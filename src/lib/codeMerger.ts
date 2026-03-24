import diff_match_patch from "diff-match-patch";
import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import postcss, { Root as PostCSSRoot } from "postcss";

export interface MergeResult {
  files: Record<string, string>;
  conflicts: string[];
}

const dmp = new diff_match_patch();
dmp.Match_Distance = 2000;
dmp.Patch_DeleteThreshold = 0.6;

const BACKEND_PROTECTED_PATTERNS = [
  /^\/data\//,
  /^\/hooks\/use\w+/,
  /^\/contexts\/\w+Context/,
  /^\/contexts\/DataContext/,
  /^\/contexts\/AuthContext/,
  /^\/api\//,
  /^\/lib\/api/,
  /^\/lib\/db/,
  /^\/lib\/supabase/,
  /^\/server\//,
  /^\/services\//,
  /^\/supabase\//,
  /^\/migrations\//,
];

const APPEND_ONLY_PATTERNS = [/^\/data\/schema/, /^\/migrations\//, /^\/supabase\//];

export function isBackendProtected(path: string): boolean {
  return BACKEND_PROTECTED_PATTERNS.some((p) => p.test(path));
}

function isAppendOnly(path: string): boolean {
  return APPEND_ONLY_PATTERNS.some((p) => p.test(path));
}

function parseCode(path: string, code: string): t.File {
  return parse(code, {
    sourceType: "module",
    plugins: [
      "jsx",
      "typescript",
      "classProperties",
      "classPrivateProperties",
      "classPrivateMethods",
      "decorators-legacy",
      "dynamicImport",
      "exportDefaultFrom",
      "exportNamespaceFrom",
      "nullishCoalescingOperator",
      "optionalChaining",
      "objectRestSpread",
      "topLevelAwait",
    ],
    sourceFilename: path,
  });
}

function diffMergeFile(
  base: string,
  current: string,
  incoming: string,
): { code: string; clean: boolean; failedHunks: number } {
  if (base === current) {
    return { code: incoming, clean: true, failedHunks: 0 };
  }
  if (base === incoming) {
    return { code: current, clean: true, failedHunks: 0 };
  }
  const patches = dmp.patch_make(base, incoming);
  if (patches.length === 0) {
    return { code: current, clean: true, failedHunks: 0 };
  }
  const [merged, results] = dmp.patch_apply(patches, current);
  const failedHunks = results.filter((r) => !r).length;
  return { code: merged, clean: failedHunks === 0, failedHunks };
}

function collectImports(ast: t.File): t.ImportDeclaration[] {
  const imports: t.ImportDeclaration[] = [];
  ast.program.body.forEach((node) => {
    if (t.isImportDeclaration(node)) imports.push(node);
  });
  return imports;
}

function normalizeImportKey(node: t.ImportDeclaration): string {
  return node.source.value;
}

function mergeImportDeclarations(
  existingImports: t.ImportDeclaration[],
  incomingImports: t.ImportDeclaration[],
): t.ImportDeclaration[] {
  const bySource = new Map<string, t.ImportDeclaration>();

  const addOrMerge = (imp: t.ImportDeclaration, incomingWins: boolean) => {
    const key = normalizeImportKey(imp);
    const existing = bySource.get(key);
    if (!existing) {
      bySource.set(key, imp);
      return;
    }

    const existingDefault = existing.specifiers.find((s) => t.isImportDefaultSpecifier(s)) as
      | t.ImportDefaultSpecifier
      | undefined;
    const incomingDefault = imp.specifiers.find((s) => t.isImportDefaultSpecifier(s)) as
      | t.ImportDefaultSpecifier
      | undefined;

    const existingNamed = existing.specifiers.filter((s) => t.isImportSpecifier(s)) as t.ImportSpecifier[];
    const incomingNamed = imp.specifiers.filter((s) => t.isImportSpecifier(s)) as t.ImportSpecifier[];

    const namedMap = new Map<string, t.ImportSpecifier>();
    const addNamed = (specs: t.ImportSpecifier[]) => {
      specs.forEach((s) => {
        const name = (s.imported as t.Identifier).name;
        namedMap.set(name, s);
      });
    };

    addNamed(existingNamed);
    addNamed(incomingNamed);

    const mergedNamed = Array.from(namedMap.values());
    let finalDefault: t.ImportDefaultSpecifier | undefined;

    if (incomingWins) {
      finalDefault = incomingDefault || existingDefault || undefined;
    } else {
      finalDefault = existingDefault || incomingDefault || undefined;
    }

    const mergedSpecs: (t.ImportSpecifier | t.ImportDefaultSpecifier)[] = [];
    if (finalDefault) mergedSpecs.push(finalDefault);
    mergedSpecs.push(...mergedNamed);

    const merged = t.importDeclaration(mergedSpecs as any, existing.source);
    bySource.set(key, merged);
  };

  existingImports.forEach((imp) => addOrMerge(imp, false));
  incomingImports.forEach((imp) => addOrMerge(imp, true));

  return Array.from(bySource.values());
}

function replaceImports(ast: t.File, newImports: t.ImportDeclaration[]): t.File {
  const newBody: t.Statement[] = [];
  newImports.forEach((imp) => newBody.push(imp));
  ast.program.body.forEach((node) => {
    if (!t.isImportDeclaration(node)) newBody.push(node);
  });
  ast.program.body = newBody;
  return ast;
}

type RouteKey = string;

function getRouteKey(node: t.JSXElement): RouteKey | null {
  const opening = node.openingElement;
  if (!t.isJSXIdentifier(opening.name) || opening.name.name !== "Route") return null;

  let pathValue: string | null = null;
  let isIndex = false;

  opening.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return;
    if (attr.name.name === "path" && attr.value && t.isStringLiteral(attr.value)) {
      pathValue = attr.value.value;
    }
    if (attr.name.name === "index") {
      isIndex = true;
    }
  });

  if (pathValue) return `path:${pathValue}`;
  if (isIndex) return "index";
  return null;
}

