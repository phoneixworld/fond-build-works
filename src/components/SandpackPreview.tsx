import { useMemo, Component, ReactNode, useEffect } from "react";
import { useProjects } from "@/contexts/ProjectContext";
import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewPane,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
import { usePreview, SandpackFileSet } from "@/contexts/PreviewContext";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { transform } from "sucrase";

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

  static getDerivedStateFromError(error: unknown) {
    // Sandpack throws SyntaxErrors with read-only properties.
    // Always create a fresh Error to avoid "Cannot assign to read only property 'message'"
    let msg = "Preview encountered an error";
    try {
      if (error instanceof Error) msg = error.message;
      else msg = String(error);
    } catch { /* swallow */ }
    return { hasError: true, error: new Error(msg) };
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
  "@tanstack/react-query", "@tanstack/react-table", "react-hook-form", "sonner",
]);

function isAllowedPkg(pkg: string): boolean {
  if (pkg.startsWith(".") || pkg.startsWith("/")) return true;
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  return ALLOWED_PACKAGES.has(base);
}

// Sucrase-based syntax validation is used instead of heuristic brace counting.

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

  // Final safety: use Sucrase to parse the code — catches real syntax errors
  // that would crash Sandpack's bundler with "Cannot assign to read only property 'message'"
  // IMPORTANT: Only use ["jsx"] transform — do NOT add "imports" as it converts
  // ES modules to CommonJS (import→require) which breaks Sandpack completely.
  try {
    transform(code, {
      transforms: ["jsx"],
      jsxRuntime: "automatic",
      production: true,
    });
  } catch {
    // Sucrase couldn't parse it — but DON'T stub it out.
    // Let Sandpack try to handle it — a Sandpack error overlay is better than a blank screen.
    // Only stub truly catastrophic files (unclosed strings, completely broken syntax)
    const hasDefaultExport = /export\s+default\b/.test(code);
    const hasOpenTags = /<\w/.test(code);
    if (hasDefaultExport && hasOpenTags) {
      // Has basic structure — let Sandpack try
      console.warn(`[SandpackPreview] Sucrase parse warning in ${filePath}, passing through to Sandpack`);
      return code;
    }
    // Truly broken — use stub
    console.warn(`[SandpackPreview] Syntax error in ${filePath}, using safe stub`);
    return makeSafeStub(filePath);
  }

  return code;
}

const DEFAULT_APP = `import React, { useState, useEffect } from "react";

export default function App() {
  const [dots, setDots] = useState("");
  const [step, setStep] = useState(0);
  const steps = [
    "Initializing workspace",
    "Analyzing requirements",
    "Generating components",
    "Assembling application"
  ];

  useEffect(() => {
    const dotTimer = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    const stepTimer = setInterval(() => setStep(s => (s + 1) % 4), 3000);
    return () => { clearInterval(dotTimer); clearInterval(stepTimer); };
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
        <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 32px" }}>
          <div style={{ width: 80, height: 80, borderRadius: 22, background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 0 40px rgba(99,102,241,0.4)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 2s ease-in-out infinite", overflow: "hidden" }}>
            <svg viewBox="0 0 200 200" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="birdGrad" x1="60" y1="20" x2="140" y2="180" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#38bdf8"/>
                  <stop offset="100%" stopColor="#a855f7"/>
                </linearGradient>
              </defs>
              <path d="M120 25c-8 0-18 6-22 14-6 12-4 28 4 38l-12 16c-20-8-38 2-46 18-8 16-4 38 10 50 14 12 34 16 50 8l8-4c4 6 10 12 18 14 10 2 20-2 26-10 8-12 6-28-2-38l4-8c12 4 26 0 34-10 10-14 8-34-4-46-10-10-24-14-36-10l-6-14c8-6 12-16 8-26-4-10-16-16-26-16l-8 8zm-14 60c6 0 12 4 14 10 2 8-2 16-10 18-8 2-16-2-18-10-2-8 2-16 10-18h4z" fill="url(#birdGrad)"/>
            </svg>
          </div>
          <div style={{ position: "absolute", inset: -5, borderRadius: 27, border: "2px solid rgba(99,102,241,0.25)", animation: "spin 8s linear infinite" }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Phoneix is building your app</h1>
        <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 32px" }}>Sit back while we craft something amazing</p>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "16px 20px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", animation: "pulse 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>{steps[step]}{dots}</span>
          </div>
          <div style={{ marginTop: 12, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg, #6366f1, #a855f7)", borderRadius: 2, animation: "loading 2s ease-in-out infinite", width: "60%" }} />
          </div>
        </div>
        <style>{\`
          @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.85; transform: scale(0.97); } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes loading { 0% { width: 10%; opacity: 0.5; } 50% { width: 70%; opacity: 1; } 100% { width: 10%; opacity: 0.5; } }
        \`}</style>
      </div>
    </div>
  );
}
`;

