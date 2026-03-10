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

function rewriteToRegistry(
  code: string,
  filePath: string,
  fileSet: Set<string>,
  npmPackages: Set<string>
): string {
  // Strip CSS imports
  code = code.replace(/^\s*import\s+['"][^'"]+\.css['"]\s*;?\s*$/gm, "");
  
  // Rewrite: import X from "react" → const X = await __import__("react")
  // Rewrite: import { A, B } from "./foo" → const { A, B } = await __import__("/resolved/foo.jsx")
  // Rewrite: import "./side-effect" → await __import__("/resolved/side-effect.js")
  
  // Handle all import forms
  const lines = code.split("\n");
  const rewritten: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Side-effect import: import "something"
    const sideEffect = trimmed.match(/^import\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (sideEffect) {
      const spec = sideEffect[1];
      if (spec.startsWith(".")) {
        const resolved = findFile(resolveRelative(filePath, spec), fileSet);
        if (resolved) {
          rewritten.push(`await __import__("${resolved}");`);
        }
      } else {
        rewritten.push(`await __import__("${spec}");`);
      }
      continue;
    }
    
    // Standard imports: import Default, { Named } from "spec"
    const importMatch = trimmed.match(
      /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/
    );
    if (importMatch) {
      const [, importClause, spec] = importMatch;
      let resolvedSpec = spec;
      
      if (spec.startsWith(".")) {
        const found = findFile(resolveRelative(filePath, spec), fileSet);
        if (found) {
          resolvedSpec = found;
        } else {
          console.warn(`[ESM] Unresolved: ${spec} from ${filePath}`);
          rewritten.push(`// UNRESOLVED: ${line}`);
          continue;
        }
      }
      
      // Parse the import clause
      const parsed = parseImportClause(importClause);
      
      if (parsed) {
        const tmpVar = `__m_${Math.random().toString(36).slice(2, 8)}`;
        rewritten.push(`const ${tmpVar} = await __import__("${resolvedSpec}");`);
        
        const assignments: string[] = [];
        if (parsed.default) {
          assignments.push(`const ${parsed.default} = ${tmpVar}.default !== undefined ? ${tmpVar}.default : ${tmpVar};`);
        }
        if (parsed.named.length > 0) {
          const destructured = parsed.named
            .map(n => n.alias ? `${n.name}: ${n.alias}` : n.name)
            .join(", ");
          assignments.push(`const { ${destructured} } = ${tmpVar};`);
        }
        if (parsed.namespace) {
          assignments.push(`const ${parsed.namespace} = ${tmpVar};`);
        }
        rewritten.push(...assignments);
      } else {
        rewritten.push(`await __import__("${resolvedSpec}");`);
      }
      continue;
    }
    
    // Export from: export { X } from "./foo"
    const exportFrom = trimmed.match(
      /^export\s+(\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/
    );
    if (exportFrom) {
      const [, clause, spec] = exportFrom;
      let resolvedSpec = spec;
      if (spec.startsWith(".")) {
        const found = findFile(resolveRelative(filePath, spec), fileSet);
        if (found) resolvedSpec = found;
      }
      const tmpVar = `__m_${Math.random().toString(36).slice(2, 8)}`;
      rewritten.push(`const ${tmpVar} = await __import__("${resolvedSpec}");`);
      // Re-export the names
      const names = clause.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
      for (const n of names) {
        const parts = n.split(/\s+as\s+/);
        const from = parts[0];
        const as = parts[1] || parts[0];
        rewritten.push(`__exports__.${as} = ${tmpVar}.${from};`);
      }
      continue;
    }
    
    // export default → __exports__.default = 
    if (trimmed.startsWith("export default function ")) {
      const fnName = trimmed.match(/export default function\s+(\w+)/)?.[1] || "DefaultExport";
      rewritten.push(line.replace("export default function", "function"));
      rewritten.push(`__exports__.default = ${fnName};`);
      continue;
    }
    if (trimmed.startsWith("export default class ")) {
      const clsName = trimmed.match(/export default class\s+(\w+)/)?.[1] || "DefaultExport";
      rewritten.push(line.replace("export default class", "class"));
      rewritten.push(`__exports__.default = ${clsName};`);
      continue;
    }
    if (trimmed.startsWith("export default ")) {
      rewritten.push(line.replace("export default ", "__exports__.default = "));
      continue;
    }
    
    // export const/let/var/function/class
    const exportDecl = trimmed.match(/^export\s+(const|let|var|function|class)\s+(\w+)/);
    if (exportDecl) {
      const [, keyword, name] = exportDecl;
      rewritten.push(line.replace(/^(\s*)export\s+/, "$1"));
      rewritten.push(`__exports__.${name} = ${name};`);
      continue;
    }
    
    // export { X, Y }
    const exportBlock = trimmed.match(/^export\s+\{([^}]+)\}\s*;?\s*$/);
    if (exportBlock) {
      const names = exportBlock[1].split(",").map(s => s.trim()).filter(Boolean);
      for (const n of names) {
        const parts = n.split(/\s+as\s+/);
        rewritten.push(`__exports__.${parts[1] || parts[0]} = ${parts[0]};`);
      }
      continue;
    }
    
    rewritten.push(line);
  }
  
  return rewritten.join("\n");
}

interface ParsedImportClause {
  default: string | null;
  named: Array<{ name: string; alias?: string }>;
  namespace: string | null;
}

function parseImportClause(clause: string): ParsedImportClause | null {
  const result: ParsedImportClause = { default: null, named: [], namespace: null };
  let remaining = clause.trim();
  
  // Namespace: * as X
  const nsMatch = remaining.match(/^\*\s+as\s+(\w+)$/);
  if (nsMatch) {
    result.namespace = nsMatch[1];
    return result;
  }
  
  // Default, possibly followed by named
  // e.g., "React, { useState, useEffect }" or just "React" or just "{ useState }"
  
  // Check for named part first
  const braceMatch = remaining.match(/\{([^}]*)\}/);
  if (braceMatch) {
    const namedStr = braceMatch[1];
    result.named = namedStr.split(",").map(s => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts.length === 2 
        ? { name: parts[0].trim(), alias: parts[1].trim() }
        : { name: parts[0].trim() };
    }).filter(n => n.name);
    remaining = remaining.replace(/,?\s*\{[^}]*\}/, "").trim();
  }
  
  // What's left is the default import
  if (remaining && remaining !== ",") {
    result.default = remaining.replace(/,\s*$/, "").trim();
  }
  
  if (!result.default && result.named.length === 0 && !result.namespace) return null;
  return result;
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

  // Find entry point
  const entryPath = [
    "/App.tsx", "/App.jsx", "/App.js", "/App.ts",
    "/src/App.tsx", "/src/App.jsx", "/src/App.js", "/src/App.ts",
  ].find(p => fileSet.has(p))
    || Array.from(fileSet).find(p => /\/App\.(tsx?|jsx?)$/.test(p));

  if (!entryPath) {
    const allFiles = Array.from(fileSet).join(", ");
    errors.push("No App entry point found");
    return { html: buildErrorPage(`No App found. Files: ${allFiles}`), fileCount: 0, errors };
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
      
      const root = createRoot(document.getElementById("root"));
      root.render(createElement(App));
      
      window.parent.postMessage({ type: "preview-ready" }, "*");
      
      // Route change reporting
      window.addEventListener("popstate", function() {
        window.parent.postMessage({ type: "route-change", path: location.pathname + location.hash }, "*");
      });
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
