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

  // 10. Semantic check: missing imports for common identifiers (clsx, React)
  const missingImportResults = checkMissingCommonImports(workspace);
  issues.push(...missingImportResults.issues);

  // 11. Semantic check: provider ordering (ToastProvider must wrap AuthProvider)
  const providerOrderResults = checkProviderOrdering(workspace);
  issues.push(...providerOrderResults.issues);

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
      // Look ahead up to 15 lines to allow for legitimate multi-line destructured imports
      if (line.includes("{") && !line.includes("}")) {
        const lookAhead = lines.slice(i, Math.min(i + 15, lines.length)).join(" ");
        const hasClosingBrace = lookAhead.includes("}");
        if (!hasClosingBrace) {
          issues.push({
            category: "invalid_import_syntax",
            severity: "error",
            file: path,
            line: lineNum,
            message: `Unclosed destructured import: "${line.slice(0, 80)}"`,
            suggestedFix: "Add closing brace } to the import statement",
          });
        }
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
  const definedRoutes = new Set<string>();
  let match;
  while ((match = routeRegex.exec(appFile)) !== null) {
    const routePath = match[1];
    if (routePath === "*") continue;
    definedRoutes.add(routePath);

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
        // Skip package imports (react-router-dom, etc.) — they're always valid
        if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
          found++;
        } else {
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
  }

  // ─── Nav-Route Mismatch Check ───────────────────────────────────────
  // Find sidebar/navbar NavLink paths and verify they have matching Route entries
  for (const sidebarPath of ["/layout/Sidebar.jsx", "/layout/Sidebar.tsx", "/components/Sidebar.jsx", "/layout/Navigation.jsx"]) {
    const sidebarContent = workspace.getFile(sidebarPath);
    if (!sidebarContent) continue;

    const navLinkPaths = new Set<string>();
    const navLinkRegex = /(?:to|path|href)[:=]\s*["']([^"']+)["']/g;
    let navMatch;
    while ((navMatch = navLinkRegex.exec(sidebarContent)) !== null) {
      const navPath = navMatch[1];
      if (navPath === "/" || navPath === "*" || navPath.startsWith("http")) continue;
      navLinkPaths.add(navPath);
    }

    for (const navPath of navLinkPaths) {
      if (!definedRoutes.has(navPath)) {
        missing++;
        issues.push({
          category: "missing_route" as const,
          severity: "error",
          file: sidebarPath,
          message: `Navigation link to '${navPath}' in ${sidebarPath} has no matching <Route> in App.jsx — clicking it shows a blank page`,
          suggestedFix: `Add <Route path="${navPath}" element={<PageComponent />} /> to App.jsx and create the page component`,
        });
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
        // Skip JS keywords, built-ins, common methods, and React functions
        const SKIP_NAMES = new Set([
          // JS keywords & control flow
          "if", "else", "for", "while", "do", "switch", "case", "return",
          "throw", "try", "catch", "finally", "new", "typeof", "instanceof",
          "void", "delete", "in", "of", "async", "await", "yield", "class",
          "function", "const", "let", "var", "import", "export", "default",
          // Built-in globals
          "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
          "fetch", "JSON", "Array", "Object", "Promise", "parseInt", "parseFloat",
          "String", "Number", "Boolean", "Date", "Math", "Error", "RegExp",
          "alert", "confirm", "prompt", "encodeURIComponent", "decodeURIComponent",
          "encodeURI", "decodeURI", "atob", "btoa", "isNaN", "isFinite",
          "Map", "Set", "WeakMap", "WeakSet", "Symbol", "Proxy", "Reflect",
          "AbortController", "URLSearchParams", "URL", "FormData", "Headers",
          "Request", "Response", "Blob", "File", "FileReader", "TextEncoder",
          "TextDecoder", "crypto", "performance", "queueMicrotask",
          "requestAnimationFrame", "cancelAnimationFrame",
          "addEventListener", "removeEventListener", "dispatchEvent",
          "CustomEvent", "Event",
          // Common prototype methods (frequently called on objects/arrays)
          "map", "filter", "reduce", "forEach", "find", "findIndex", "some",
          "every", "includes", "indexOf", "slice", "splice", "push", "pop",
          "shift", "unshift", "sort", "reverse", "concat", "join", "split",
          "replace", "match", "test", "exec", "trim", "startsWith", "endsWith",
          "keys", "values", "entries", "from", "assign", "create", "freeze",
          "stringify", "parse", "resolve", "reject", "all", "allSettled", "race",
          "then", "catch", "finally",
          // DOM methods
          "getElementById", "querySelector", "querySelectorAll",
          "createElement", "appendChild", "removeChild", "setAttribute",
          "getAttribute", "getItem", "setItem", "removeItem", "clear",
          // React internals
          "useEffect", "useState", "useCallback", "useMemo", "useRef",
          "useContext", "useReducer", "useLayoutEffect", "useId",
          "createContext", "createRef", "forwardRef", "memo", "lazy",
          "createElement", "cloneElement", "createPortal",
          "render", "unmount",
        ]);
        if (SKIP_NAMES.has(fnName)) continue;
        // Skip setState-like calls (setX pattern)
        if (/^set[A-Z]/.test(fnName)) continue;
        // Skip common method call patterns (obj.method() — the regex captures "method")
        // If the character before the function name is a dot, it's a method call — skip
        const matchPos = callMatch.index;
        if (matchPos > 0 && effectBody[matchPos - 1] === '.') continue;

        // Check if the function is defined/imported anywhere in the file
        const defPatterns = [
          new RegExp(`function\\s+${fnName}\\s*\\(`),
          new RegExp(`const\\s+${fnName}\\s*=`),
          new RegExp(`let\\s+${fnName}\\s*=`),
          new RegExp(`var\\s+${fnName}\\s*=`),
          new RegExp(`\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*=`), // destructuring assignment
          new RegExp(`function\\s+\\w+\\s*\\(\\s*\\{[^)]*\\b${fnName}\\b[^)]*\\}\\s*\\)`), // function params
          new RegExp(`(?:const|let|var)\\s+\\w+\\s*=\\s*(?:async\\s*)?\\(\\s*\\{[^)]*\\b${fnName}\\b[^)]*\\}\\s*\\)\\s*=>`), // arrow params
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
 * is actually defined in the file. Also detects duplicate named + default
 * exports of the same symbol (e.g. `export { Button }` AND `export default Button`).
 */
function checkExportValidity(workspace: Workspace): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;
    const lines = content.split("\n");

    // Track all named exports and default exports
    const namedExports = new Set<string>();
    let defaultExportName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect `export { X, Y }`
      const namedMatch = line.match(/^export\s*\{([^}]+)\}\s*;?\s*$/);
      if (namedMatch) {
        const ids = namedMatch[1].split(",").map(s => s.replace(/\s+as\s+\w+/, "").trim()).filter(Boolean);
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
          namedExports.add(id);
        }
      }

      // Detect `export default X` or `export default function X`
      const defaultMatch = line.match(/^export\s+default\s+(?:function\s+)?(\w+)/);
      if (defaultMatch) {
        defaultExportName = defaultMatch[1];
      }
    }

    // Check for conflict: same symbol in both `export { X }` and `export default X`
    if (defaultExportName && namedExports.has(defaultExportName)) {
      issues.push({
        category: "undefined_export",
        severity: "error",
        file: path,
        message: `'${defaultExportName}' is exported both as named export and default export — this causes "already exported" errors`,
        suggestedFix: `Remove "export { ${defaultExportName} }" and keep only "export default ${defaultExportName}"`,
      });
    }
  }
  return { issues };
}

