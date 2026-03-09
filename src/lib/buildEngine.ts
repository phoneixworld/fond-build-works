/**
 * Build Engine — the core orchestrator for reliable code generation.
 * 
 * Pipeline: Classify → Plan → Execute Tasks → Merge → Validate → Assemble → Preview
 * 
 * Key design principles:
 * 1. Every task gets full accumulated code context (not truncated)
 * 2. Files are intelligently merged across tasks (routes, imports combined)
 * 3. A final assembly step ensures all modules are connected
 * 4. Failed tasks are retried with error context before moving on
 * 5. If no code is produced, the engine forces a retry with explicit instructions
 * 6. Validation is parse-only (Sucrase + PostCSS) — no regex repair
 * 
 * Performance optimizations:
 * 7. Independent tasks run in parallel (dependency-aware scheduling)
 * 8. Task outputs and validation results are cached
 * 9. Only changed files are sent to preview (file diffing)
 * 10. Structured observability for every pipeline stage
 */

import { streamBuildAgent, validateReactCode, formatRetryContext, MAX_BUILD_RETRIES } from "@/lib/agentPipeline";
import { transform } from "sucrase";
import postcss from "postcss";
import { generatePlan, type BuildPlan, type PlanTask } from "@/lib/planningAgent";
import { topologicalSort } from "@/lib/taskExecutor";
import { mergeFiles, buildFullCodeContext, isBackendProtected, type MergeResult } from "@/lib/codeMerger";
import { generateMockLayer } from "@/lib/mockLayerGenerator";
import { supabase } from "@/integrations/supabase/client";
import {
  getTaskCacheKey, getCachedTaskOutput, setCachedTaskOutput,
  isFileValidated, markFileValidated, clearValidationCache,
  computeFileDiff, isDiffEmpty,
} from "@/lib/buildCache";
import {
  startBuild, recordPlanningLatency, startTask, completeTask,
  finishBuild, timer, type TaskMetrics, type BuildMetrics,
} from "@/lib/buildObservability";
import { buildIncrementalContext, contextReductionRatio } from "@/lib/incrementalContext";
import { applyAdaptiveSplitting } from "@/lib/adaptiveTaskSplitter";
import { persistTaskOutput, getPersistedTaskOutput } from "@/lib/persistentCache";

// ─── Base Template (mandatory scaffold for all new builds) ────────────────

import { type DomainModel } from "@/lib/domainTemplates";

/**
 * Returns the mandatory base file scaffold for new React builds.
 * When a DomainModel is provided, generates entity-specific pages, hooks,
 * sidebar nav, and optional auth context — so the AI extends the correct
 * structure from the start instead of a generic Dashboard shell.
 */
function getBaseTemplate(domainModel?: DomainModel | null): Record<string, string> {
  // If no domain model, fall back to the generic scaffold
  if (!domainModel) {
    return getGenericScaffold();
  }

  return buildDomainScaffold(domainModel);
}