function collectRoutes(ast: t.File): { routes: t.JSXElement[]; parentByRoute: Map<t.JSXElement, t.JSXElement> } {
  const routes: t.JSXElement[] = [];
  const parentByRoute = new Map<t.JSXElement, t.JSXElement>();

  traverse(ast, {
    JSXElement(path) {
      const node = path.node;
      if (!t.isJSXIdentifier(node.openingElement.name)) return;
      if (node.openingElement.name.name !== "Routes") return;

      node.children.forEach((child) => {
        if (!t.isJSXElement(child)) return;
        if (!t.isJSXIdentifier(child.openingElement.name)) return;
        if (child.openingElement.name.name !== "Route") return;
        routes.push(child);
        parentByRoute.set(child, node);
      });
    },
  });

  return { routes, parentByRoute };
}

function mergeRoutes(existingAst: t.File, incomingAst: t.File): t.File {
  const existing = collectRoutes(existingAst);
  const incoming = collectRoutes(incomingAst);

  const existingMap = new Map<RouteKey, t.JSXElement>();
  existing.routes.forEach((r) => {
    const key = getRouteKey(r);
    if (key) existingMap.set(key, r);
  });

  const incomingMap = new Map<RouteKey, t.JSXElement>();
  incoming.routes.forEach((r) => {
    const key = getRouteKey(r);
    if (key) incomingMap.set(key, r);
  });

  const finalMap = new Map<RouteKey, t.JSXElement>();

  existingMap.forEach((route, key) => {
    if (!incomingMap.has(key)) finalMap.set(key, route);
  });

  incomingMap.forEach((route, key) => {
    finalMap.set(key, route);
  });

  const routesByParent = new Map<t.JSXElement, t.JSXElement[]>();
  incoming.routes.forEach((r) => {
    const parent = incoming.parentByRoute.get(r);
    if (!parent) return;
    if (!routesByParent.has(parent)) routesByParent.set(parent, []);
  });

  const firstRoutesParent = incoming.routes.length > 0 ? incoming.parentByRoute.get(incoming.routes[0]) || null : null;

  if (firstRoutesParent) {
    const orderedRoutes: t.JSXElement[] = [];
    finalMap.forEach((route) => orderedRoutes.push(route));
    firstRoutesParent.children = orderedRoutes;
  }

  return incomingAst;
}

