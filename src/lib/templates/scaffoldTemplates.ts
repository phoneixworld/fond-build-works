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
import { getAllUIComponents, UI_ANIMATIONS_CSS } from "@/lib/templates/uiComponentTemplates";

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
  const statCards = entities.slice(0, 4).map((e, i) => {
    const values = ["1,247", "89.5%", "₹45.2K", "32"];
    const trends = ["+12%", "+3.2%", "+8.5%", "-2"];
    const colors = ["var(--color-primary)", "var(--color-success)", "var(--color-warning)", "var(--color-info)"];
    const icons = ["Users", "CheckCircle", "DollarSign", "Clock"];
    return `        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">${e.pluralName}</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "${colors[i]}15" }}>
              <${icons[i]} className="w-4 h-4" style={{ color: "${colors[i]}" }} />
            </div>
          </div>
          <p className="text-2xl font-bold text-[var(--color-text)]">${values[i]}</p>
          <p className="text-xs mt-1"><span className="text-[var(--color-success)] font-medium">${trends[i]}</span> <span className="text-[var(--color-text-muted)]">from last month</span></p>
        </div>`;
  }).join("\n");

  const tableEntity = entities[0];
  const sampleRows = tableEntity ? `
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent ${tableEntity.pluralName}</h2>
          <button className="text-xs text-[var(--color-primary)] hover:underline">View All</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Name</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Sarah Johnson", status: "Active", date: "2024-03-15" },
              { name: "Michael Chen", status: "Pending", date: "2024-03-14" },
              { name: "Emily Brown", status: "Active", date: "2024-03-13" },
              { name: "James Wilson", status: "Inactive", date: "2024-03-12" },
              { name: "Sophia Martinez", status: "Active", date: "2024-03-11" },
            ].map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors">
                <td className="px-5 py-3 font-medium text-[var(--color-text)]">{row.name}</td>
                <td className="px-5 py-3">
                  <span className={\`px-2 py-0.5 rounded-full text-xs font-medium \${row.status === "Active" ? "bg-green-100 text-green-700" : row.status === "Pending" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}\`}>{row.status}</span>
                </td>
                <td className="px-5 py-3 text-[var(--color-text-secondary)]">{row.date}</td>
                <td className="px-5 py-3 text-right">
                  <button className="text-[var(--color-primary)] hover:underline text-xs mr-3">Edit</button>
                  <button className="text-[var(--color-danger)] hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>` : "";

  return `import React from "react";
import { Users, CheckCircle, DollarSign, Clock } from "lucide-react";

export default function ${name}() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">${templateName} Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Welcome back! Here's your overview.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
${statCards}
      </div>
${sampleRows}
    </div>
  );
}
`;
}

function generateListPage(name: string, entity: string, title: string): string {
  return `import React, { useState } from "react";
import { Plus, Search, Filter, MoreVertical } from "lucide-react";

const SAMPLE_DATA = [
  { id: 1, name: "Sarah Johnson", status: "Active", email: "sarah@example.com", date: "Mar 15, 2024" },
  { id: 2, name: "Michael Chen", status: "Active", email: "michael@example.com", date: "Mar 14, 2024" },
  { id: 3, name: "Emily Brown", status: "Pending", email: "emily@example.com", date: "Mar 13, 2024" },
  { id: 4, name: "James Wilson", status: "Inactive", email: "james@example.com", date: "Mar 12, 2024" },
  { id: 5, name: "Sophia Martinez", status: "Active", email: "sophia@example.com", date: "Mar 11, 2024" },
  { id: 6, name: "David Lee", status: "Active", email: "david@example.com", date: "Mar 10, 2024" },
];

export default function ${name}() {
  const [search, setSearch] = useState("");
  const filtered = SAMPLE_DATA.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">${title}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{SAMPLE_DATA.length} total ${entity.toLowerCase()}s</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Add ${entity}
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search ${title.toLowerCase()}..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Email</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors">
                <td className="px-5 py-3.5 font-medium text-[var(--color-text)]">{row.name}</td>
                <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">{row.email}</td>
                <td className="px-5 py-3.5">
                  <span className={\`px-2 py-0.5 rounded-full text-xs font-medium \${row.status === "Active" ? "bg-green-100 text-green-700" : row.status === "Pending" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}\`}>{row.status}</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">{row.date}</td>
                <td className="px-5 py-3.5 text-right">
                  <button className="p-1 hover:bg-[var(--color-bg-secondary)] rounded"><MoreVertical className="w-4 h-4 text-[var(--color-text-muted)]" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <Search className="w-10 h-10 mx-auto text-[var(--color-text-muted)] mb-3" />
            <p className="text-sm font-medium text-[var(--color-text)]">No results found</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Try adjusting your search terms</p>
          </div>
        )}
      </div>
    </div>
  );
}
`;
}

