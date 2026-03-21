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
  return `import React, { useState } from "react";
import { FileText, Plus, Search, Filter, MoreVertical, Edit, Trash2, Eye } from "lucide-react";

const SAMPLE_DATA = [
  { id: 1, name: "Item Alpha", category: "Category A", status: "Active", updated: "Mar 15, 2024", assignee: "Sarah Johnson" },
  { id: 2, name: "Item Beta", category: "Category B", status: "Pending", updated: "Mar 14, 2024", assignee: "Michael Chen" },
  { id: 3, name: "Item Gamma", category: "Category A", status: "Active", updated: "Mar 13, 2024", assignee: "Emily Brown" },
  { id: 4, name: "Item Delta", category: "Category C", status: "Inactive", updated: "Mar 12, 2024", assignee: "James Wilson" },
  { id: 5, name: "Item Epsilon", category: "Category B", status: "Active", updated: "Mar 11, 2024", assignee: "Sophia Martinez" },
  { id: 6, name: "Item Zeta", category: "Category A", status: "Pending", updated: "Mar 10, 2024", assignee: "David Lee" },
];

export default function ${name}() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const filtered = SAMPLE_DATA.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.assignee.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">${title}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{SAMPLE_DATA.length} total records</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add New
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{SAMPLE_DATA.length}</p>
          <p className="text-xs text-[var(--color-success)] mt-1">+12% from last month</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{SAMPLE_DATA.filter(d => d.status === "Active").length}</p>
          <p className="text-xs text-[var(--color-success)] mt-1">+8% from last month</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Pending</p>
          <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{SAMPLE_DATA.filter(d => d.status === "Pending").length}</p>
          <p className="text-xs text-[var(--color-warning)] mt-1">Needs attention</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Category</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Assignee</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Updated</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors">
                <td className="px-5 py-3.5 font-medium text-[var(--color-text)]">{row.name}</td>
                <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">{row.category}</td>
                <td className="px-5 py-3.5">
                  <span className={\`px-2 py-0.5 rounded-full text-xs font-medium \${row.status === "Active" ? "bg-green-100 text-green-700" : row.status === "Pending" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}\`}>{row.status}</span>
                </td>
                <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">{row.assignee}</td>
                <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">{row.updated}</td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="p-1.5 hover:bg-[var(--color-bg-secondary)] rounded-lg" title="View"><Eye className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /></button>
                    <button className="p-1.5 hover:bg-[var(--color-bg-secondary)] rounded-lg" title="Edit"><Edit className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /></button>
                    <button className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5 text-[var(--color-danger)]" /></button>
                  </div>
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Add New Record</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Name</label>
                <input type="text" placeholder="Enter name" className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Category</label>
                <select className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20">
                  <option>Category A</option>
                  <option>Category B</option>
                  <option>Category C</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button className="flex-1 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">Save</button>
                <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm hover:bg-[var(--color-bg-secondary)]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getConfig = () => ({
    apiBase: window.__SUPABASE_URL__ || "",
    apiKey: window.__SUPABASE_KEY__ || "",
    projectId: window.__PROJECT_ID__ || "",
  });

  const persistSession = useCallback((nextUser, nextToken) => {
    setUser(nextUser || null);
    setToken(nextToken || null);
    setError(null);

    try {
      if (nextToken) localStorage.setItem("auth_token", nextToken);
      else localStorage.removeItem("auth_token");

      if (nextUser) localStorage.setItem("auth_user", JSON.stringify(nextUser));
      else localStorage.removeItem("auth_user");
    } catch (e) {
      // localStorage may be unavailable in some environments
      console.warn("Failed to persist auth session:", e);
    }
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setError(null);
    try {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
    } catch (e) {
      console.warn("Failed to clear auth session:", e);
    }
  }, []);

  const authFetch = useCallback(async (action, body = {}, providedToken) => {
    const { apiBase, apiKey, projectId } = getConfig();
    
    // Graceful degradation: if auth is not configured, don't crash
    if (!apiBase || !projectId) {
      console.warn("Auth is not configured for this project. Running in unauthenticated mode.");
      return { data: null };
    }

    const payload = { project_id: projectId, action, ...body };
    if (providedToken) {
      payload.token = providedToken;
      payload.access_token = providedToken;
    }

    try {
      const res = await fetch(\`\${apiBase}/functions/v1/project-auth\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
        body: JSON.stringify(payload),
      });

      // Handle non-JSON responses gracefully
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Server returned invalid response");
      }

      if (!res.ok || json?.error) throw new Error(json?.error || "Authentication request failed");
      return json;
    } catch (e) {
      // Network errors should not crash the app
      if (e instanceof TypeError && e.message.includes("fetch")) {
        console.warn("Network error during auth:", e.message);
        throw new Error("Network error — please check your connection");
      }
      throw e;
    }
  }, []);

  const extractSession = useCallback((json) => {
    if (!json) return { nextUser: null, nextToken: null };
    const payload = json?.data || json || {};
    const nextUser = payload.user || null;
    const nextToken = payload.token || payload.access_token || json?.token || json?.access_token || null;
    return { nextUser, nextToken };
  }, []);

  // Restore and validate existing session on mount
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      let savedToken = null;
      try {
        savedToken = localStorage.getItem("auth_token");
      } catch {
        // localStorage unavailable
      }
      
      if (!savedToken) {
        // Try to restore user from localStorage cache even without token validation
        try {
          const savedUser = localStorage.getItem("auth_user");
          if (savedUser && !cancelled) {
            // We have cached user but no token — user needs to re-login
          }
        } catch {}
        if (!cancelled) setLoading(false);
        return;
      }

      const { apiBase, projectId } = getConfig();
      if (!apiBase || !projectId) {
        // Auth not configured — clear stale tokens and continue
        if (!cancelled) {
          clearSession();
          setLoading(false);
        }
        return;
      }

      try {
        const json = await authFetch("me", {}, savedToken);
        const { nextUser } = extractSession(json);

        if (!cancelled) {
          if (nextUser) {
            persistSession(nextUser, savedToken);
          } else {
            clearSession();
          }
        }
      } catch (err) {
        // CRITICAL: Failed session validation must NOT crash the app.
        // Clear the invalid token and let the user re-login.
        console.warn("Session restore failed:", err?.message || err);
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restore();
    return () => { cancelled = true; };
  }, [authFetch, extractSession, persistSession, clearSession]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch("login", { email, password });
      const { nextUser, nextToken } = extractSession(json);
      if (!nextUser || !nextToken) throw new Error("Invalid credentials");
      persistSession(nextUser, nextToken);
      return { success: true, user: nextUser };
    } catch (err) {
      const message = err?.message || "Login failed";
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [authFetch, extractSession, persistSession]);

  const signup = useCallback(async (email, password, displayName) => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch("signup", { email, password, display_name: displayName });
      const { nextUser, nextToken } = extractSession(json);
      if (!nextUser || !nextToken) throw new Error("Signup failed — please try again");
      persistSession(nextUser, nextToken);
      return { success: true, user: nextUser };
    } catch (err) {
      const message = err?.message || "Signup failed";
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [authFetch, extractSession, persistSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  // While loading, show a centered spinner — never render routes with null auth state
  if (loading) {
    return React.createElement("div", {
      style: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }
    }, React.createElement("div", {
      className: "spinner",
      style: { width: 32, height: 32, border: "3px solid var(--color-border, #e5e7eb)", borderTopColor: "var(--color-primary, #3b82f6)", borderRadius: "50%", animation: "spin 0.6s linear infinite" }
    }));
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Instead of throwing (which crashes the whole app), return a safe default
    console.warn("useAuth called outside AuthProvider — returning default values");
    return { user: null, token: null, loading: false, error: null, login: async () => ({ success: false, error: "Not configured" }), signup: async () => ({ success: false, error: "Not configured" }), logout: () => {}, isAuthenticated: false };
  }
  return ctx;
}

export default AuthProvider;
`;
}