type NavKey = string;

function getNavKey(obj: t.ObjectExpression): NavKey | null {
  let toValue: string | null = null;
  obj.properties.forEach((prop) => {
    if (!t.isObjectProperty(prop)) return;
    if (!t.isIdentifier(prop.key)) return;
    if (prop.key.name !== "to") return;
    if (t.isStringLiteral(prop.value)) {
      toValue = prop.value.value;
    }
  });
  return toValue ? `to:${toValue}` : null;
}

function collectNavItems(ast: t.File): {
  arrayPath: NodePath<t.VariableDeclarator> | null;
  items: t.ObjectExpression[];
} {
  let arrayPath: NodePath<t.VariableDeclarator> | null = null;
  const items: t.ObjectExpression[] = [];

  traverse(ast, {
    VariableDeclarator(path) {
      const node = path.node;
      if (!t.isIdentifier(node.id)) return;
      if (node.id.name !== "navItems") return;
      if (!t.isArrayExpression(node.init)) return;
      arrayPath = path;
      node.init.elements.forEach((el) => {
        if (t.isObjectExpression(el)) items.push(el);
      });
    },
  });

  return { arrayPath, items };
}

function mergeSidebarAst(existingAst: t.File, incomingAst: t.File): t.File {
  const existing = collectNavItems(existingAst);
  const incoming = collectNavItems(incomingAst);

  if (!incoming.arrayPath || !incoming.arrayPath.node.init || !t.isArrayExpression(incoming.arrayPath.node.init)) {
    return incomingAst;
  }

  const existingMap = new Map<NavKey, t.ObjectExpression>();
  existing.items.forEach((obj) => {
    const key = getNavKey(obj);
    if (key) existingMap.set(key, obj);
  });

  const incomingMap = new Map<NavKey, t.ObjectExpression>();
  incoming.items.forEach((obj) => {
    const key = getNavKey(obj);
    if (key) incomingMap.set(key, obj);
  });

  const finalMap = new Map<NavKey, t.ObjectExpression>();

  existingMap.forEach((obj, key) => {
    if (!incomingMap.has(key)) finalMap.set(key, obj);
  });

  incomingMap.forEach((obj, key) => {
    finalMap.set(key, obj);
  });

  const finalItems: t.ObjectExpression[] = [];
  finalMap.forEach((obj) => finalItems.push(obj));

  incoming.arrayPath.node.init.elements = finalItems;

  return incomingAst;
}

function mergeBackendAst(existingCode: string, incomingCode: string, path: string): string {
  let existingAst: t.File;
  let incomingAst: t.File;
  try {
    existingAst = parseCode(path, existingCode);
    incomingAst = parseCode(path, incomingCode);
  } catch {
    return incomingCode;
  }

  const existingExports = new Map<string, t.Statement>();
  const incomingExports = new Map<string, t.Statement>();

  const collect = (ast: t.File, map: Map<string, t.Statement>) => {
    ast.program.body.forEach((node) => {
      if (t.isExportNamedDeclaration(node) && node.declaration) {
        if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
          map.set(node.declaration.id.name, node);
        } else if (t.isVariableDeclaration(node.declaration)) {
          node.declaration.declarations.forEach((d) => {
            if (t.isIdentifier(d.id)) map.set(d.id.name, node);
          });
        }
      } else if (t.isExportDefaultDeclaration(node)) {
        map.set("default", node);
      } else if (t.isExportNamedDeclaration(node) && node.specifiers.length > 0) {
        node.specifiers.forEach((s) => {
          if (t.isExportSpecifier(s) && t.isIdentifier(s.exported)) {
            map.set(s.exported.name, node);
          }
        });
      }
    });
  };

  collect(existingAst, existingExports);
  collect(incomingAst, incomingExports);

  const finalExports = new Map<string, t.Statement>();

  existingExports.forEach((stmt, name) => {
    if (!incomingExports.has(name)) finalExports.set(name, stmt);
  });

  incomingExports.forEach((stmt, name) => {
    finalExports.set(name, stmt);
  });

  const otherIncoming: t.Statement[] = [];
  incomingAst.program.body.forEach((node) => {
    if (!t.isExportNamedDeclaration(node) && !t.isExportDefaultDeclaration(node)) {
      otherIncoming.push(node);
    }
  });

  const newBody: t.Statement[] = [];
  otherIncoming.forEach((n) => newBody.push(n));
  finalExports.forEach((stmt) => newBody.push(stmt));

  incomingAst.program.body = newBody;

  return generate(incomingAst, { retainLines: true }).code;
}