function generateDetailPage(name: string, entity: string): string {
  return `import React from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Edit, Trash2, Mail, Phone, Calendar } from "lucide-react";

export default function ${name}() {
  const { id } = useParams();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button className="p-2 hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold text-[var(--color-text)]">${entity} Details</h1>
      </div>
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-lg font-bold text-[var(--color-primary)]">SJ</div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Sarah Johnson</h2>
              <p className="text-sm text-[var(--color-text-muted)]">ID: #{id || "1001"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)]"><Edit className="w-3.5 h-3.5" /> Edit</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-danger)] border border-[var(--color-danger)]/30 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)]">
            <Mail className="w-4 h-4 text-[var(--color-text-muted)]" />
            <div><p className="text-xs text-[var(--color-text-muted)]">Email</p><p className="text-sm font-medium">sarah@example.com</p></div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)]">
            <Phone className="w-4 h-4 text-[var(--color-text-muted)]" />
            <div><p className="text-xs text-[var(--color-text-muted)]">Phone</p><p className="text-sm font-medium">+1 (555) 123-4567</p></div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)]">
            <Calendar className="w-4 h-4 text-[var(--color-text-muted)]" />
            <div><p className="text-xs text-[var(--color-text-muted)]">Joined</p><p className="text-sm font-medium">March 15, 2024</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
`;
}

function generateFormPage(name: string, entity: string, title: string): string {
  return `import React, { useState } from "react";
import { Save, X } from "lucide-react";

export default function ${name}() {
  const [formData, setFormData] = useState({ name: "", email: "", status: "active" });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submit:", formData);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">${title}</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[var(--color-border)] p-6 max-w-2xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Full Name</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter full name" className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Email Address</label>
          <input type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder="Enter email" className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Status</label>
          <select value={formData.status} onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]">
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            <Save className="w-4 h-4" /> Save ${entity}
          </button>
          <button type="button" className="flex items-center gap-2 px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm hover:bg-[var(--color-bg-secondary)] transition-colors">
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
`;
}