/** Builds a scaffold dynamically from a matched domain template */
function buildDomainScaffold(model: DomainModel): Record<string, string> {
  const files: Record<string, string> = {};

  // ── 1. Extract pages & routes from domain model ──
  const pages = model.suggestedPages || [];
  const navItems = model.suggestedNavItems || [];
  const entities = model.entities || [];

  // Determine the index route (first page or "/dashboard" or "/")
  const indexPage = pages.find(p => p.path === "/") || pages.find(p => p.path === "/dashboard") || pages[0];
  const indexPath = indexPage?.path || "/";

  // ── 2. Generate /pages/<Entity>/<Entity>List.jsx and /pages/<Entity>/<Entity>Detail.jsx ──
  const routeImports: string[] = [];
  const routeElements: string[] = [];
  const generatedPageComponents = new Set<string>();

  for (const page of pages) {
    if (page.path.includes(":")) continue; // Detail routes handled below via entity

    const pageName = page.title.replace(/[^a-zA-Z0-9]/g, "");
    if (generatedPageComponents.has(pageName)) continue;
    generatedPageComponents.add(pageName);

    const dirName = pageName;
    const fileName = pageName;
    const filePath = `/pages/${dirName}/${fileName}.jsx`;

    // Generate page stub based on type
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

  // Generate detail pages for entities that have detail routes
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

  // ── 3. Generate App.jsx with all routes ──
  const authImport = model.requiresAuth ? `import { AuthProvider } from "./contexts/AuthContext";\n` : "";
  const authWrapOpen = model.requiresAuth ? `      <AuthProvider>\n` : "";
  const authWrapClose = model.requiresAuth ? `      </AuthProvider>\n` : "";

  files["/App.jsx"] = `import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
${authImport}${routeImports.join("\n")}

export default function App() {
  return (
${authWrapOpen}    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
${routeElements.join("\n")}
          <Route path="*" element={<Navigate to="${indexPath}" />} />
        </Route>
      </Routes>
    </HashRouter>
${authWrapClose}  );
}
`;

  // ── 4. Generate /layout/Sidebar.jsx with domain nav items ──
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
    <nav className="w-64 bg-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold">${model.templateName}</h1>
      </div>
      <div className="flex-1 py-2">
        {navItems.map(({ to, icon: ItemIcon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              \`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors \${
                isActive ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"
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

  // ── 5. Generate /layout/AppLayout.jsx ──
  files["/layout/AppLayout.jsx"] = `import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
`;

  // ── 6. Generate /hooks/use<Entity>.js for each entity ──
  for (const entity of entities) {
    const hookName = `use${entity.name}`;
    files[`/hooks/${hookName}.js`] = generateEntityHook(entity.name, entity.pluralName);
  }

  // ── 7. Generate /contexts/AuthContext.jsx if auth required ──
  if (model.requiresAuth) {
    files["/contexts/AuthContext.jsx"] = generateAuthContext();
  }

  // ── 8. Add shared UI components (same as generic scaffold) ──
  Object.assign(files, getSharedUIComponents());

  // ── 9. Add hooks/useApi.js and styles/globals.css ──
  files["/hooks/useApi.js"] = getUseApiHook();
  files["/styles/globals.css"] = getGlobalStyles();

  return files;
}

// ─── Page Generators ──────────────────────────────────────────────────────

function generateDashboardPage(name: string, templateName: string, entities: DomainModel["entities"]): string {
  const statCards = entities.slice(0, 4).map(e =>
    `        <div className="bg-white rounded-lg border border-gray-100 p-6">
          <h3 className="text-sm font-medium text-gray-500">${e.pluralName}</h3>
          <p className="text-2xl font-semibold text-gray-800 mt-1">0</p>
        </div>`
  ).join("\n");

  return `import React from "react";

export default function ${name}() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-light tracking-wide text-gray-800 mb-6">${templateName} Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
${statCards}
      </div>
      <p className="text-gray-400">Loading content...</p>
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
  return `import React, { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const API_BASE = window.__SUPABASE_URL__ || "";
      const API_KEY = window.__SUPABASE_KEY__ || "";
      const res = await fetch(\`\${API_BASE}/functions/v1/project-auth\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${API_KEY}\` },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const json = await res.json();
      if (json.user) setUser(json.user);
      return json;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => setUser(null), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
`;
}

// ─── Shared scaffolding (used by both generic and domain scaffolds) ───────

function getSharedUIComponents(): Record<string, string> {
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

function getUseApiHook(): string {
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

function getGlobalStyles(): string {
  return `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
`;
}

/** The original generic scaffold (no domain model) */
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

  files["/layout/AppLayout.jsx"] = `import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
`;

  files["/layout/Sidebar.jsx"] = `import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
];

export default function Sidebar() {
  return (
    <nav className="w-64 bg-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold">App</h1>
      </div>
      <div className="flex-1 py-2">
        {navItems.map(({ to, icon: ItemIcon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              \`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors \${
                isActive ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"
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
      <h1 className="text-2xl font-light tracking-wide text-gray-800 mb-6">Dashboard</h1>
      <p className="text-gray-400">Loading content...</p>
    </div>
  );
}
`;

  Object.assign(files, getSharedUIComponents());
  files["/hooks/useApi.js"] = getUseApiHook();
  files["/styles/globals.css"] = getGlobalStyles();

  return files;
}
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
    "/hooks/useApi.js": `import { useState, useEffect, useCallback } from "react";

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
`,
    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
`,
  };
}

// ─── Auto-Schema Detection ────────────────────────────────────────────────

async function autoDetectAndCreateSchemas(files: Record<string, string>, projectId: string): Promise<void> {
  try {
    const allCode = Object.values(files).join("\n");
    
    // Method 1: Explicit Data API collection references
    const collectionMatches = allCode.matchAll(/collection:\s*["'](\w+)["']/g);
    const collections = new Set<string>();
    for (const match of collectionMatches) {
      collections.add(match[1]);
    }
    
    // Method 2: Infer entities from page/component file names and mock data patterns
    // e.g., /pages/Students/StudentList.jsx → "students" collection
    const fileNames = Object.keys(files);
    const entityInferenceMap: Record<string, string[]> = {};
    
    for (const filePath of fileNames) {
      const pageMatch = filePath.match(/\/pages\/(\w+)\//);
      if (pageMatch) {
        const entity = pageMatch[1].toLowerCase();
        // Skip generic pages
        if (!['dashboard', 'home', 'settings', 'profile', 'login', 'signup', 'auth'].includes(entity)) {
          collections.add(entity);
          entityInferenceMap[entity] = entityInferenceMap[entity] || [];
        }
      }
    }
    
    // Method 3: Detect mock data arrays to infer fields
    // Patterns like: const students = [...] or useState([{name: "...", class: "..."}])
    for (const [filePath, code] of Object.entries(files)) {
      const pageEntity = filePath.match(/\/pages\/(\w+)\//)?.[1]?.toLowerCase();
      if (!pageEntity || ['dashboard', 'home', 'settings'].includes(pageEntity)) continue;
      
      // Find array patterns with object shapes
      const arrayPatterns = code.matchAll(/(?:const|let)\s+\w+\s*=\s*\[[\s\S]*?\{([^}]{10,300})\}/g);
      for (const m of arrayPatterns) {
        const objBlock = m[1];
        const keyMatches = objBlock.matchAll(/(\w+)\s*:/g);
        if (!entityInferenceMap[pageEntity]) entityInferenceMap[pageEntity] = [];
        for (const km of keyMatches) {
          const key = km[1];
          if (!['id', 'key', 'icon', 'color', 'className', 'style', 'onClick', 'children'].includes(key)) {
            entityInferenceMap[pageEntity].push(key);
          }
        }
      }
    }
    
    const fieldsByCollection: Record<string, Set<string>> = {};
    
    // From explicit Data API patterns
    for (const collection of collections) {
      fieldsByCollection[collection] = new Set<string>(entityInferenceMap[collection] || []);
      
      const dataPatterns = [
        new RegExp(`collection:\\s*["']${collection}["'][^}]*data:\\s*\\{([^}]+)\\}`, 'g'),
        new RegExp(`data:\\s*\\{([^}]+)\\}[^}]*collection:\\s*["']${collection}["']`, 'g'),
      ];
      
      for (const pattern of dataPatterns) {
        const matches = allCode.matchAll(pattern);
        for (const m of matches) {
          const dataBlock = m[1];
          const keyMatches = dataBlock.matchAll(/(\w+)\s*:/g);
          for (const km of keyMatches) {
            const key = km[1];
            if (!['action', 'collection', 'project_id', 'id', 'filters'].includes(key)) {
              fieldsByCollection[collection].add(key);
            }
          }
        }
      }
    }
    
    if (collections.size === 0) {
      console.log("[AutoSchema] No collections detected in generated code");
      return;
    }
    
    console.log(`[AutoSchema] Detected ${collections.size} collections:`, [...collections]);
    
    const { data: existing } = await supabase
      .from("project_schemas")
      .select("collection_name")
      .eq("project_id", projectId);
    
    const existingNames = new Set((existing || []).map((s: any) => s.collection_name));
    
    const newSchemas = [...collections]
      .filter(name => !existingNames.has(name))
      .map(name => {
        const fields = fieldsByCollection[name] || new Set();
        const schema = {
          fields: [...fields].map(f => ({
            name: f,
            type: inferFieldType(f),
            required: false,
          })),
        };
        return {
          project_id: projectId,
          collection_name: name,
          schema,
        };
      });
    
    if (newSchemas.length > 0) {
      const { error } = await supabase
        .from("project_schemas")
        .insert(newSchemas as any);
      
      if (error) {
        console.warn("[AutoSchema] Failed to create schemas:", error);
      } else {
        console.log(`[AutoSchema] ✅ Created ${newSchemas.length} schemas:`, newSchemas.map(s => s.collection_name));
      }
    }

    // ── Auto-detect auth usage and create summary ──
    const usesAuth = allCode.includes("project-auth") || allCode.includes("useAuth") || allCode.includes("AuthProvider") || allCode.includes("AuthContext");
    const usesDataApi = allCode.includes("project-api") || collections.size > 0;
    const usesCustomFunctions = allCode.includes("project-exec");

    // Create a summary of backend capabilities for the Cloud panel
    const backendSummary = {
      collections: [...collections],
      usesAuth,
      usesDataApi,
      usesCustomFunctions,
      totalSchemas: collections.size + (existingNames?.size || 0),
    };
    console.log("[AutoSchema] Backend summary:", backendSummary);

    // Save backend capabilities to project_data for the Cloud panel to read
    await supabase
      .from("project_data")
      .upsert(
        {
          project_id: projectId,
          collection: "backend_capabilities",
          data: backendSummary as any,
        },
        { onConflict: "project_id,collection" }
      )
      .then(({ error }) => {
        if (error) console.warn("[AutoSchema] Failed to save backend summary:", error);
      });

  } catch (err) {
    console.warn("[AutoSchema] Error during schema detection:", err);
  }
}

function inferFieldType(fieldName: string): string {
  const name = fieldName.toLowerCase();
  if (name.includes('email')) return 'email';
  if (name.includes('phone') || name.includes('mobile')) return 'phone';
  if (name.includes('date') || name.includes('_at') || name.includes('time')) return 'datetime';
  if (name.includes('price') || name.includes('amount') || name.includes('fee') || name.includes('cost') || name.includes('salary')) return 'number';
  if (name.includes('count') || name.includes('quantity') || name.includes('age') || name.includes('total') || name.includes('number')) return 'number';
  if (name.includes('is_') || name.includes('has_') || name.includes('active') || name.includes('done') || name.includes('completed') || name.includes('enabled')) return 'boolean';
  if (name.includes('description') || name.includes('content') || name.includes('notes') || name.includes('body') || name.includes('bio')) return 'textarea';
  if (name.includes('url') || name.includes('link') || name.includes('website')) return 'url';
  if (name.includes('image') || name.includes('avatar') || name.includes('photo') || name.includes('logo')) return 'url';
  return 'text';
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EngineConfig {
  projectId: string;
  techStack: string;
  schemas?: any[];
  model?: string;
  designTheme?: string;
  knowledge?: string[];
  snippetsContext?: string;
  existingFiles?: Record<string, string>;
  templateContext?: string;
  chatHistory?: Array<{ role: string; content: string }>;
  domainModel?: any; // Domain model from Requirements Agent
}

export type EnginePhase = 
  | "planning" 
  | "executing" 
  | "merging" 
  | "validating" 
  | "assembling" 
  | "complete" 
  | "error";

export interface EngineProgress {
  phase: EnginePhase;
  message: string;
  taskIndex?: number;
  totalTasks?: number;
  currentTask?: string;
  plan?: BuildPlan;
}

export interface EngineCallbacks {
  onProgress: (progress: EngineProgress) => void;
  onDelta: (chunk: string) => void;
  onFilesReady: (files: Record<string, string>, deps: Record<string, string>) => void;
  onComplete: (result: EngineResult) => void;
  onError: (error: string) => void;
}

export interface EngineResult {
  files: Record<string, string>;
  deps: Record<string, string>;
  plan?: BuildPlan;
  chatText: string;
  mergeConflicts: string[];
  metrics?: BuildMetrics;
}

// ─── File Validation (real parsers — single source of truth) ──────────────

/**
 * Validate files using real parsers. Skips files already validated via cache.
 */
function validateAllFiles(files: Record<string, string>): { file: string; error: string }[] {
  const errors: { file: string; error: string }[] = [];
  
  // Available packages that provide named/default exports usable as JSX components
  const availablePackages = new Set([
    "react", "react-dom", "lucide-react", "framer-motion", "date-fns",
    "recharts", "react-router-dom", "clsx", "tailwind-merge",
  ]);
  
  // Collect all exported component names across generated files
  const definedComponents = new Set<string>(["React", "Fragment"]);
  for (const [, code] of Object.entries(files)) {
    // Match: export default function Foo / export function Foo / function Foo (top-level)
    const exportDefaultMatch = code.matchAll(/export\s+default\s+function\s+(\w+)/g);
    for (const m of exportDefaultMatch) definedComponents.add(m[1]);
    const exportNamedMatch = code.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g);
    for (const m of exportNamedMatch) definedComponents.add(m[1]);
    // Match top-level function declarations (may be exported elsewhere)
    const fnMatch = code.matchAll(/^function\s+([A-Z]\w+)/gm);
    for (const m of fnMatch) definedComponents.add(m[1]);
    const constMatch = code.matchAll(/^(?:export\s+)?const\s+([A-Z]\w+)\s*=/gm);
    for (const m of constMatch) definedComponents.add(m[1]);
  }
  
  for (const [filePath, code] of Object.entries(files)) {
    // Skip if this exact content was already validated
    if (isFileValidated(filePath, code)) continue;

    if (filePath.match(/\.(jsx?|tsx?)$/)) {
      try {
        transform(code, { transforms: ["jsx", "imports"], filePath });
      } catch (e: any) {
        errors.push({ file: filePath, error: (e.message || "JSX parse error").slice(0, 200) });
        continue;
      }
      
      // Check for undefined JSX components (PascalCase tags used but not imported/defined)
      const undefinedRefs = findUndefinedJSXReferences(code, filePath, files, definedComponents, availablePackages);
      if (undefinedRefs.length > 0) {
        errors.push({ 
          file: filePath, 
          error: `${undefinedRefs.join(", ")} ${undefinedRefs.length === 1 ? "is" : "are"} not defined. Either import ${undefinedRefs.length === 1 ? "it" : "them"} or remove ${undefinedRefs.length === 1 ? "it" : "them"}. Available packages: ${[...availablePackages].join(", ")}. Do NOT use react-hot-toast, sonner, or any toast library — implement a simple inline toast component instead.`
        });
        continue;
      }
      
      markFileValidated(filePath, code);
    } else if (filePath.match(/\.css$/)) {
      try {
        postcss.parse(code);
        markFileValidated(filePath, code);
      } catch (e: any) {
        errors.push({ file: filePath, error: (e.message || "CSS parse error").slice(0, 200) });
      }
    }
  }
  
  return errors;
}

/**
 * Find JSX component references (PascalCase) that are neither imported nor defined in the file.
 */
function findUndefinedJSXReferences(
  code: string,
  filePath: string,
  allFiles: Record<string, string>,
  definedComponents: Set<string>,
  availablePackages: Set<string>
): string[] {
  // Collect locally defined/imported names
  const localNames = new Set<string>();
  
  // Imports: import Foo from "..."; import { Foo, Bar } from "...";
  const importRegex = /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+["'][^"']+["']/g;
  let m;
  while ((m = importRegex.exec(code)) !== null) {
    if (m[1]) localNames.add(m[1]);
    if (m[2]) {
      m[2].split(",").forEach(n => {
        const name = n.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) localNames.add(name);
      });
    }
  }
  
  // Local function/const declarations
  const localDeclRegex = /(?:function|const|let|var|class)\s+([A-Z]\w+)/g;
  while ((m = localDeclRegex.exec(code)) !== null) {
    localNames.add(m[1]);
  }
  
  // Destructured renames: { icon: Icon, foo: Bar } — common pattern in .map() callbacks
  const destructureRenameRegex = /\w+\s*:\s*([A-Z]\w+)/g;
  while ((m = destructureRenameRegex.exec(code)) !== null) {
    localNames.add(m[1]);
  }
  
  // Arrow/function parameters with PascalCase (e.g., ({ Icon }) => ...)
  const paramRegex = /\(\s*\{([^}]+)\}\s*\)/g;
  while ((m = paramRegex.exec(code)) !== null) {
    m[1].split(",").forEach(p => {
      const name = p.trim().split(/\s*:\s*/).pop()?.trim();
      if (name && /^[A-Z]/.test(name)) localNames.add(name);
    });
  }
  
  // Built-in HTML-like React components to skip
  const builtins = new Set(["React", "Fragment", "Suspense", "StrictMode"]);
  
  // Find all PascalCase JSX tags: <ComponentName or <ComponentName>
  const jsxTagRegex = /<([A-Z]\w+)[\s/>]/g;
  const undefinedRefs = new Set<string>();
  while ((m = jsxTagRegex.exec(code)) !== null) {
    const name = m[1];
    if (builtins.has(name)) continue;
    if (localNames.has(name)) continue;
    if (definedComponents.has(name)) continue;
    // Check if it could be from a dotted import (e.g., motion.div) — skip
    undefinedRefs.add(name);
  }
  
  return [...undefinedRefs];
}

/**
 * Enforce mandatory folder structure by relocating misplaced files.
 * Rules:
 * - Non-page components inside /pages/X/ → move to /components/ or /components/ui/
 * - Toast/context providers → /contexts/ only for data, /components/ui/ for UI
 * - Charts, widgets inside /pages/ → move to /components/
 * - Flat /pages/X.jsx → /pages/X/X.jsx
 */
function enforceFileStructure(files: Record<string, string>): Record<string, string> {
  // ── Step 0: Fix concatenated paths (AI sometimes merges folder/file into one name) ──
  // e.g. /components/uiBadge.jsx → /components/ui/Badge.jsx
  //      /stylesglobals.css → /styles/globals.css
  const normalized: Record<string, string> = {};
  
  // Known folder prefixes the AI concatenates with filenames
  const CONCAT_FIXES: Array<{ pattern: RegExp; replacement: string }> = [
    // /components/uiX.jsx → /components/ui/X.jsx (lowercase "ui" prefix on PascalCase name)
    { pattern: /^\/components\/ui([A-Z]\w+)\.(jsx?|tsx?|css)$/, replacement: "/components/ui/$1.$2" },
    // /componentsX.jsx → /components/X.jsx (missing slash after "components")
    { pattern: /^\/components([A-Z]\w+)\.(jsx?|tsx?|css)$/, replacement: "/components/$1.$2" },
    // /componentsuiX.jsx → /components/ui/X.jsx
    { pattern: /^\/componentsui([A-Z]\w+)\.(jsx?|tsx?|css)$/, replacement: "/components/ui/$1.$2" },
    // /stylesglobals.css → /styles/globals.css
    { pattern: /^\/styles(\w+)\.(css)$/, replacement: "/styles/$1.$2" },
    // /layoutAppLayout.jsx → /layout/AppLayout.jsx
    { pattern: /^\/layout([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/layout/$1.$2" },
    // /layoutSidebar.jsx → /layout/Sidebar.jsx
    { pattern: /^\/layout([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/layout/$1.$2" },
    // /hooksuseFetch.js → /hooks/useFetch.js  
    { pattern: /^\/hooks(use\w+)\.(jsx?|tsx?|js)$/, replacement: "/hooks/$1.$2" },
    // /hooksuseApi.js → /hooks/useApi.js  
    { pattern: /^\/hooks(use\w+)\.(jsx?|tsx?|js)$/, replacement: "/hooks/$1.$2" },
    // /pagesX.jsx → /pages/X/X.jsx
    { pattern: /^\/pages([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/pages/$1/$1.$2" },
    // /pagesDashboardDashboard.jsx → /pages/Dashboard/Dashboard.jsx
    { pattern: /^\/pages([A-Z]\w+)([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/pages/$1/$2.$3" },
    // /contextsSomeContext.jsx → /contexts/SomeContext.jsx
    { pattern: /^\/contexts([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/contexts/$1.$2" },
  ];

  for (const [path, code] of Object.entries(files)) {
    let fixedPath = path;
    for (const { pattern, replacement } of CONCAT_FIXES) {
      if (pattern.test(fixedPath)) {
        fixedPath = fixedPath.replace(pattern, replacement);
        break;
      }
    }
    normalized[fixedPath] = code;
  }

  const result: Record<string, string> = {};
  
  // Known page-level suffixes (these stay in /pages/)
  const pagePatterns = /(?:Page|List|Detail|Details|Manager|View|Form|Editor|Settings|Profile|History)\.jsx?$/;
  
  for (const [path, code] of Object.entries(normalized)) {
    let newPath = path;
    
    // Rule 1: Flat /pages/X.jsx → /pages/X/X.jsx (already handled in parser, but double-check)
    const flatPageMatch = newPath.match(/^\/pages\/([A-Z]\w+)\.(jsx?|tsx?)$/);
    if (flatPageMatch) {
      newPath = `/pages/${flatPageMatch[1]}/${flatPageMatch[1]}.${flatPageMatch[2]}`;
    }
    
    // Rule 2: Non-page component inside /pages/Module/Component.jsx
    // e.g., /pages/Dashboard/OrderStatusChart.jsx → /components/OrderStatusChart.jsx
    const nestedPageFileMatch = newPath.match(/^\/pages\/([A-Z]\w+)\/([A-Z]\w+)\.(jsx?|tsx?)$/);
    if (nestedPageFileMatch) {
      const [, moduleName, fileName, ext] = nestedPageFileMatch;
      const isMainPage = fileName === moduleName || pagePatterns.test(`${fileName}.${ext}`);
      if (!isMainPage) {
        newPath = `/components/${fileName}.${ext}`;
      }
    }
    
    // Rule 3: ToastContext.jsx / toast provider → /components/ui/Toast.jsx
    if (newPath.match(/\/contexts\/Toast/i) && code.includes("toast")) {
      newPath = `/components/ui/Toast.jsx`;
    }
    
    result[newPath] = code;
  }
  
  // Fix cross-file imports for any relocated files
  return fixRelocatedImports(files, result);
}

/**
 * After relocating files, fix import paths in all files that referenced old paths.
 */
function fixRelocatedImports(
  originalFiles: Record<string, string>,
  relocatedFiles: Record<string, string>
): Record<string, string> {
  // Build a map of old path → new path
  const pathMap = new Map<string, string>();
  const origPaths = Object.keys(originalFiles);
  const newPaths = Object.keys(relocatedFiles);
  
  for (let i = 0; i < origPaths.length; i++) {
    if (origPaths[i] !== newPaths[i]) {
      // Map old import path (without extension) to new import path
      const oldImport = origPaths[i].replace(/\.(jsx?|tsx?)$/, "");
      const newImport = newPaths[i].replace(/\.(jsx?|tsx?)$/, "");
      pathMap.set(oldImport, newImport);
    }
  }
  
  if (pathMap.size === 0) return relocatedFiles;
  
  const result: Record<string, string> = {};
  for (const [path, code] of Object.entries(relocatedFiles)) {
    let fixedCode = code;
    for (const [oldImport, newImport] of pathMap) {
      // Replace relative imports — convert to path relative from current file
      const oldRelative = makeRelative(path, oldImport);
      const newRelative = makeRelative(path, newImport);
      fixedCode = fixedCode.replace(
        new RegExp(`(from\\s+["'])${escapeRegex(oldRelative)}(["'])`, "g"),
        `$1${newRelative}$2`
      );
      // Also try the bare old path form
      fixedCode = fixedCode.replace(
        new RegExp(`(from\\s+["'])\\.${escapeRegex(oldImport)}(["'])`, "g"),
        `$1.${newImport}$2`
      );
    }
    result[path] = fixedCode;
  }
  
  return result;
}

function makeRelative(fromPath: string, toPath: string): string {
  const fromParts = fromPath.split("/").slice(0, -1); // directory
  const toParts = toPath.split("/");
  
  // Find common prefix
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }
  
  const ups = fromParts.length - common;
  const rel = ups > 0 ? "../".repeat(ups) + toParts.slice(common).join("/") : "./" + toParts.slice(common).join("/");
  return rel;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeStub(filePath: string): string {
  const componentName = filePath
    .replace(/.*\//, '')
    .replace(/\.(jsx?|tsx?)$/, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  const safeName = componentName.charAt(0).toUpperCase() + componentName.slice(1) || 'BrokenModule';
  return `import React from "react";\n\nexport default function ${safeName}() {\n  return (\n    <div className="p-8 text-center space-y-3">\n      <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 flex items-center justify-center"><span className="text-amber-600 text-xl">\u26A0</span></div>\n      <h2 className="text-lg font-semibold text-slate-800">${safeName}</h2>\n      <p className="text-sm text-slate-500">This module had a build error after retries. Send a follow-up message to fix it.</p>\n    </div>\n  );\n}\n`;
}

function makeCSSSub(): string {
  return `/* CSS had parse errors after retries — using safe fallback */\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
}

function stubBrokenFiles(files: Record<string, string>, errors: { file: string; error: string }[]): Record<string, string> {
  const result = { ...files };
  for (const { file, error } of errors) {
    console.warn(`[BuildEngine] Stubbing broken file "${file}": ${error}`);
    if (file.match(/\.css$/)) {
      result[file] = makeCSSSub();
    } else if (file.match(/\.(jsx?|tsx?)$/)) {
      result[file] = makeStub(file);
    }
  }
  return result;
}

// ─── File Parser ───────────────────────────────────────────────────────────

function parseReactFilesFromOutput(text: string): { 
  chatText: string; 
  files: Record<string, string> | null; 
  deps: Record<string, string>;
} {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};

  const fencePatterns = ["```react-preview", "```jsx-preview", "```react", "```jsx"];
  let fenceStart = -1;
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) break;
  }
  
  if (fenceStart === -1) {
    const genericFence = text.match(/```\w*\n[\s\S]*?---\s+\/?(src\/)?App\.jsx?\s*-{0,3}/);
    if (genericFence) fenceStart = text.indexOf(genericFence[0]);
  }
  
  if (fenceStart === -1) {
    return { chatText: text, files: null, deps };
  }

  const chatText = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  
  let fenceEnd = -1;
  let searchFrom = codeStart;
  while (searchFrom < text.length) {
    const candidate = text.indexOf("\n```", searchFrom);
    if (candidate === -1) break;
    const afterFence = candidate + 4;
    if (afterFence >= text.length || /[\s\n\r]/.test(text[afterFence])) {
      fenceEnd = candidate;
      break;
    }
    searchFrom = candidate + 4;
  }
  
  const block = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  if (block.trim().length === 0) return { chatText: text, files: null, deps };

  const separatorRegex = /^-{3}\s+(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;
  const depsRegex = /^-{3}\s+dependencies\s*-{0,3}\s*$/;
  const lines = block.split("\n");
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  let inDeps = false;
  let depsLines: string[] = [];

  function flush() {
    if (currentFile) {
      let code = currentLines.join("\n").trim();
      if (code.length > 0) {
        let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
        fname = fname.replace(/^\/src\//, "/");
        // Enforce nested structure: /pages/Dashboard.jsx → /pages/Dashboard/Dashboard.jsx
        const pageMatch = fname.match(/^\/pages\/([A-Z]\w+)\.(jsx?|tsx?)$/);
        if (pageMatch) {
          fname = `/pages/${pageMatch[1]}/${pageMatch[1]}.${pageMatch[2]}`;
        }
        files[fname] = code;
      }
    }
    if (inDeps) {
      try { Object.assign(deps, JSON.parse(depsLines.join("\n").trim())); } catch {}
      inDeps = false;
      depsLines = [];
    }
    currentFile = null;
    currentLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const sepMatch = trimmed.match(separatorRegex);
    if (sepMatch) {
      flush();
      currentFile = sepMatch[1];
      continue;
    }
    if (depsRegex.test(trimmed)) {
      flush();
      inDeps = true;
      continue;
    }
    if (inDeps) depsLines.push(line);
    else if (currentFile) currentLines.push(line);
  }
  flush();

  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    files["/App.jsx"] = block.trim();
  }

  // Enforce mandatory folder structure (relocate misplaced files)
  const structuredFiles = Object.keys(files).length > 0 ? enforceFileStructure(files) : files;

  return {
    chatText,
    files: Object.keys(structuredFiles).length > 0 ? structuredFiles : null,
    deps,
  };
}

// ─── Single Task Executor (with caching) ──────────────────────────────────

async function executeSingleTask(
  prompt: string,
  config: EngineConfig,
  accumulatedCode: string,
  onDelta: (chunk: string) => void,
  retryCount = 0,
  maxTokens?: number
): Promise<{ files: Record<string, string>; deps: Record<string, string>; chatText: string; modelMs: number; cached: boolean }> {
  // ── Check in-memory cache first, then persistent cache ──
  const cacheKey = getTaskCacheKey(prompt, accumulatedCode);
  const cached = getCachedTaskOutput(cacheKey);
  if (cached && retryCount === 0) {
    console.log("[BuildEngine] Memory cache hit — skipping model call");
    return { ...cached, modelMs: 0, cached: true };
  }
  if (retryCount === 0) {
    const persisted = await getPersistedTaskOutput(cacheKey);
    if (persisted) {
      console.log("[BuildEngine] IndexedDB cache hit — skipping model call");
      setCachedTaskOutput(cacheKey, { ...persisted, timestamp: Date.now() });
      return { ...persisted, modelMs: 0, cached: true };
    }
  }

  const modelTimer = timer();

  return new Promise((resolve, reject) => {
    let fullText = "";
    
    // Build messages: use chat history but ensure the current prompt isn't duplicated
    const historyMessages = (config.chatHistory || []).slice(-6).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    // Check if the last history message is already the same prompt to avoid duplication
    const lastHistoryMsg = historyMessages[historyMessages.length - 1];
    const promptAlreadyInHistory = lastHistoryMsg && lastHistoryMsg.role === "user" && lastHistoryMsg.content === prompt;
    const buildMessages = promptAlreadyInHistory
      ? historyMessages
      : [...historyMessages, { role: "user" as const, content: prompt }];
    
    streamBuildAgent({
      messages: buildMessages,
      projectId: config.projectId,
      techStack: config.techStack,
      schemas: config.schemas,
      model: config.model,
      designTheme: config.designTheme,
      knowledge: config.knowledge,
      snippetsContext: config.snippetsContext,
      templateContext: config.templateContext,
      currentCode: accumulatedCode || undefined,
      maxTokens,
      onDelta: (chunk) => {
        fullText += chunk;
        onDelta(chunk);
      },
      onDone: (responseText) => {
        const modelMs = modelTimer.elapsed();
        const parsed = parseReactFilesFromOutput(responseText);
        
        if (parsed.files && Object.keys(parsed.files).length > 0) {
          const validationErrors = validateAllFiles(parsed.files);
          
          if (validationErrors.length > 0 && retryCount < 2) {
            const errorSummary = validationErrors.map(e => `${e.file}: ${e.error}`).join('\n');
            console.warn(`[BuildEngine] Validation errors, retrying (attempt ${retryCount + 1}):\n${errorSummary}`);
            // Call onDelta to update progress messaging
            onDelta(`\n[Auto-fixing ${validationErrors.length} syntax error(s), attempt ${retryCount + 1}/2...]\n`);
            executeSingleTask(
              prompt + `\n\n⚠️ SYNTAX ERRORS IN YOUR OUTPUT — FIX THESE:\n${errorSummary}\n\nRegenerate ONLY the broken files with correct syntax.`,
              config,
              accumulatedCode,
              onDelta,
              retryCount + 1,
              maxTokens
            ).then(resolve).catch(reject);
          } else {
            let finalFiles = parsed.files;
            if (validationErrors.length > 0) {
              console.warn(`[BuildEngine] Max retries reached, stubbing ${validationErrors.length} broken file(s)`);
              finalFiles = stubBrokenFiles(parsed.files, validationErrors);
            }
            // Cache successful output (memory + persistent)
            const output = { files: finalFiles, deps: parsed.deps, chatText: parsed.chatText };
            setCachedTaskOutput(cacheKey, { ...output, timestamp: Date.now() });
            persistTaskOutput(cacheKey, output).catch(() => {});
            resolve({ ...output, modelMs, cached: false });
          }
        } else if (retryCount < 2) {
          console.warn(`[BuildEngine] No code in response, retrying (attempt ${retryCount + 1})`);
          executeSingleTask(
            prompt + "\n\nCRITICAL: Your previous response did not contain code. You MUST output React code inside ```react-preview fences with --- /App.jsx markers. Output the code NOW.",
            config,
            accumulatedCode,
            onDelta,
            retryCount + 1,
            maxTokens
          ).then(resolve).catch(reject);
        } else {
          console.error("[BuildEngine] No code after retries");
          resolve({ files: {}, deps: {}, chatText: responseText, modelMs, cached: false });
        }
      },
      onError: (err) => {
        // Don't retry on usage/rate limit errors — surface immediately
        const isQuotaError = err.includes("Usage limit") || err.includes("Rate limited");
        if (isQuotaError) {
          reject(new Error("⚠️ AI usage limit reached. Please add credits in Settings → Workspace → Usage, then try again."));
          return;
        }
        if (retryCount < 1) {
          console.warn(`[BuildEngine] Task error, retrying: ${err}`);
          setTimeout(() => {
            executeSingleTask(prompt, config, accumulatedCode, onDelta, retryCount + 1, maxTokens)
              .then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(new Error(err));
        }
      },
    });
  });
}

// ─── Parallel Task Scheduler ──────────────────────────────────────────────

/**
 * Group sorted tasks into parallel execution groups.
 * Tasks in the same group have no dependencies on each other
 * AND no overlapping filesAffected.
 */
function buildParallelGroups(sortedTasks: PlanTask[]): PlanTask[][] {
  const groups: PlanTask[][] = [];
  const completed = new Set<string>();

  let remaining = [...sortedTasks];

  while (remaining.length > 0) {
    const group: PlanTask[] = [];
    const groupFiles = new Set<string>();
    const nextRemaining: PlanTask[] = [];

    for (const task of remaining) {
      // All deps must be completed
      const depsReady = task.dependsOn.every(dep => completed.has(dep));
      // No file conflicts with current group
      const hasFileConflict = task.filesAffected.some(f => groupFiles.has(f));
      // Don't run App.jsx producers in parallel — they need smart merge
      const touchesApp = task.filesAffected.some(f => /App\.(jsx?|tsx?)$/.test(f));
      const groupTouchesApp = group.some(g => g.filesAffected.some(f => /App\.(jsx?|tsx?)$/.test(f)));

      if (depsReady && !hasFileConflict && !(touchesApp && groupTouchesApp)) {
        group.push(task);
        task.filesAffected.forEach(f => groupFiles.add(f));
      } else {
        nextRemaining.push(task);
      }
    }

    if (group.length === 0) {
      // Deadlock safety — force the first remaining task
      const forced = nextRemaining.shift()!;
      group.push(forced);
    }

    for (const t of group) completed.add(t.id);
    groups.push(group);
    remaining = nextRemaining;
  }

  return groups;
}

// ─── Assembly Step ─────────────────────────────────────────────────────────

async function assembleApp(
  files: Record<string, string>,
  config: EngineConfig,
  onDelta: (chunk: string) => void
): Promise<Record<string, string>> {
  const appFile = files["/App.jsx"] || files["/App.tsx"];
  if (!appFile) return files;
  
  const componentFiles = Object.keys(files).filter(p => 
    p.startsWith("/components/") && p.match(/\.(jsx?|tsx?)$/)
  );
  
  const missingImports: string[] = [];
  for (const compPath of componentFiles) {
    const compName = compPath.match(/\/([^/]+)\.(jsx?|tsx?)$/)?.[1];
    if (!compName) continue;
    if (!appFile.includes(compName)) {
      missingImports.push(compPath);
    }
  }
  
  if (missingImports.length === 0) return files;
  
  console.log(`[BuildEngine:assemble] ${missingImports.length} components not connected, running assembly fix`);
  
  const assemblyPrompt = `## ASSEMBLY FIX — Connect missing modules

The app has these component files that are NOT imported or routed in App.jsx:
${missingImports.map(p => `- ${p}`).join("\n")}

Update ONLY /App.jsx to:
1. Import all the above components
2. Add Route entries for each 
3. Add sidebar/navigation links for each

Keep ALL existing routes and imports intact. Only ADD the missing ones.

## CURRENT APP CODE:
${buildFullCodeContext(files, 24000)}`;

  try {
    const result = await executeSingleTask(assemblyPrompt, config, buildFullCodeContext(files), onDelta, 0, 12000);
    if (result.files["/App.jsx"] || result.files["/App.tsx"]) {
      const appKey = result.files["/App.jsx"] ? "/App.jsx" : "/App.tsx";
      return { ...files, [appKey]: result.files[appKey] };
    }
  } catch (err) {
    console.warn("[BuildEngine:assemble] Assembly fix failed:", err);
  }
  
  return files;
}

// ─── Backend Task Executor ────────────────────────────────────────────────

async function executeBackendTask(
  task: PlanTask,
  config: EngineConfig,
  onDelta: (chunk: string) => void
): Promise<{ files: Record<string, string>; deps: Record<string, string>; chatText: string; modelMs: number }> {
  const modelT = timer();
  const taskType = (task as any).taskType || "backend";
  
  onDelta(`\n[Backend Agent] Generating ${taskType} layer...\n`);

  try {
    const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

    const resp = await fetch(`${BASE_URL}/functions/v1/backend-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH_HEADER },
      body: JSON.stringify({
        task,
        domainModel: config.domainModel,
        projectId: config.projectId,
        techStack: config.techStack,
        existingFiles: config.existingFiles ? Object.keys(config.existingFiles) : [],
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      const generatedFiles: Record<string, string> = json.files || {};
      const chatText: string = json.chatText || `✅ ${taskType} layer generated`;
      const modelMs = modelT.elapsed();
      onDelta(`\n[Backend Agent] Generated ${Object.keys(generatedFiles).length} files\n`);
      return { files: generatedFiles, deps: {}, chatText, modelMs };
    }
    throw new Error(`Backend agent returned ${resp.status}`);
  } catch (err) {
    console.warn(`[BuildEngine] Backend Agent failed, using local generator:`, err);
    if (config.domainModel) {
      const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const generatedFiles = generateMockLayer(config.domainModel, config.projectId, apiBase, anonKey);
      const modelMs = modelT.elapsed();
      onDelta(`\n[Local Generator] Generated ${Object.keys(generatedFiles).length} mock layer files\n`);
      return { files: generatedFiles, deps: {}, chatText: `✅ ${taskType} layer generated locally`, modelMs };
    }
    throw err;
  }
}

// ─── Main Engine ───────────────────────────────────────────────────────────

export async function runBuildEngine(
  userPrompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  const isComplex = userPrompt.length > 120 || 
    /\b(with|and|include|featuring|modules?|sections?)\b.*\b(with|and|include|featuring|modules?|sections?)\b/gi.test(userPrompt);
  
  const hasExistingCode = config.existingFiles && Object.keys(config.existingFiles).length > 0;
  
  // Clear validation cache for fresh builds
  clearValidationCache();
  
  try {
    if (isComplex && !hasExistingCode) {
      await runPlannedBuild(userPrompt, config, callbacks);
    } else {
      await runDirectBuild(userPrompt, config, callbacks);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown engine error";
    callbacks.onError(errMsg);
  }
}

async function runDirectBuild(
  prompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  const metrics = startBuild(1);
  const taskMetrics = startTask("direct", "Direct build");

  callbacks.onProgress({ phase: "executing", message: "Generating code..." });
  
  const existingCode = config.existingFiles 
    ? buildFullCodeContext(config.existingFiles) 
    : buildFullCodeContext(getBaseTemplate());
  
  const result = await executeSingleTask(prompt, config, existingCode, callbacks.onDelta);
  
  if (Object.keys(result.files).length === 0) {
    completeTask(taskMetrics, { fileCount: 0, totalFileSize: 0, modelLatencyMs: result.modelMs, validationLatencyMs: 0, mergeLatencyMs: 0, retryCount: 0, cached: result.cached, status: "failed" });
    finishBuild();
    callbacks.onError("The AI did not generate any code. Please try a more specific prompt like: \"Build a dashboard with sidebar navigation, user list, and settings page\"");
    return;
  }

  // Merge with existing if applicable
  // Merge with existing or base template
  let finalFiles = result.files;
  let conflicts: string[] = [];
  const mergeTimer = timer();
  const baseOrExisting = config.existingFiles && Object.keys(config.existingFiles).length > 0
    ? config.existingFiles
    : getBaseTemplate();
  
  callbacks.onProgress({ phase: "merging", message: "Merging with base template..." });
  const merged = mergeFiles(baseOrExisting, result.files);
  finalFiles = merged.files;
  conflicts = merged.conflicts;
  const mergeMs = mergeTimer.elapsed();
  
  // Final validation
  callbacks.onProgress({ phase: "validating", message: "Validating code..." });
  const valTimer = timer();
  const postMergeErrors = validateAllFiles(finalFiles);
  if (postMergeErrors.length > 0) {
    console.warn("[BuildEngine:direct] Post-merge validation issues — stubbing:", postMergeErrors);
    finalFiles = stubBrokenFiles(finalFiles, postMergeErrors);
  }
  const valMs = valTimer.elapsed();

  const totalSize = Object.values(finalFiles).reduce((s, c) => s + c.length, 0);
  completeTask(taskMetrics, {
    fileCount: Object.keys(finalFiles).length,
    totalFileSize: totalSize,
    modelLatencyMs: result.modelMs,
    validationLatencyMs: valMs,
    mergeLatencyMs: mergeMs,
    retryCount: 0,
    cached: result.cached,
    status: postMergeErrors.length > 0 ? "stubbed" : "success",
  });
  
  callbacks.onFilesReady(finalFiles, result.deps);
  autoDetectAndCreateSchemas(finalFiles, config.projectId);
  
  callbacks.onProgress({ phase: "complete", message: "Build complete" });
  const finalMetrics = finishBuild();
  callbacks.onComplete({
    files: finalFiles,
    deps: result.deps,
    chatText: result.chatText || "✅ App generated successfully",
    mergeConflicts: conflicts,
    metrics: finalMetrics || undefined,
  });
}

async function runPlannedBuild(
  prompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  // ── Planning ──
  callbacks.onProgress({ phase: "planning", message: "Analyzing requirements and creating build plan..." });
  
  const planTimer = timer();
  let plan: BuildPlan;
  try {
    plan = await generatePlan(
      prompt,
      config.existingFiles ? Object.keys(config.existingFiles) : undefined,
      config.techStack,
      config.schemas,
      config.knowledge,
      config.domainModel
    );
    
    recordPlanningLatency(planTimer.elapsed());
    
    callbacks.onProgress({
      phase: "planning",
      message: `Plan: ${plan.tasks.length} tasks (${plan.overallComplexity})`,
      totalTasks: plan.tasks.length,
      plan,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Don't fallback on quota errors — surface them directly
    if (errMsg.includes("Usage limit") || errMsg.includes("Rate limited")) {
      throw new Error("⚠️ AI usage limit reached. Please add credits in Settings → Workspace → Usage, then try again.");
    }
    console.warn("[BuildEngine] Planning failed, falling back to direct build:", err);
    await runDirectBuild(prompt, config, callbacks);
    return;
  }

  // ── Adaptive task splitting ──
  const splitResult = applyAdaptiveSplitting(plan.tasks);
  if (splitResult.splitCount > 0) {
    console.log(`[BuildEngine] Split ${splitResult.splitCount} oversized tasks: ${splitResult.originalCount} → ${splitResult.totalAfterSplit}`);
    plan = { ...plan, tasks: splitResult.tasks };
  }

  const sortedTasks = topologicalSort(plan.tasks);
  const executableTasks = sortedTasks.filter(t => !t.needsUserInput);
  const parallelGroups = buildParallelGroups(executableTasks);
  
  const metrics = startBuild(executableTasks.length);
  metrics.parallelGroups = parallelGroups.length;
  
  console.log(`[BuildEngine] ${executableTasks.length} tasks in ${parallelGroups.length} parallel groups: ${parallelGroups.map(g => `[${g.map(t => t.title).join(", ")}]`).join(" → ")}`);

  const baseTemplate = getBaseTemplate();
  let accumulatedFiles: Record<string, string> = config.existingFiles ? { ...config.existingFiles } : { ...baseTemplate };
  let previousFiles: Record<string, string> | null = config.existingFiles ? { ...config.existingFiles } : { ...baseTemplate };
  let allDeps: Record<string, string> = {};
  let allConflicts: string[] = [];
  let lastChatText = "";
  let globalTaskIndex = 0;

  // ── Execute groups (parallel within each group, sequential across groups) ──
  for (const group of parallelGroups) {
    // Use incremental context per task instead of full codebase

    // Run all tasks in this group concurrently
    const taskPromises = group.map(async (task, groupIdx) => {
      const taskIdx = globalTaskIndex + groupIdx;
      const taskMet = startTask(task.id, task.title);

      callbacks.onProgress({
        phase: "executing",
        message: group.length > 1
          ? `Building (parallel): ${group.map(t => t.title).join(", ")}`
          : `Building: ${task.title}`,
        taskIndex: taskIdx,
        totalTasks: executableTasks.length,
        currentTask: task.title,
        plan,
      });
      
      const domainContext = config.domainModel 
        ? `\n\n## DOMAIN MODEL\n${JSON.stringify(config.domainModel, null, 2).slice(0, 4000)}` 
        : "";
      
      const taskType = (task as any).taskType || "frontend";

      // ── Route by task type ──
      if ((taskType === "schema" || taskType === "backend") && config.domainModel) {
        // Route schema/backend tasks to Backend Agent
        try {
          const backendResult = await executeBackendTask(task, config, callbacks.onDelta);
          const totalSize = Object.values(backendResult.files).reduce((s, c) => s + c.length, 0);
          completeTask(taskMet, {
            fileCount: Object.keys(backendResult.files).length,
            totalFileSize: totalSize,
            modelLatencyMs: backendResult.modelMs,
            validationLatencyMs: 0,
            mergeLatencyMs: 0,
            retryCount: 0,
            cached: false,
            status: Object.keys(backendResult.files).length > 0 ? "success" : "failed",
          });
          return { task, result: backendResult };
        } catch (err) {
          console.error(`[BuildEngine] Backend task "${task.title}" failed, falling back to build agent:`, err);
          // Fall through to regular build agent
        }
      }

      // ── Frontend tasks (and fallback) go to regular Build Agent ──
      const taskPrompt = `## TASK: ${task.title}
## TASK TYPE: ${taskType}

${task.buildPrompt}
${domainContext}

## FILES TO CREATE/MODIFY:
${task.filesAffected.map(f => `- ${f}`).join("\n")}

## IMPORTANT RULES:
- Generate ONLY the files listed above (plus /App.jsx if routes need updating)
- Make sure imports reference existing component files correctly
- If updating /App.jsx, KEEP ALL existing routes and imports — only ADD new ones
- Output complete, working code in \`\`\`react-preview fences
- NO descriptions, NO planning text — ONLY code
- For frontend tasks: Import data from /data/ and hooks from /hooks/ — do NOT hardcode mock data in pages
- If /hooks/use<Entity>.js exists, IMPORT from it. Do NOT recreate data hooks in pages.
- If /data/<collection>.js exists, do NOT create inline mock arrays.`;

      try {
        const codeContext = buildIncrementalContext(task, accumulatedFiles);
        const { reductionPercent } = contextReductionRatio(task, accumulatedFiles);
        if (reductionPercent > 0) console.log(`[BuildEngine] Task "${task.title}" context reduced by ${reductionPercent}%`);
        const taskResult = await executeSingleTask(taskPrompt, config, codeContext, callbacks.onDelta, 0, 16000);
        
        const totalSize = Object.values(taskResult.files).reduce((s, c) => s + c.length, 0);
        completeTask(taskMet, {
          fileCount: Object.keys(taskResult.files).length,
          totalFileSize: totalSize,
          modelLatencyMs: taskResult.modelMs,
          validationLatencyMs: 0,
          mergeLatencyMs: 0,
          retryCount: 0,
          cached: taskResult.cached,
          status: Object.keys(taskResult.files).length > 0 ? "success" : "failed",
        });

        return { task, result: taskResult };
      } catch (err) {
        console.error(`[BuildEngine] Task "${task.title}" failed:`, err);
        completeTask(taskMet, {
          fileCount: 0, totalFileSize: 0, modelLatencyMs: 0,
          validationLatencyMs: 0, mergeLatencyMs: 0, retryCount: 0,
          cached: false, status: "failed",
        });
        return { task, result: null };
      }
    });

    const results = await Promise.all(taskPromises);
    globalTaskIndex += group.length;

    // ── Merge results from this group into accumulated files ──
    const mergeT = timer();
    for (const { task, result } of results) {
      if (!result || Object.keys(result.files).length === 0) {
        console.warn(`[BuildEngine] Task "${task.title}" produced no files`);
        continue;
      }

      // Protect backend files from being overwritten by frontend tasks
      const isFrontendTask = (task as any).taskType === "frontend";
      const merged = mergeFiles(accumulatedFiles, result.files, isFrontendTask);
      accumulatedFiles = merged.files;
      allConflicts.push(...merged.conflicts);
      Object.assign(allDeps, result.deps);
      if (result.chatText) lastChatText = result.chatText;

      console.log(`[BuildEngine] Task "${task.title}" done: +${Object.keys(result.files).length} files, total: ${Object.keys(accumulatedFiles).length}`);
    }

    // ── Batch file update: only send to preview once per group ──
    const diff = computeFileDiff(previousFiles, accumulatedFiles);
    if (!isDiffEmpty(diff)) {
      callbacks.onFilesReady(accumulatedFiles, allDeps);
      previousFiles = { ...accumulatedFiles };
    }
  }

  if (Object.keys(accumulatedFiles).length === 0) {
    finishBuild();
    callbacks.onError("No code was generated. Please try a simpler, more specific prompt.");
    return;
  }

  // ── Final validation ──
  callbacks.onProgress({ phase: "validating", message: "Validating assembled app..." });
  const finalErrors = validateAllFiles(accumulatedFiles);
  if (finalErrors.length > 0) {
    console.warn("[BuildEngine:planned] Stubbing broken files post-assembly:", finalErrors);
    accumulatedFiles = stubBrokenFiles(accumulatedFiles, finalErrors);
  }

  // ── Assembly ──
  callbacks.onProgress({ phase: "assembling", message: "Connecting all modules..." });
  const asmTimer = timer();
  accumulatedFiles = await assembleApp(accumulatedFiles, config, callbacks.onDelta);
  if (metrics) metrics.assemblyLatencyMs = asmTimer.elapsed();
  
  // Final diff-based update
  const finalDiff = computeFileDiff(previousFiles, accumulatedFiles);
  if (!isDiffEmpty(finalDiff)) {
    callbacks.onFilesReady(accumulatedFiles, allDeps);
  }
  
  autoDetectAndCreateSchemas(accumulatedFiles, config.projectId);
  
  const taskSummary = executableTasks.map((t, i) => `✅ ${i + 1}. ${t.title}`).join("\n");
  const chatText = `✅ **Build Complete** — ${executableTasks.length} tasks in ${parallelGroups.length} parallel groups\n\n${plan.summary}\n\n${taskSummary}`;

  callbacks.onProgress({ phase: "complete", message: "Build complete" });
  const finalMetrics = finishBuild();
  callbacks.onComplete({
    files: accumulatedFiles,
    deps: allDeps,
    plan,
    chatText,
    mergeConflicts: allConflicts,
    metrics: finalMetrics || undefined,
  });
}
