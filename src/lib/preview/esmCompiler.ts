/**
 * Phoenix ESM Compiler
 * 
 * Handles file compilation (Sucrase JSX/TS → JS) and import/export rewriting
 * for the inline module registry pattern.
 */

import { transform } from "sucrase";
import type { CompiledModule, PreviewDiagnostic } from "./types";

// ─── UID Generator ──────────────────────────────────────────────────────────

let _uid = 0;
function uid(): string {
  return `_${(++_uid).toString(36)}`;
}

/** Reset UID counter (useful for deterministic tests) */
export function resetUidCounter(): void {
  _uid = 0;
}

// ─── Single File Compilation ────────────────────────────────────────────────

export function compileFile(code: string, filePath: string): { code: string; error?: string } {
  const isTS = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
  const isJSX = filePath.endsWith(".jsx") || filePath.endsWith(".tsx");

  const transforms: ("typescript" | "jsx")[] = [];
  if (isTS) transforms.push("typescript");
  if (isJSX || isTS || filePath.endsWith(".js")) transforms.push("jsx");

  try {
    const result = transform(code, {
      transforms,
      jsxRuntime: "automatic",
      jsxImportSource: "react",
      production: true,
      filePath,
    });
    return { code: result.code };
  } catch (e: any) {
    const name = filePath
      .replace(/.*\//, "")
      .replace(/\.\w+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "") || "ErrorModule";

    const fallback = `
import { jsx as _jsx } from "react/jsx-runtime";
export default function ${name}() {
  return _jsx("div", { 
    style: { padding: "2rem", textAlign: "center", color: "#f59e0b" },
    children: "⚠ ${name} had a compile error"
  });
}`;
    return { code: fallback, error: e.message };
  }
}

// ─── Path Resolution ────────────────────────────────────────────────────────

export function resolveRelativePath(from: string, to: string): string {
  if (!to.startsWith(".")) return to;
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  for (const part of toParts) {
    if (part === ".") continue;
    if (part === "..") fromParts.pop();
    else fromParts.push(part);
  }
  return fromParts.join("/");
}

export function findFileByImport(importPath: string, fileSet: Set<string>): string | null {
  if (fileSet.has(importPath)) return importPath;

  const noExt = importPath.replace(/\.\w+$/, "");
  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
    if (fileSet.has(noExt + ext)) return noExt + ext;
    if (fileSet.has(importPath + ext)) return importPath + ext;
  }
  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
    if (fileSet.has(importPath + "/index" + ext)) return importPath + "/index" + ext;
    if (fileSet.has(noExt + "/index" + ext)) return noExt + "/index" + ext;
  }
  return null;
}

function resolveSpecifier(spec: string, filePath: string, fileSet: Set<string>): string {
  if (spec.startsWith(".")) {
    const found = findFileByImport(resolveRelativePath(filePath, spec), fileSet);
    return found || spec;
  }
  return spec;
}

// ─── Import / Export Rewriting ──────────────────────────────────────────────