function generateStaticPage(name: string, title: string): string {
  return `import React from "react";
import { FileText } from "lucide-react";

export default function ${name}() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">${title}</h1>
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center mb-4">
          <FileText className="w-6 h-6 text-[var(--color-primary)]" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">${title}</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto">This section will display ${title.toLowerCase()} data and management tools.</p>
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

export default function Card({ children, title, icon: Icon, value, trend, trendUp, className = "" }) {
  // Stat card mode
  if (value !== undefined) {
    return (
      <div className={\`bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-md transition-all \${className}\`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">{title}</span>
          {Icon && <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center"><Icon className="w-4 h-4 text-[var(--color-primary)]" /></div>}
        </div>
        <p className="text-2xl font-bold text-[var(--color-text)]">{value}</p>
        {trend && <p className="text-xs mt-1"><span className={\`font-medium \${trendUp ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}\`}>{trend}</span> <span className="text-[var(--color-text-muted)]">from last month</span></p>}
      </div>
    );
  }
  // Generic card mode
  return (
    <div className={\`bg-white rounded-xl border border-[var(--color-border)] p-6 hover:shadow-md transition-all \${className}\`}>
      {title && <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h3>}
      {children}
    </div>
  );
}

export { Card };
`,
    "/components/ui/Button.jsx": \`import React from "react";

const variants = {
  primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-sm",
  secondary: "bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-border)]/50",
  danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
  ghost: "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]",
  outline: "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]",
};
const sizes = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  icon: "p-2",
};

export default function Button({ children, onClick, variant = "primary", size = "md", className = "", disabled = false, ...props }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\\\`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 \\\${variants[variant] || variants.primary} \\\${sizes[size] || sizes.md} \\\${disabled ? "opacity-50 cursor-not-allowed" : ""} \\\${className}\\\`}
      {...props}
    >
      {children}
    </button>
  );
}

export { Button };
\`,
    "/components/ui/Modal.jsx": \`import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ isOpen, onClose, title, children, size = "md" }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleEsc); document.body.style.overflow = ""; };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className={\\\`relative bg-white rounded-xl shadow-2xl border border-[var(--color-border)] w-full mx-4 animate-scaleIn \\\${sizes[size] || sizes.md}\\\`}>
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
\`,
    "/components/ui/DataTable.jsx": \`import React, { useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export default function DataTable({ columns, data, onRowClick, pageSize = 10, emptyMessage = "No data found" }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);

  const handleSort = (key) => {
    if (sortKey === key) { setSortDir(sortDir === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir("asc"); }
  };

  let sorted = [...(data || [])];
  if (sortKey) {
    sorted.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === "number" ? va - vb : String(va || "").localeCompare(String(vb || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={\\\`text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider \\\${col.sortable !== false ? "cursor-pointer hover:text-[var(--color-text)] select-none" : ""}\\\`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && <ArrowUpDown className="w-3 h-3" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-5 py-12 text-center text-[var(--color-text-muted)]">{emptyMessage}</td></tr>
            ) : paged.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onRowClick && onRowClick(row)}
                className={\\\`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors \\\${onRowClick ? "cursor-pointer" : ""}\\\`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 text-[var(--color-text)]">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <span className="text-xs text-[var(--color-text-muted)]">Page {page + 1} of {totalPages} ({sorted.length} items)</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="p-1 rounded hover:bg-[var(--color-border)]/50 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-[var(--color-border)]/50 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
\`,
    "/components/ui/Toast.jsx": \`import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

let toastHandler = null;

export function showToast(message, type = "success") {
  if (toastHandler) toastHandler({ message, type, id: Date.now() });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastHandler = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    return () => { toastHandler = null; };
  }, []);

  const icons = { success: CheckCircle, error: AlertCircle, info: Info };
  const colors = { success: "bg-emerald-500", error: "bg-red-500", info: "bg-blue-500" };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type] || icons.info;
        return (
          <div key={toast.id} className={\\\`flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm shadow-lg animate-slideInRight \\\${colors[toast.type] || colors.success}\\\`}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))} className="p-0.5 hover:bg-white/20 rounded"><X className="w-3 h-3" /></button>
          </div>
        );
      })}
    </div>
  );
}
\`,
    "/components/ui/Spinner.jsx": \`import React from "react";

export default function Spinner({ size = "md", className = "" }) {
  const sizes = { sm: "w-4 h-4 border-2", md: "w-6 h-6 border-2", lg: "w-10 h-10 border-3" };
  return (
    <div className={\\\`\\\${sizes[size] || sizes.md} border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin \\\${className}\\\`} />
  );
}
\`,
    // Include all shadcn-quality components
    ...getShadcnUIComponents(),
  };
}

// ─── Utility Generators ───────────────────────────────────────────────────

export function getUseApiHook(): string {
  return `import { useState, useEffect, useCallback } from "react";

const API_BASE = window.__SUPABASE_URL__ || "";
const API_KEY = window.__SUPABASE_KEY__ || "";

export function useApi(collection, projectId, sampleData) {
  const fallback = sampleData || [];
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!API_BASE || !projectId) {
      setData(fallback);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(\`\${API_BASE}/functions/v1/project-api\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${API_KEY}\` },
        body: JSON.stringify({ project_id: projectId, collection, action: "list" }),
      });
      const json = await res.json();
      const result = json.data || [];
      setData(result.length > 0 ? result : fallback);
    } catch (e) {
      console.warn("API unavailable, using sample data:", e.message);
      setData(fallback);
      setError(null);
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
  return DESIGN_SYSTEM_CSS + "\n" + UI_ANIMATIONS_CSS;
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
