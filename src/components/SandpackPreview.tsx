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
    // Some Sandpack errors have read-only properties; safely extract message
    let safeError = error;
    try {
      // If the error's message is read-only, wrap it in a new Error
      const msg = error?.message || String(error) || "Preview error";
      safeError = new Error(msg);
    } catch {
      safeError = new Error("Preview encountered an error");
    }
    return { hasError: true, error: safeError };
  }

  componentDidCatch(error: Error) {
    // Safely log — don't try to modify the error
    try {
      console.error("[SandpackErrorBoundary]", error?.message || String(error));
    } catch {
      console.error("[SandpackErrorBoundary] Error caught");
    }
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

// ─── Allowlist (for import stripping only) ────────────────────────────────
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

/**
 * Quick syntax check — returns true if code is likely parseable.
 * Checks brace/bracket/paren balance skipping strings.
 * Tolerant of minor imbalances (±3) to avoid false positives.
 */
function quickSyntaxCheck(code: string): boolean {
  let braces = 0, brackets = 0, parens = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inString) {
      if (c === stringChar && code[i - 1] !== '\\') inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; continue; }
    if (c === '{') braces++;
    else if (c === '}') braces--;
    else if (c === '[') brackets++;
    else if (c === ']') brackets--;
    else if (c === '(') parens++;
    else if (c === ')') parens--;
  }
  // If significantly unbalanced, it's broken
  if (Math.abs(braces) > 3 || Math.abs(brackets) > 3 || Math.abs(parens) > 3) return false;
  if (inString) return false;
  return true;
}

/**
 * Generate a safe stub component when code is broken.
 */
