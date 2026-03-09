import { useMemo, Component, ReactNode } from "react";
import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewPane,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
import { usePreview, SandpackFileSet } from "@/contexts/PreviewContext";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
  console.warn(`[SandpackRepair] File "${filePath}" is truncated. Replacing with stub.`);
  return `import React from "react";\n\nexport default function ${safeName}() {\n  return (\n    <div className="p-8 text-center">\n      <h2 className="text-lg font-semibold text-slate-800">${safeName}</h2>\n      <p className="text-sm text-slate-500 mt-2">This page is being generated. Please rebuild.</p>\n    </div>\n  );\n}\n`;
}

function repairTruncatedCode(code: string, filePath: string): string {
  // Quick check: if file is very short or empty, stub it
  if (code.trim().length < 30) return makeStub(filePath);

  // ── Step 1: Fix unterminated strings per-line (same as autoRepairJSX) ──
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dq = (line.match(/(?<!\\)"/g) || []).length;
    const sq = (line.match(/(?<!\\)'/g) || []).length;
    const bt = (line.match(/(?<!\\)`/g) || []).length;
    if (dq % 2 !== 0) lines[i] = line + '"';
    if (sq % 2 !== 0) lines[i] = lines[i] + "'";
    if (bt % 2 !== 0) lines[i] = lines[i] + "`";
  }
  code = lines.join("\n");

  // ── Step 2: Count unmatched brackets AFTER string repair ──
  let braces = 0, brackets = 0, parens = 0;
  let inSingleStr = false, inDoubleStr = false, inTemplate = false;
  let prevCh = '';
  for (const ch of code) {
    if (prevCh !== '\\') {
      if (ch === "'" && !inDoubleStr && !inTemplate) inSingleStr = !inSingleStr;
      if (ch === '"' && !inSingleStr && !inTemplate) inDoubleStr = !inDoubleStr;
      if (ch === '`' && !inSingleStr && !inDoubleStr) inTemplate = !inTemplate;
    }
    if (!inSingleStr && !inDoubleStr && !inTemplate) {
      if (ch === '{') braces++; else if (ch === '}') braces--;
      if (ch === '[') brackets++; else if (ch === ']') brackets--;
      if (ch === '(') parens++; else if (ch === ')') parens--;
    }
    prevCh = ch;
  }

  // Close any remaining unterminated strings at file level
  if (inTemplate) code = code.trimEnd() + '`';
  if (inDoubleStr) code = code.trimEnd() + '"';
  if (inSingleStr) code = code.trimEnd() + "'";

  const totalUnclosed = Math.max(0, braces) + Math.max(0, brackets) + Math.max(0, parens);

  // Only stub if SEVERELY broken (>8 unclosed) — otherwise try to repair
  if (totalUnclosed > 8) {
    console.warn(`[SandpackRepair] File "${filePath}" has ${totalUnclosed} unclosed brackets — stubbing.`);
    return makeStub(filePath);
  }

  // Close unclosed brackets (up to 8)
  const closers: string[] = [];
  for (let i = 0; i < Math.max(0, parens); i++) closers.push(')');
  for (let i = 0; i < Math.max(0, brackets); i++) closers.push(']');
  for (let i = 0; i < Math.max(0, braces); i++) closers.push('}');
  if (closers.length > 0) {
    code = code.trimEnd() + ';\n' + closers.join(';\n') + ';\n';
  }

  // If no export, add a default export wrapper instead of stubbing
  const hasExport = /export\s+(default|const|function|class|let|var|\{)/.test(code) || code.includes('module.exports');
  if (!hasExport) {
    if (filePath.match(/\.(jsx?|tsx?)$/) && !filePath.includes('styles') && !filePath.includes('utils') && !filePath.includes('data') && !filePath.includes('config') && !filePath.includes('constants')) {
      // Try to find a function/const component name
      const fnMatch = code.match(/(?:function|const|class)\s+([A-Z]\w+)/);
      if (fnMatch) {
        code += `\nexport default ${fnMatch[1]};\n`;
      } else {
        // No recoverable component — stub it
        return makeStub(filePath);
      }
    }
  }

  return code;
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