// ─── Missing Common Imports Check ─────────────────────────────────────────

/**
 * Detects usage of well-known identifiers without corresponding imports.
 * E.g. using clsx() without importing clsx.
 */
function checkMissingCommonImports(workspace: Workspace): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];

  const COMMON_IMPORTS = [
    { name: "clsx", usagePattern: /\bclsx\s*\(/, importPattern: /import\s+(?:clsx|{[^}]*clsx[^}]*})\s+from\s+['"]clsx['"]/ },
    { name: "React", usagePattern: /\bReact\b/, importPattern: /import\s+React/ },
  ];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;

    for (const check of COMMON_IMPORTS) {
      if (check.usagePattern.test(content) && !check.importPattern.test(content)) {
        issues.push({
          category: "missing_import" as IssueCategory,
          severity: "error",
          file: path,
          message: `'${check.name}' is used but not imported in ${path}`,
          suggestedFix: `Add import for '${check.name}'`,
        });
      }
    }
  }

  return { issues };
}

// ─── Provider Ordering Check ──────────────────────────────────────────────

/**
 * Validates that ToastProvider wraps AuthProvider in App.jsx.
 * AuthProvider uses useToast() internally, so it MUST be inside ToastProvider.
 */
function checkProviderOrdering(workspace: Workspace): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];
  
  const appPath = ["/App.jsx", "/App.tsx", "/App.js"].find(p => workspace.hasFile(p));
  if (!appPath) return { issues };

  const content = workspace.getFile(appPath)!;
  
  // Check if both providers exist
  const hasAuth = /<AuthProvider[\s>]/.test(content);
  const hasToast = /<ToastProvider[\s>]/.test(content);
  
  if (!hasAuth || !hasToast) return { issues };

  // Check ordering: AuthProvider should NOT be the outer wrapper
  const authPos = content.search(/<AuthProvider[\s>]/);
  const toastPos = content.search(/<ToastProvider[\s>]/);

  if (authPos < toastPos) {
    issues.push({
      category: "provider_ordering" as IssueCategory,
      severity: "error",
      file: appPath,
      message: "AuthProvider wraps ToastProvider, but AuthProvider uses useToast() — ToastProvider must be the outer wrapper",
      suggestedFix: "Swap provider nesting: <ToastProvider><AuthProvider>...</AuthProvider></ToastProvider>",
    });
  }

  return { issues };
}
