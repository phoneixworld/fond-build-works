/**
 * Build Compiler v1.0 — Verification Layer
 * 
 * Never marks a build "complete" if the workspace is broken.
 * Runs static, structural, and domain checks.
 */

import { transform } from "sucrase";
import type { Workspace } from "./workspace";
import type { TaskGraph, VerificationResult, VerificationIssue, IssueCategory } from "./types";

// ─── Main Verification ────────────────────────────────────────────────────

export function verifyWorkspace(
  workspace: Workspace,
  taskGraph: TaskGraph
): VerificationResult {
  const issues: VerificationIssue[] = [];

  // 1. Static checks: syntax
  const syntaxResults = checkSyntax(workspace);
  issues.push(...syntaxResults.issues);

  // 2. Static checks: import resolution
  const importResults = checkImports(workspace);
  issues.push(...importResults.issues);

  // 3. Static checks: import syntax validation
  const importSyntaxResults = checkImportSyntax(workspace);
  issues.push(...importSyntaxResults.issues);

  // 4. Structural checks: all produces[] exist
  const producesResults = checkProducedFiles(workspace, taskGraph);
  issues.push(...producesResults.issues);

  // 5. Structural checks: empty stubs
  const stubResults = checkEmptyStubs(workspace);
  issues.push(...stubResults.issues);

  // 6. Structural checks: route existence
  const routeResults = checkRoutes(workspace);
  issues.push(...routeResults.issues);

  // 7. Structural checks: undefined function calls in useEffect
  const undefResults = checkUndefinedCalls(workspace);
  issues.push(...undefResults.issues);

  // 8. Semantic check: useNavigate inside AuthContext (outside Router)
  const routerHookResults = checkRouterHookViolations(workspace);
  issues.push(...routerHookResults.issues);

  // 9. Semantic check: export { X } where X is not defined
  const exportResults = checkExportValidity(workspace);
  issues.push(...exportResults.issues);

  // Stats
  const files = workspace.listFiles();
  const jsFiles = files.filter(f => /\.(jsx?|tsx?)$/.test(f));
  const errorCount = issues.filter(i => i.severity === "error").length;

  return {
    ok: errorCount === 0,
    issues,
    stats: {
      totalFiles: files.length,
      parsedOk: syntaxResults.passed,
      parseFailed: syntaxResults.failed,
      importsResolved: importResults.resolved,
      importsBroken: importResults.broken,
      routesOk: routeResults.found,
      routesMissing: routeResults.missing,
    },
  };
}

// ─── Syntax Check ─────────────────────────────────────────────────────────

function checkSyntax(workspace: Workspace): {
  issues: VerificationIssue[];
  passed: number;
  failed: number;
} {
  const issues: VerificationIssue[] = [];
  let passed = 0;
  let failed = 0;

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;

    // Skip very small files (likely just re-exports)
    if (content.trim().length < 10) continue;

    try {
      transform(content, {
        transforms: ["jsx", "imports"],
        jsxRuntime: "automatic",
        filePath: path,
      });
      passed++;
    } catch (err: any) {
      failed++;
      issues.push({
        category: "syntax_error",
        severity: "error",
        file: path,
        line: err.loc?.line,
        message: err.message?.split("\n")[0] || "Syntax error",
      });
    }
  }

  return { issues, passed, failed };
}

// ─── Import Syntax Validation ─────────────────────────────────────────────

/**
 * Validates import statement syntax beyond what the parser catches.
 * Detects: malformed imports, mixed default+named without proper syntax,
 * duplicate imports from same module, imports using require() in ESM context.
 */
function checkImportSyntax(workspace: Workspace): {
  issues: VerificationIssue[];
} {
  const issues: VerificationIssue[] = [];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;
    const lines = content.split("\n");

    const seenImportSources = new Map<string, number>(); // source → first line

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("import ") && !line.startsWith("import{")) continue;

      const lineNum = i + 1;

      // Check for require() in import context (common AI mistake)
      if (/import\s+.*=\s*require\s*\(/.test(line)) {
        issues.push({
          category: "invalid_import_syntax",
          severity: "error",
          file: path,
          line: lineNum,
          message: `CJS require() mixed with import syntax: "${line.slice(0, 80)}"`,
          suggestedFix: "Convert to ESM: import X from 'module'",
        });
        continue;
      }

      // Check for import without from (except side-effect imports like import './styles.css')
      if (/import\s+\{[^}]+\}\s*;/.test(line) || /import\s+\w+\s*;/.test(line)) {
        if (!line.includes("from") && !/'[^']*'/.test(line) && !/"[^"]*"/.test(line)) {
          issues.push({
            category: "invalid_import_syntax",
            severity: "error",
            file: path,
            line: lineNum,
            message: `Import missing 'from' clause: "${line.slice(0, 80)}"`,
            suggestedFix: "Add from 'module-path' to the import statement",
          });
          continue;
        }
      }

      // Check for duplicate imports from same source
      const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/);
      if (fromMatch) {
        const source = fromMatch[1];
        if (seenImportSources.has(source)) {
          issues.push({
            category: "invalid_import_syntax",
            severity: "warning",
            file: path,
            line: lineNum,
            message: `Duplicate import from '${source}' (first at line ${seenImportSources.get(source)})`,
            suggestedFix: `Merge imports from '${source}' into a single statement`,
          });
        } else {
          seenImportSources.set(source, lineNum);
        }
      }

      // Check for malformed destructured imports (missing closing brace)
      if (line.includes("{") && !line.includes("}") && !lines.slice(i, Math.min(i + 5, lines.length)).join(" ").includes("}")) {
        issues.push({
          category: "invalid_import_syntax",
          severity: "error",
          file: path,
          line: lineNum,
          message: `Unclosed destructured import: "${line.slice(0, 80)}"`,
          suggestedFix: "Add closing brace } to the import statement",
        });
      }

      // Check for import from empty string
      if (/from\s+['"]["']/.test(line)) {
        issues.push({
          category: "invalid_import_syntax",
          severity: "error",
          file: path,
          line: lineNum,
          message: `Import from empty module path: "${line.slice(0, 80)}"`,
          suggestedFix: "Specify a valid module path",
        });
      }
    }
  }

  return { issues };
}

