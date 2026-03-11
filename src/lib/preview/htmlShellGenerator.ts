/**
 * Phoenix HTML Shell Generator
 * 
 * Generates the enterprise-grade HTML document with:
 * - Import map injection
 * - Module registry & loader
 * - Error bridge (forwards errors to parent)
 * - Phoenix runtime helpers
 * - Telemetry hooks
 * - Fallback error overlay
 */

import type { CompiledModule } from "./types";

interface ShellConfig {
  importMap: Record<string, string>;
  modules: CompiledModule[];
  cssContents: string[];
  entryPath: string;
  projectId: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

/**
 * Build the full HTML shell for the ESM preview iframe.
 */
export function generateHtmlShell(config: ShellConfig): string {
  const {
    importMap,
    modules,
    cssContents,
    entryPath,
    projectId,
    supabaseUrl = "",
    supabaseKey = "",
  } = config;

  // Build module definitions as escaped template literals
  const moduleDefinitions = modules
    .map(m => {
      const escaped = m.code
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${");
      return `  "${m.path}": \`${escaped}\``;
    })
    .join(",\n");

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

    /* Phoenix fallback overlay */
    #__phoenix_fallback__ {
      display: none;
      position: fixed; inset: 0; z-index: 99999;
      background: #0f172a; color: #e2e8f0;
      font-family: 'Inter', system-ui, monospace;
      padding: 2rem;
      overflow: auto;
    }
    #__phoenix_fallback__.visible { display: flex; flex-direction: column; align-items: center; justify-content: center; }
    #__phoenix_fallback__ h2 { color: #f87171; margin-bottom: 1rem; font-size: 1.25rem; }
    #__phoenix_fallback__ pre {
      font-size: 12px; color: #94a3b8; white-space: pre-wrap; max-width: 600px;
      background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid #334155;
      text-align: left; width: 100%;
    }
    ${cssContents.join("\n")}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="__phoenix_fallback__">
    <h2>⚠ Preview Error</h2>
    <pre id="__phoenix_error_detail__"></pre>
  </div>

  <script>
    // ── Phoenix Runtime Globals ──
    window.__PROJECT_ID__ = "${projectId}";
    window.__SUPABASE_URL__ = "${supabaseUrl}";
    window.__SUPABASE_KEY__ = "${supabaseKey}";
    window.__PHOENIX_PREVIEW__ = true;
    window.__PHOENIX_METRICS__ = { bootStart: performance.now() };

    // ── Safe URL Constructor ──
    // Patch URL to handle invalid bases (about:srcdoc, blob:, etc.)
    var _OrigURL = URL;
    window.URL = function PhoenixURL(url, base) {
      try {
        return new _OrigURL(url, base);
      } catch(e) {
        try {
          return new _OrigURL(url, "https://localhost");
        } catch(e2) {
          try {
            return new _OrigURL("https://localhost/" + (url || ""));
          } catch(e3) {
            return new _OrigURL("https://localhost");
          }
        }
      }
    };
    window.URL.prototype = _OrigURL.prototype;
    Object.setPrototypeOf(window.URL, _OrigURL);
    window.URL.createObjectURL = _OrigURL.createObjectURL;
    window.URL.revokeObjectURL = _OrigURL.revokeObjectURL;

    function __phoenixError__(msg, extra) {
      console.error("[Phoenix Preview]", msg, extra || "");
      window.parent.postMessage({ type: "preview-error", msg: String(msg), extra: extra || null }, "*");
    }

    window.onerror = function(msg, src, line, col, err) {
      __phoenixError__(msg, { src: src, line: line, col: col, stack: err?.stack });
    };
    window.addEventListener("unhandledrejection", function(e) {
      __phoenixError__("Unhandled: " + (e.reason?.message || e.reason || "unknown"), { stack: e.reason?.stack });
    });

    // ── Mount Timeout Fallback ──
    window.__phoenixMounted__ = false;
    setTimeout(function() {
      if (!window.__phoenixMounted__) {
        var el = document.getElementById("__phoenix_fallback__");
        var detail = document.getElementById("__phoenix_error_detail__");
        if (el && detail) {
          el.classList.add("visible");
          detail.textContent = "React did not mount within 10 seconds.\\nThis may indicate a missing entry point or a runtime error.\\nCheck the browser console for details.";
        }
        __phoenixError__("Mount timeout: React did not render within 10s");
      }
    }, 10000);
  </script>

