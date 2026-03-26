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
import { DEFAULT_SANDPACK_DEPENDENCIES } from "@/lib/preview/defaultSandpackDependencies";
import { normalizeSandpackFileMap } from "@/lib/preview/normalizeFileMap";

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
    // Safely log and bridge error to self-healing without mutating readonly Error objects
    let msg = "Preview encountered an error";
    try {
      msg = error?.message || String(error);
      console.error("[SandpackErrorBoundary]", msg);
    } catch {
      console.error("[SandpackErrorBoundary] Error caught");
    }

    try {
      const errorType = /syntax|unexpected token|already been (?:declared|exported)/i.test(msg) ? "syntax" : "runtime";
      window.postMessage({ type: "preview-error", errorType, message: msg }, "*");
    } catch {
      // swallow message bridge failures
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
  "react-router-dom", "clsx", "tailwind-merge", "class-variance-authority",
  "react-intersection-observer", "zustand", "zod", "axios",
  "@tanstack/react-query", "@tanstack/react-table", "react-hook-form", "sonner",
  "@supabase/supabase-js",
]);

function isAllowedPkg(pkg: string): boolean {
  if (pkg.startsWith(".") || pkg.startsWith("/")) return true;
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  // Allow all Radix UI packages used by shadcn-compatible component files
  // (e.g. @radix-ui/react-popover, @radix-ui/react-tooltip, etc.)
  if (base.startsWith("@radix-ui/")) return true;
  return ALLOWED_PACKAGES.has(base);
}

// Sucrase-based syntax validation is used instead of heuristic brace counting.

/**
 * Generate a safe stub component when code is broken.
 */
