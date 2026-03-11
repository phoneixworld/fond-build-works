/**
 * ESM Preview Builder v2
 * 
 * Compiles workspace files using Sucrase (JSX/TS → JS) and serves them
 * in a plain iframe using an inline module registry pattern.
 * 
 * Instead of blob URLs (which break relative imports), we create a global
 * module registry and rewrite all imports to use it.
 */

import { transform } from "sucrase";

// ─── Known packages → esm.sh URLs ──────────────────────────────────────────

const ESM_CDN = "https://esm.sh";

const PINNED_VERSIONS: Record<string, string> = {
  "react": "18.2.0",
  "react-dom": "18.2.0",
  "react-dom/client": "18.2.0",
  "react/jsx-runtime": "18.2.0",
  "react/jsx-dev-runtime": "18.2.0",
  "lucide-react": "0.400.0",
  "framer-motion": "11.0.0",
  "date-fns": "3.6.0",
  "recharts": "2.12.0",
  "react-router-dom": "6.22.0",
  "clsx": "2.1.0",
  "tailwind-merge": "2.2.0",
  "react-intersection-observer": "9.10.0",
  "zustand": "4.5.0",
  "zod": "3.22.0",
  "sonner": "1.7.0",
  "react-hook-form": "7.50.0",
  "@tanstack/react-query": "5.20.0",
};

function esmUrl(pkg: string, version?: string): string {
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  const subpath = pkg.replace(base, "");
  const v = version || PINNED_VERSIONS[base] || "latest";
  return `${ESM_CDN}/${base}@${v}${subpath}?external=react,react-dom`;
}

// ─── Compile a single file ──────────────────────────────────────────────────

function compileFile(code: string, filePath: string): string {
  const isTS = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
  const isJSX = filePath.endsWith(".jsx") || filePath.endsWith(".tsx");

  const transforms: ("typescript" | "jsx")[] = [];
  if (isTS) transforms.push("typescript");
  if (isJSX || isTS || filePath.endsWith(".js")) transforms.push("jsx");

  try {
    return transform(code, {
      transforms,
      jsxRuntime: "automatic",
      jsxImportSource: "react",
      production: true,
      filePath,
    }).code;
  } catch (e: any) {
    console.warn(`[ESM] Compile error in ${filePath}:`, e.message);
    const name = filePath.replace(/.*\//, "").replace(/\.\w+$/, "").replace(/[^a-zA-Z0-9]/g, "") || "ErrorModule";
    return `
import { jsx as _jsx } from "react/jsx-runtime";
export default function ${name}() {
  return _jsx("div", { 
    style: { padding: "2rem", textAlign: "center", color: "#f59e0b" },
    children: "⚠ ${name} had a compile error"
  });
}`;
  }
}

// ─── Path resolution ────────────────────────────────────────────────────────

function resolveRelative(from: string, to: string): string {
  if (!to.startsWith(".")) return to;
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  for (const part of toParts) {
    if (part === ".") continue;
    if (part === "..") fromParts.pop();
    else fromParts.push(part);
  }
  return fromParts.join("/");
}

/** Normalize a path to canonical form: /components/ui/Card */
function normalizePath(p: string): string {
  let n = p.startsWith("/") ? p : `/${p}`;
  // Strip extension for matching
  return n;
}

/** Find a file by import path, trying common extensions */
function findFile(importResolved: string, fileSet: Set<string>): string | null {
  // Exact match
  if (fileSet.has(importResolved)) return importResolved;
  // Try extensions
  const noExt = importResolved.replace(/\.\w+$/, "");
  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
    if (fileSet.has(noExt + ext)) return noExt + ext;
    if (fileSet.has(importResolved + ext)) return importResolved + ext;
  }
  // Try index files
  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
    if (fileSet.has(importResolved + "/index" + ext)) return importResolved + "/index" + ext;
    if (fileSet.has(noExt + "/index" + ext)) return noExt + "/index" + ext;
  }
  return null;
}

// ─── Module registry approach ───────────────────────────────────────────────

/**
 * Instead of blob URLs, we create an inline module registry.
 * All modules are defined as functions in a global __modules__ map,
 * and imports are rewritten to use __require__() calls.
 */

function resolveSpec(spec: string, filePath: string, fileSet: Set<string>): string {
  if (spec.startsWith(".")) {
    const found = findFile(resolveRelative(filePath, spec), fileSet);
    return found || spec;
  }
  return spec;
}