function mergeCss(existing: string, incoming: string): string {
  let existingAst: PostCSSRoot;
  let incomingAst: PostCSSRoot;
  try {
    existingAst = postcss.parse(existing);
    incomingAst = postcss.parse(incoming);
  } catch {
    return incoming;
  }

  const existingImports = new Set<string>();
  existingAst.nodes.forEach((node) => {
    if (node.type === "atrule" && node.name === "import") {
      existingImports.add(node.params);
    }
  });

  const newNodes: typeof incomingAst.nodes = [];
  incomingAst.nodes.forEach((node) => {
    if (node.type === "atrule" && node.name === "import") {
      if (!existingImports.has(node.params)) {
        newNodes.push(node);
      }
    } else {
      newNodes.push(node);
    }
  });

  incomingAst.nodes = newNodes;

  return incomingAst.toString();
}

export function mergeFiles(
  existing: Record<string, string>,
  incoming: Record<string, string>,
  protectBackend = false,
  base?: Record<string, string>,
): MergeResult {
  const result: Record<string, string> = { ...existing };
  const conflicts: string[] = [];

  for (const [path, code] of Object.entries(incoming)) {
    if (code.trim().length === 0) continue;

    if (!result[path]) {
      result[path] = code;
      continue;
    }

    if (protectBackend && isBackendProtected(path)) {
      conflicts.push(`${path}: protected — skipped frontend overwrite`);
      continue;
    }

    if (isAppendOnly(path)) {
      if (!result[path].includes(code.trim())) {
        result[path] = result[path] + "\n\n" + code;
        conflicts.push(`${path}: append-only — content appended`);
      }
      continue;
    }

    if (!protectBackend && isBackendProtected(path)) {
      const merged = mergeBackendAst(result[path], code, path);
      result[path] = merged;
      conflicts.push(`${path}: backend files merged (incoming wins on conflicts)`);
      continue;
    }

    if (path === "/App.jsx" || path === "/App.tsx") {
      try {
        const existingAst = parseCode(path, result[path]);
        const incomingAst = parseCode(path, code);

        const existingImports = collectImports(existingAst);
        const incomingImports = collectImports(incomingAst);
        const mergedImports = mergeImportDeclarations(existingImports, incomingImports);
        const withMergedImports = replaceImports(incomingAst, mergedImports);

        const mergedRoutesAst = mergeRoutes(existingAst, withMergedImports);
        result[path] = generate(mergedRoutesAst, { retainLines: true }).code;
        conflicts.push(`${path}: AST-merged (imports + routes, incoming wins on conflicts)`);
      } catch {
        result[path] = code;
        conflicts.push(`${path}: AST merge failed — incoming overwritten`);
      }
      continue;
    }

    if (path.includes("Sidebar") && path.match(/\.(jsx?|tsx?)$/)) {
      try {
        const existingAst = parseCode(path, result[path]);
        const incomingAst = parseCode(path, code);

        const existingImports = collectImports(existingAst);
        const incomingImports = collectImports(incomingAst);
        const mergedImports = mergeImportDeclarations(existingImports, incomingImports);
        const withMergedImports = replaceImports(incomingAst, mergedImports);

        const mergedSidebarAst = mergeSidebarAst(existingAst, withMergedImports);
        result[path] = generate(mergedSidebarAst, { retainLines: true }).code;
        conflicts.push(`${path}: AST-merged (imports + nav, incoming wins on conflicts)`);
      } catch {
        result[path] = code;
        conflicts.push(`${path}: Sidebar AST merge failed — incoming overwritten`);
      }
      continue;
    }

    if (path.endsWith(".css")) {
      try {
        const mergedCss = mergeCss(result[path], code);
        result[path] = mergedCss;
        conflicts.push(`${path}: CSS merged (incoming wins, @import deduped)`);
      } catch {
        result[path] = code;
        conflicts.push(`${path}: CSS merge failed — incoming overwritten`);
      }
      continue;
    }

    if (base && base[path] && path.match(/\.(jsx?|tsx?|ts|js)$/)) {
      const { code: merged, clean, failedHunks } = diffMergeFile(base[path], result[path], code);
      result[path] = merged;
      if (!clean) {
        conflicts.push(`${path}: diff merge had ${failedHunks} failed hunk(s) — some changes may be lost`);
      } else if (base[path] !== code) {
        conflicts.push(`${path}: diff-merged (user edits preserved, incoming wins on conflicts)`);
      }
      continue;
    }

    if (path.match(/\.(jsx?|tsx?|ts|js)$/) && result[path]) {
      try {
        const existingAst = parseCode(path, result[path]);
        const incomingAst = parseCode(path, code);

        const existingImports = collectImports(existingAst);
        const incomingImports = collectImports(incomingAst);
        const mergedImports = mergeImportDeclarations(existingImports, incomingImports);
        const withMergedImports = replaceImports(incomingAst, mergedImports);

        result[path] = generate(withMergedImports, { retainLines: true }).code;
        conflicts.push(`${path}: overwritten with AST import merge (incoming wins)`);
      } catch {
        result[path] = code;
        conflicts.push(`${path}: AST merge failed — incoming overwritten`);
      }
      continue;
    }

    conflicts.push(`${path}: overwritten by later task (incoming wins)`);
    result[path] = code;
  }

  return { files: result, conflicts };
}