function makeSafeStub(filePath: string): string {
  const name = filePath.replace(/.*\//, '').replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9]/g, '') || 'BrokenModule';
  const safeName = name.charAt(0).toUpperCase() + name.slice(1);
  return `import React from "react";

export default function ${safeName}() {
  return (
    <div style={{padding: "2rem", textAlign: "center"}}>
      <p style={{color: "#f59e0b", fontSize: "1.5rem"}}>⚠</p>
      <p style={{color: "#64748b", fontSize: "0.875rem"}}>${safeName} had a build error. Send a follow-up to fix it.</p>
    </div>
  );
}
`;
}

/**
 * Minimal sanitization — strip blocked imports only. No repair, no mutation.
 * Files reaching this point have already been validated upstream by the build engine.
 * Also performs a final syntax safety check to prevent Sandpack crashes.
 */
function sanitizeImports(code: string, filePath: string): string {
  if (!filePath.match(/\.(jsx?|tsx?)$/)) return code;

  // Strip file separator lines (leftover from AI output formatting)
  code = code.split("\n").filter(line => {
    const t = line.trim();
    if (/^-{3}\s+\/?\w[\w/.-]*\.\w+\s*-{0,3}\s*$/.test(t)) return false;
    return true;
  }).join("\n");

  // Strip import/export from blocked packages
  code = code.replace(
    /^\s*(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => isAllowedPkg(pkg) ? match : `// [BLOCKED] ${pkg}`
  );
  code = code.replace(
    /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => isAllowedPkg(pkg) ? match : `// [BLOCKED] ${pkg}`
  );
  code = code.replace(
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => isAllowedPkg(pkg) ? match : `undefined /* BLOCKED: ${pkg} */`
  );

  // Final safety: if code is obviously broken (truncated/malformed), replace with stub
  if (!quickSyntaxCheck(code)) {
    console.warn(`[SandpackPreview] Broken syntax detected in ${filePath}, using safe stub`);
    return makeSafeStub(filePath);
  }

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

const INDEX_JS = `import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Report route changes to parent for URL bar sync
function reportRoute() {
  try {
    window.parent.postMessage({ type: "route-change", path: location.pathname + location.search + location.hash }, "*");
  } catch(e) {}
}

// Safely patch history methods — Sandpack may freeze these
(function patchHistory() {
  try {
    var _push = history.pushState;
    var _replace = history.replaceState;
    history.pushState = function pushState() {
      var r = _push.apply(this, arguments);
      reportRoute();
      return r;
    };
    history.replaceState = function replaceState() {
      var r = _replace.apply(this, arguments);
      reportRoute();
      return r;
    };
  } catch(e) {
    // Sandpack readonly — fall back to polling
    var _lastHref = location.href;
    setInterval(function() {
      if (location.href !== _lastHref) { _lastHref = location.href; reportRoute(); }
    }, 300);
  }
})();
window.addEventListener("popstate", reportRoute);

// Listen for navigation commands from parent
window.addEventListener("message", function(e) {
  if (e.data && e.data.type === "navigate" && e.data.path) {
    try { history.pushState(null, "", e.data.path); } catch(ex) {}
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
});

var root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(StrictMode, null, React.createElement(App))
);
`;

const DEFAULT_STYLES = `@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-light: #dbeafe;
  --color-primary-dark: #1d4ed8;
  --color-success: #10b981;
  --color-success-light: #d1fae5;
  --color-warning: #f59e0b;
  --color-warning-light: #fef3c7;
  --color-danger: #ef4444;
  --color-danger-light: #fee2e2;
  --color-info: #6366f1;
  --color-info-light: #e0e7ff;
  --color-bg: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary: #f1f5f9;
  --color-bg-elevated: #ffffff;
  --color-sidebar: #0f172a;
  --color-sidebar-hover: #1e293b;
  --color-sidebar-active: #334155;
  --color-sidebar-text: #94a3b8;
  --color-sidebar-text-active: #ffffff;
  --color-sidebar-border: #1e293b;
  --color-text: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-text-inverse: #ffffff;
  --color-border: #e2e8f0;
  --color-border-light: #f1f5f9;
  --color-border-focus: #3b82f6;
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --transition-fast: 150ms cubic-bezier(0.4,0,0.2,1);
  --transition-base: 200ms cubic-bezier(0.4,0,0.2,1);
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-sans); color: var(--color-text); background: var(--color-bg); -webkit-font-smoothing: antialiased; line-height: 1.6; }

.card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 1.5rem; box-shadow: var(--shadow-sm); transition: box-shadow var(--transition-base), transform var(--transition-base); }
.card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 500; font-size: 0.875rem; padding: 0.5rem 1rem; border-radius: var(--radius-lg); border: none; cursor: pointer; transition: all var(--transition-fast); }
.btn-primary { background: var(--color-primary); color: var(--color-text-inverse); }
.btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-secondary { background: var(--color-bg-secondary); color: var(--color-text); border: 1px solid var(--color-border); }
.btn-secondary:hover { background: var(--color-bg-tertiary); }
.btn-danger { background: var(--color-danger); color: var(--color-text-inverse); }
.input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.875rem; background: var(--color-bg); color: var(--color-text); transition: border-color var(--transition-fast); }
.input:focus { outline: none; border-color: var(--color-border-focus); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.badge { display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 500; border-radius: var(--radius-full); }
.badge-primary { background: var(--color-primary-light); color: var(--color-primary-dark); }
.badge-success { background: var(--color-success-light); color: #065f46; }
.badge-warning { background: var(--color-warning-light); color: #92400e; }
.badge-danger { background: var(--color-danger-light); color: #991b1b; }
.table { width: 100%; border-collapse: collapse; }
.table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); border-bottom: 1px solid var(--color-border); }
.table td { padding: 0.75rem 1rem; font-size: 0.875rem; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border-light); }
.table tr:hover td { background: var(--color-bg-secondary); }
.surface { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.surface-elevated { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
*:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: var(--radius-full); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
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

  // Map user files into sandpack paths — sanitize imports only, no repair
  for (const [path, code] of Object.entries(files)) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const sandpackPath = normalized.replace(/\.tsx?$/, ".js");
    base[sandpackPath] = sandpackPath.match(/\.(jsx?|js)$/) ? sanitizeImports(code, sandpackPath) : code;
  }

  if (!base["/App.js"] && !base["/App.jsx"]) {
    base["/App.js"] = DEFAULT_APP;
  }

  if (base["/App.jsx"] && !base["/App.js"]) {
    base["/index.js"] = INDEX_JS.replace('./App', './App.jsx');
  }

  return base;
}

// ─── Content hash for stable Sandpack remounting ─────────────────────────
function contentHash(files: SandpackFileSet | null): string {
  if (!files) return "empty";
  const keys = Object.keys(files).sort();
  // FNV-1a-inspired fast hash of all paths + contents
  let hash = 2166136261;
  for (const key of keys) {
    const str = key + files[key];
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
  }
  return hash.toString(36);
}

interface SandpackPreviewProps {
  viewport?: { width: string; maxWidth: string };
  showConsole?: boolean;
  initialPath?: string;
}

const SandpackPreview = ({ viewport, showConsole = false, initialPath }: SandpackPreviewProps) => {
  const { sandpackFiles, sandpackDeps } = usePreview();

  const files = useMemo(() => buildSandpackFiles(sandpackFiles), [sandpackFiles]);

  // Content-based key: remount only when file contents actually change
  const stableKey = useMemo(() => contentHash(sandpackFiles), [sandpackFiles]);

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
