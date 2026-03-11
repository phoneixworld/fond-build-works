/**
 * Scaffold Templates — JSX template generators for new project builds.
 * 
 * Extracted from buildEngine.ts. These generate the initial file structure
 * (App.jsx, layout, pages, hooks, UI components) for both generic and
 * domain-specific scaffolds.
 * 
 * PATH CONVENTION:
 * All generated files use bare "/" paths (e.g., /App.jsx, /components/Hero.jsx).
 * This is required by Sandpack which expects files at root.
 * The pathNormalizer module handles mapping to src/ for:
 *   - VirtualFS display (file tree shows src/App.jsx)
 *   - GitHub push/pull (exports as src/App.jsx)
 *   - Android/ZIP export (bundles under src/)
 * DO NOT change these paths to src/ — it will break preview rendering.
 */

import { type DomainModel } from "@/lib/domainTemplates";
import { DESIGN_SYSTEM_CSS } from "@/lib/designSystem";

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Returns the mandatory base file scaffold for new React builds.
 * When a DomainModel is provided, generates entity-specific pages, hooks,
 * sidebar nav, and optional auth context — so the AI extends the correct
 * structure from the start instead of a generic Dashboard shell.
 */
export function getBaseTemplate(domainModel?: DomainModel | null): Record<string, string> {
  if (!domainModel) {
    return getGenericScaffold();
  }
  return buildDomainScaffold(domainModel);
}

// ─── Domain Scaffold ──────────────────────────────────────────────────────