function rewriteToRegistry(
  code: string,
  filePath: string,
  fileSet: Set<string>,
  _npmPackages: Set<string>
): string {
  // Strip CSS imports (single and multi-line)
  code = code.replace(/import\s+['"][^'"]*\.css['"]\s*;?/g, "");

  // Order matters: most specific patterns first, side-effect last

  // 1) import * as X from "specifier"
  code = code.replace(
    /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, ns: string, spec: string) => {
      const resolved = resolveSpec(spec, filePath, fileSet);
      return `const ${ns} = await __import__("${resolved}");`;
    }
  );

  // 2) import Default, { Named as Alias, ... } from "specifier"
  code = code.replace(
    /import\s+([\w$]+)\s*,\s*\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, def: string, named: string, spec: string) => {
      const resolved = resolveSpec(spec, filePath, fileSet);
      const tmp = `__m${uid()}`;
      const namedPart = parseNamedList(named);
      return `const ${tmp} = await __import__("${resolved}");\nconst ${def} = ${tmp}.default !== undefined ? ${tmp}.default : ${tmp};\nconst { ${namedPart} } = ${tmp};`;
    }
  );

  // 3) import { Named } from "specifier"
  code = code.replace(
    /import\s+\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, named: string, spec: string) => {
      const resolved = resolveSpec(spec, filePath, fileSet);
      const tmp = `__m${uid()}`;
      const namedPart = parseNamedList(named);
      return `const ${tmp} = await __import__("${resolved}");\nconst { ${namedPart} } = ${tmp};`;
    }
  );

  // 4) import Default from "specifier"
  code = code.replace(
    /import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, def: string, spec: string) => {
      const resolved = resolveSpec(spec, filePath, fileSet);
      const tmp = `__m${uid()}`;
      return `const ${tmp} = await __import__("${resolved}");\nconst ${def} = ${tmp}.default !== undefined ? ${tmp}.default : ${tmp};`;
    }
  );

  // 5) Side-effect: import "specifier" (LAST — so it doesn't eat other patterns)
  code = code.replace(
    /import\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, spec: string) => {
      const resolved = resolveSpec(spec, filePath, fileSet);
      return `await __import__("${resolved}");`;
    }
  );

  // 4) export { X } from "specifier"
  code = code.replace(
    /export\s+\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]\s*;?/g,
    (_match, names: string, spec: string) => {
      const resolved = resolveSpec(spec, filePath, fileSet);
      const tmp = `__m${uid()}`;
      const lines = [`const ${tmp} = await __import__("${resolved}");`];
      for (const n of names.split(",").map(s => s.trim()).filter(Boolean)) {
        const [from, as] = n.split(/\s+as\s+/);
        lines.push(`__exports__.${as || from} = ${tmp}.${from};`);
      }
      return lines.join("\n");
    }
  );

  // Export rewrites — done line-by-line since they're declaration-level
  const lines = code.split("\n");
  const result: string[] = [];
  const defaultExportNames: string[] = [];
  const namedExportNames: string[] = []; // Deferred to end of module
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    // export default function Name
    const edf = trimmed.match(/^export\s+default\s+function\s+(\w+)/);
    if (edf) {
      result.push(lines[i].replace("export default function", "function"));
      defaultExportNames.push(edf[1]);
      continue;
    }
    
    // export default class Name  
    const edc = trimmed.match(/^export\s+default\s+class\s+(\w+)/);
    if (edc) {
      result.push(lines[i].replace("export default class", "class"));
      defaultExportNames.push(edc[1]);
      continue;
    }
    
    // export default <expression>
    if (trimmed.startsWith("export default ")) {
      result.push(lines[i].replace("export default ", "__exports__.default = "));
      continue;
    }
    
    // export const/let/var/function/class Name
    // CRITICAL: Defer the __exports__ assignment to the END of the module,
    // because the declaration may span multiple lines (arrow functions, etc.)
    // and inserting immediately would place the assignment inside the function body.
    const ed = trimmed.match(/^export\s+(const|let|var|function|class)\s+(\w+)/);
    if (ed) {
      result.push(lines[i].replace(/^(\s*)export\s+/, "$1"));
      namedExportNames.push(ed[2]);
      continue;
    }
    
    // export { X, Y }
    const eb = trimmed.match(/^export\s+\{([^}]+)\}\s*;?\s*$/);
    if (eb) {
      for (const n of eb[1].split(",").map(s => s.trim()).filter(Boolean)) {
        const [from, as] = n.split(/\s+as\s+/);
        namedExportNames.push(`${as || from}=${from}`);
      }
      continue;
    }
    
    result.push(lines[i]);
  }
  
  // Add ALL deferred exports at the end of the module
  for (const name of defaultExportNames) {
    result.push(`__exports__.default = ${name};`);
  }
  for (const entry of namedExportNames) {
    if (entry.includes("=")) {
      // export { X as Y } case
      const [exportName, localName] = entry.split("=");
      result.push(`__exports__.${exportName} = ${localName};`);
    } else {
      result.push(`__exports__.${entry} = ${entry};`);
    }
  }
  
  return result.join("\n");
}

