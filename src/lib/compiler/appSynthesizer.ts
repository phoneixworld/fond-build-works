/**
 * App Synthesizer — generates a fallback App.jsx when the build agent fails to produce one.
 * Scans the workspace for pages, contexts, and components to assemble a working entry point.
 */

import type { Workspace } from "./workspace";

export function synthesizeAppJsx(workspace: Workspace): string {
  const files = workspace.listFiles();
  
  // Find pages
  const pages = files.filter(f => f.startsWith("/pages/") && /\.(jsx?|tsx?)$/.test(f));
  // Find auth context
  const hasAuth = files.some(f => f.includes("AuthContext"));
  const hasProtectedRoute = files.some(f => f.includes("ProtectedRoute"));
  
  // Build route entries from page files
  const routes: Array<{ path: string; component: string; importPath: string; protect: boolean }> = [];
  
  for (const page of pages) {
    const fileName = page.split("/").pop()!.replace(/\.\w+$/, "");
    const isLogin = /login/i.test(fileName);
    const routePath = isLogin ? "/login" : `/${fileName.toLowerCase().replace(/page$/, "")}`;
    
    routes.push({
      path: routePath,
      component: fileName,
      importPath: `.${page.replace(/\.\w+$/, "")}`,
      protect: !isLogin && hasAuth,
    });
  }
  
  // If no pages found, find any component to render
  if (routes.length === 0) {
    const components = files.filter(f => 
      /\.(jsx?|tsx?)$/.test(f) && 
      !f.includes("Context") && 
      !f.includes("ProtectedRoute") &&
      !f.includes("/ui/")
    );
    if (components.length > 0) {
      const comp = components[0];
      const name = comp.split("/").pop()!.replace(/\.\w+$/, "");
      routes.push({
        path: "/",
        component: name,
        importPath: `.${comp.replace(/\.\w+$/, "")}`,
        protect: false,
      });
    }
  }
  
  // Ensure we have a root route
  if (routes.length > 0 && !routes.some(r => r.path === "/")) {
    const nonLogin = routes.find(r => r.path !== "/login");
    if (nonLogin) {
      routes.unshift({ ...nonLogin, path: "/" });
    }
  }
  
  // Build imports
  const imports: string[] = [
    'import React from "react";',
    'import { HashRouter, Routes, Route, Navigate } from "react-router-dom";',
  ];
  
  if (hasAuth) {
    imports.push('import { AuthProvider, useAuth } from "./contexts/AuthContext";');
  }
  if (hasProtectedRoute) {
    imports.push('import ProtectedRoute from "./components/ProtectedRoute";');
  }
  
  const seenComponents = new Set<string>();
  for (const route of routes) {
    if (!seenComponents.has(route.component)) {
      imports.push(`import ${route.component} from "${route.importPath}";`);
      seenComponents.add(route.component);
    }
  }
  
  // Build route elements
  const routeElements = routes.map(r => {
    const element = r.protect && hasProtectedRoute
      ? `<ProtectedRoute><${r.component} /></ProtectedRoute>`
      : `<${r.component} />`;
    return `        <Route path="${r.path}" element={${element}} />`;
  }).join("\n");
  
  // Assemble App
  const appBody = hasAuth
    ? `  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
${routeElements}
        </Routes>
      </HashRouter>
    </AuthProvider>
  );`
    : `  return (
    <HashRouter>
      <Routes>
${routeElements}
      </Routes>
    </HashRouter>
  );`;
  
  return `${imports.join("\n")}

export default function App() {
${appBody}
}
`;
}