function buildDomainScaffold(model: DomainModel): Record<string, string> {
  const files: Record<string, string> = {};

  const pages = model.suggestedPages || [];
  const navItems = model.suggestedNavItems || [];
  const entities = model.entities || [];

  const indexPage = pages.find(p => p.path === "/") || pages.find(p => p.path === "/dashboard") || pages[0];
  const indexPath = indexPage?.path || "/";

  const routeImports: string[] = [];
  const routeElements: string[] = [];
  const generatedPageComponents = new Set<string>();

  for (const page of pages) {
    if (page.path.includes(":")) continue;

    const pageName = page.title.replace(/[^a-zA-Z0-9]/g, "");
    if (generatedPageComponents.has(pageName)) continue;
    generatedPageComponents.add(pageName);

    const dirName = pageName;
    const fileName = pageName;
    const filePath = `/pages/${dirName}/${fileName}.jsx`;

    if (page.type === "dashboard") {
      files[filePath] = generateDashboardPage(pageName, model.templateName, entities);
    } else if (page.type === "list" && page.entity) {
      files[filePath] = generateListPage(pageName, page.entity, page.title);
    } else if (page.type === "form" && page.entity) {
      files[filePath] = generateFormPage(pageName, page.entity, page.title);
    } else {
      files[filePath] = generateStaticPage(pageName, page.title);
    }

    const routePath = page.path === "/" || page.path === indexPath ? "" : page.path.replace(/^\//, "");
    routeImports.push(`import ${pageName} from "./pages/${dirName}/${fileName}";`);

    if (page.path === "/" || page.path === indexPath) {
      routeElements.push(`          <Route index element={<${pageName} />} />`);
    } else {
      routeElements.push(`          <Route path="${routePath}" element={<${pageName} />} />`);
    }
  }

  for (const page of pages) {
    if (!page.path.includes(":") || !page.entity) continue;
    const entityName = page.entity;
    const detailName = `${entityName}Detail`;
    if (generatedPageComponents.has(detailName)) continue;
    generatedPageComponents.add(detailName);

    const filePath = `/pages/${entityName}/${detailName}.jsx`;
    files[filePath] = generateDetailPage(detailName, entityName);

    const routePath = page.path.replace(/^\//, "");
    routeImports.push(`import ${detailName} from "./pages/${entityName}/${detailName}";`);
    routeElements.push(`          <Route path="${routePath}" element={<${detailName} />} />`);
  }

  const authImport = model.requiresAuth ? `import { AuthProvider } from "./contexts/AuthContext";\n` : "";
  const authWrapOpen = model.requiresAuth ? `        <AuthProvider>\n` : "";
  const authWrapClose = model.requiresAuth ? `        </AuthProvider>\n` : "";

  files["/App.jsx"] = `import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
${authImport}${routeImports.join("\n")}

export default function App() {
  return (
    <HashRouter>
${authWrapOpen}      <Routes>
        <Route path="/" element={<AppLayout />}>
${routeElements.join("\n")}
          <Route path="*" element={<Navigate to="${indexPath}" />} />
        </Route>
      </Routes>
${authWrapClose}    </HashRouter>
  );
}
`;

  const iconImports = new Set<string>(["LayoutDashboard"]);
  for (const nav of navItems) {
    if (nav.icon) iconImports.add(nav.icon);
  }

  const sidebarNavItems = navItems.map(nav =>
    `  { to: "${nav.path}", icon: ${nav.icon || "LayoutDashboard"}, label: "${nav.label}" },`
  ).join("\n");

  files["/layout/Sidebar.jsx"] = `import React from "react";
import { NavLink } from "react-router-dom";
import { ${[...iconImports].join(", ")} } from "lucide-react";

const navItems = [
${sidebarNavItems}
];

export default function Sidebar() {
  return (
    <nav className="w-64 bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] flex flex-col">
      <div className="p-4 border-b border-[var(--color-sidebar-border)]">
        <h1 className="text-lg font-bold text-[var(--color-sidebar-text-active)]">${model.templateName}</h1>
      </div>
      <div className="flex-1 py-2">
        {navItems.map(({ to, icon: ItemIcon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              \`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors \${
                isActive ? "bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-text-active)]" : "text-[var(--color-sidebar-text)] hover:text-[var(--color-sidebar-text-active)] hover:bg-[var(--color-sidebar-hover)]"
              }\`
            }
          >
            <ItemIcon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
`;

  files["/layout/AppLayout.jsx"] = generateAppLayout();

  for (const entity of entities) {
    const hookName = `use${entity.name}`;
    files[`/hooks/${hookName}.js`] = generateEntityHook(entity.name, entity.pluralName);
  }

  if (model.requiresAuth) {
    files["/contexts/AuthContext.jsx"] = generateAuthContext();
  }

  Object.assign(files, getSharedUIComponents());
  files["/hooks/useApi.js"] = getUseApiHook();
  files["/styles/globals.css"] = getGlobalStyles();

  return files;
}

// ─── Page Generators ──────────────────────────────────────────────────────

function generateDashboardPage(name: string, templateName: string, entities: DomainModel["entities"]): string {
  const statCards = entities.slice(0, 4).map(e =>
    `        <div className="card">
          <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">${e.pluralName}</h3>
          <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">0</p>
        </div>`
  ).join("\n");

  return `import React from "react";

export default function ${name}() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-light tracking-wide text-[var(--color-text)] mb-6">${templateName} Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
${statCards}
      </div>
      <p className="text-[var(--color-text-muted)]">Loading content...</p>
    </div>
  );
}
`;
}

function generateListPage(name: string, entity: string, title: string): string {
  return `import React from "react";

export default function ${name}() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light tracking-wide text-gray-800">${title}</h1>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
          Add ${entity}
        </button>
      </div>
      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <p className="text-gray-400">Loading ${title.toLowerCase()}...</p>
      </div>
    </div>
  );
}
`;
}

function generateDetailPage(name: string, entity: string): string {
  return `import React from "react";
import { useParams } from "react-router-dom";

export default function ${name}() {
  const { id } = useParams();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-light tracking-wide text-gray-800 mb-6">${entity} Detail</h1>
      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <p className="text-gray-400">Loading ${entity.toLowerCase()} {id}...</p>
      </div>
    </div>
  );
}
`;
}

function generateFormPage(name: string, entity: string, title: string): string {
  return `import React from "react";

export default function ${name}() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-light tracking-wide text-gray-800 mb-6">${title}</h1>
      <div className="bg-white rounded-lg border border-gray-100 p-6 max-w-2xl">
        <p className="text-gray-400">Loading form...</p>
      </div>
    </div>
  );
}
`;
}

function generateStaticPage(name: string, title: string): string {
  return `import React from "react";

export default function ${name}() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-light tracking-wide text-gray-800 mb-6">${title}</h1>
      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <p className="text-gray-400">Content loading...</p>
      </div>
    </div>
  );
}
`;
}

// ─── Hook & Context Generators ────────────────────────────────────────────

function generateEntityHook(entityName: string, pluralName: string): string {
  return `import { useState, useEffect, useCallback } from "react";

const API_BASE = window.__SUPABASE_URL__ || "";
const API_KEY = window.__SUPABASE_KEY__ || "";

export default function use${entityName}(projectId) {
  const [${pluralName}, set${entityName}s] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch${entityName}s = useCallback(async () => {
    if (!API_BASE || !projectId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await fetch(\`\${API_BASE}/functions/v1/project-api\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${API_KEY}\` },
        body: JSON.stringify({ project_id: projectId, collection: "${pluralName}", action: "list" }),
      });
      const json = await res.json();
      set${entityName}s(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch${entityName}s(); }, [fetch${entityName}s]);

  const create${entityName} = useCallback(async (data) => {
    const res = await fetch(\`\${API_BASE}/functions/v1/project-api\`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${API_KEY}\` },
      body: JSON.stringify({ project_id: projectId, collection: "${pluralName}", action: "create", data }),
    });
    const json = await res.json();
    if (json.data) set${entityName}s(prev => [...prev, json.data]);
    return json.data;
  }, [projectId]);

  return { ${pluralName}, loading, error, refetch: fetch${entityName}s, create${entityName} };
}
`;
}

function generateAuthContext(): string {
  return `import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
// IMPORTANT: Do NOT import useNavigate here. AuthContext must remain router-agnostic.
// Navigation after login/logout should be handled by consuming components, not this context.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getConfig = () => ({
    apiBase: window.__SUPABASE_URL__ || "",
    apiKey: window.__SUPABASE_KEY__ || "",
    projectId: window.__PROJECT_ID__ || "",
  });

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const savedUser = localStorage.getItem("auth_user");
    if (token && savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch {}
    }
    setLoading(false);
  }, []);

  const authFetch = useCallback(async (action, body = {}) => {
    const { apiBase, apiKey, projectId } = getConfig();
    const res = await fetch(\`\${apiBase}/functions/v1/project-auth\`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
      body: JSON.stringify({ project_id: projectId, action, ...body }),
    });
    return res.json();
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const json = await authFetch("login", { email, password });
      if (json.user) {
        setUser(json.user);
        localStorage.setItem("auth_token", json.token);
        localStorage.setItem("auth_user", JSON.stringify(json.user));
      } else if (json.data?.user) {
        setUser(json.data.user);
        localStorage.setItem("auth_token", json.data.token || json.token);
        localStorage.setItem("auth_user", JSON.stringify(json.data.user));
      } else if (json.error) {
        throw new Error(json.error);
      }
      return json;
    } finally { setLoading(false); }
  }, [authFetch]);

  const signup = useCallback(async (email, password, displayName) => {
    setLoading(true);
    try {
      const json = await authFetch("signup", { email, password, display_name: displayName });
      if (json.user) {
        setUser(json.user);
        localStorage.setItem("auth_token", json.token);
        localStorage.setItem("auth_user", JSON.stringify(json.user));
      } else if (json.data?.user) {
        setUser(json.data.user);
        localStorage.setItem("auth_token", json.data.token || json.token);
        localStorage.setItem("auth_user", JSON.stringify(json.data.user));
      } else if (json.error) {
        throw new Error(json.error);
      }
      return json;
    } finally { setLoading(false); }
  }, [authFetch]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default AuthProvider;
`;
}

// ─── Shared UI Components ─────────────────────────────────────────────────

export function getSharedUIComponents(): Record<string, string> {
  return {
    "/components/ui/Card.jsx": `import React from "react";

export default function Card({ children, className = "" }) {
  return (
    <div className={\`bg-white rounded-lg border border-gray-100 p-6 \${className}\`}>
      {children}
    </div>
  );
}
`,
    "/components/ui/Button.jsx": `import React from "react";

export default function Button({ children, onClick, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-blue-500 text-white hover:bg-blue-600",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "text-gray-600 hover:bg-gray-100",
  };
  return (
    <button
      onClick={onClick}
      className={\`px-4 py-2 rounded-lg text-sm font-medium transition-colors \${variants[variant] || variants.primary} \${className}\`}
      {...props}
    >
      {children}
    </button>
  );
}
`,
    "/components/ui/Modal.jsx": `import React from "react";
import { X } from "lucide-react";

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
`,
    "/components/ui/DataTable.jsx": `import React from "react";

export default function DataTable({ columns, data, onRowClick }) {
  return (
    <div className="overflow-x-auto border border-gray-100 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map((col) => (
              <th key={col.key} className="text-left px-4 py-3 text-gray-500 font-medium">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick && onRowClick(row)}
              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-700">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`,
    "/components/ui/Toast.jsx": `import React, { useState, useEffect } from "react";

let toastHandler = null;

export function showToast(message, type = "success") {
  if (toastHandler) toastHandler({ message, type });
}

export default function ToastContainer() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    toastHandler = (t) => {
      setToast(t);
      setTimeout(() => setToast(null), 3000);
    };
    return () => { toastHandler = null; };
  }, []);

  if (!toast) return null;

  const colors = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    info: "bg-blue-500",
  };

  return (
    <div className={\`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm shadow-lg \${colors[toast.type] || colors.success}\`}>
      {toast.message}
    </div>
  );
}
`,
    "/components/ui/Spinner.jsx": `import React from "react";

export default function Spinner({ size = "md", className = "" }) {
  const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };
  return (
    <div className={\`\${sizes[size] || sizes.md} border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin \${className}\`} />
  );
}
`,
  };
}

// ─── Utility Generators ───────────────────────────────────────────────────

export function getUseApiHook(): string {
  return `import { useState, useEffect, useCallback } from "react";

const API_BASE = window.__SUPABASE_URL__ || "";
const API_KEY = window.__SUPABASE_KEY__ || "";

export function useApi(collection, projectId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!API_BASE || !projectId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await fetch(\`\${API_BASE}/functions/v1/project-api\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${API_KEY}\` },
        body: JSON.stringify({ project_id: projectId, collection, action: "list" }),
      });
      const json = await res.json();
      setData(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [collection, projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
`;
}

export function getGlobalStyles(): string {
  return DESIGN_SYSTEM_CSS;
}

function generateAppLayout(): string {
  return `import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-[var(--color-bg-secondary)]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
`;
}

// ─── Generic Scaffold ─────────────────────────────────────────────────────

function getGenericScaffold(): Record<string, string> {
  const files: Record<string, string> = {};

  files["/App.jsx"] = `import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard/Dashboard";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
`;

  files["/layout/AppLayout.jsx"] = generateAppLayout();

  files["/layout/Sidebar.jsx"] = `import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
];

export default function Sidebar() {
  return (
    <nav className="w-64 bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] flex flex-col">
      <div className="p-4 border-b border-[var(--color-sidebar-border)]">
        <h1 className="text-lg font-bold text-[var(--color-sidebar-text-active)]">App</h1>
      </div>
      <div className="flex-1 py-2">
        {navItems.map(({ to, icon: ItemIcon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              \`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors \${
                isActive ? "bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-text-active)]" : "text-[var(--color-sidebar-text)] hover:text-[var(--color-sidebar-text-active)] hover:bg-[var(--color-sidebar-hover)]"
              }\`
            }
          >
            <ItemIcon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
`;

  files["/pages/Dashboard/Dashboard.jsx"] = `import React from "react";

export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-light tracking-wide text-[var(--color-text)] mb-6">Dashboard</h1>
      <p className="text-[var(--color-text-muted)]">Loading content...</p>
    </div>
  );
}
`;

  Object.assign(files, getSharedUIComponents());
  files["/hooks/useApi.js"] = getUseApiHook();
  files["/styles/globals.css"] = getGlobalStyles();

  return files;
}
