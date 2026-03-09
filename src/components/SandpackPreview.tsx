import { useMemo, Component, ReactNode } from "react";
import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewPane,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
import { usePreview, SandpackFileSet } from "@/contexts/PreviewContext";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { transform } from "sucrase";
import postcss from "postcss";

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SandpackErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[SandpackErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-background">
          <div className="text-center space-y-4 max-w-sm px-6">
            <div className="w-12 h-12 mx-auto rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Preview crashed</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {this.state.error?.message || "An unexpected error occurred in the preview."}
              </p>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onRetry();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Allowlist ────────────────────────────────────────────────────────────────
const ALLOWED_PACKAGES = new Set([
  "react", "react-dom", "react/jsx-runtime",
  "lucide-react", "framer-motion", "date-fns", "recharts",
  "react-router-dom", "clsx", "tailwind-merge",
  "react-intersection-observer", "zustand", "zod", "axios",
  "@tanstack/react-query", "react-hook-form", "sonner",
]);

function isAllowedPkg(pkg: string): boolean {
  if (pkg.startsWith(".") || pkg.startsWith("/")) return true;
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  return ALLOWED_PACKAGES.has(base);
}

/** Second-pass sanitizer applied right before Sandpack receives code */
function makeStub(filePath: string): string {
  const componentName = filePath
    .replace(/.*\//, '')
    .replace(/\.(jsx?|tsx?)$/, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  const safeName = componentName.charAt(0).toUpperCase() + componentName.slice(1) || 'TruncatedPage';
  console.warn(`[SandpackRepair] File "${filePath}" could not be repaired. Using stub.`);
  return `import React from "react";\n\nexport default function ${safeName}() {\n  return (\n    <div className="p-8 text-center space-y-3">\n      <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 flex items-center justify-center"><span className="text-amber-600 text-xl">\u26A0</span></div>\n      <h2 className="text-lg font-semibold text-slate-800">${safeName}</h2>\n      <p className="text-sm text-slate-500">This module had a build error. Send a follow-up message to fix it.</p>\n    </div>\n  );\n}\n`;
}

/**
 * Try to parse JSX with Sucrase. Returns null if valid, or error message if invalid.
 */
function tryParse(code: string): string | null {
  try {
    transform(code, { transforms: ["jsx", "imports"], filePath: "file.jsx" });
    return null;
  } catch (e: any) {
    return e.message || "Unknown parse error";
  }
}

/**
 * Attempt targeted repairs based on Sucrase parse error messages.
 * Returns repaired code or null if unrepairable.
 */
function attemptRepair(code: string, error: string): string | null {
  // Unterminated template literal
  if (/unterminated template/i.test(error)) {
    code = code.trimEnd() + '`';
  }
  // Unterminated string literal  
  else if (/unterminated string/i.test(error)) {
    // Detect which quote type
    let inSingle = false, inDouble = false, prevCh = '';
    for (const ch of code) {
      if (prevCh !== '\\') {
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        if (ch === '"' && !inSingle) inDouble = !inDouble;
      }
      prevCh = ch;
    }
    if (inDouble) code = code.trimEnd() + '"';
    else if (inSingle) code = code.trimEnd() + "'";
    else code = code.trimEnd() + '"';
  }
  // Unterminated regular expression
  else if (/unterminated regular expression/i.test(error)) {
    // Usually means a template literal or string was misinterpreted
    // Try closing with backtick first
    code = code.trimEnd() + '`';
  }
  // Unexpected token / unexpected EOF — likely unclosed brackets
  else if (/unexpected (token|eof)/i.test(error) || /expected/i.test(error)) {
    // Count bracket imbalances
    let braces = 0, brackets = 0, parens = 0;
    let inStr = false, strCh = '';
    let prev = '';
    for (const ch of code) {
      if (prev !== '\\') {
        if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = true; strCh = ch; }
        else if (inStr && ch === strCh) { inStr = false; }
      }
      if (!inStr) {
        if (ch === '{') braces++; else if (ch === '}') braces--;
        if (ch === '[') brackets++; else if (ch === ']') brackets--;
        if (ch === '(') parens++; else if (ch === ')') parens--;
      }
      prev = ch;
    }
    const closers: string[] = [];
    for (let i = 0; i < Math.max(0, parens); i++) closers.push(')');
    for (let i = 0; i < Math.max(0, brackets); i++) closers.push(']');
    for (let i = 0; i < Math.max(0, braces); i++) closers.push('}');
    if (closers.length > 0) {
      code = code.trimEnd() + ';\n' + closers.join(';\n') + ';\n';
    }
  } else {
    return null; // Unknown error type
  }
  return code;
}
/**
 * Repair common CSS issues from AI-generated code.
 * Fixes missing semicolons, unclosed braces, and truncated @import statements.
 */
function repairCSS(code: string): string {
  const lines = code.split("\n");
  const repaired: string[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('//')) {
      repaired.push(line);
      continue;
    }

    // Track braces
    for (const ch of trimmed) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }

    // Inside a rule block: property lines need semicolons
    if (braceDepth > 0 && trimmed.includes(':') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(';') && !trimmed.startsWith('@') && !trimmed.startsWith('/*')) {
      line = line.trimEnd() + ';';
    }

    repaired.push(line);
  }

  let result = repaired.join("\n");

  // Close unclosed braces
  if (braceDepth > 0) {
    for (let i = 0; i < braceDepth; i++) {
      result += '\n}';
    }
  }

  return result;
}

