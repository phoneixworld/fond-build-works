// src/lib/compiler/appSynthesizer.ts

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

// IR-based synthesizeAppFromIR has been REMOVED.
// All App.jsx generation now goes through workspace-driven synthesizeAppJsx()
// which only imports components verified to exist in the workspace.
