// src/lib/compiler/appSynthesizer.ts

import type { IR } from "../ir";
import type { Workspace } from "./workspace";

/**
 * Workspace-based entry point used by the compiler and tests.
 * This version is correct and safe — it never imports route wrappers,
 * never imports warmers, and only uses components that actually exist.
 */
export function synthesizeAppJsx(
  ws: Workspace,
  routes?: Array<{ path: string; component: string; file: string }>,
): string {
  const pageFiles = ws.listFiles().filter((f) => f.startsWith("/pages/") && f.endsWith(".jsx"));

  const pageImports: string[] = [];
  const routeLines: string[] = [];

  for (const file of pageFiles) {
    const content = ws.getFile(file) || "";

    // Derive component name from filename
    const raw = file.match(/\/([^/]+)\.jsx$/)?.[1] || "Page";
    const componentName = raw.replace(/[^a-zA-Z0-9]/g, "");

    // Import the page
    const hasDefault = /export\s+default/.test(content);
    if (hasDefault) {
      pageImports.push(`import ${componentName} from "${file.replace(/\.jsx$/, "")}";`);
    } else {
      pageImports.push(`import { ${componentName} } from "${file.replace(/\.jsx$/, "")}";`);
    }

    // Route path
    const path = componentName.toLowerCase().includes("dashboard")
      ? "/"
      : `/${componentName
          .replace(/Page$/i, "")
          .replace(/([a-z])([A-Z])/g, "$1-$2")
          .toLowerCase()}`;

    const isIndex = path === "/";
    const pathAttr = isIndex ? "" : ` path="${path.replace(/^\//, "")}"`;
    const indexAttr = isIndex ? " index" : "";

    routeLines.push(`        <Route${indexAttr}${pathAttr} element={<${componentName} />} />`);
  }

  // Context providers
  const contextFiles = ws.listFiles().filter((f) => f.startsWith("/contexts/") && f.endsWith(".jsx"));

  const contextImports: string[] = [];
  for (const file of contextFiles) {
    const content = ws.getFile(file) || "";
    const providerMatch = content.match(/export\s+(?:function|const)\s+(\w+Provider)/);
    if (providerMatch) {
      contextImports.push(`import { ${providerMatch[1]} } from "${file.replace(/\.jsx$/, "")}";`);
    }
  }

  return `
import React from "react";
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
 * IR-based synthesizer — now corrected.
 *
 * This version:
 * - DOES NOT import route wrappers
 * - DOES NOT import warmers
 * - DOES NOT assume AppLayout exists unless IR explicitly requires it
 * - Imports pages directly
 * - Uses real Toast/Auth providers
 */
export function synthesizeAppFromIR(ir: IR): string {
  const imports = buildImports(ir);

  // Pages must include importPath in IR
  const pageImports = ir.pages.map((p) => `import ${p.name} from "${p.importPath}";`);

  const routeLines = ir.pages.map((p) => {
    const isIndex = p.path === "/";
    const pathAttr = isIndex ? "" : ` path="${p.path.replace(/^\//, "")}"`;
    const indexAttr = isIndex ? " index" : "";
    return `            <Route${indexAttr}${pathAttr} element={<${p.name} />} />`;
  });

  const providersOpen = buildProvidersOpen(ir);
  const providersClose = buildProvidersClose(ir);

  // Optional layout
  const hasLayout = ir.pages.some((p) => p.type !== "custom");
  const layoutImport = hasLayout ? `import AppLayout from "./layout/AppLayout";` : "";
  const layoutOpen = hasLayout
    ? `<AppLayout navigation={${JSON.stringify(ir.navigation, null, 2)}}>`
    : `<React.Fragment>`;
  const layoutClose = hasLayout ? `</AppLayout>` : `</React.Fragment>`;

  return `
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
${imports.join("\n")}
${pageImports.join("\n")}
${layoutImport}

export default function App() {
  return (
${providersOpen}
      <HashRouter>
        <Routes>
          <Route
            path="/"
            element={
              ${layoutOpen}
                {/* App Shell */}
              ${layoutClose}
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
 * Build import statements for contexts + Toast/Auth providers.
 */
function buildImports(ir: IR): string[] {
  const contextImports = ir.contexts.map((c) => {
    if (c.name === "AuthContext") {
      return `import { AuthProvider } from "./contexts/AuthContext";`;
    }
    return `import { ${c.name} } from "./contexts/${c.name}";`;
  });

  const toastImport = ir.components.includes("Toast")
    ? `import { ToastProvider } from "./contexts/ToastContext.jsx";`
    : "";

  return [...contextImports, toastImport].filter(Boolean);
}

/**
 * Provider wrappers
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
