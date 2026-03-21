import type { IR } from "./ir";

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