function buildIndexJs(projectId: string, supabaseUrl: string, supabaseKey: string): string {
  return `import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Inject project globals for generated auth/data hooks
window.__PROJECT_ID__ = "${projectId}";
window.__SUPABASE_URL__ = "${supabaseUrl}";
window.__SUPABASE_KEY__ = "${supabaseKey}";

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
}

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

function buildSandpackFiles(files: SandpackFileSet | null, projectId: string, supabaseUrl: string, supabaseKey: string): Record<string, string> {
  const indexJs = buildIndexJs(projectId, supabaseUrl, supabaseKey);
  const base: Record<string, string> = {
    "/index.js": indexJs,
    "/styles.css": DEFAULT_STYLES,
    "/public/index.html": DEFAULT_INDEX_HTML,
  };

  if (!files || Object.keys(files).length === 0) {
    base["/App.js"] = DEFAULT_APP;
    return base;
  }

  // Map user files into sandpack paths — sanitize imports only, no repair
  // Normalize ALL .jsx/.tsx/.ts extensions to .js for consistent Sandpack resolution
  for (const [path, code] of Object.entries(files)) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const sandpackPath = normalized.replace(/\.(tsx?|jsx)$/, ".js");
    let processed = sandpackPath.match(/\.js$/) ? sanitizeImports(code, sandpackPath) : code;

    // ── AuthContext fixes: strip useNavigate, ensure exports ──
    if (sandpackPath.includes("AuthContext") && sandpackPath.endsWith(".js")) {
      // CRITICAL: AuthContext must NOT use useNavigate — it sits outside Router
      // Step 1: Remove entire "const navigate = useNavigate();" lines FIRST
      processed = processed.replace(/^\s*const\s+navigate\s*=\s*useNavigate\s*\(\s*\)\s*;?\s*$/gm, "");
      // Step 2: Replace any navigate("/...") calls with no-ops
      processed = processed.replace(/\bnavigate\s*\(\s*['"][^'"]*['"]\s*\)/g, "/* navigate removed */");
      // Step 2b: Remove "navigate" from dependency arrays like [projectId, navigate]
      processed = processed.replace(/,\s*navigate\b/g, "");
      processed = processed.replace(/\bnavigate\s*,\s*/g, "");
      // Step 3: Remove useNavigate from import statements (e.g. "import { useState, useNavigate } from ...")
      processed = processed.replace(/,\s*useNavigate/g, "");
      processed = processed.replace(/useNavigate\s*,\s*/g, "");
      // Handle solo import: "import { useNavigate } from ..."
      processed = processed.replace(/^\s*import\s*\{\s*useNavigate\s*\}\s*from\s*['"][^'"]*['"]\s*;?\s*$/gm, "");

      // Ensure AuthProvider and useAuth are exported — but NEVER duplicate existing exports
      const hasNamedAuthProviderExport = /export\s+(function|const)\s+AuthProvider\b/.test(processed) || /export\s*\{[^}]*AuthProvider[^}]*\}/.test(processed);
      const hasDefaultExport = /export\s+default\b/.test(processed);
      const hasNamedUseAuthExport = /export\s+(function|const)\s+useAuth\b/.test(processed) || /export\s*\{[^}]*useAuth[^}]*\}/.test(processed);

      // Convert "export default function AuthProvider" to named export
      if (/export\s+default\s+function\s+AuthProvider/.test(processed)) {
        processed = processed.replace(/export\s+default\s+function\s+AuthProvider/, "export function AuthProvider");
        if (!/export\s+default\s/.test(processed)) {
          processed += "\nexport default AuthProvider;\n";
        }
      }
      // Add default export if missing
      if (!hasDefaultExport && hasNamedAuthProviderExport) {
        processed += "\nexport default AuthProvider;\n";
      }
      // Add named AuthProvider export if missing
      if (!hasNamedAuthProviderExport && /(?:function|const)\s+AuthProvider\b/.test(processed)) {
        processed = processed.replace(/^((?:function|const)\s+AuthProvider\b)/m, "export $1");
      }
      // Add named useAuth export if missing
      if (!hasNamedUseAuthExport && /(?:function|const)\s+useAuth\b/.test(processed)) {
        processed = processed.replace(/^((?:function|const)\s+useAuth\b)/m, "export $1");
      }
    }

    // Ensure all component files have a default export — prevents "Element type is invalid"
    if (sandpackPath.endsWith(".js") && !sandpackPath.includes("styles") && !sandpackPath.includes(".css")) {
      if (!/export\s+default\b/.test(processed)) {
        // Try to find the main component/function name and add default export
        const mainExportMatch = processed.match(/export\s+(?:function|const)\s+([A-Z]\w+)/);
        if (mainExportMatch) {
          processed += `\nexport default ${mainExportMatch[1]};\n`;
        }
      }
    }

    base[sandpackPath] = processed;
  }

  if (!base["/App.js"]) {
    base["/App.js"] = DEFAULT_APP;
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
  const { currentProject } = useProjects();

  const projectId = currentProject?.id || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  const files = useMemo(() => buildSandpackFiles(sandpackFiles, projectId, supabaseUrl, supabaseKey), [sandpackFiles, projectId, supabaseUrl, supabaseKey]);

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
    "@tanstack/react-table": "^8.17.0",
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