function repairTruncatedCode(code: string, filePath: string): string {
  if (code.trim().length < 30) return makeStub(filePath);
  
  // CSS files: basic repair (fix missing semicolons at end of property lines)
  if (filePath.match(/\.css$/)) {
    return repairCSS(code);
  }

  // Skip non-JSX files
  if (!filePath.match(/\.(jsx?|tsx?)$/)) return code;

  // ── Step 1: Try parsing as-is ──
  let parseError = tryParse(code);
  if (!parseError) return code; // Valid! No repair needed.

  // ── Step 2: Try up to 3 rounds of targeted repair ──
  let repaired = code;
  for (let attempt = 0; attempt < 3; attempt++) {
    const fixed = attemptRepair(repaired, parseError!);
    if (!fixed) break;
    repaired = fixed;
    parseError = tryParse(repaired);
    if (!parseError) {
      console.info(`[SandpackRepair] Fixed "${filePath}" after ${attempt + 1} repair(s)`);
      // Ensure export exists
      const hasExport = /export\s+(default|const|function|class|let|var|\{)/.test(repaired) || repaired.includes('module.exports');
      if (!hasExport) {
        const fnMatch = repaired.match(/(?:function|const|class)\s+([A-Z]\w+)/);
        if (fnMatch) repaired += `\nexport default ${fnMatch[1]};\n`;
      }
      return repaired;
    }
  }

  // ── Step 3: All repairs failed — stub it ──
  console.warn(`[SandpackRepair] Could not fix "${filePath}": ${parseError}`);
  return makeStub(filePath);
}

/** Second-pass sanitizer applied right before Sandpack receives code */
function sanitizeCode(code: string, filePath: string = ""): string {
  // First repair any truncated code
  code = repairTruncatedCode(code, filePath);
  
  // Strip file separator lines
  code = code.split("\n").filter(line => {
    const t = line.trim();
    if (/^-{3}\s+\/?\w[\w/.-]*\.\w+\s*-{0,3}\s*$/.test(t)) return false;
    return true;
  }).join("\n");
  
  // Strip import/export ... from 'unknown-pkg'
  code = code.replace(
    /^\s*(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => isAllowedPkg(pkg) ? match : `// [BLOCKED] ${pkg}`
  );
  // Strip side-effect imports
  code = code.replace(
    /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => isAllowedPkg(pkg) ? match : `// [BLOCKED] ${pkg}`
  );
  // Strip require()
  code = code.replace(
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => isAllowedPkg(pkg) ? match : `undefined /* BLOCKED: ${pkg} */`
  );
  return code;
}

const DEFAULT_APP = `import React from "react";

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">L</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome to Your App</h1>
        <p className="text-sm text-gray-500">Start building by chatting with the AI assistant</p>
      </div>
    </div>
  );
}
`;

const INDEX_JS = `import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Report route changes to parent for URL bar sync
const origPushState = history.pushState;
const origReplaceState = history.replaceState;
function reportRoute() {
  window.parent.postMessage({ type: "route-change", path: location.pathname + location.search + location.hash }, "*");
}
history.pushState = function() { origPushState.apply(this, arguments); reportRoute(); };
history.replaceState = function() { origReplaceState.apply(this, arguments); reportRoute(); };
window.addEventListener("popstate", reportRoute);

// Listen for navigation commands from parent
window.addEventListener("message", function(e) {
  if (e.data?.type === "navigate" && e.data.path) {
    history.pushState(null, "", e.data.path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
});

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

const DEFAULT_STYLES = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const DEFAULT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

function buildSandpackFiles(files: SandpackFileSet | null): Record<string, string> {
  const base: Record<string, string> = {
    "/index.js": INDEX_JS,
    "/styles.css": DEFAULT_STYLES,
    "/public/index.html": DEFAULT_INDEX_HTML,
  };

  if (!files || Object.keys(files).length === 0) {
    base["/App.js"] = DEFAULT_APP;
    return base;
  }

  // Map user files into sandpack paths
  for (const [path, code] of Object.entries(files)) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const sandpackPath = normalized.replace(/\.tsx?$/, ".js");
    base[sandpackPath] = sandpackPath.match(/\.(jsx?|js)$/) ? sanitizeCode(code, sandpackPath) : code;
  }

  // Ensure entry point exists
  if (!base["/App.js"] && !base["/App.jsx"]) {
    base["/App.js"] = DEFAULT_APP;
  }

  // If we have /App.jsx but not /App.js, update index.js import
  if (base["/App.jsx"] && !base["/App.js"]) {
    base["/index.js"] = INDEX_JS.replace('./App', './App.jsx');
  }

  return base;
}

// ─── Stable hash for files to avoid unnecessary Sandpack remounts ─────────
function filesHash(files: SandpackFileSet | null): string {
  if (!files) return "empty";
  const keys = Object.keys(files).sort();
  // Use file count + total length as a fast fingerprint
  const totalLen = keys.reduce((sum, k) => sum + files[k].length, 0);
  return `${keys.length}-${totalLen}`;
}

interface SandpackPreviewProps {
  viewport?: { width: string; maxWidth: string };
  showConsole?: boolean;
  initialPath?: string;
}

const SandpackPreview = ({ viewport, showConsole = false, initialPath }: SandpackPreviewProps) => {
  const { sandpackFiles, sandpackDeps } = usePreview();

  const files = useMemo(() => buildSandpackFiles(sandpackFiles), [sandpackFiles]);

  // Stable key: only remount Sandpack when file structure actually changes
  const stableKey = useMemo(() => filesHash(sandpackFiles), [sandpackFiles]);

  const dependencies = useMemo(() => ({
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
    "date-fns": "^3.6.0",
    "recharts": "^2.12.0",
    "react-router-dom": "^6.22.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "react-intersection-observer": "^9.10.0",
    ...sandpackDeps,
  }), [sandpackDeps]);

  return (
    <div className="h-full w-full" style={{ minHeight: 0 }}>
      <SandpackErrorBoundary onRetry={() => {}}>
        <SandpackProvider
          key={stableKey}
          template="react"
          theme="auto"
          files={files}
          customSetup={{
            dependencies,
          }}
          options={{
            externalResources: [
              "https://cdn.tailwindcss.com",
            ],
            recompileMode: "delayed",
            recompileDelay: 800,
            bundlerTimeOut: 120000,
          }}
        >
          <div className="h-full flex flex-col" style={viewport ? { width: viewport.width, maxWidth: viewport.maxWidth, height: '100%' } : { height: '100%' }}>
            <SandpackPreviewPane
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
              style={{ flex: 1, minHeight: 0, height: '100%' }}
            />
            {showConsole && (
              <div className="h-40 border-t border-border overflow-auto">
                <SandpackConsole />
              </div>
            )}
          </div>
        </SandpackProvider>
      </SandpackErrorBoundary>
    </div>
  );
};

export default SandpackPreview;