function makeSafeStub(filePath: string): string {
  // Preserve utility files — don't turn them into React components
  if (/\/utils\.(js|ts|jsx|tsx)$/.test(filePath) || /\/utils\/cn\.(js|ts|jsx|tsx)$/.test(filePath)) {
    return `export function cn(...classes) { return classes.filter(Boolean).join(" "); }\n`;
  }

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

function trimLateImportTail(code: string, filePath: string): string {
  const lines = code.split("\n");
  let inPreambleImportBlock = true;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;

    const isTopLevelImport = /^import(?:\s|\{|\*)/.test(trimmed);

    if (inPreambleImportBlock) {
      if (isTopLevelImport) continue;
      inPreambleImportBlock = false;
      continue;
    }

    if (isTopLevelImport) {
      const before = lines.slice(0, i).join("\n").trim();
      if (before.length > 80) {
        const truncated = lines.slice(0, i).join("\n").trim();
        if (/export\s|return\s+\(|function\s+\w+|const\s+\w+\s*=|class\s+\w+/.test(before) && truncated.length > 60) {
          console.warn(`[SandpackPreview] Trimmed duplicate late import block in ${filePath} at line ${i + 1}`);
          return truncated;
        }
      }
    }
  }

  return code;
}

function collapseDuplicateReactImports(code: string, filePath: string): string {
  const lines = code.split("\n");
  const reactImportLines: Array<{ index: number; line: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+.+\s+from\s+['"]react['"]\s*;?\s*$/.test(lines[i])) {
      reactImportLines.push({ index: i, line: lines[i] });
    }
  }

  if (reactImportLines.length < 2) return code;

  // Keep the richest import (usually includes both default + hooks), remove others.
  const keep = reactImportLines.reduce((best, curr) => (curr.line.length > best.line.length ? curr : best));
  const removeSet = new Set(reactImportLines.filter(r => r.index !== keep.index).map(r => r.index));
  const collapsed = lines.filter((_line, idx) => !removeSet.has(idx)).join("\n");

  console.warn(`[SandpackPreview] Collapsed duplicate React imports in ${filePath}`);
  return collapsed;
}

function hasLikelyJsx(code: string): boolean {
  const hasFragmentSyntax = /<>|<\/>|<\s*>/.test(code);
  const hasSelfClosingTag = /<([A-Za-z][\w:-]*)(\s[^<>]*)?\/>/.test(code);
  const hasPairedTag = /<([A-Za-z][\w:-]*)(\s[^<>]*)?>[\s\S]*?<\/\1>/.test(code);
  return hasFragmentSyntax || hasSelfClosingTag || hasPairedTag;
}

function ensureReactInScope(code: string, filePath: string): string {
  if (!filePath.match(/\.(jsx?|tsx?)$/)) return code;
  if (!hasLikelyJsx(code)) return code;

  // Already has React in scope
  if (
    /^\s*import\s+React(?:\s*,|\s+from\s+['"]react['"])/m.test(code) ||
    /^\s*import\s+\*\s+as\s+React\s+from\s+['"]react['"]/m.test(code) ||
    /\bconst\s+React\s*=\s*require\(\s*['"]react['"]\s*\)/.test(code)
  ) {
    // React default is imported — but check hooks are included too
    code = ensureReactHooksImported(code, filePath);
    return code;
  }

  // If there is already a named react import, upgrade it to include default React.
  if (/^\s*import\s+(?:type\s+)?\{[^}]+\}\s+from\s+['"]react['"]/m.test(code)) {
    const upgraded = code.replace(
      /^\s*import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]react['"]\s*;?/m,
      (_m, names) => `import React, {${String(names).trim()}} from "react";`
    );
    console.warn(`[SandpackPreview] Added default React import to existing react import in ${filePath}`);
    return ensureReactHooksImported(upgraded, filePath);
  }

  console.warn(`[SandpackPreview] Injected missing React import in ${filePath}`);
  code = `import React from "react";\n${code}`;
  return ensureReactHooksImported(code, filePath);
}

const REACT_HOOKS = ["useState", "useEffect", "useContext", "useCallback", "useRef", "useMemo", "useReducer", "useLayoutEffect", "useId", "useDeferredValue", "useTransition", "useSyncExternalStore", "useImperativeHandle", "useDebugValue", "useInsertionEffect"];

function ensureReactHooksImported(code: string, filePath: string): string {
  const missingHooks: string[] = [];
  for (const hook of REACT_HOOKS) {
    const used = new RegExp(`\\b${hook}\\b`).test(code);
    if (!used) continue;
    // Check if already imported from react
    const imported = new RegExp(`import\\s+(?:React\\s*,\\s*)?\\{[^}]*\\b${hook}\\b[^}]*\\}\\s+from\\s+['"]react['"]`).test(code);
    if (imported) continue;
    missingHooks.push(hook);
  }
  if (missingHooks.length === 0) return code;

  // Try to extend existing react import
  const reactImportMatch = code.match(/^(\s*import\s+(?:React\s*,\s*)?\{([^}]*)\}\s+from\s+['"]react['"]\s*;?\s*)$/m);
  if (reactImportMatch) {
    const existingHooks = reactImportMatch[2].split(",").map(s => s.trim()).filter(Boolean);
    const allHooks = [...new Set([...existingHooks, ...missingHooks])];
    const hasDefault = /import\s+React\s*,/.test(reactImportMatch[1]);
    const newImport = hasDefault
      ? `import React, { ${allHooks.join(", ")} } from "react";`
      : `import { ${allHooks.join(", ")} } from "react";`;
    code = code.replace(reactImportMatch[0].trim(), newImport);
  } else if (/^\s*import\s+React\s+from\s+['"]react['"]/m.test(code)) {
    // Only default import — upgrade to include hooks
    code = code.replace(
      /^\s*import\s+React\s+from\s+['"]react['"]\s*;?/m,
      `import React, { ${missingHooks.join(", ")} } from "react";`
    );
  } else {
    // No react import at all — add one
    code = `import { ${missingHooks.join(", ")} } from "react";\n${code}`;
  }
  console.warn(`[SandpackPreview] Injected missing React hooks {${missingHooks.join(", ")}} in ${filePath}`);
  return code;
}

function resolveRelativePath(fromFile: string, rel: string): string {
  if (!rel.startsWith(".")) return rel;
  const fromParts = fromFile.split("/").filter(Boolean);
  fromParts.pop();
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") fromParts.pop();
    else fromParts.push(seg);
  }
  return `/${fromParts.join("/")}`;
}

function removeSelfImports(code: string, filePath: string): string {
  const currentBase = filePath.replace(/\.[^.]+$/, "");
  let removed = false;

  const cleaned = code.replace(
    /^\s*import\s+[\s\S]*?\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\s*$/gm,
    (line, relPath: string) => {
      const resolvedBase = resolveRelativePath(filePath, relPath).replace(/\.[^.]+$/, "");
      if (resolvedBase === currentBase) {
        removed = true;
        return "";
      }
      return line;
    }
  );

  if (removed) {
    console.warn(`[SandpackPreview] Removed self-import in ${filePath}`);
  }

  return cleaned;
}

function removeDefaultExportConflict(code: string, filePath: string): string {
  const defaultExport = code.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?/);
  const defaultName = defaultExport?.[1];
  if (!defaultName) return code;

  let removed = false;
  const cleaned = code.replace(/export\s*\{([\s\S]*?)\}\s*;?/gm, (line, names) => {
    const entries = String(names)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const filtered = entries.filter((entry) => {
      const normalized = entry.replace(/\s+/g, " ").trim();
      return !new RegExp(`^${defaultName}(?:\\s+as\\s+[A-Za-z_$][\\w$]*)?$`).test(normalized);
    });

    if (filtered.length === entries.length) return line;
    removed = true;
    if (filtered.length === 0) return "";
    return `export { ${filtered.join(", ")} };`;
  });

  if (removed) {
    console.warn(`[SandpackPreview] Removed named export conflicting with default export in ${filePath}`);
  }

  return cleaned;
}

function removeDuplicateNamedExports(code: string, filePath: string): string {
  const exportedNames = new Set<string>();
  let changed = false;

  // Seed with direct declaration exports (export const X, export function X, etc.)
  for (const m of code.matchAll(/\bexport\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    exportedNames.add(m[1]);
  }

  const deduped = code.replace(/export\s*\{([\s\S]*?)\}\s*;?/gm, (_line, names) => {
    const entries = String(names)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const kept: string[] = [];
    for (const entry of entries) {
      const parts = entry.split(/\s+as\s+/i).map((p) => p.trim());
      const exported = parts[1] || parts[0];
      if (!exported) continue;
      if (exportedNames.has(exported)) {
        changed = true;
        continue;
      }
      exportedNames.add(exported);
      kept.push(entry);
    }

    if (kept.length === 0) {
      changed = true;
      return "";
    }

    if (kept.length !== entries.length) {
      changed = true;
      return `export { ${kept.join(", ")} };`;
    }

    return `export { ${entries.join(", ")} };`;
  });

  if (changed) {
    console.warn(`[SandpackPreview] Removed duplicate named exports in ${filePath}`);
  }

  return deduped;
}

/**
 * Minimal sanitization — strip blocked imports only. No repair, no mutation.
 * Files reaching this point have already been validated upstream by the build engine.
 * Also performs a final syntax safety check to prevent Sandpack crashes.
 */
function sanitizeImports(code: string, filePath: string): string {
  if (!filePath.match(/\.(jsx?|tsx?)$/)) return code;

  // Strip file separator lines (leftover from AI output formatting)
  // Catches: --- /path/to/file.jsx, --- /path/File.jsx (truncated), --- /dependencies, etc.
  code = code.split("\n").filter(line => {
    const t = line.trim();
    // Standard file separator: --- /some/path.ext [optional metadata]
    if (/^-{3}\s+\/?.+?\.(?:jsx?|tsx?|css|js|ts)\b/i.test(t)) return false;
    // Dependencies separator
    if (/^-{3}\s+\/?dependencies\b/i.test(t)) return false;
    // Bare triple-dash followed by a path-like string (catch-all for unusual AI headers)
    if (/^-{3}\s+\/[a-zA-Z]/.test(t) && !t.includes("import") && !t.includes("export")) return false;
    return true;
  }).join("\n");

  // Repair common AI concatenation artifacts before parse.
  code = trimLateImportTail(code, filePath);
  code = collapseDuplicateReactImports(code, filePath);
  code = removeSelfImports(code, filePath);
  code = removeDefaultExportConflict(code, filePath);
  code = removeDuplicateNamedExports(code, filePath);
  code = ensureReactInScope(code, filePath);

  // ── Rename local declarations that collide with imported identifiers ──
  {
    // Collect all imported identifiers
    const importedIds = new Set<string>();
    const importLineRe = /^\s*import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s*from\s+['"][^'"]+['"]/gm;
    let im;
    while ((im = importLineRe.exec(code)) !== null) {
      if (im[1]) importedIds.add(im[1]);
      if (im[2]) {
        im[2].split(",").forEach(s => {
          const name = s.trim().split(/\s+as\s+/).pop()!.trim();
          if (name) importedIds.add(name);
        });
      }
    }

    // For each imported name, rename any local re-declarations to __LOCAL_STUB_<Name>
    if (importedIds.size > 0) {
      for (const id of importedIds) {
        // Match: const/let/var <Name> = ... OR function <Name>(
        const localDeclRe = new RegExp(
          `((?:const|let|var)\\s+)${id}(\\s*=)`,
          "g"
        );
        const localFnRe = new RegExp(
          `(function\\s+)${id}(\\s*\\()`,
          "g"
        );
        code = code.replace(localDeclRe, `$1__LOCAL_STUB_${id}$2`);
        code = code.replace(localFnRe, `$1__LOCAL_STUB_${id}$2`);
      }
    }
  }

  // Keep ESM imports/exports intact so Sandpack can report real dependency errors.
  // Rewriting them to comments can create misleading runtime failures
  // like "X is not defined" (e.g. PopoverPrimitive) instead of the true cause.
  code = code.replace(
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => isAllowedPkg(pkg) ? match : `undefined /* BLOCKED: ${pkg} */`
  );

  // Final safety: use Sucrase to parse the code — catches real syntax errors
  // that would crash Sandpack's bundler with "Cannot assign to read only property 'message'"
  // IMPORTANT: Do NOT add "imports" transform — it converts ES modules to
  // CommonJS (import→require) which breaks Sandpack completely.
  // Use "typescript" transform for .ts/.tsx files to strip type annotations.
  try {
    const isTS = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
    transform(code, {
      transforms: isTS ? ["typescript", "jsx"] : ["jsx"],
      jsxRuntime: "automatic",
      production: true,
    });
  } catch (e: any) {
    const message = String(e?.message || e || "");

    // Hard parse failures are unsafe to pass through to Sandpack.
    const hardSyntaxFailure = /has already been declared|has already been exported|Identifier\s+['"`].+['"`]\s+has already been declared|Unexpected token|Unterminated|Unexpected end of input/i.test(message);

    if (!hardSyntaxFailure) {
      // Sucrase can be stricter than Sandpack Babel for some valid patterns.
      const hasExport = /export\s/.test(code);
      if (hasExport) {
        console.warn(`[SandpackPreview] Sucrase parse warning in ${filePath}, passing through to Sandpack`);
        return code;
      }
    }

    console.warn(`[SandpackPreview] Syntax error in ${filePath}, using safe stub: ${message}`);
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

function buildBootstrapJs(projectId: string, supabaseUrl: string, supabaseKey: string): string {
  return `// Phoenix Runtime Bootstrap — sets globals BEFORE any app code evaluates
window.__PROJECT_ID__ = "${projectId}";
window.__SUPABASE_URL__ = "${supabaseUrl}";
window.__SUPABASE_KEY__ = "${supabaseKey}";
window.__PHOENIX_PREVIEW__ = true;
`;
}

function buildIndexJs(projectId: string, supabaseUrl: string, supabaseKey: string): string {
  return `import "./_bootstrap"; // MUST be first — sets globals before App imports evaluate
import React, { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Runtime error boundary to prevent blank screens
class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error) {
    console.error("[Preview] App crashed:", error);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", {
        style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "system-ui, sans-serif", padding: "2rem" }
      },
        React.createElement("div", { style: { textAlign: "center", maxWidth: 400 } },
          React.createElement("div", { style: { fontSize: 48, marginBottom: 16 } }, "⚠️"),
          React.createElement("h2", { style: { fontSize: 18, fontWeight: 600, color: "#1e293b", marginBottom: 8 } }, "App encountered an error"),
          React.createElement("p", { style: { fontSize: 14, color: "#64748b", marginBottom: 16 } },
            this.state.error?.message || "Something went wrong. Send a follow-up message to fix it."
          ),
          React.createElement("button", {
            onClick: () => this.setState({ hasError: false, error: null }),
            style: { padding: "8px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 }
          }, "Try Again")
        )
      );
    }
    return this.props.children;
  }
}

// Report route changes to parent for URL bar sync
function reportRoute() {
  try {
    // For HashRouter apps, extract the meaningful path from the hash
    var hash = location.hash;
    var path = hash && hash.startsWith("#") ? hash.slice(1) || "/" : location.pathname + location.search;
    window.parent.postMessage({ type: "route-change", path: path }, "*");
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
window.addEventListener("hashchange", reportRoute);

// Listen for navigation commands from parent
window.addEventListener("message", function(e) {
  if (e.data && e.data.type === "navigate" && e.data.path) {
    var targetPath = e.data.path;
    // Support HashRouter: update hash, BrowserRouter: use pushState
    if (location.hash.startsWith("#/") || location.hash === "#" || document.querySelector("[data-reactroot]")) {
      location.hash = "#" + targetPath;
    } else {
      try { history.pushState(null, "", targetPath); } catch(ex) {}
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }
  if (e.data && e.data.type === "history-back") {
    history.back();
  }
  if (e.data && e.data.type === "history-forward") {
    history.forward();
  }
});

var root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(StrictMode, null,
    React.createElement(AppErrorBoundary, null,
      React.createElement(App)
    )
  )
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
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

/**
 * Sanitize CSS by balancing delimiters while ignoring comments/strings.
 * Prevents parser crashes like "Unclosed block" and "Unclosed bracket".
 */
function sanitizeCss(css: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let inComment = false;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];
    const prev = css[i - 1];

    // Comment boundaries
    if (!inSingle && !inDouble && !inComment && ch === "/" && next === "*") {
      inComment = true;
      out.push(ch, next);
      i++;
      continue;
    }
    if (inComment) {
      out.push(ch);
      if (ch === "*" && next === "/") {
        out.push(next);
        inComment = false;
        i++;
      }
      continue;
    }

    // String boundaries (ignore escaped quotes)
    if (!inDouble && ch === "'" && prev !== "\\") {
      inSingle = !inSingle;
      out.push(ch);
      continue;
    }
    if (!inSingle && ch === '"' && prev !== "\\") {
      inDouble = !inDouble;
      out.push(ch);
      continue;
    }
    if (inSingle || inDouble) {
      out.push(ch);
      continue;
    }

    // Delimiter balancing outside comments/strings
    if (ch === "{") {
      stack.push("}");
      out.push(ch);
      continue;
    }
    if (ch === "[") {
      stack.push("]");
      out.push(ch);
      continue;
    }
    if (ch === "(") {
      stack.push(")");
      out.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]" || ch === ")") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
        out.push(ch);
      } else {
        // Drop stray closing delimiters to keep CSS parseable.
      }
      continue;
    }

    out.push(ch);
  }

  // Close unterminated structures to avoid parser hard-failures.
  if (inComment) out.push("*/");
  if (inSingle) out.push("'");
  if (inDouble) out.push('"');
  if (stack.length > 0) {
    out.push("\n", stack.reverse().join(""), " /* auto-closed */");
  }

  return out.join("");
}

/**
 * Auto-repair broken relative imports by resolving against actual file set.
 * Runs as a last-resort pass before Sandpack compiles.
 */
function repairRelativeImports(files: Record<string, string>): Record<string, string> {
  const allPaths = Object.keys(files);

  // Build a lookup: basename (no ext) → full paths
  const basenameLookup = new Map<string, string[]>();
  for (const p of allPaths) {
    const base = p.split("/").pop()!.replace(/\.\w+$/, "").toLowerCase();
    if (!basenameLookup.has(base)) basenameLookup.set(base, []);
    basenameLookup.get(base)!.push(p);
  }

  function resolveInFiles(fromFile: string, importPath: string): string | null {
    if (!importPath.startsWith(".")) return null; // skip packages

    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const parts = [...fromDir.split("/"), ...importPath.split("/")].filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part !== ".") stack.push(part);
    }
    const resolved = "/" + stack.join("/");
    const exts = ["", ".jsx", ".tsx", ".js", ".ts"];
    for (const ext of exts) {
      if (allPaths.includes(resolved + ext)) return null; // already valid
    }
    // Also check /index variants
    for (const ext of [".jsx", ".tsx", ".js", ".ts"]) {
      if (allPaths.includes(resolved + "/index" + ext)) return null;
    }
    return resolved; // broken — return what it resolved to
  }

  function buildRelPath(fromFile: string, toFile: string): string {
    const fromParts = fromFile.split("/").filter(Boolean);
    fromParts.pop();
    const toParts = toFile.split("/").filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common++;
    const ups = fromParts.length - common;
    const rel = (ups === 0 ? "./" : "../".repeat(ups)) + toParts.slice(common).join("/");
    return rel.replace(/\.\w+$/, ""); // strip extension
  }

  function pickBest(target: string, candidates: string[], dirHints: string[]): string {
    if (candidates.length === 1) return candidates[0];
    let bestScore = -1, best = candidates[0];
    for (const c of candidates) {
      let score = 0;
      const cParts = c.split("/").filter(Boolean);
      for (const h of dirHints) { if (cParts.includes(h)) score += 10; }
      if (c.includes("/components/")) score += 2;
      if (c.includes("/contexts/")) score += 2;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  const result: Record<string, string> = {};
  const importRe = /(import\s+(?:[\w{},\s*]+\s+from\s+|))(['"])(\.\.?\/[^'"]+)\2/g;

  for (const [filePath, code] of Object.entries(files)) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) { result[filePath] = code; continue; }

    result[filePath] = code.replace(importRe, (match, prefix, quote, importPath) => {
      const broken = resolveInFiles(filePath, importPath);
      if (!broken) return match; // valid import

      const targetBase = importPath.split("/").pop()!.replace(/\.\w+$/, "").toLowerCase();
      const candidates = basenameLookup.get(targetBase);
      if (!candidates || candidates.length === 0) return match; // can't fix

      const dirHints = importPath.replace(/^\.\.?\//, "").split("/").slice(0, -1);
      const best = pickBest(broken, candidates, dirHints);
      const newPath = buildRelPath(filePath, best);

      console.log(`[SandpackImportRepair] ${filePath}: '${importPath}' → '${newPath}'`);
      return `${prefix}${quote}${newPath}${quote}`;
    });
  }

  return result;
}

// normalizeSandpackFileMap is now imported from @/lib/preview/normalizeFileMap

function buildSandpackFiles(files: SandpackFileSet | null, projectId: string, supabaseUrl: string, supabaseKey: string): Record<string, string> {
  // Determine the App entry import path from user files.
  // IMPORTANT: keep this extensionless so later TS/JS auto-renames never break the import.
  let appImportPath = "./App";
  if (files) {
    const normalizedPaths = Object.keys(files)
      .filter(Boolean)
      .map((p) => (p.startsWith("/") ? p : `/${p}`));

    // Deterministic priority: root App.* first, then src/App.*
    const appPatterns: Array<{ re: RegExp; importPath: string }> = [
      { re: /^\/App\.(tsx|jsx|ts|js)$/, importPath: "./App" },
      { re: /^\/src\/App\.(tsx|jsx|ts|js)$/, importPath: "./src/App" },
    ];

    for (const pat of appPatterns) {
      if (normalizedPaths.some((p) => pat.re.test(p))) {
        appImportPath = pat.importPath;
        break;
      }
    }
  }

  // Detect user CSS files that should also be imported
  const userCssPaths: string[] = [];
  if (files) {
    for (const p of Object.keys(files)) {
      if (!p) continue;
      const norm = p.startsWith("/") ? p : `/${p}`;
      if (/\.css$/.test(norm) && norm !== "/styles.css") {
        userCssPaths.push(norm);
      }
    }
  }

  // Build index.js with the correct App import path
  let indexJs = buildIndexJs(projectId, supabaseUrl, supabaseKey).replace(
    'import App from "./App"',
    `import App from "${appImportPath}"`
  );

  // Inject imports for user CSS files (e.g. /styles/globals.css)
  if (userCssPaths.length > 0) {
    const cssImports = userCssPaths.map(p => `import ".${p}";`).join("\n");
    indexJs = indexJs.replace(
      'import "./styles.css";',
      `import "./styles.css";\n${cssImports}`
    );
  }

  const base: Record<string, string> = {
    "/_bootstrap.js": buildBootstrapJs(projectId, supabaseUrl, supabaseKey),
    "/index.js": indexJs,
    "/styles.css": DEFAULT_STYLES,
    "/public/index.html": DEFAULT_INDEX_HTML,
  };

  if (!files || Object.keys(files).length === 0) {
    base["/App.js"] = DEFAULT_APP;
    return base;
  }

  // Map user files into sandpack paths — guard against null/undefined paths and content
  for (const [path, code] of Object.entries(files)) {
    const trimmedPath = typeof path === "string" ? path.trim() : "";
    if (!trimmedPath || code == null) {
      console.warn(`[SandpackPreview] Skipping invalid file entry: path=${path}`);
      continue;
    }
    if (/^(null|undefined)$/i.test(trimmedPath) || /\/(?:null|undefined)$/i.test(trimmedPath)) {
      console.warn(`[SandpackPreview] Skipping invalid file path token: ${trimmedPath}`);
      continue;
    }
    if (typeof code !== "string") {
      console.warn(`[SandpackPreview] Skipping non-string file content for path=${trimmedPath}`);
      continue;
    }

    const normalized = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
    let sandpackPath = normalized.startsWith("/") ? normalized : `/${normalized}`;

    // Fix: .ts files containing JSX must be renamed to .tsx for Sandpack's Babel
    if (sandpackPath.endsWith(".ts") && !sandpackPath.endsWith(".d.ts") && hasLikelyJsx(code)) {
      console.warn(`[SandpackPreview] Renaming ${sandpackPath} → .tsx (contains JSX)`);
      sandpackPath = sandpackPath.replace(/\.ts$/, ".tsx");
    }

    // Fix: .js/.jsx files containing TypeScript syntax (generics, type annotations) must be .tsx
    if (/\.(js|jsx)$/.test(sandpackPath)) {
      const hasTypeScriptSyntax = /useState<[^>]+>|useRef<[^>]+>|useCallback<[^>]+>|useMemo<[^>]+>|:\s*(React\.FC|React\.ReactNode|string|number|boolean|void|any|null|undefined)\b|<[A-Z]\w+(?:<[^>]*>)?\s*\[\]>|interface\s+\w+|type\s+\w+\s*=|as\s+(string|number|boolean|any|const)\b/.test(code);
      const hasJsx = hasLikelyJsx(code);
      if (hasTypeScriptSyntax) {
        const newExt = hasJsx ? ".tsx" : ".ts";
        const oldPath = sandpackPath;
        sandpackPath = sandpackPath.replace(/\.(js|jsx)$/, newExt);
        console.warn(`[SandpackPreview] Renaming ${oldPath} → ${sandpackPath} (contains TypeScript syntax)`);
      }
    }

    const isCodeFile = /\.(jsx?|tsx?)$/.test(sandpackPath);
    let processed = isCodeFile ? sanitizeImports(code, sandpackPath) : code;

    if (isCodeFile && !sandpackPath.includes("styles") && !sandpackPath.includes(".css")) {
      const hasDefaultExport = /export\s+default\b/.test(processed);
      const hasAnyExplicitExport = /\bexport\s+/.test(processed);
      // Only auto-add a default export when the file has no exports at all.
      // This avoids parser failures like:
      // `export { Button }; export default Button;` (duplicate exported identifier)
      if (!hasDefaultExport && !hasAnyExplicitExport) {
        const mainComponentMatch = processed.match(/\b(?:function|const)\s+([A-Z]\w+)/);
        if (mainComponentMatch) {
          processed += `\nexport default ${mainComponentMatch[1]};\n`;
        }
      }
    }

    base[sandpackPath] = processed;
  }

  // If user has a globals.css, also merge its content into /styles.css as a fallback
  // so CSS variables are always available even if the dynamic import fails
  const globalsCssPath = userCssPaths.find(p => p.includes("globals"));
  if (globalsCssPath && files) {
    const globalsCss = files[globalsCssPath] || files[globalsCssPath.slice(1)];
    if (globalsCss) {
      const sanitized = sanitizeCss(globalsCss);
      base["/styles.css"] = DEFAULT_STYLES + "\n\n/* === User globals.css merged === */\n" + sanitized;
    }
  }

  // Sanitize all CSS files in the workspace to prevent unclosed block errors
  for (const [path, content] of Object.entries(base)) {
    if (path.endsWith(".css")) {
      base[path] = sanitizeCss(content);
    }
  }

  // Only inject DEFAULT_APP if no App entry exists anywhere (root or src/)
  const hasAnyAppEntry = [
    "/App.tsx", "/App.jsx", "/App.js", "/App.ts",
    "/src/App.tsx", "/src/App.jsx", "/src/App.js", "/src/App.ts",
  ].some(p => p in base);
  if (!hasAnyAppEntry) {
    console.warn("[SandpackPreview] No App entry found in workspace, injecting DEFAULT_APP. Keys:", Object.keys(base).filter(k => /App/i.test(k)));
    base["/App.js"] = DEFAULT_APP;
  }

  // ── Mirror structureNormalizer: normalize file placement ──
  normalizeSandpackFileMap(base);

  // ── Last-resort import repair pass ──
  return repairRelativeImports(base);
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

  const files = useMemo(() => {
    const built = buildSandpackFiles(sandpackFiles, projectId, supabaseUrl, supabaseKey);
    console.log("[SandpackPreview] Building with", Object.keys(built).length, "files. Entry:", Object.keys(built).filter(k => k.includes("App")).join(", "));
    return built;
  }, [sandpackFiles, projectId, supabaseUrl, supabaseKey]);

  // Include content hash in the key so Sandpack remounts when files change
  // This ensures subsequent builds within the same project update the preview
  const filesHash = useMemo(() => contentHash(sandpackFiles), [sandpackFiles]);
  const stableKey = useMemo(() => `sp-${projectId || "default"}-${filesHash}`, [projectId, filesHash]);

  const dependencies = useMemo(() => ({
    ...DEFAULT_SANDPACK_DEPENDENCIES,
    ...sandpackDeps,
  }), [sandpackDeps]);

  // If sandpackFiles is null/empty, show a friendly fallback instead of blank screen
  if (!sandpackFiles || Object.keys(sandpackFiles).length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-sm px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-xl font-bold text-primary-foreground">L</span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">No preview available</h3>
          <p className="text-xs text-muted-foreground">
            Chat with the AI to build your app and see it here.
          </p>
        </div>
      </div>
    );
  }

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
            recompileMode: "delayed",
            recompileDelay: 1200,
            bundlerTimeOut: 240000,
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
