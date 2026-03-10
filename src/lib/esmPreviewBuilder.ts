/**
 * ESM Preview Builder
 * 
 * Compiles workspace files using Sucrase (JSX/TS → JS) and serves them
 * in a plain iframe using esm.sh importmaps. No bundler needed.
 * 
 * This replaces Sandpack for large apps where in-browser bundling times out.
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
  const v = version || PINNED_VERSIONS[pkg];
  // For scoped sub-paths like react-dom/client
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  const subpath = pkg.replace(base, "");
  const baseVersion = v || PINNED_VERSIONS[base] || "latest";
  return `${ESM_CDN}/${base}@${baseVersion}${subpath}?external=react,react-dom`;
}

// ─── Compile a single file ──────────────────────────────────────────────────

function compileFile(code: string, filePath: string): string {
  const isTS = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
  const isJSX = filePath.endsWith(".jsx") || filePath.endsWith(".tsx");

  const transforms: ("typescript" | "jsx")[] = [];
  if (isTS) transforms.push("typescript");
  if (isJSX || isTS) transforms.push("jsx");
  if (transforms.length === 0 && filePath.endsWith(".js")) {
    // Plain JS — might still have JSX
    transforms.push("jsx");
  }

  try {
    const result = transform(code, {
      transforms,
      jsxRuntime: "automatic",
      jsxImportSource: "react",
      production: true,
      filePath,
    });
    return result.code;
  } catch (e: any) {
    console.warn(`[ESM] Compile error in ${filePath}:`, e.message);
    // Return a stub component
    const name = filePath.replace(/.*\//, "").replace(/\.\w+$/, "").replace(/[^a-zA-Z0-9]/g, "") || "ErrorModule";
    return `
import { jsx as _jsx } from "react/jsx-runtime";
export default function ${name}() {
  return _jsx("div", { 
    style: { padding: "2rem", textAlign: "center", color: "#f59e0b" },
    children: "⚠ ${name} had a compile error"
  });
}
`;
  }
}

// ─── Rewrite imports to use importmap specifiers or blob URLs ───────────────

function rewriteImports(
  code: string,
  filePath: string,
  fileMap: Map<string, string>,
  blobUrls: Map<string, string>
): string {
  // Rewrite relative imports to blob URLs
  return code.replace(
    /from\s+['"](\.[^'"]+)['"]/g,
    (match, importPath) => {
      const resolved = resolveRelative(filePath, importPath);
      const blobUrl = blobUrls.get(resolved);
      if (blobUrl) {
        return `from "${blobUrl}"`;
      }
      // Try common extensions
      for (const ext of [".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.tsx"]) {
        const tryPath = resolved.replace(/\.\w+$/, "") + ext;
        const tryBlob = blobUrls.get(tryPath);
        if (tryBlob) return `from "${tryBlob}"`;
      }
      // Also try without extension
      const noExt = resolved.replace(/\.\w+$/, "");
      for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
        const tryBlob = blobUrls.get(noExt + ext);
        if (tryBlob) return `from "${tryBlob}"`;
      }
      console.warn(`[ESM] Unresolved import: ${importPath} from ${filePath}`);
      return match;
    }
  );
}

function resolveRelative(from: string, to: string): string {
  if (!to.startsWith(".")) return to;
  const fromParts = from.split("/").slice(0, -1); // directory of 'from'
  const toParts = to.split("/");
  
  for (const part of toParts) {
    if (part === ".") continue;
    if (part === "..") fromParts.pop();
    else fromParts.push(part);
  }
  
  return fromParts.join("/");
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

  // Build importmap from all npm imports found in files
  const npmImports = new Set<string>();
  for (const code of Object.values(normalized)) {
    const matches = code.matchAll(/(?:import|from)\s+['"]([^./][^'"]*)['"]/g);
    for (const m of matches) {
      npmImports.add(m[1]);
    }
  }

  // Always include react essentials
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

  // Phase 1: Compile all files
  const compiled = new Map<string, string>();
  for (const [path, code] of Object.entries(normalized)) {
    if (path.match(/\.(jsx?|tsx?)$/)) {
      compiled.set(path, compileFile(code, path));
    } else if (path.endsWith(".css")) {
      compiled.set(path, code); // CSS handled separately
    }
  }

  // Phase 2: Create blob URLs bottom-up (leaf modules first)
  // Simple approach: two passes — first create blobs, then rewrite
  const blobUrls = new Map<string, string>();
  
  // We need to do this in dependency order. For simplicity, do 3 passes
  // which handles up to 3 levels of internal imports.
  const fileList = Array.from(compiled.keys()).filter(p => p.match(/\.(jsx?|tsx?)$/));
  
  // Sort: files with fewer internal imports first (leaves)
  fileList.sort((a, b) => {
    const aImports = (compiled.get(a) || "").match(/from\s+['"]\./g)?.length || 0;
    const bImports = (compiled.get(b) || "").match(/from\s+['"]\./g)?.length || 0;
    return aImports - bImports;
  });

  // Multiple passes to resolve deeper dependency chains
  for (let pass = 0; pass < 4; pass++) {
    for (const path of fileList) {
      let code = compiled.get(path)!;
      code = rewriteImports(code, path, compiled, blobUrls);
      
      // Revoke old blob if exists
      const oldBlob = blobUrls.get(path);
      if (oldBlob) URL.revokeObjectURL(oldBlob);
      
      const blob = new Blob([code], { type: "application/javascript" });
      blobUrls.set(path, URL.createObjectURL(blob));
    }
  }

  // Collect CSS
  const cssFiles: string[] = [];
  for (const [path, code] of compiled) {
    if (path.endsWith(".css")) {
      cssFiles.push(code);
    }
  }
  // Also extract CSS imports that aren't files
  for (const [path, code] of Object.entries(normalized)) {
    if (path.endsWith(".css") && !compiled.has(path)) {
      cssFiles.push(code);
    }
  }

  // Find entry point
  const entryPath = ["/App.tsx", "/App.jsx", "/App.js", "/App.ts"]
    .find(p => blobUrls.has(p));
  
  if (!entryPath) {
    errors.push("No App entry point found");
    return { html: buildErrorPage("No App.tsx/jsx found in workspace"), fileCount: 0, errors };
  }

  const appBlobUrl = blobUrls.get(entryPath)!;

  // Build HTML
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
    ${cssFiles.join("\n")}
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
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    
    // Error boundary for the whole app
    window.onerror = function(msg, url, line) {
      document.getElementById("root").innerHTML = 
        '<div style="padding:2rem;text-align:center;color:#ef4444;">' +
        '<h2>Runtime Error</h2><pre style="font-size:12px;color:#64748b;white-space:pre-wrap;max-width:600px;margin:1rem auto">' + 
        msg + ' (line ' + line + ')' + '</pre></div>';
    };

    try {
      const { default: App } = await import("${appBlobUrl}");
      const root = createRoot(document.getElementById("root"));
      root.render(createElement(App));
      
      // Report route changes to parent
      function reportRoute() {
        try {
          window.parent.postMessage({ type: "route-change", path: location.pathname + location.hash }, "*");
        } catch(e) {}
      }
      window.addEventListener("popstate", reportRoute);
      
      // Report ready
      window.parent.postMessage({ type: "preview-ready" }, "*");
    } catch(e) {
      console.error("[ESM Preview]", e);
      document.getElementById("root").innerHTML = 
        '<div style="padding:2rem;text-align:center;color:#ef4444;">' +
        '<h2>Module Load Error</h2><pre style="font-size:12px;color:#64748b;white-space:pre-wrap;max-width:600px;margin:1rem auto">' + 
        e.message + '</pre></div>';
    }
  </script>
</body>
</html>`;

  return {
    html,
    fileCount: compiled.size,
    errors,
  };
}

function buildErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#ef4444;">
<div style="text-align:center"><h2>Build Error</h2><p style="color:#64748b">${message}</p></div>
</body></html>`;
}

/**
 * Cleanup blob URLs when preview is unmounted
 */
export function revokeBlobUrls(html: string) {
  const matches = html.matchAll(/blob:[^"'\s]+/g);
  for (const m of matches) {
    try { URL.revokeObjectURL(m[0]); } catch {}
  }
}