// ─── Import Resolution Check ──────────────────────────────────────────────

function checkImports(workspace: Workspace): {
  issues: VerificationIssue[];
  resolved: number;
  broken: number;
} {
  const unresolved = workspace.findUnresolvedImports();
  const issues: VerificationIssue[] = unresolved.map(u => ({
    category: "broken_import" as IssueCategory,
    severity: "error" as const,
    file: u.file,
    message: `Cannot resolve import '${u.importPath}' (symbols: ${u.symbols.join(", ")})`,
    suggestedFix: `Create file ${u.importPath} or fix the import path`,
  }));

  // Count total imports to get resolved count
  const idx = workspace.index;
  let totalInternal = 0;
  for (const imports of Object.values(idx.imports)) {
    totalInternal += imports.filter(i =>
      i.from.startsWith(".") || i.from.startsWith("/") || i.from.startsWith("@/")
    ).length;
  }

  return {
    issues,
    resolved: totalInternal - unresolved.length,
    broken: unresolved.length,
  };
}

// ─── Produced Files Check ─────────────────────────────────────────────────

function checkProducedFiles(
  workspace: Workspace,
  taskGraph: TaskGraph
): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];

  for (const task of taskGraph.tasks) {
    if (task.status === "skipped") continue;

    for (const expectedFile of task.produces) {
      // Try with and without extensions
      const exists = workspace.hasFile(expectedFile) ||
        workspace.hasFile(expectedFile + ".jsx") ||
        workspace.hasFile(expectedFile + ".tsx") ||
        workspace.hasFile(expectedFile + ".js");

      if (!exists) {
        issues.push({
          category: "missing_file",
          severity: "error",
          file: expectedFile,
          message: `Task '${task.label}' was expected to produce '${expectedFile}' but it doesn't exist`,
          suggestedFix: `Generate ${expectedFile} with the required exports`,
        });
      }
    }
  }

  return { issues };
}

// ─── Empty Stub Check ─────────────────────────────────────────────────────

function checkEmptyStubs(workspace: Workspace): {
  issues: VerificationIssue[];
} {
  const issues: VerificationIssue[] = [];
  const STUB_PATTERNS = [
    /loading\.\.\./i,
    /placeholder/i,
    /TODO:\s*implement/i,
    /stub/i,
  ];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;

    // Very short files with stub-like content
    if (content.length < 200 && STUB_PATTERNS.some(p => p.test(content))) {
      issues.push({
        category: "empty_stub",
        severity: "warning",
        file: path,
        message: `File appears to be an empty stub: ${path}`,
        suggestedFix: `Generate real implementation for ${path}`,
      });
    }
  }

  return { issues };
}

// ─── Route Check ──────────────────────────────────────────────────────────

function checkRoutes(workspace: Workspace): {
  issues: VerificationIssue[];
  found: number;
  missing: number;
} {
  const issues: VerificationIssue[] = [];
  let found = 0;
  let missing = 0;

  const appFile = workspace.getFile("/App.jsx") || workspace.getFile("/App.tsx") || "";
  if (!appFile) return { issues, found: 0, missing: 0 };

  // Extract route paths from App.jsx
  const routeRegex = /path=["']([^"']+)["']/g;
  let match;
  while ((match = routeRegex.exec(appFile)) !== null) {
    const routePath = match[1];
    if (routePath === "*") continue;

    // Extract component name from element={<ComponentName />}
    const routeArea = appFile.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    const componentMatch = routeArea.match(/element=\{[^}]*<(\w+)/);
    if (componentMatch) {
      const componentName = componentMatch[1];
      // Check if this component is imported
      const importRegex = new RegExp(`import\\s+.*${componentName}.*from\\s+['"]([^'"]+)['"]`);
      const importMatch = appFile.match(importRegex);

      if (importMatch) {
        const importPath = importMatch[1];
        const resolved = workspace.resolveImport("/App.jsx", importPath);
        if (resolved && workspace.hasFile(resolved)) {
          found++;
        } else {
          missing++;
          issues.push({
            category: "missing_route" as const,
            severity: "error",
            file: "/App.jsx",
            message: `Route '${routePath}' references component '${componentName}' imported from '${importPath}' which doesn't exist`,
            suggestedFix: `Create ${importPath}.jsx with a ${componentName} component`,
          });
        }
      }
    }
  }

  return { issues, found, missing };
}

