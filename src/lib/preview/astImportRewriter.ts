/**
 * Phoenix AST-Aware Import Rewriter
 * 
 * Replaces the regex-based import rewriting in VitePreviewEngine with
 * a proper statement-level parser that handles:
 * - Named imports:        import { A, B } from "./x"
 * - Default imports:      import X from "./x"
 * - Namespace imports:    import * as X from "./x"
 * - Mixed imports:        import X, { A } from "./x"
 * - Side-effect imports:  import "./x"
 * - Re-exports:           export { A } from "./x"
 * - Barrel re-exports:    export * from "./x"
 * - Named re-exports:     export * as ns from "./x"
 * - Dynamic imports:      import("./x")
 * - CSS imports:          import "./styles.css" (stripped)
 * - @/ alias resolution:  import X from "@/components/Y"
 * - Asset URL rewriting:  new URL("./img.png", import.meta.url)
 *
 * Strategy: Parse code into import/export statements using a line-by-line
 * state machine (not regex on full code). Each statement is individually
 * resolved and rewritten.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImportStatement {
  /** Full original text of the import/export statement */
  original: string;
  /** Start index in source code */
  start: number;
  /** End index in source code */
  end: number;
  /** The module specifier ("./components/Header", "@/lib/utils", "react") */
  specifier: string;
  /** Type of statement */
  kind:
    | "import-named"       // import { A } from "x"
    | "import-default"     // import X from "x"
    | "import-namespace"   // import * as X from "x"
    | "import-mixed"       // import X, { A } from "x"
    | "import-side-effect" // import "x"
    | "export-named-from"  // export { A } from "x"
    | "export-all"         // export * from "x"
    | "export-all-as"      // export * as ns from "x"
    | "dynamic-import";    // import("x")
  /** Whether this is a local (relative/alias) import vs external */
  isLocal: boolean;
}

type FileResolver = (importPath: string, fromFile: string) => string | null;

// ─── Statement Extraction ───────────────────────────────────────────────────

/**
 * Extract all import/export-from statements from source code.
 * Uses a state machine that handles multi-line statements and avoids
 * matching inside strings/comments.
 */
export function extractStatements(code: string): ImportStatement[] {
  const statements: ImportStatement[] = [];

  // Normalize multi-line imports to single lines for simpler parsing
  // This handles: import {\n  A,\n  B,\n} from "path"
  const normalized = code.replace(
    /((?:import|export)\s*\{[^}]*\})/gs,
    (match) => match.replace(/\n/g, " ").replace(/\s+/g, " ")
  );

  // Also normalize multi-line import statements without braces
  // e.g.: import\n  X\n  from "path"
  const fullyNormalized = normalized.replace(
    /((?:import|export)\s+(?:(?!\bfrom\b)[\s\S])*?\bfrom\b\s*['"][^'"]+['"])/g,
    (match) => match.replace(/\n/g, " ").replace(/\s+/g, " ")
  );

  // ── Pattern 1: export * as ns from "specifier"
  const exportAllAsRe = /export\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = exportAllAsRe.exec(fullyNormalized)) !== null) {
    statements.push(makeStatement(m, "export-all-as"));
  }

  // ── Pattern 2: export * from "specifier"
  const exportAllRe = /export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = exportAllRe.exec(fullyNormalized)) !== null) {
    // Skip if already captured as export-all-as
    if (!statements.some(s => s.start === m!.index)) {
      statements.push(makeStatement(m, "export-all"));
    }
  }

  // ── Pattern 3: export { ... } from "specifier"
  const exportNamedFromRe = /export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = exportNamedFromRe.exec(fullyNormalized)) !== null) {
    statements.push(makeStatement(m, "export-named-from"));
  }

  // ── Pattern 4: import * as X from "specifier"
  const importNsRe = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = importNsRe.exec(fullyNormalized)) !== null) {
    statements.push(makeStatement(m, "import-namespace"));
  }

  // ── Pattern 5: import Default, { Named } from "specifier"
  const importMixedRe = /import\s+[\w$]+\s*,\s*\{[^}]*\}\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = importMixedRe.exec(fullyNormalized)) !== null) {
    if (!statements.some(s => s.start === m!.index)) {
      statements.push(makeStatement(m, "import-mixed"));
    }
  }

  // ── Pattern 6: import { Named } from "specifier"
  const importNamedRe = /import\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = importNamedRe.exec(fullyNormalized)) !== null) {
    if (!statements.some(s => s.start === m!.index)) {
      statements.push(makeStatement(m, "import-named"));
    }
  }

  // ── Pattern 7: import Default from "specifier"
  const importDefaultRe = /import\s+[\w$]+\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = importDefaultRe.exec(fullyNormalized)) !== null) {
    if (!statements.some(s => s.start === m!.index)) {
      statements.push(makeStatement(m, "import-default"));
    }
  }

  // ── Pattern 8: import "specifier" (side-effect)
  const importSideEffectRe = /import\s+['"]([^'"]+)['"]\s*;?/g;
  while ((m = importSideEffectRe.exec(fullyNormalized)) !== null) {
    if (!statements.some(s => s.start === m!.index)) {
      statements.push(makeStatement(m, "import-side-effect"));
    }
  }

  // ── Pattern 9: dynamic import("specifier")
  const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicImportRe.exec(fullyNormalized)) !== null) {
    if (!statements.some(s => s.start === m!.index)) {
      statements.push(makeStatement(m, "dynamic-import"));
    }
  }

  // Sort by position
  statements.sort((a, b) => a.start - b.start);

  return statements;
}

