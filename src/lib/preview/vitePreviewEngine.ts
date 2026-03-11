/**
 * Phoenix Vite Preview Engine
 * 
 * Implements the PreviewEngine contract using a Service Worker virtual filesystem.
 * Uses Sucrase for JSX/TS transforms (already installed) instead of browser-vite.
 * 
 * Key differences from ESM engine:
 * - Files served via SW fetch interception (real HTTP, real module resolution)
 * - Import maps handled natively by the browser
 * - Incremental updates — only changed files sent to SW
 * - No srcDoc restrictions — real origin, real pushState
 */

import type {
  PreviewEngine,
  PreviewSession,
  WorkspaceSnapshot,
  PreviewBuildResult,
  PreviewDiagnostic,
  PreviewMetrics,
} from "./types";
import { compileFile } from "./esmCompiler";
import { buildImportMap, CdnImportMapProvider } from "./importMapResolver";
import {
  rewriteImportsForSW,
  buildDependencyGraph,
  detectCircularDeps,
  isBarrelFile,
} from "./astImportRewriter";

// ─── Vite Preview Engine ────────────────────────────────────────────────────

export class VitePreviewEngine implements PreviewEngine {
  readonly name = "vite" as const;
  private importMapProvider: CdnImportMapProvider;

  constructor(cdnBase?: string) {
    this.importMapProvider = new CdnImportMapProvider(cdnBase);
  }

  canHandle(snapshot: WorkspaceSnapshot): boolean {
    // Vite SW handles up to 150 files, any complexity
    return snapshot.fileCount <= 150;
  }

  build(session: PreviewSession, snapshot: WorkspaceSnapshot): PreviewBuildResult {
    const buildStart = performance.now();
    const diagnostics: PreviewDiagnostic[] = [];

    // 1. Normalize paths
    const normalized: Record<string, string> = {};
    for (const [path, code] of Object.entries(snapshot.files)) {
      const p = path.startsWith("/") ? path : `/${path}`;
      normalized[p] = code;
    }

    const fileSet = new Set(Object.keys(normalized));

    // 2. Find entry point
    let entryPath = this.findEntryPoint(fileSet);
    if (!entryPath) {
      entryPath = this.synthesizeEntry(fileSet, normalized);
      if (entryPath) {
        fileSet.add(entryPath);
        diagnostics.push({
          severity: "info",
          category: "entrypoint-missing",
          message: `Auto-synthesized ${entryPath}`,
          timestamp: Date.now(),
        });
      }
    }

    if (!entryPath) {
      return this.errorResult(buildStart, "No App entry point found", diagnostics);
    }

    // 3. Compile all source files to browser-ready JS
    const compiledFiles: Record<string, string> = {};
    const cssContents: string[] = [];
    const assetMap: Record<string, string> = {};

    for (const [path, code] of Object.entries(normalized)) {
      if (/\.(jsx?|tsx?)$/.test(path)) {
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
        // Rewrite imports for SW resolution
        compiledFiles[path.replace(/\.tsx?$/, ".js").replace(/\.jsx$/, ".js")] =
          this.rewriteImportsForSW(compiled.code, path, fileSet);
      } else if (path.endsWith(".css")) {
        const cleaned = code
          .replace(/^@tailwind\s+\w+;\s*$/gm, "")
          .replace(/^@import\s+url\([^)]+\);\s*$/gm, "")
          .trim();
        if (cleaned) cssContents.push(cleaned);
        compiledFiles[path] = code;
      } else if (/\.(png|jpg|jpeg|gif|webp|svg|ico|json)$/i.test(path)) {
        const ext = path.split(".").pop()!.toLowerCase();
        const mimeMap: Record<string, string> = {
          png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
          gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
          ico: "image/x-icon", json: "application/json",
        };
        if (ext === "svg" || ext === "json") {
          assetMap[path] = `data:${mimeMap[ext]};charset=utf-8,${encodeURIComponent(code)}`;
        }
        compiledFiles[path] = code;
      }
    }

    // 4. Build import map
    const importMap = buildImportMap(normalized, snapshot.dependencies, this.importMapProvider);

    // 5. Generate entry.js (bootstrap)
    const entryJsPath = entryPath.replace(/\.tsx?$/, ".js").replace(/\.jsx$/, ".js");
    const entryJs = this.generateEntryBootstrap(
      entryJsPath,
      snapshot.projectId,
      snapshot.supabaseUrl || "",
      snapshot.supabaseKey || ""
    );
    compiledFiles["/entry.js"] = entryJs;

    // 6. Generate index.html for SW to serve
    const indexHtml = this.generateIndexHtml(importMap, cssContents, assetMap);
    compiledFiles["/__generated_index.html"] = indexHtml;

    // 7. Build module map (all files that go to SW)
    const moduleMap: Record<string, string> = {};
    for (const [path, code] of Object.entries(compiledFiles)) {
      moduleMap[path] = code;
    }

