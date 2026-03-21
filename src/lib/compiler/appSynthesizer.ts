import type { IR } from "../ir";
import { Workspace } from "./workspace";

export function synthesizeAppFromIR(ir: IR): string {
  const pageImports = ir.pages.map((p) => {
    const safeName = p.name;
    return `import ${safeName} from "./pages/${safeName}";`;
  });

  const routeLines = ir.pages.map((p) => {
    const path = p.path === "/" ? "" : ` path="${p.path.replace(/^\//, "")}"`;
    const index = p.path === "/" ? " index" : "";
    return `            <Route${index}${path} element={<${p.name} />} />`;
  });

  return `
import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./contexts/AuthContext";
import AppLayout from "./layout/AppLayout";
${pageImports.join("\n")}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route
              path="/"
              element={
                <AppLayout navigation={${JSON.stringify(ir.navigation)}}>
                  {/* App shell */}
                </AppLayout>
              }
            >
${routeLines.join("\n")}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
`.trim();
}

/**
 * Workspace-based App.jsx synthesizer used by the compiler and tests.
 * Scans workspace for page files and generates App.jsx with correct imports.
 */
export function synthesizeAppJsx(ws: Workspace): string {
  const pageFiles = ws.listFiles().filter(f => f.startsWith("/pages/") && f.endsWith(".jsx"));

  const pages = pageFiles.map(f => {
    const match = f.match(/\/([A-Za-z0-9_]+)\.jsx$/);
    const name = match ? match[1] : f.replace(/^\/pages\//, "").replace(/\.jsx$/, "").replace(/\//g, "_");
    return { name, file: f };
  });

  const pageImports = pages.map(p => {
    const content = ws.getFile(p.file) || "";
    const hasDefault = /export\s+default/.test(content);
    const relPath = "." + p.file.replace(/\.jsx$/, "");
    return hasDefault
      ? `import ${p.name} from "${relPath}";`
      : `import { ${p.name} } from "${relPath}";`;
  });

  const routeLines = pages.map((p, i) => {
    const index = i === 0 ? " index" : "";
    const path = i === 0 ? "" : ` path="${p.name.replace(/Page$/, "").toLowerCase()}"`;
    return `        <Route${index}${path} element={<${p.name} />} />`;
  });

  return `import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
${pageImports.join("\n")}

export default function App() {
  return (
    <HashRouter>
      <Routes>
${routeLines.join("\n")}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}`;
}
