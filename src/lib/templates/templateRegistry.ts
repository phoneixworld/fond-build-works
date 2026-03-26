/**
 * Template Registry v2 — Domain Template Engine
 * 
 * Centralized registry for all production-quality domain templates.
 * Each template is a complete, compilable React app with:
 * - Proper TypeScript
 * - Semantic design tokens (no hardcoded colors)
 * - Real data patterns (not stubs)
 * - Responsive layout
 * - Loading states
 */

// ─── Types ───────────────────────────────────────────────────────────────

export interface DomainTemplate {
  id: string;
  /** Human-readable name */
  name: string;
  /** Category for grouping */
  category: TemplateCategory;
  /** Keywords for matching user intent */
  keywords: string[];
  /** Short description */
  description: string;
  /** Complete file set for the app */
  files: Record<string, string>;
  /** NPM dependencies required */
  deps: Record<string, string>;
  /** Placeholder variables that can be hydrated */
  variables: string[];
}

export type TemplateCategory =
  | "business"
  | "dashboard"
  | "ecommerce"
  | "content"
  | "saas"
  | "productivity"
  | "data"
  | "social"
  | "utility";

export interface TemplateMatch {
  template: DomainTemplate;
  score: number;
  matchedKeywords: string[];
}

// ─── Registry ────────────────────────────────────────────────────────────

const registry = new Map<string, DomainTemplate>();

export function registerTemplate(template: DomainTemplate): void {
  registry.set(template.id, template);
}

export function getTemplate(id: string): DomainTemplate | undefined {
  return registry.get(id);
}

export function getAllTemplates(): DomainTemplate[] {
  return Array.from(registry.values());
}

export function getTemplatesByCategory(category: TemplateCategory): DomainTemplate[] {
  return getAllTemplates().filter(t => t.category === category);
}

/**
 * Match user intent to the best template.
 * Uses keyword matching with scoring.
 */
export function matchTemplate(userPrompt: string): TemplateMatch | null {
  const prompt = userPrompt.toLowerCase();
  const words = prompt.split(/\s+/);
  
  let bestMatch: TemplateMatch | null = null;

  for (const template of registry.values()) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of template.keywords) {
      const kw = keyword.toLowerCase();
      // Exact word match (higher score)
      if (words.includes(kw)) {
        score += 3;
        matchedKeywords.push(keyword);
      }
      // Substring match
      else if (prompt.includes(kw)) {
        score += 2;
        matchedKeywords.push(keyword);
      }
      // Partial word match (e.g., "invoic" matches "invoice")
      else if (words.some(w => w.startsWith(kw.slice(0, 4)) || kw.startsWith(w.slice(0, 4)))) {
        score += 1;
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { template, score, matchedKeywords };
    }
  }

  return bestMatch;
}

/**
 * Hydrate template variables with project-specific values.
 */
export function hydrateTemplateFiles(
  template: DomainTemplate,
  values: Record<string, string>
): Record<string, string> {
  const files: Record<string, string> = {};
  
  for (const [path, code] of Object.entries(template.files)) {
    let hydrated = code;
    for (const [key, value] of Object.entries(values)) {
      hydrated = hydrated.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    files[path] = hydrated;
  }

  return files;
}

// ─── Shared Template Fragments ──────────────────────────────────────────

/** Shared CSS with semantic tokens for all templates */
export const TEMPLATE_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-bg: #ffffff;
    --color-bg-secondary: #f8fafc;
    --color-bg-tertiary: #f1f5f9;
    --color-text: #0f172a;
    --color-text-secondary: #64748b;
    --color-text-muted: #94a3b8;
    --color-primary: #3b82f6;
    --color-primary-hover: #2563eb;
    --color-primary-light: #eff6ff;
    --color-primary-text: #ffffff;
    --color-success: #10b981;
    --color-success-light: #ecfdf5;
    --color-warning: #f59e0b;
    --color-warning-light: #fffbeb;
    --color-danger: #ef4444;
    --color-danger-light: #fef2f2;
    --color-border: #e2e8f0;
    --color-border-hover: #cbd5e1;
    --color-shadow: rgba(0,0,0,0.08);
    --radius: 0.5rem;
  }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--color-text);
    background: var(--color-bg);
    -webkit-font-smoothing: antialiased;
  }
}`;

/** Standard sidebar nav component */
export function generateSidebar(appName: string, navItems: { icon: string; label: string }[]): string {
  const iconImports = [...new Set(navItems.map(n => n.icon))].join(", ");
  const navArray = navItems.map((n, i) => 
    `  { icon: ${n.icon}, label: "${n.label}"${i === 0 ? ", active: true" : ""} }`
  ).join(",\n");

  return `import React from "react";
import { ${iconImports}, Zap, ChevronLeft } from "lucide-react";