    const buildEnd = performance.now();

    console.log(
      `[Phoenix Vite] Built: ${Object.keys(compiledFiles).length} files, ` +
      `entry: ${entryPath}, ${Object.keys(importMap).length} deps, ` +
      `${Math.round(buildEnd - buildStart)}ms`
    );

    return {
      htmlShell: indexHtml,
      importMap,
      modules: moduleMap,
      assets: assetMap,
      entryFile: entryPath,
      diagnostics,
      metrics: this.buildMetrics(
        buildStart,
        buildEnd,
        Object.keys(compiledFiles).length,
        Object.keys(importMap).length,
        Object.values(compiledFiles).reduce((s, c) => s + c.length, 0),
        diagnostics.filter(d => d.severity === "error").length
      ),
    };
  }

  getEntryHtml(result: PreviewBuildResult): string {
    return result.htmlShell;
  }

  // ─── Import Rewriting for SW ────────────────────────────────────────────

  private rewriteImportsForSW(
    code: string,
    filePath: string,
    fileSet: Set<string>
  ): string {
    // Rewrite relative imports to resolved .js paths
    // import X from "./components/Header" → import X from "./components/Header.js"
    code = code.replace(
      /(import\s+(?:[\w$*{},\s]+\s+from\s+)?['"])(\.\.?\/[^'"]+)(['"])/g,
      (match, prefix, importPath, suffix) => {
        // Skip CSS imports
        if (importPath.endsWith(".css")) return match;
        
        const resolved = this.resolveRelativeImport(filePath, importPath, fileSet);
        // Convert to .js extension for the compiled version
        const jsPath = resolved
          .replace(/\.tsx?$/, ".js")
          .replace(/\.jsx$/, ".js");
        return `${prefix}${jsPath}${suffix}`;
      }
    );

    // Rewrite @/ alias imports to relative paths
    code = code.replace(
      /(import\s+(?:[\w$*{},\s]+\s+from\s+)?['"])@\/([^'"]+)(['"])/g,
      (match, prefix, importPath, suffix) => {
        const absPath = "/" + importPath;
        const resolved = this.findFileWithExtension(absPath, fileSet);
        const jsPath = resolved
          ? resolved.replace(/\.tsx?$/, ".js").replace(/\.jsx$/, ".js")
          : absPath + ".js";
        return `${prefix}${jsPath}${suffix}`;
      }
    );

    // Strip CSS imports (CSS is injected via <style> in index.html)
    code = code.replace(/import\s+['"][^'"]*\.css['"]\s*;?/g, "");

    // Rewrite new URL("./path", import.meta.url) patterns
    code = code.replace(
      /new\s+URL\(\s*(['"]([^'"]+)['"])\s*,\s*import\.meta\.url\s*\)/g,
      (_m, _quoted, path: string) => {
        return `new URL("${path}", window.location.origin + "/vfs-preview/")`;
      }
    );

    return code;
  }

  private resolveRelativeImport(
    fromFile: string,
    importPath: string,
    fileSet: Set<string>
  ): string {
    // Resolve relative path
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const parts = [...fromDir.split("/"), ...importPath.split("/")].filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part !== ".") stack.push(part);
    }
    const resolved = "/" + stack.join("/");

    return this.findFileWithExtension(resolved, fileSet) || resolved;
  }

  private findFileWithExtension(path: string, fileSet: Set<string>): string | null {
    if (fileSet.has(path)) return path;
    for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
      if (fileSet.has(path + ext)) return path + ext;
    }
    for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
      if (fileSet.has(path + "/index" + ext)) return path + "/index" + ext;
    }
    return null;
  }

  // ─── Entry Point ───────────────────────────────────────────────────────

  private findEntryPoint(fileSet: Set<string>): string | null {
    const candidates = [
      "/App.tsx", "/App.jsx", "/App.js", "/App.ts",
      "/src/App.tsx", "/src/App.jsx", "/src/App.js", "/src/App.ts",
    ];
    for (const c of candidates) {
      if (fileSet.has(c)) return c;
    }
    return Array.from(fileSet).find(p => /\/App\.(tsx?|jsx?)$/.test(p)) || null;
  }

  private synthesizeEntry(
    fileSet: Set<string>,
    files: Record<string, string>
  ): string | null {
    const jsxFiles = Array.from(fileSet).filter(
      p => /\.(jsx?|tsx?)$/.test(p) && !p.includes("/ui/")
    );
    if (jsxFiles.length === 0) return null;

    const pageFiles = jsxFiles.filter(p => p.includes("/pages/"));
    const mainComponent = pageFiles[0] || jsxFiles[0];
    const compName = mainComponent.split("/").pop()!.replace(/\.\w+$/, "");

    const appCode = `import React from "react";
import ${compName} from ".${mainComponent.replace(/\.\w+$/, "")}";

export default function App() {
  return <${compName} />;
}
`;
    files["/App.jsx"] = appCode;
    return "/App.jsx";
  }

  // ─── HTML Generation ──────────────────────────────────────────────────

  private generateIndexHtml(
    importMap: Record<string, string>,
    cssContents: string[],
    assetMap: Record<string, string>
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>

  <script type="importmap">
  ${JSON.stringify({ imports: importMap }, null, 2)}
  </script>

  <script src="https://cdn.tailwindcss.com"></script>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    ${cssContents.join("\n")}
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    // Asset registry
    window.__PHOENIX_ASSETS__ = ${JSON.stringify(assetMap)};
    window.__PHOENIX_PREVIEW__ = true;
    window.__PHOENIX_METRICS__ = { bootStart: performance.now() };

    // Error bridge
    window.onerror = function(msg, src, line, col, err) {
      window.parent.postMessage({ type: "preview-error", msg: String(msg), extra: { src, line, col, stack: err?.stack } }, "*");
    };
    window.addEventListener("unhandledrejection", function(e) {
      window.parent.postMessage({ type: "preview-error", msg: "Unhandled: " + (e.reason?.message || e.reason || "unknown") }, "*");
    });

    // Route change reporting
    (function() {
      var _push = history.pushState;
      var _replace = history.replaceState;
      function report() {
        window.parent.postMessage({ type: "route-change", path: location.pathname + location.search + location.hash }, "*");
      }
      history.pushState = function() { var r = _push.apply(this, arguments); report(); return r; };
      history.replaceState = function() { var r = _replace.apply(this, arguments); report(); return r; };
      window.addEventListener("popstate", report);
    })();

    // Listen for navigation from parent
    window.addEventListener("message", function(e) {
      if (e.data?.type === "navigate" && e.data.path) {
        try { history.pushState(null, "", e.data.path); } catch(ex) {}
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    });
  </script>

  <script type="module" src="./entry.js"></script>
</body>
</html>`;
  }

  private generateEntryBootstrap(
    appPath: string,
    projectId: string,
    supabaseUrl: string,
    supabaseKey: string
  ): string {
    return `import React, { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import App from ".${appPath}";

// Inject project globals
window.__PROJECT_ID__ = "${projectId}";
window.__SUPABASE_URL__ = "${supabaseUrl}";
window.__SUPABASE_KEY__ = "${supabaseKey}";

// Error boundary
class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error) { console.error("[Preview] App crashed:", error); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", {
        style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "system-ui", padding: "2rem" }
      },
        React.createElement("div", { style: { textAlign: "center", maxWidth: 400 } },
          React.createElement("div", { style: { fontSize: 48, marginBottom: 16 } }, "⚠️"),
          React.createElement("h2", { style: { fontSize: 18, fontWeight: 600, color: "#1e293b", marginBottom: 8 } }, "App Error"),
          React.createElement("p", { style: { fontSize: 14, color: "#64748b", marginBottom: 16 } },
            this.state.error?.message || "Something went wrong."
          ),
          React.createElement("button", {
            onClick: () => this.setState({ hasError: false }),
            style: { padding: "8px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }
          }, "Try Again")
        )
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(StrictMode, null,
    React.createElement(AppErrorBoundary, null,
      React.createElement(App)
    )
  )
);

window.__phoenixMounted__ = true;
window.__PHOENIX_METRICS__.bootEnd = performance.now();
window.parent.postMessage({
  type: "preview-ready",
  metrics: {
    bootDurationMs: Math.round(window.__PHOENIX_METRICS__.bootEnd - window.__PHOENIX_METRICS__.bootStart),
    moduleCount: 0
  }
}, "*");
`;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private errorResult(
    buildStart: number,
    message: string,
    diagnostics: PreviewDiagnostic[]
  ): PreviewBuildResult {
    const buildEnd = performance.now();
    return {
      htmlShell: `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#0f172a;color:#f87171;">
<div style="text-align:center"><h2>Preview Build Error</h2><p style="color:#94a3b8">${message}</p></div></body></html>`,
      importMap: {},
      modules: {},
      assets: {},
      entryFile: "",
      diagnostics: [
        ...diagnostics,
        { severity: "error", category: "entrypoint-missing", message, timestamp: Date.now() },
      ],
      metrics: this.buildMetrics(buildStart, buildEnd, 0, 0, 0, 1),
    };
  }

  private buildMetrics(
    startMs: number, endMs: number,
    moduleCount: number, depCount: number,
    totalSize: number, errorCount: number
  ): PreviewMetrics {
    return {
      buildStartMs: startMs,
      buildEndMs: endMs,
      buildDurationMs: Math.round(endMs - startMs),
      fileCount: moduleCount,
      moduleCount,
      dependencyCount: depCount,
      totalSizeBytes: totalSize,
      errorCount,
      warningCount: 0,
    };
  }
}
