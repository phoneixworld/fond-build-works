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
  // Find toast provider
  const hasToast = files.some(f => {
    if (!/\.(jsx?|tsx?)$/.test(f)) return false;
    const content = workspace.getFile(f) || "";
    return /export\s+(?:function|const)\s+ToastProvider/.test(content) ||
           /export\s*\{[^}]*ToastProvider[^}]*\}/.test(content);
  });
  
  // Build route entries from page files
  const routes: Array<{ path: string; component: string; importPath: string; protect: boolean }> = [];
  
  for (const page of pages) {
    const fileName = page.split("/").pop()!.replace(/\.\w+$/, "");
    const normalized = fileName.toLowerCase();

    const isLogin = /^login(page)?$|^signin(page)?$/.test(normalized);
    const isSignup = /^signup(page)?$|^register(page)?$/.test(normalized);
    const isPublicAuthRoute = isLogin || isSignup || /forgot|reset|auth/.test(normalized);

    const routePath = isLogin
      ? "/login"
      : isSignup
        ? "/signup"
        : `/${normalized.replace(/page$/, "")}`;

    routes.push({
      path: routePath,
      component: fileName,
      importPath: `.${page.replace(/\.\w+$/, "")}`,
      protect: hasAuth && !isPublicAuthRoute,
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
    const nonAuthRoute = routes.find(r => !["/login", "/signup", "/auth"].includes(r.path));
    const fallback = nonAuthRoute || routes.find(r => r.path === "/login") || routes[0];
    if (fallback) {
      routes.unshift({ ...fallback, path: "/" });
    }
  }
  
  // Build imports
  const imports: string[] = [
    'import React from "react";',
    'import { HashRouter, Routes, Route, Navigate } from "react-router-dom";',
  ];
  
  if (hasToast) {
    // Find the file that exports ToastProvider to get correct import path
    const toastFile = files.find(f => {
      const content = workspace.getFile(f) || "";
      return /export\s+(?:function|const)\s+ToastProvider/.test(content) ||
             /export\s*\{[^}]*ToastProvider[^}]*\}/.test(content);
    });
    const toastImportPath = toastFile ? `.${toastFile.replace(/\.\w+$/, "")}` : "./components/ui/Toast";
    imports.push(`import { ToastProvider } from "${toastImportPath}";`);
  }
  
  if (hasAuth) {
    imports.push('import { AuthProvider, useAuth } from "./contexts/AuthContext";');
  }
  if (hasProtectedRoute) {
    imports.push('import ProtectedRoute from "./components/ProtectedRoute";');
  }
  
  const seenComponents = new Set<string>();
  for (const route of routes) {
    if (!seenComponents.has(route.component)) {
      // Check if target file has a default export
      const targetFile = files.find(f => {
        const name = f.split("/").pop()!.replace(/\.\w+$/, "");
        return name === route.component;
      });
      const targetContent = targetFile ? (workspace.getFile(targetFile) || "") : "";
      const hasDefault = /export\s+default\s/.test(targetContent);
      
      if (hasDefault || !targetFile) {
        imports.push(`import ${route.component} from "${route.importPath}";`);
      } else {
        imports.push(`import { ${route.component} } from "${route.importPath}";`);
      }
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
  
  // Assemble App — respect provider ordering: ToastProvider → AuthProvider → Router
  let appBody: string;
  if (hasToast && hasAuth) {
    appBody = `  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
${routeElements}
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );`;
  } else if (hasAuth) {
    appBody = `  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
${routeElements}
        </Routes>
      </HashRouter>
    </AuthProvider>
  );`;
  } else if (hasToast) {
    appBody = `  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
${routeElements}
        </Routes>
      </HashRouter>
    </ToastProvider>
  );`;
  } else {
    appBody = `  return (
    <HashRouter>
      <Routes>
${routeElements}
      </Routes>
    </HashRouter>
  );`;
  }
  
  return `${imports.join("\n")}

export default function App() {
${appBody}
}
`;
}