// ─── Shared UI Components ─────────────────────────────────────────────────

export function getSharedUIComponents(): Record<string, string> {
  return getAllUIComponents();
}

// ─── Domain Component Templates (hardcoded fallbacks) ─────────────────────

const STAT_CARD_COMPONENT = `import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ title, value, trend, trendLabel, icon: Icon, color = "var(--color-primary)" }) {
  const isPositive = trend && !String(trend).startsWith("-");
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">{title}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + "15" }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-[var(--color-text)]">{value}</p>
      {trend && (
        <p className="text-xs mt-1 flex items-center gap-1">
          {isPositive ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
          <span className={isPositive ? "text-green-600 font-medium" : "text-red-500 font-medium"}>{trend}</span>
          {trendLabel && <span className="text-[var(--color-text-muted)]">{trendLabel}</span>}
        </p>
      )}
    </div>
  );
}
`;

const STATUS_BADGE_COMPONENT = `import React from "react";

const STATUS_COLORS = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  inactive: "bg-gray-100 text-gray-600",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
  default: "bg-gray-100 text-gray-600",
};

export default function StatusBadge({ status = "default", className = "" }) {
  const key = String(status).toLowerCase();
  const colors = STATUS_COLORS[key] || STATUS_COLORS.default;
  return (
    <span className={\`px-2.5 py-0.5 rounded-full text-xs font-medium \${colors} \${className}\`}>
      {status}
    </span>
  );
}
`;