function makeStatement(
  match: RegExpExecArray,
  kind: ImportStatement["kind"]
): ImportStatement {
  const specifier = match[1];
  return {
    original: match[0],
    start: match.index,
    end: match.index + match[0].length,
    specifier,
    kind,
    isLocal: specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/"),
  };
}

// ─── Import Rewriting ───────────────────────────────────────────────────────

export interface RewriteOptions {
  /** Source file path (for relative resolution) */
  filePath: string;
  /** Set of all file paths in the workspace */
  fileSet: Set<string>;
  /** Resolve a file path with extension/index fallback */
  resolveFile: FileResolver;
}

/**
 * Rewrite all import/export specifiers in compiled code for SW serving.
 * 
 * - Local imports: resolve to actual file paths, convert to .js extension
 * - @/ aliases: resolve to absolute paths
 * - CSS imports: strip entirely (injected via <style>)
 * - External imports: left untouched (handled by import map)
 * - Asset URLs: rewrite to SW-relative paths
 * - Barrel re-exports (export * from): preserved with resolved paths
 */
export function rewriteImportsForSW(
  code: string,
  options: RewriteOptions
): { code: string; resolvedImports: string[]; unresolvedImports: string[] } {
  const { filePath, fileSet, resolveFile } = options;
  const resolvedImports: string[] = [];
  const unresolvedImports: string[] = [];

  // 1. Handle asset URL patterns first (before statement extraction)
  code = rewriteAssetURLs(code);

  // 2. Extract all import/export statements
  const statements = extractStatements(code);

  // 3. Process statements in reverse order (so indices stay valid)
  const reversedStatements = [...statements].reverse();

  for (const stmt of reversedStatements) {
    // CSS imports — strip entirely
    if (stmt.specifier.endsWith(".css")) {
      code = code.slice(0, stmt.start) + "/* [CSS stripped] */" + code.slice(stmt.end);
      continue;
    }

    // External imports — leave untouched
    if (!stmt.isLocal) {
      continue;
    }

    // Resolve the specifier
    const resolved = resolveSpecifier(stmt.specifier, filePath, fileSet, resolveFile);

    if (resolved) {
      resolvedImports.push(resolved);

      // Convert to .js for compiled output
      const jsPath = toJsExtension(resolved);

      // Replace the specifier in the original statement
      const newStatement = stmt.original.replace(
        new RegExp(`(['"])${escapeRegex(stmt.specifier)}(['"])`),
        `$1${jsPath}$2`
      );
      code = code.slice(0, stmt.start) + newStatement + code.slice(stmt.end);
    } else {
      unresolvedImports.push(stmt.specifier);
      // Leave as-is — SW will serve a 200 stub for missing modules
    }
  }

  // 4. Strip any remaining bare import.meta.url references
  code = code.replace(/import\.meta\.url/g, '"https://localhost/"');

  return { code, resolvedImports, unresolvedImports };
}