export function buildFullCodeContext(files: Record<string, string>, budgetChars = 32000): string {
  const entries = Object.entries(files);
  if (entries.length === 0) return "";

  const totalChars = entries.reduce((sum, [, code]) => sum + code.length, 0);

  if (totalChars <= budgetChars) {
    return entries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  }

  const PRIORITY = ["/App.jsx", "/App.tsx", "/App.js"];
  const NAV_PATTERNS = ["/Sidebar", "/Navigation", "/Nav", "/Layout"];

  const priorityFiles = entries.filter(
    ([p]) => PRIORITY.some((k) => p.endsWith(k)) || NAV_PATTERNS.some((k) => p.includes(k)),
  );
  const otherFiles = entries.filter(
    ([p]) => !PRIORITY.some((k) => p.endsWith(k)) && !NAV_PATTERNS.some((k) => p.includes(k)),
  );

  let result = "";
  let remaining = budgetChars;

  for (const [path, code] of priorityFiles) {
    const section = `--- ${path}\n${code}\n\n`;
    result += section;
    remaining -= section.length;
  }

  for (const [path, code] of otherFiles) {
    if (remaining <= 200) {
      result += `--- ${path} (${code.length} chars — omitted)\n`;
      continue;
    }
    if (code.length <= remaining) {
      const section = `--- ${path}\n${code}\n\n`;
      result += section;
      remaining -= section.length;
    } else {
      const lines = code.split("\n");
      const preview = lines.slice(0, 30).join("\n");
      result += `--- ${path} (truncated, ${lines.length} total lines)\n${preview}\n...[truncated]\n\n`;
      remaining -= preview.length + 100;
    }
  }

  return result;
}
