// src/lib/compiler/appSynthesizer.ts

import type { IR } from "../ir";
import type { Workspace } from "./workspace";

/**
 * Workspace-based entry point used by the compiler and tests.
 * Scans the workspace for page/context files and synthesizes a valid App.jsx string.
 */
export function synthesizeAppJsx(ws: Workspace, routes?: Array<{ path: string; component: string; file: string }>): string {
  const pageFiles = ws.listFiles().filter(f => f.startsWith("/pages/") && f.endsWith(".jsx"));

  const pageImports: string[] = [];
  const routeLines: string[] = [];

  for (const file of pageFiles) {
    const content = ws.getFile(file) || "";
    const name = file.replace(/^\/pages\//, "").replace(/\.jsx$/, "").replace(/\//g, "_").replace(/.*\//, "");
    const componentName = file.match(/\/([^/]+)\.jsx$/)?.[1] || name;

    const hasDefault = /export\s+default/.test(content);
    const namedMatch = content.match(/export\s+(?:function|const|class)\s+(\w+)/);

    if (hasDefault) {
      pageImports.push(`import ${componentName} from "${file.replace(/\.jsx$/, "")}";`);
    } else if (namedMatch) {
      pageImports.push(`import { ${namedMatch[1]} as ${componentName} } from "${file.replace(/\.jsx$/, "")}";`);
    } else {
      pageImports.push(`import ${componentName} from "${file.replace(/\.jsx$/, "")}";`);
    }

    const path = componentName.toLowerCase().includes("dashboard") ? "/" :
      `/${componentName.replace(/Page$/i, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
    const isIndex = path === "/";
    routeLines.push(`        <Route${isIndex ? " index" : ` path="${path.replace(/^\//, "")}"`} element={<${componentName} />} />`);
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

  return `import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
${pageImports.join("\n")}
${contextImports.join("\n")}

export default function App() {
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
 * This is deterministic and replaces any model-generated App.jsx.
 *
 * - React Router v6
 * - Shadcn layout shell
 * - Sidebar navigation
 * - Auth + Toast providers (if present)
 * - Nested routing via <Outlet />
 */
export function synthesizeAppFromIR(ir: IR): string {
  const imports = buildImports(ir);
  const providersOpen = buildProvidersOpen(ir);
  const providersClose = buildProvidersClose(ir);
  const layoutImport = ir.pages.some((p) => p.type !== "custom") ? `import AppLayout from "./layout/AppLayout";` : "";

  const routeLines = ir.pages.map((p) => {
    const path = p.path === "/" ? "" : ` path="${p.path.replace(/^\//, "")}"`;
    const index = p.path === "/" ? " index" : "";
    return `            <Route${index}${path} element={<${p.name} />} />`;
  });

  return `
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
${imports.join("\n")}
${layoutImport}

export default function App() {
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
 * Build import statements for all pages + contexts + UI.
 */
function buildImports(ir: IR): string[] {
  const pageImports = ir.pages.map((p) => `import ${p.name} from "./pages/${p.name}";`);

  const contextImports = ir.contexts.map((c) => {
    // AuthContext exports AuthProvider, not AuthContext
    if (c.name === "AuthContext") {
      return `import { AuthProvider } from "./contexts/AuthContext";`;
    }
    return `import { ${c.name} } from "./contexts/${c.name}";`;
  });

  const toastImport = ir.components.includes("Toast") ? `import { ToastProvider } from "./components/ui/Toast";` : "";

  return [...pageImports, ...contextImports, toastImport].filter(Boolean);
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
