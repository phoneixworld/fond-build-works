// src/lib/compiler/appSynthesizer.ts

import type { IR } from "../ir";
import type { Workspace } from "./workspace";

/**
 * Workspace-based entry point used by the compiler and tests.
 * Scans the workspace for page/context files and synthesizes a valid App.jsx string.
 * Now supports route wrappers for two-phase rendering when detected.
 */
export function synthesizeAppJsx(ws: Workspace, routes?: Array<{ path: string; component: string; file: string }>): string {
  const pageFiles = ws.listFiles().filter(f => f.startsWith("/pages/") && f.endsWith(".jsx"));
  const routeFiles = ws.listFiles().filter(f => f.startsWith("/routes/") && f.endsWith("Route.jsx"));
  const hasRouteWrappers = routeFiles.length > 0;
  const hasWarmers = ws.hasFile("/hooks/useBackgroundWarmers.jsx");

  const pageImports: string[] = [];
  const routeLines: string[] = [];

  for (const file of pageFiles) {
    const content = ws.getFile(file) || "";
    const name = file.replace(/^\/pages\//, "").replace(/\.jsx$/, "").replace(/\//g, "_").replace(/.*\//, "");
    const rawComponentName = file.match(/\/([^/]+)\.jsx$/)?.[1] || name;
    const componentName = rawComponentName.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join("") || rawComponentName;

    // Check if a route wrapper exists for this page
    const routeWrapperFile = `/routes/${componentName}Route.jsx`;
    const useWrapper = hasRouteWrappers && ws.hasFile(routeWrapperFile);
    const importName = useWrapper ? `${componentName}Route` : componentName;
    const importFile = useWrapper ? routeWrapperFile : file;

    const importContent = useWrapper ? ws.getFile(routeWrapperFile) || "" : content;
    const hasDefault = /export\s+default/.test(importContent);
    const namedMatch = importContent.match(/export\s+(?:function|const|class)\s+(\w+)/);

    if (hasDefault) {
      pageImports.push(`import ${importName} from "${importFile.replace(/\.jsx$/, "")}";`);
    } else if (namedMatch) {
      pageImports.push(`import { ${namedMatch[1]} as ${importName} } from "${importFile.replace(/\.jsx$/, "")}";`);
    } else {
      pageImports.push(`import ${importName} from "${importFile.replace(/\.jsx$/, "")}";`);
    }

    const path = componentName.toLowerCase().includes("dashboard") ? "/" :
      `/${componentName.replace(/Page$/i, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
    const isIndex = path === "/";
    routeLines.push(`        <Route${isIndex ? " index" : ` path="${path.replace(/^\//, "")}"`} element={<${importName} />} />`);
  }

  // Context imports
  const contextFiles = ws.listFiles().filter(f => f.startsWith("/contexts/") && f.endsWith(".jsx"));
  const contextImports: string[] = [];
  for (const file of contextFiles) {
    const content = ws.getFile(file) || "";
    const providerMatch = content.match(/export\s+(?:function|const)\s+(\w+Provider)/);
    if (providerMatch) {
      contextImports.push(`import { ${providerMatch[1]} } from "${file.replace(/\.jsx$/, "")}";`);
    }
  }

  // Background warmers import
  const warmerImport = hasWarmers
    ? `import { useBackgroundWarmers } from "/hooks/useBackgroundWarmers";`
    : "";
  const warmerCall = hasWarmers ? "\n  useBackgroundWarmers();" : "";

  return `import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
${pageImports.join("\n")}
${contextImports.join("\n")}
${warmerImport}

export default function App() {${warmerCall}
  return (
    <HashRouter>
      <Routes>
${routeLines.join("\n")}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
`.trim();
}

/**
 * Generates a complete App.jsx file from the IR.
 * Now integrates:
 * - Route wrappers for two-phase rendering
 * - Background warmers for predictive preloading
 * - Optimistic navigation support
 */
export function synthesizeAppFromIR(ir: IR): string {
  const imports = buildImports(ir);
  const providersOpen = buildProvidersOpen(ir);
  const providersClose = buildProvidersClose(ir);
  const layoutImport = ir.pages.some((p) => p.type !== "custom") ? `import AppLayout from "./layout/AppLayout";` : "";

  // Route wrapper imports (use route wrappers instead of raw pages)
  const routeImports = ir.pages.map((p) => {
    const safeName = p.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || p.name;
    return `import ${safeName}Route from "./routes/${safeName}Route";`;
  });

  const routeLines = ir.pages.map((p) => {
    const safeName = p.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || p.name;
    const path = p.path === "/" ? "" : ` path="${p.path.replace(/^\//, "")}"`;
    const index = p.path === "/" ? " index" : "";
    return `            <Route${index}${path} element={<${safeName}Route />} />`;
  });

  return `
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
${imports.join("\n")}
${routeImports.join("\n")}
${layoutImport}
import { useBackgroundWarmers } from "./hooks/useBackgroundWarmers";

export default function App() {
  useBackgroundWarmers();

  return (
${providersOpen}
      <HashRouter>
        <Routes>
          <Route
            path="/"
            element={
              <AppLayout navigation={${JSON.stringify(ir.navigation, null, 2)}}>
                {/* App Shell */}
              </AppLayout>
            }
          >
${routeLines.join("\n")}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
${providersClose}
  );
}
`.trim();
}

/**
 * Build import statements for contexts + UI (pages are now imported via route wrappers).
 */
function buildImports(ir: IR): string[] {
  const contextImports = ir.contexts.map((c) => {
    if (c.name === "AuthContext") {
      return `import { AuthProvider } from "./contexts/AuthContext";`;
    }
    return `import { ${c.name} } from "./contexts/${c.name}";`;
  });

  const toastImport = ir.components.includes("Toast") ? `import { ToastProvider } from "./components/ui/Toast";` : "";

  return [...contextImports, toastImport].filter(Boolean);
}

/**
 * Wrap App with providers in correct order.
 */
function buildProvidersOpen(ir: IR): string {
  const lines: string[] = [];

  if (ir.components.includes("Toast")) lines.push(`<ToastProvider>`);

  const hasAuth = ir.contexts.some((c) => c.name === "AuthContext");
  if (hasAuth) lines.push(`  <AuthProvider>`);

  if (ir.contexts.some((c) => c.name === "AppContext")) lines.push(`    <AppContext>`);

  return lines.map((l) => "  " + l).join("\n");
}

function buildProvidersClose(ir: IR): string {
  const lines: string[] = [];

  if (ir.contexts.some((c) => c.name === "AppContext")) lines.push(`    </AppContext>`);

  const hasAuth = ir.contexts.some((c) => c.name === "AuthContext");
  if (hasAuth) lines.push(`  </AuthProvider>`);

  if (ir.components.includes("Toast")) lines.push(`</ToastProvider>`);

  return lines.map((l) => "  " + l).join("\n");
}
