/**
 * Build Compiler v1.0 — Provider Injector
 * 
 * Deterministic pass: scans workspace for hook usage patterns
 * that require a Provider wrapper, and injects the Provider
 * into App.jsx if missing. No AI needed — pure text transforms.
 */

import type { Workspace } from "./workspace";

interface ProviderRule {
  /** Hook name to search for */
  hookPattern: RegExp;
  /** Provider component name */
  providerName: string;
  /** Import source (relative from App.jsx) */
  importFrom: string;
  /** How to detect the provider is already present */
  providerPattern: RegExp;
}

const PROVIDER_RULES: ProviderRule[] = [
  {
    hookPattern: /\buseAuth\b/,
    providerName: "AuthProvider",
    importFrom: "./contexts/AuthContext",
    providerPattern: /<AuthProvider[\s>]/,
  },
  {
    hookPattern: /\buseToast\b/,
    providerName: "ToastProvider",
    importFrom: "./components/ui/Toast",
    providerPattern: /<ToastProvider[\s>]/,
  },
  {
    hookPattern: /\buseTheme\b/,
    providerName: "ThemeProvider",
    importFrom: "./contexts/ThemeContext",
    providerPattern: /<ThemeProvider[\s>]/,
  },
];

/**
 * Scan workspace for hooks that need providers.
 * If the hook is used anywhere but the provider is missing from App.jsx,
 * inject it deterministically.
 * 
 * Returns the number of providers injected.
 */
export function injectMissingProviders(workspace: Workspace): number {
  const appPath = findAppFile(workspace);
  if (!appPath) return 0;

  let appContent = workspace.getFile(appPath)!;
  let injected = 0;

  for (const rule of PROVIDER_RULES) {
    // Check if any file in workspace uses this hook
    const hookUsed = isHookUsedAnywhere(workspace, rule.hookPattern, appPath);
    if (!hookUsed) continue;

    // Check if provider already exists in App
    if (rule.providerPattern.test(appContent)) continue;

    // Check if the provider source file exists (or will be stubbed)
    const providerFileExists = resolveProviderFile(workspace, rule.importFrom);

    // Inject the provider
    appContent = injectProvider(appContent, rule, providerFileExists);
    injected++;

    console.log(`[ProviderInjector] 💉 Injected <${rule.providerName}> into ${appPath}`);
  }

  if (injected > 0) {
    workspace.updateFile(appPath, appContent);
  }

  return injected;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function findAppFile(workspace: Workspace): string | null {
  const candidates = ["/App.jsx", "/App.tsx", "/App.js"];
  for (const c of candidates) {
    if (workspace.hasFile(c)) return c;
  }
  return null;
}

function isHookUsedAnywhere(
  workspace: Workspace,
  hookPattern: RegExp,
  excludeFile: string
): boolean {
  for (const file of workspace.listFiles()) {
    if (file === excludeFile) continue;
    if (!/\.(jsx?|tsx?)$/.test(file)) continue;
    const content = workspace.getFile(file)!;
    if (hookPattern.test(content)) return true;
  }
  return false;
}

function resolveProviderFile(workspace: Workspace, importFrom: string): boolean {
  const extensions = ["", ".jsx", ".tsx", ".js", ".ts"];
  const path = importFrom.startsWith("./") ? "/" + importFrom.slice(2) : importFrom;
  for (const ext of extensions) {
    if (workspace.hasFile(path + ext)) return true;
  }
  return false;
}

function injectProvider(
  appContent: string,
  rule: ProviderRule,
  providerFileExists: boolean
): string {
  // Step 1: Add import at the top (after last import line)
  const importStatement = `import { ${rule.providerName} } from '${rule.importFrom}';`;

  // Find the last import line
  const lines = appContent.split("\n");
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) {
      lastImportIndex = i;
    }
  }

  // Don't add duplicate import
  if (!appContent.includes(rule.providerName)) {
    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
    } else {
      lines.unshift(importStatement);
    }
  }

  let result = lines.join("\n");

  // Step 2: Wrap the outermost JSX return content with the provider
  // Strategy: find the return statement's outermost JSX element and wrap it
  result = wrapReturnJSX(result, rule.providerName);

  return result;
}

/**
 * Find the main return(...) in the default export component,
 * and wrap its content with <ProviderName>...</ProviderName>.
 * 
 * Handles patterns like:
 *   return ( <HashRouter>...</HashRouter> )
 *   return ( <div>...</div> )
 */
function wrapReturnJSX(code: string, providerName: string): string {
  // Find "return (" pattern — the main render
  // We look for the LAST return( which is typically the App component's return
  const returnMatches = [...code.matchAll(/return\s*\(\s*\n?/g)];
  if (returnMatches.length === 0) return code;

  // Use the last match (likely the App component, not a nested component)
  const match = returnMatches[returnMatches.length - 1];
  const returnStart = match.index! + match[0].length;

  // Find the matching closing paren by counting parens
  let depth = 1;
  let returnEnd = returnStart;
  for (let i = returnStart; i < code.length; i++) {
    if (code[i] === "(") depth++;
    if (code[i] === ")") depth--;
    if (depth === 0) {
      returnEnd = i;
      break;
    }
  }

  const jsxContent = code.substring(returnStart, returnEnd).trim();

  // Wrap the JSX content
  const indented = jsxContent
    .split("\n")
    .map(line => "  " + line)
    .join("\n");

  const wrapped = `<${providerName}>\n${indented}\n    </${providerName}>`;

  return code.substring(0, returnStart) + "\n    " + wrapped + "\n  " + code.substring(returnEnd);
}