// ─── Undefined Function Calls in useEffect ────────────────────────────────

function checkUndefinedCalls(workspace: Workspace): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;

    // Find useEffect calls and check that functions referenced inside are defined
    const effectRegex = /useEffect\(\s*\(\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;
    while ((match = effectRegex.exec(content)) !== null) {
      const effectBody = match[1];
      // Find function calls like fetchBoards(), loadData(), etc.
      const callRegex = /\b([a-zA-Z_]\w*)\s*\(/g;
      let callMatch;
      while ((callMatch = callRegex.exec(effectBody)) !== null) {
        const fnName = callMatch[1];
        // Skip common built-ins and React functions
        const builtins = new Set([
          "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
          "fetch", "JSON", "Array", "Object", "Promise", "parseInt", "parseFloat",
          "String", "Number", "Boolean", "Date", "Math", "Error", "RegExp",
          "alert", "confirm", "encodeURIComponent", "decodeURIComponent",
        ]);
        if (builtins.has(fnName)) continue;
        // Skip setState-like calls (setX pattern)
        if (/^set[A-Z]/.test(fnName)) continue;

        // Check if the function is defined/imported anywhere in the file
        const defPatterns = [
          new RegExp(`function\\s+${fnName}\\s*\\(`),
          new RegExp(`const\\s+${fnName}\\s*=`),
          new RegExp(`let\\s+${fnName}\\s*=`),
          new RegExp(`var\\s+${fnName}\\s*=`),
          new RegExp(`\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*=`), // destructuring
          new RegExp(`import\\b[^;]*\\b${fnName}\\b`),
        ];

        const isDefined = defPatterns.some(p => p.test(content));
        if (!isDefined) {
          const lineNum = content.substring(0, match.index).split("\n").length;
          issues.push({
            category: "missing_component",
            severity: "error",
            file: path,
            line: lineNum,
            message: `Function '${fnName}()' called in useEffect but never defined or imported`,
            suggestedFix: `Define '${fnName}' as a function or destructure it from a context/hook before calling it`,
          });
        }
      }
    }
  }

  return { issues };
}

// ─── Router Hook Violations ───────────────────────────────────────────────

/**
 * Detects useNavigate (or other Router-only hooks) inside files that are
 * rendered OUTSIDE a Router context — specifically AuthContext, ThemeContext,
 * and any top-level provider.
 */
function checkRouterHookViolations(workspace: Workspace): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];
  const ROUTER_HOOKS = ["useNavigate", "useLocation", "useParams", "useSearchParams"];
  // Files that typically wrap OUTSIDE the Router (or are the Router's sibling)
  const CONTEXT_PATTERNS = [/AuthContext/, /ThemeContext/, /AppContext/, /Provider/];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const isContextFile = CONTEXT_PATTERNS.some(p => p.test(path));
    if (!isContextFile) continue;

    const content = workspace.getFile(path)!;
    for (const hook of ROUTER_HOOKS) {
      const regex = new RegExp(`\\b${hook}\\b`);
      if (regex.test(content)) {
        const lineNum = content.split("\n").findIndex(l => regex.test(l)) + 1;
        issues.push({
          category: "router_hook_violation",
          severity: "error",
          file: path,
          line: lineNum,
          message: `'${hook}' used in ${path} which is rendered outside <Router>. Remove it — navigation should be handled by consuming components.`,
          suggestedFix: `Remove all '${hook}' usage from ${path}`,
        });
      }
    }
  }
  return { issues };
}

// ─── Export Validity Check ────────────────────────────────────────────────

/**
 * Checks "export { A, B, C }" statements and ensures each identifier
 * is actually defined in the file. Catches AI-generated barrel exports
 * that reference non-existent symbols.
 */
function checkExportValidity(workspace: Workspace): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^export\s*\{([^}]+)\}\s*;?\s*$/);
      if (!match) continue;

      const ids = match[1].split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean);
      for (const id of ids) {
        // Check if this identifier is defined somewhere in the file
        const defRegex = new RegExp(`(?:function|const|let|var|class)\\s+${id}\\b`);
        if (!defRegex.test(content)) {
          issues.push({
            category: "undefined_export",
            severity: "error",
            file: path,
            line: i + 1,
            message: `Export '${id}' in "export { ... }" is not defined in ${path}`,
            suggestedFix: `Remove '${id}' from the export statement or define it`,
          });
        }
      }
    }
  }
  return { issues };
}

  return { issues };
}