  <script type="module">
    // ── Module Registry ──
    const __sources__ = {
${moduleDefinitions}
    };

    const __cache__ = {};
    const __loading__ = {};

    async function __import__(specifier) {
      // NPM package → native import (resolved by import map)
      if (!specifier.startsWith("/")) {
        try {
          return await import(specifier);
        } catch(e) {
          console.error("[Phoenix] Failed to import npm package:", specifier, e);
          window.parent.postMessage({
            type: "preview-diagnostic",
            diagnostic: { severity: "error", category: "import-map-missing", message: "Missing: " + specifier }
          }, "*");
          return { default: () => null };
        }
      }

      // Local module — cache check
      if (__cache__[specifier]) return __cache__[specifier];

      // Circular import guard
      if (__loading__[specifier]) {
        return __cache__[specifier] || {};
      }

      const source = __sources__[specifier];
      if (!source) {
        console.warn("[Phoenix] Module not found:", specifier);
        window.parent.postMessage({
          type: "preview-diagnostic",
          diagnostic: { severity: "warning", category: "unresolved-import", message: "Module not found: " + specifier }
        }, "*");
        return { default: () => null };
      }

      __loading__[specifier] = true;
      const __exports__ = {};
      __cache__[specifier] = __exports__;

      try {
        // Polyfill import.meta.url for AsyncFunction context
        var metaUrl;
        try { metaUrl = new URL(specifier, location.href).href; } catch(_) { metaUrl = "https://localhost" + specifier; }
        const wrappedSource = "const import_meta_url = \\"" + metaUrl + "\\";\\n" + source.replace(/import\\.meta\\.url/g, "import_meta_url");
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction("__exports__", "__import__", wrappedSource);
        await fn(__exports__, __import__);
      } catch(e) {
        console.error("[Phoenix] Error in " + specifier + ":", e);
        window.parent.postMessage({
          type: "preview-error",
          msg: "Module " + specifier + ": " + e.message,
          extra: { file: specifier, stack: e.stack }
        }, "*");
        __exports__.default = function ErrorFallback() {
          return { $$typeof: Symbol.for("react.element"), type: "div", props: {
            style: { padding: "2rem", textAlign: "center", color: "#ef4444" },
            children: "⚠ Error in " + specifier + ": " + e.message
          }, key: null, ref: null };
        };
      }

      delete __loading__[specifier];
      return __exports__;
    }

    // ── Boot ──
    try {
      const { createElement } = await import("react");
      const { createRoot } = await import("react-dom/client");
      const AppModule = await __import__("${entryPath}");
      const App = AppModule.default || AppModule;

      if (typeof App !== "function" && typeof App !== "object") {
        throw new Error("App entry point did not export a valid component. Got: " + typeof App);
      }

      const root = createRoot(document.getElementById("root"));
      root.render(createElement(App));

      window.__phoenixMounted__ = true;
      window.__PHOENIX_METRICS__.bootEnd = performance.now();
      window.__PHOENIX_METRICS__.bootDuration = window.__PHOENIX_METRICS__.bootEnd - window.__PHOENIX_METRICS__.bootStart;

      window.parent.postMessage({
        type: "preview-ready",
        metrics: {
          bootDurationMs: Math.round(window.__PHOENIX_METRICS__.bootDuration),
          moduleCount: Object.keys(__sources__).length
        }
      }, "*");

      // Route change reporting
      window.addEventListener("popstate", function() {
        window.parent.postMessage({ type: "route-change", path: location.pathname + location.hash }, "*");
      });
    } catch(e) {
      console.error("[Phoenix Preview]", e);
      window.parent.postMessage({ type: "preview-error", msg: e.message, extra: { stack: e.stack } }, "*");

      var fb = document.getElementById("__phoenix_fallback__");
      var detail = document.getElementById("__phoenix_error_detail__");
      if (fb && detail) {
        fb.classList.add("visible");
        detail.textContent = e.message + (e.stack ? "\\n\\n" + e.stack.split("\\n").slice(0,5).join("\\n") : "");
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Generate a minimal error-only HTML page.
 */
export function generateErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#0f172a;color:#f87171;">
<div style="text-align:center;max-width:500px;padding:2rem">
  <h2 style="margin-bottom:0.5rem">Preview Build Error</h2>
  <p style="color:#94a3b8;font-size:14px">${message}</p>
</div>
</body></html>`;
}