const nav = [
${navArray}
];

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle }) {
  return (
    <aside className={"h-full flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)] transition-all duration-200 " + (collapsed ? "w-16" : "w-60")}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="font-semibold text-sm">${appName}</span>}
        </div>
        <button onClick={onToggle} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ChevronLeft className={"w-4 h-4 transition-transform " + (collapsed ? "rotate-180" : "")} />
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map(n => {
          const active = activePage === n.label;
          return (
            <button
              key={n.label}
              onClick={() => onNavigate(n.label)}
              className={"w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all " + 
                (active 
                  ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium" 
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]"
                )}
            >
              <n.icon className="w-4.5 h-4.5 flex-shrink-0" />
              {!collapsed && <span>{n.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}`;
}

/** Standard header component */
export function generateHeader(showSearch: boolean = true): string {
  return `import React from "react";
import { Search, Bell, User } from "lucide-react";

export default function Header({ title, subtitle }) {
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text)]">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        ${showSearch ? `<div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-9 pr-4 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] w-56"
          />
        </div>` : ""}
        <button className="relative p-2 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
          <Bell className="w-4.5 h-4.5 text-[var(--color-text-secondary)]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[var(--color-danger)] rounded-full" />
        </button>
        <button className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </button>
      </div>
    </header>
  );
}`;
}

/** Stats card row generator */
export function generateStatsCards(stats: { label: string; value: string; change: string; icon: string; trend: "up" | "down" }[]): string {
  const iconImports = [...new Set(stats.map(s => s.icon))].join(", ");
  const statsArray = stats.map(s => 
    `  { label: "${s.label}", value: "${s.value}", change: "${s.change}", icon: ${s.icon}, trend: "${s.trend}" }`
  ).join(",\n");

  return `import React from "react";
import { ${iconImports}, TrendingUp, TrendingDown } from "lucide-react";

const stats = [
${statsArray}
];

export default function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(stat => (
        <div key={stat.label} className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--color-text-secondary)]">{stat.label}</span>
            <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center">
              <stat.icon className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[var(--color-text)]">{stat.value}</div>
          <div className={"flex items-center gap-1 mt-1 text-xs font-medium " + 
            (stat.trend === "up" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")}>
            {stat.trend === "up" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{stat.change}</span>
            <span className="text-[var(--color-text-muted)] font-normal ml-1">vs last month</span>
          </div>
        </div>
      ))}
    </div>
  );
}`;
}

/** Data table component generator */
export function generateDataTable(
  entityName: string,
  columns: { key: string; label: string; type?: "text" | "badge" | "date" | "currency" }[],
  sampleData: Record<string, string>[]
): string {
  const colDefs = columns.map(c => `  { key: "${c.key}", label: "${c.label}", type: "${c.type || "text"}" }`).join(",\n");
  const dataStr = JSON.stringify(sampleData, null, 2);

  return `import React, { useState } from "react";
import { Search, Plus, Filter, MoreHorizontal, ChevronDown } from "lucide-react";

const columns = [
${colDefs}
];

const initialData = ${dataStr};

const badgeColors = {
  active: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  completed: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  paid: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  pending: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  "in progress": "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
  overdue: "bg-[var(--color-danger-light)] text-[var(--color-danger)]",
  cancelled: "bg-[var(--color-danger-light)] text-[var(--color-danger)]",
  inactive: "bg-gray-100 text-gray-500",
  draft: "bg-gray-100 text-gray-500",
};

export default function ${entityName}Table() {
  const [search, setSearch] = useState("");
  const [data] = useState(initialData);

  const filtered = data.filter(row =>
    Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
      <div className="p-4 flex items-center justify-between border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-[var(--color-text)]">${entityName}</h2>
          <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded-full">{filtered.length} records</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 w-48"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map(col => (
                <th key={col.key} className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-4 py-3">
                  <button className="flex items-center gap-1 hover:text-[var(--color-text)]">
                    {col.label} <ChevronDown className="w-3 h-3" />
                  </button>
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors">
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3 text-sm">
                    {col.type === "badge" ? (
                      <span className={"inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium " + (badgeColors[row[col.key]?.toLowerCase()] || "bg-gray-100 text-gray-600")}>
                        {row[col.key]}
                      </span>
                    ) : col.type === "currency" ? (
                      <span className="font-medium">{row[col.key]}</span>
                    ) : (
                      <span className={col.key === columns[0].key ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"}>
                        {row[col.key]}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-2">
                  <button className="p-1 rounded hover:bg-[var(--color-bg-tertiary)]">
                    <MoreHorizontal className="w-4 h-4 text-[var(--color-text-muted)]" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 flex items-center justify-between border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
        <span>Showing {filtered.length} of {data.length} results</span>
        <div className="flex gap-1">
          <button className="px-2.5 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]">Previous</button>
          <button className="px-2.5 py-1 rounded bg-[var(--color-primary)] text-white">1</button>
          <button className="px-2.5 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]">2</button>
          <button className="px-2.5 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]">Next</button>
        </div>
      </div>
    </div>
  );
}`;
}

// ─── Template Stats ──────────────────────────────────────────────────────

export function getRegistryStats(): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  for (const t of registry.values()) {
    byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  }
  return { total: registry.size, byCategory };
}