const PAGE_HEADER_COMPONENT = `import React from "react";

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-text-muted)] mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
`;

const SEARCH_FILTER_BAR_COMPONENT = `import React from "react";
import { Search, Filter } from "lucide-react";

export default function SearchFilterBar({ searchValue = "", onSearchChange, placeholder = "Search...", filters, onFilterChange, children }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={searchValue}
          onChange={e => onSearchChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
        />
      </div>
      {children}
    </div>
  );
}
`;

const ACTIVITY_FEED_COMPONENT = `import React from "react";
import { Clock } from "lucide-react";

const SAMPLE_ACTIVITIES = [
  { id: 1, text: "New record created", time: "2 min ago", avatar: "S" },
  { id: 2, text: "Status updated to Active", time: "15 min ago", avatar: "M" },
  { id: 3, text: "Report generated", time: "1 hour ago", avatar: "E" },
  { id: 4, text: "New user registered", time: "3 hours ago", avatar: "J" },
];

export default function ActivityFeed({ activities = SAMPLE_ACTIVITIES, title = "Recent Activity" }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h3>
      <div className="space-y-3">
        {(activities || []).map((item, i) => (
          <div key={item.id || i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {item.avatar || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--color-text)]">{item.text}</p>
              <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" /> {item.time}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
`;

const QUICK_ACTIONS_COMPONENT = `import React from "react";
import { Plus, FileText, Users, Settings } from "lucide-react";

const DEFAULT_ACTIONS = [
  { label: "Add New", icon: Plus, color: "var(--color-primary)" },
  { label: "Reports", icon: FileText, color: "var(--color-info)" },
  { label: "Users", icon: Users, color: "var(--color-success)" },
  { label: "Settings", icon: Settings, color: "var(--color-warning)" },
];

export default function QuickActions({ actions = DEFAULT_ACTIONS, onAction }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {(actions || []).map((action, i) => {
        const Icon = action.icon || Plus;
        return (
          <button
            key={i}
            onClick={() => onAction?.(action)}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-[var(--color-border)] hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: (action.color || "var(--color-primary)") + "15" }}>
              <Icon className="w-5 h-5" style={{ color: action.color || "var(--color-primary)" }} />
            </div>
            <span className="text-xs font-medium text-[var(--color-text)]">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
`;

const NOTIFICATION_BELL_COMPONENT = `import React, { useState } from "react";
import { Bell } from "lucide-react";

export default function NotificationBell({ count = 3 }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
        <Bell className="w-5 h-5 text-[var(--color-text-secondary)]" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--color-danger)] text-white text-[10px] flex items-center justify-center font-bold">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-[var(--color-border)] shadow-lg z-50 p-3">
          <p className="text-xs font-semibold text-[var(--color-text)] mb-2">Notifications</p>
          <p className="text-xs text-[var(--color-text-muted)]">No new notifications</p>
        </div>
      )}
    </div>
  );
}
`;

export function getDomainComponents(): Record<string, string> {
  return {
    "/components/StatCard.jsx": STAT_CARD_COMPONENT,
    "/components/StatusBadge.jsx": STATUS_BADGE_COMPONENT,
    "/components/PageHeader.jsx": PAGE_HEADER_COMPONENT,
    "/components/SearchFilterBar.jsx": SEARCH_FILTER_BAR_COMPONENT,
    "/components/ActivityFeed.jsx": ACTIVITY_FEED_COMPONENT,
    "/components/QuickActions.jsx": QUICK_ACTIONS_COMPONENT,
    "/components/NotificationBell.jsx": NOTIFICATION_BELL_COMPONENT,
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
