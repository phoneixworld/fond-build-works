// src/lib/appSynthesizer.ts

import type { IR } from "./ir";

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

  const contextImports = ir.contexts.map((c) => `import { ${c.name} } from "./contexts/${c.name}";`);

  const toastImport = ir.components.includes("Toast") ? `import { ToastProvider } from "./components/ui/Toast";` : "";

  return [...pageImports, ...contextImports, toastImport].filter(Boolean);
}

/**
 * Wrap App with providers in correct order.
 */
function buildProvidersOpen(ir: IR): string {
  const lines: string[] = [];

  if (ir.components.includes("Toast")) lines.push(`<ToastProvider>`);
  if (ir.contexts.some((c) => c.name === "AuthContext")) lines.push(`  <AuthContext>`);
  if (ir.contexts.some((c) => c.name === "AppContext")) lines.push(`    <AppContext>`);

  return lines.map((l) => "  " + l).join("\n");
}

function buildProvidersClose(ir: IR): string {
  const lines: string[] = [];

  if (ir.contexts.some((c) => c.name === "AppContext")) lines.push(`    </AppContext>`);
  if (ir.contexts.some((c) => c.name === "AuthContext")) lines.push(`  </AuthContext>`);
  if (ir.components.includes("Toast")) lines.push(`</ToastProvider>`);

  return lines.map((l) => "  " + l).join("\n");
}