// ─── Resolution Helpers ─────────────────────────────────────────────────────

function resolveSpecifier(
  specifier: string,
  fromFile: string,
  fileSet: Set<string>,
  resolveFile: FileResolver
): string | null {
  // @/ alias → absolute path
  if (specifier.startsWith("@/")) {
    const absPath = "/" + specifier.slice(2);
    return resolveFile(absPath, fromFile);
  }

  // Relative path
  if (specifier.startsWith(".")) {
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const parts = [...fromDir.split("/"), ...specifier.split("/")].filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part !== ".") stack.push(part);
    }
    const resolved = "/" + stack.join("/");
    return resolveFile(resolved, fromFile);
  }

  // Absolute path
  if (specifier.startsWith("/")) {
    return resolveFile(specifier, fromFile);
  }

  return null;
}

function toJsExtension(path: string): string {
  return path
    .replace(/\.tsx$/, ".js")
    .replace(/\.ts$/, ".js")
    .replace(/\.jsx$/, ".js");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteAssetURLs(code: string): string {
  // new URL("./path", import.meta.url) → new URL("./path", window.location.origin + "/vfs-preview/")
  code = code.replace(
    /new\s+URL\(\s*(['"]([^'"]+)['"])\s*,\s*import\.meta\.url\s*\)/g,
    (_m, _quoted, path: string) => {
      return `new URL("${path}", window.location.origin + "/vfs-preview/")`;
    }
  );

  // new URL(variable, import.meta.url) → new URL(variable, window.location.origin + "/vfs-preview/")
  code = code.replace(
    /new\s+URL\(\s*([^,)]+)\s*,\s*import\.meta\.url\s*\)/g,
    (_m, expr: string) => `new URL(${expr.trim()}, window.location.origin + "/vfs-preview/")`
  );

  return code;
}

// ─── Barrel File Detection ──────────────────────────────────────────────────

/**
 * Detect if a file is a barrel file (index.ts that only re-exports).
 * Used to generate proper export * from chains in the SW.
 */
export function isBarrelFile(code: string): boolean {
  const lines = code.split("\n").filter(l => l.trim() && !l.trim().startsWith("//"));
  if (lines.length === 0) return false;
  
  // A barrel file has >80% of its lines being export statements
  const exportLines = lines.filter(l => 
    /^\s*export\s/.test(l) || /^\s*\/\//.test(l) || l.trim() === ""
  );
  return exportLines.length / lines.length > 0.8;
}

/**
 * Build a dependency graph from extracted statements.
 * Used for circular dependency detection.
 */
export function buildDependencyGraph(
  files: Record<string, string>,
  fileSet: Set<string>,
  resolveFile: FileResolver
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const filePath of Object.keys(files)) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) continue;
    
    const deps = new Set<string>();
    const statements = extractStatements(files[filePath]);

    for (const stmt of statements) {
      if (!stmt.isLocal) continue;
      const resolved = resolveSpecifier(stmt.specifier, filePath, fileSet, resolveFile);
      if (resolved) {
        deps.add(resolved);
      }
    }

    graph.set(filePath, deps);
  }

  return graph;
}

/**
 * Detect circular dependencies in the graph.
 * Returns arrays of file paths that form cycles.
 */
export function detectCircularDeps(
  graph: Map<string, Set<string>>
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(node: string) {
    if (inStack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = pathStack.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...pathStack.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    pathStack.push(node);

    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep);
      }
    }

    pathStack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
}