function parseNamedList(named: string): string {
  return named
    .split(",")
    .map(s => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Rewrite ESM imports/exports to use the __import__/__exports__ registry pattern.
 * Returns rewritten code and list of resolved import specifiers.
 */
export function rewriteToRegistry(
  code: string,
  filePath: string,
  fileSet: Set<string>
): { code: string; imports: string[] } {
  const imports: string[] = [];

  function trackResolve(spec: string): string {
    const resolved = resolveSpecifier(spec, filePath, fileSet);
    imports.push(resolved);
    return resolved;
  }

  // Rewrite new URL("./path", import.meta.url) → static string
  code = code.replace(
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
    (_m, path: string) => `"${path}"`
  );

  // Strip CSS imports
  code = code.replace(/import\s+['"][^'"]*\.css['"]\s*;?/g, "");

  // 1) import * as X from "specifier"
  code = code.replace(
    /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_m, ns: string, spec: string) => {
      const resolved = trackResolve(spec);
      return `const ${ns} = await __import__("${resolved}");`;
    }
  );

  // 2) import Default, { Named } from "specifier"
  code = code.replace(
    /import\s+([\w$]+)\s*,\s*\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]\s*;?/g,
    (_m, def: string, named: string, spec: string) => {
      const resolved = trackResolve(spec);
      const tmp = `__m${uid()}`;
      const namedPart = parseNamedList(named);
      return `const ${tmp} = await __import__("${resolved}");\nconst ${def} = ${tmp}.default !== undefined ? ${tmp}.default : ${tmp};\nconst { ${namedPart} } = ${tmp};`;
    }
  );

  // 3) import { Named } from "specifier"
  code = code.replace(
    /import\s+\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]\s*;?/g,
    (_m, named: string, spec: string) => {
      const resolved = trackResolve(spec);
      const tmp = `__m${uid()}`;
      const namedPart = parseNamedList(named);
      return `const ${tmp} = await __import__("${resolved}");\nconst { ${namedPart} } = ${tmp};`;
    }
  );

  // 4) import Default from "specifier"
  code = code.replace(
    /import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_m, def: string, spec: string) => {
      const resolved = trackResolve(spec);
      const tmp = `__m${uid()}`;
      return `const ${tmp} = await __import__("${resolved}");\nconst ${def} = ${tmp}.default !== undefined ? ${tmp}.default : ${tmp};`;
    }
  );

  // 5) Side-effect: import "specifier"
  code = code.replace(
    /import\s+['"]([^'"]+)['"]\s*;?/g,
    (_m, spec: string) => {
      const resolved = trackResolve(spec);
      return `await __import__("${resolved}");`;
    }
  );

  // 6) export { X } from "specifier"
  code = code.replace(
    /export\s+\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]\s*;?/g,
    (_m, names: string, spec: string) => {
      const resolved = trackResolve(spec);
      const tmp = `__m${uid()}`;
      const lines = [`const ${tmp} = await __import__("${resolved}");`];
      for (const n of names.split(",").map(s => s.trim()).filter(Boolean)) {
        const [from, as] = n.split(/\s+as\s+/);
        lines.push(`__exports__.${as || from} = ${tmp}.${from};`);
      }
      return lines.join("\n");
    }
  );

  // Export rewrites — line-by-line with deferred assignment
  const lines = code.split("\n");
  const result: string[] = [];
  const defaultExportNames: string[] = [];
  const namedExportNames: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // export default function Name
    const edf = trimmed.match(/^export\s+default\s+function\s+(\w+)/);
    if (edf) {
      result.push(line.replace("export default function", "function"));
      defaultExportNames.push(edf[1]);
      continue;
    }

    // export default class Name
    const edc = trimmed.match(/^export\s+default\s+class\s+(\w+)/);
    if (edc) {
      result.push(line.replace("export default class", "class"));
      defaultExportNames.push(edc[1]);
      continue;
    }

    // export default <expression>
    if (trimmed.startsWith("export default ")) {
      result.push(line.replace("export default ", "__exports__.default = "));
      continue;
    }

    // export const/let/var/function/class Name
    const ed = trimmed.match(/^export\s+(const|let|var|function|class)\s+(\w+)/);
    if (ed) {
      result.push(line.replace(/^(\s*)export\s+/, "$1"));
      namedExportNames.push(ed[2]);
      continue;
    }

    // export { X, Y }
    const eb = trimmed.match(/^export\s+\{([^}]+)\}\s*;?\s*$/);
    if (eb) {
      for (const n of eb[1].split(",").map(s => s.trim()).filter(Boolean)) {
        const [from, as] = n.split(/\s+as\s+/);
        namedExportNames.push(`${as || from}=${from}`);
      }
      continue;
    }

    result.push(line);
  }

  // Deferred exports at module end
  for (const name of defaultExportNames) {
    result.push(`__exports__.default = ${name};`);
  }
  for (const entry of namedExportNames) {
    if (entry.includes("=")) {
      const [exportName, localName] = entry.split("=");
      result.push(`__exports__.${exportName} = ${localName};`);
    } else {
      result.push(`__exports__.${entry} = ${entry};`);
    }
  }

  return { code: result.join("\n"), imports };
}

// ─── Batch Compilation ──────────────────────────────────────────────────────

/**
 * Compile all source files in a workspace, returning CompiledModules and diagnostics.
 */
export function compileWorkspace(
  files: Record<string, string>,
  fileSet: Set<string>
): { modules: CompiledModule[]; css: string[]; diagnostics: PreviewDiagnostic[] } {
  const modules: CompiledModule[] = [];
  const css: string[] = [];
  const diagnostics: PreviewDiagnostic[] = [];

  for (const [path, code] of Object.entries(files)) {
    if (path.match(/\.(jsx?|tsx?)$/)) {
      const compiled = compileFile(code, path);

      if (compiled.error) {
        diagnostics.push({
          severity: "warning",
          category: "compile-error",
          message: compiled.error,
          file: path,
          timestamp: Date.now(),
        });
      }

      const rewritten = rewriteToRegistry(compiled.code, path, fileSet);
      
      modules.push({
        path,
        originalPath: path,
        code: rewritten.code,
        imports: rewritten.imports,
        exports: [], // Could be extracted but not critical for runtime
        hasDefaultExport: rewritten.code.includes("__exports__.default"),
        sizeBytes: new Blob([rewritten.code]).size,
      });
    } else if (path.endsWith(".css")) {
      const cleaned = code
        .replace(/^@tailwind\s+\w+;\s*$/gm, "")
        .replace(/^@import\s+url\([^)]+\);\s*$/gm, "")
        .trim();
      if (cleaned) css.push(cleaned);
    }
  }

  return { modules, css, diagnostics };
}