let _uid = 0;
function uid(): string {
  return `_${(++_uid).toString(36)}`;
}

function parseNamedList(named: string): string {
  return named.split(",").map(s => {
    const parts = s.trim().split(/\s+as\s+/);
    return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
  }).filter(Boolean).join(", ");
}

// ─── Build the full HTML document ──────────────────────────────────────────

export interface ESMBuildResult {
  html: string;
  fileCount: number;
  errors: string[];
}

export function buildESMPreview(
  files: Record<string, string>,
  extraDeps?: Record<string, string>,
  projectId?: string,
  supabaseUrl?: string,
  supabaseKey?: string
): ESMBuildResult {
  const errors: string[] = [];
  
  // Normalize paths
  const normalized: Record<string, string> = {};
  for (const [path, code] of Object.entries(files)) {
    const p = path.startsWith("/") ? path : `/${path}`;
    normalized[p] = code;
  }

  // Build set of all file paths for resolution
  const fileSet = new Set(Object.keys(normalized));

  // Scan for npm imports
  const npmImports = new Set<string>();
  for (const code of Object.values(normalized)) {
    const matches = code.matchAll(/(?:import|from)\s+['"]([^./][^'"]*)['"]/g);
    for (const m of matches) {
      npmImports.add(m[1]);
    }
  }
  npmImports.add("react");
  npmImports.add("react-dom");
  npmImports.add("react-dom/client");
  npmImports.add("react/jsx-runtime");
  npmImports.add("react/jsx-dev-runtime");

  const importMap: Record<string, string> = {};
  for (const pkg of npmImports) {
    const version = extraDeps?.[pkg] || extraDeps?.[pkg.split("/")[0]];
    importMap[pkg] = esmUrl(pkg, version);
  }

  // Compile and rewrite all JS/TS files
  const modules: Array<{ path: string; code: string }> = [];
  const cssContents: string[] = [];

  for (const [path, code] of Object.entries(normalized)) {
    if (path.match(/\.(jsx?|tsx?)$/)) {
      const compiled = compileFile(code, path);
      const rewritten = rewriteToRegistry(compiled, path, fileSet, npmImports);
      modules.push({ path, code: rewritten });
    } else if (path.endsWith(".css")) {
      const cleaned = code
        .replace(/^@tailwind\s+\w+;\s*$/gm, "")
        .replace(/^@import\s+url\([^)]+\);\s*$/gm, "")
        .trim();
      if (cleaned) cssContents.push(cleaned);
    }
  }

  // Find entry point — or synthesize one
  let entryPath = [
    "/App.tsx", "/App.jsx", "/App.js", "/App.ts",
    "/src/App.tsx", "/src/App.jsx", "/src/App.js", "/src/App.ts",
  ].find(p => fileSet.has(p))
    || Array.from(fileSet).find(p => /\/App\.(tsx?|jsx?)$/.test(p));

  if (!entryPath) {
    // Auto-synthesize a minimal App.jsx from available pages/components
    const jsxFiles = Array.from(fileSet).filter(p => /\.(jsx?|tsx?)$/.test(p) && !p.includes("/ui/"));
    if (jsxFiles.length > 0) {
      const pageFiles = jsxFiles.filter(p => p.includes("/pages/"));
      const mainComponent = pageFiles[0] || jsxFiles[0];
      const compName = mainComponent.split("/").pop()!.replace(/\.\w+$/, "");
      const hasAuthCtx = Array.from(fileSet).some(p => p.includes("AuthContext"));
      
      let appCode = `import React from "react";\n`;
      appCode += `import ${compName} from ".${mainComponent.replace(/\.\w+$/, "")}";\n`;
      if (hasAuthCtx) {
        appCode += `import { AuthProvider } from "./contexts/AuthContext";\n`;
        appCode += `\nexport default function App() {\n  return (\n    <AuthProvider>\n      <${compName} />\n    </AuthProvider>\n  );\n}\n`;
      } else {
        appCode += `\nexport default function App() {\n  return <${compName} />;\n}\n`;
      }
      
      entryPath = "/App.jsx";
      normalized[entryPath] = appCode;
      fileSet.add(entryPath);
      
      // Compile and add to modules
      const compiled = compileFile(appCode, entryPath);
      const rewritten = rewriteToRegistry(compiled, entryPath, fileSet, npmImports);
      modules.push({ path: entryPath, code: rewritten });
      
      console.log(`[ESM] Auto-synthesized App.jsx wrapping ${compName}`);
    } else {
      const allFiles = Array.from(fileSet).join(", ");
      errors.push("No App entry point found");
      return { html: buildErrorPage(`No App found. Files: ${allFiles}`), fileCount: 0, errors };
    }
  }

  console.log(`[ESM] Building preview: ${modules.length} modules, entry: ${entryPath}`);

  // Build the module registry as inline script
  const moduleDefinitions = modules.map(m => {
    // Escape backticks and ${} in the code for embedding in template literal
    const escaped = m.code
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
    return `  "${m.path}": \`${escaped}\``;
  }).join(",\n");

  const html = `<!DOCTYPE html>
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
    window.__PROJECT_ID__ = "${projectId || ""}";
    window.__SUPABASE_URL__ = "${supabaseUrl || ""}";
    window.__SUPABASE_KEY__ = "${supabaseKey || ""}";
  </script>
  <script type="module">
    // ── Module Registry ──
    const __sources__ = {
${moduleDefinitions}
    };

    const __cache__ = {};
    const __loading__ = {};

    async function __import__(specifier) {
      // npm package — use native import (resolved by importmap)
      if (!specifier.startsWith("/")) {
        return await import(specifier);
      }
      
      // Local module
      if (__cache__[specifier]) return __cache__[specifier];
      
      // Prevent circular import infinite loops
      if (__loading__[specifier]) {
        return __cache__[specifier] || {};
      }
      
      const source = __sources__[specifier];
      if (!source) {
        console.warn("[ESM] Module not found:", specifier);
        return { default: () => null };
      }
      
      __loading__[specifier] = true;
      const __exports__ = {};
      __cache__[specifier] = __exports__;
      
      try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction("__exports__", "__import__", source);
        await fn(__exports__, __import__);
      } catch(e) {
        console.error("[ESM] Error in " + specifier + ":", e);
        window.parent.postMessage({ type: "esm-preview-error", message: "Module " + specifier + ": " + e.message }, "*");
        __exports__.default = function ErrorComponent() {
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
      
      window.parent.postMessage({ type: "preview-ready" }, "*");
      
      // Route change reporting (hash-aware)
      function reportRoute() {
        var hash = location.hash;
        var path = hash && hash.startsWith("#") ? hash.slice(1) || "/" : location.pathname + location.search;
        window.parent.postMessage({ type: "route-change", path: path }, "*");
      }
      window.addEventListener("popstate", reportRoute);
      window.addEventListener("hashchange", reportRoute);

      // Listen for navigation from parent
      window.addEventListener("message", function(e) {
        if (e.data && e.data.type === "navigate" && e.data.path) {
          if (location.hash.startsWith("#/") || location.hash === "#") {
            location.hash = "#" + e.data.path;
          } else {
            try { history.pushState(null, "", e.data.path); } catch(ex) {}
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
        }
      });
    } catch(e) {
      console.error("[ESM Preview]", e);
      window.parent.postMessage({ type: "esm-preview-error", message: e.message }, "*");
      document.getElementById("root").innerHTML = 
        '<div style="padding:2rem;text-align:center;color:#ef4444;font-family:system-ui;">' +
        '<h2 style="margin-bottom:0.5rem">Preview Error</h2>' +
        '<pre style="font-size:12px;color:#64748b;white-space:pre-wrap;max-width:600px;margin:1rem auto;text-align:left;background:#f8fafc;padding:1rem;border-radius:8px;border:1px solid #e2e8f0">' + 
        e.message + (e.stack ? "\\n\\n" + e.stack.split("\\n").slice(0,5).join("\\n") : "") + '</pre></div>';
    }
    
    // Global error handler for runtime errors
    window.onerror = function(msg) {
      window.parent.postMessage({ type: "esm-preview-error", message: String(msg) }, "*");
    };
    window.addEventListener("unhandledrejection", function(e) {
      window.parent.postMessage({ type: "esm-preview-error", message: "Unhandled: " + (e.reason?.message || e.reason || "unknown") }, "*");
    });
    }
  </script>
</body>
</html>`;

  return { html, fileCount: modules.length, errors };
}

function buildErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#ef4444;">
<div style="text-align:center"><h2>Build Error</h2><p style="color:#64748b">${message}</p></div>
</body></html>`;
}

export function revokeBlobUrls(_html: string) {
  // No longer using blob URLs — this is now a no-op kept for API compat
}
