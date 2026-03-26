/**
 * Hybrid Generation Engine — Phase 5
 * 
 * Routes every required output file to one of two lanes:
 *   1. DETERMINISTIC — Template scaffolds (instant, zero AI calls)
 *   2. AI-GENERATED — LLM micro-prompts for business logic only
 * 
 * Target: 70% deterministic, 30% AI — measured and logged.
 */

import type { IR, IRPage, IREntity } from "@/lib/ir";
import type { Workspace } from "./workspace";
import type { BuildContext, CompilerTask } from "./types";
import { cloudLog } from "@/lib/cloudLogBus";

// ─── File Classification ──────────────────────────────────────────────────

export type GenerationLane = "deterministic" | "ai_required";

export interface FileClassification {
  path: string;
  lane: GenerationLane;
  reason: string;
  /** Template ID to use (if deterministic) */
  templateId?: string;
  /** Micro-prompt for AI (if ai_required) */
  aiPrompt?: string;
  /** Entity this file relates to */
  entity?: string;
  /** Page this file relates to */
  page?: string;
  /** Priority: lower = generate first */
  priority: number;
}

export interface HybridPlan {
  classifications: FileClassification[];
  deterministicCount: number;
  aiRequiredCount: number;
  deterministicRatio: number;
  /** Files that need AI micro-prompts */
  aiGaps: AIGap[];
}

export interface AIGap {
  file: string;
  gapType: "business_logic" | "custom_ui" | "workflow" | "validation" | "integration" | "computation";
  description: string;
  microPrompt: string;
  /** Which entity/page context to include */
  contextFiles: string[];
  /** Max tokens for this micro-prompt */
  maxTokens: number;
}

// ─── Deterministic Patterns ───────────────────────────────────────────────

/** Patterns that are ALWAYS templateable */
const DETERMINISTIC_PATTERNS: Array<{
  test: (path: string, ir: IR) => boolean;
  templateId: string;
  reason: string;
  priority: number;
}> = [
  {
    test: (p) => p === "/App.jsx" || p === "/App.tsx",
    templateId: "app_entry",
    reason: "App entry point is fully derivable from routes",
    priority: 0,
  },
  {
    test: (p) => /^\/pages\/\w+Page\.(jsx|tsx)$/.test(p),
    templateId: "crud_page",
    reason: "CRUD pages follow standard list/detail/form patterns",
    priority: 10,
  },
  {
    test: (p) => /^\/pages\/Dashboard\.(jsx|tsx)$/.test(p),
    templateId: "dashboard_page",
    reason: "Dashboard pages use stat cards + recent items pattern",
    priority: 10,
  },
  {
    test: (p) => /^\/contexts\/\w+Context\.(jsx|tsx)$/.test(p),
    templateId: "entity_context",
    reason: "Entity contexts follow create/read/update/delete pattern",
    priority: 5,
  },
  {
    test: (p) => /^\/hooks\/use\w+\.(js|ts|jsx|tsx)$/.test(p),
    templateId: "data_hook",
    reason: "Data hooks follow fetch/mutate pattern",
    priority: 5,
  },
  {
    test: (p) => /^\/components\/ui\//.test(p),
    templateId: "ui_component",
    reason: "UI primitives are pre-scaffolded",
    priority: 1,
  },
  {
    test: (p) => /^\/components\/(Sidebar|Navigation|Header|Footer|Layout)\.(jsx|tsx)$/.test(p),
    templateId: "layout_component",
    reason: "Layout components are derived from routes + nav structure",
    priority: 3,
  },
  {
    test: (p) => /^\/api\//.test(p) || /^\/services\//.test(p),
    templateId: "api_service",
    reason: "API services follow REST endpoint pattern",
    priority: 5,
  },
  {
    test: (p) => p === "/styles/globals.css" || p.endsWith(".css"),
    templateId: "styles",
    reason: "Styles use design tokens from theme",
    priority: 1,
  },
  {
    test: (p) => /^\/components\/forms\/\w+Form\.(jsx|tsx)$/.test(p),
    templateId: "entity_form",
    reason: "Entity forms are derived from field schemas",
    priority: 8,
  },
  {
    test: (p) => /^\/components\/tables\/\w+Table\.(jsx|tsx)$/.test(p),
    templateId: "entity_table",
    reason: "Data tables are derived from entity fields",
    priority: 8,
  },
  {
    test: (p) => /\/(AuthContext|ProtectedRoute|LoginPage|SignupPage)\.(jsx|tsx)$/.test(p),
    templateId: "auth_scaffold",
    reason: "Auth follows canonical patterns",
    priority: 2,
  },
];

/** Patterns that ALWAYS require AI */
const AI_REQUIRED_PATTERNS: Array<{
  test: (path: string, requirements: string) => boolean;
  gapType: AIGap["gapType"];
  reason: string;
}> = [
  {
    test: (_, req) => /custom\s+(algorithm|calculation|formula|logic)/i.test(req),
    gapType: "computation",
    reason: "Custom computation logic requires AI",
  },
  {
    test: (_, req) => /drag.?and.?drop|sortable|kanban|reorder/i.test(req),
    gapType: "custom_ui",
    reason: "Drag-and-drop interactions require AI",
  },
  {
    test: (_, req) => /workflow|state\s*machine|approval\s*flow|pipeline/i.test(req),
    gapType: "workflow",
    reason: "Custom workflow state machines require AI",
  },
  {
    test: (_, req) => /chart|graph|visualization|analytics\s*dashboard/i.test(req),
    gapType: "custom_ui",
    reason: "Data visualizations require AI for chart config",
  },
  {
    test: (_, req) => /integrate|webhook|third.?party|api\s*call|external/i.test(req),
    gapType: "integration",
    reason: "External integrations require AI",
  },
];

// ─── Classifier ──────────────────────────────────────────────────────────

/**
 * Classify every file the build needs to produce into deterministic vs AI lanes.
 */
export function classifyFiles(
  ir: IR,
  requirements: string,
  existingFiles: string[]
): HybridPlan {
  const classifications: FileClassification[] = [];
  const aiGaps: AIGap[] = [];

  // Derive the full file manifest from IR
  const requiredFiles = deriveFileManifest(ir);

  for (const filePath of requiredFiles) {
    // Skip files that already exist
    if (existingFiles.includes(filePath)) continue;

    // Check deterministic patterns first
    const deterministicMatch = DETERMINISTIC_PATTERNS.find(p => p.test(filePath, ir));

    if (deterministicMatch) {
      classifications.push({
        path: filePath,
        lane: "deterministic",
        reason: deterministicMatch.reason,
        templateId: deterministicMatch.templateId,
        priority: deterministicMatch.priority,
      });
      continue;
    }

    // Check if AI is explicitly required
    const aiMatch = AI_REQUIRED_PATTERNS.find(p => p.test(filePath, requirements));

    if (aiMatch) {
      const gap = buildAIGap(filePath, aiMatch.gapType, aiMatch.reason, ir, requirements);
      aiGaps.push(gap);
      classifications.push({
        path: filePath,
        lane: "ai_required",
        reason: aiMatch.reason,
        aiPrompt: gap.microPrompt,
        priority: 20,
      });
      continue;
    }

    // Default: if it matches known structural patterns → deterministic
    // Otherwise → AI required
    if (isStructuralFile(filePath)) {
      classifications.push({
        path: filePath,
        lane: "deterministic",
        reason: "Matches structural pattern",
        templateId: "generic_component",
        priority: 15,
      });
    } else {
      const gap = buildAIGap(filePath, "business_logic", "Custom component", ir, requirements);
      aiGaps.push(gap);
      classifications.push({
        path: filePath,
        lane: "ai_required",
        reason: "Custom business logic component",
        aiPrompt: gap.microPrompt,
        priority: 20,
      });
    }
  }

  const deterministicCount = classifications.filter(c => c.lane === "deterministic").length;
  const aiRequiredCount = classifications.filter(c => c.lane === "ai_required").length;
  const total = deterministicCount + aiRequiredCount;

  return {
    classifications: classifications.sort((a, b) => a.priority - b.priority),
    deterministicCount,
    aiRequiredCount,
    deterministicRatio: total > 0 ? deterministicCount / total : 1,
    aiGaps,
  };
}

// ─── Template Saturator ──────────────────────────────────────────────────

/**
 * Fill the workspace with all deterministic files from the hybrid plan.
 * Returns the number of files generated (zero AI calls).
 */
export function saturateWithTemplates(
  workspace: Workspace,
  plan: HybridPlan,
  ir: IR,
  ctx: BuildContext
): number {
  let generated = 0;

  for (const classification of plan.classifications) {
    if (classification.lane !== "deterministic") continue;
    if (workspace.hasFile(classification.path)) continue;

    const content = generateFromTemplate(
      classification.templateId!,
      classification.path,
      ir,
      ctx
    );

    if (content) {
      workspace.addFile(classification.path, content);
      generated++;
    }
  }

  cloudLog.info(
    `[HybridGen] Template saturation: ${generated} files generated deterministically (${plan.deterministicRatio * 100}% ratio)`,
    "compiler"
  );

  return generated;
}

// ─── AI Gap Analyzer ─────────────────────────────────────────────────────

/**
 * Analyze workspace post-template-saturation to find remaining logic gaps.
 * Scans for TODO markers and empty function bodies left by templates.
 */
export function analyzeAIGaps(
  workspace: Workspace,
  ir: IR,
  requirements: string
): AIGap[] {
  const gaps: AIGap[] = [];
  const files = workspace.listFiles();

  for (const filePath of files) {
    const content = workspace.getFile(filePath);
    if (!content) continue;

    // Find TODO markers left by templates
    const todoMatches = content.matchAll(/\/\/\s*TODO:\s*(.+)/g);
    for (const match of todoMatches) {
      const todoText = match[1].trim();

      // Skip trivial TODOs
      if (/add more|implement later|placeholder/i.test(todoText)) continue;

      const gapType = classifyGapType(todoText);
      gaps.push({
        file: filePath,
        gapType,
        description: todoText,
        microPrompt: buildMicroPrompt(filePath, todoText, gapType, ir, requirements),
        contextFiles: findRelatedFiles(filePath, workspace),
        maxTokens: gapType === "computation" ? 2000 : gapType === "custom_ui" ? 4000 : 3000,
      });
    }

    // Find empty function bodies (stub implementations)
    const emptyFnMatches = content.matchAll(
      /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{\s*(?:\/\/[^\n]*)?\s*\}/g
    );
    for (const match of emptyFnMatches) {
      const fnName = match[1] || match[2];
      if (!fnName || /^(?:handle|on|set|get|toggle|is|has|can)\w{0,3}$/i.test(fnName)) continue;

      gaps.push({
        file: filePath,
        gapType: "business_logic",
        description: `Implement ${fnName} function body`,
        microPrompt: buildMicroPrompt(
          filePath,
          `Implement the ${fnName} function`,
          "business_logic",
          ir,
          requirements
        ),
        contextFiles: findRelatedFiles(filePath, workspace),
        maxTokens: 2000,
      });
    }
  }

  return gaps;
}

/**
 * Convert AI gaps into focused compiler tasks.
 * These are micro-tasks that only ask the AI for specific logic.
 */
export function gapsToMicroTasks(gaps: AIGap[]): CompilerTask[] {
  return gaps.map((gap, i) => ({
    id: `ai-gap-${i}`,
    label: `ai:${gap.gapType}:${gap.file}`,
    type: "frontend" as const,
    description: gap.microPrompt,
    buildPrompt: gap.microPrompt,
    dependsOn: [],
    produces: [gap.file],
    touches: gap.contextFiles,
    priority: gap.gapType === "business_logic" ? 1 : 2,
    status: "pending" as const,
    retries: 0,
  }));
}

// ─── Template Generators ─────────────────────────────────────────────────

function generateFromTemplate(
  templateId: string,
  filePath: string,
  ir: IR,
  ctx: BuildContext
): string | null {
  switch (templateId) {
    case "app_entry":
      return generateAppEntry(ir);
    case "crud_page":
      return generateCRUDPage(filePath, ir);
    case "dashboard_page":
      return generateDashboardPage(ir);
    case "entity_context":
      return generateEntityContext(filePath, ir);
    case "data_hook":
      return generateDataHook(filePath, ir);
    case "layout_component":
      return generateLayoutComponent(filePath, ir);
    case "entity_form":
      return generateEntityForm(filePath, ir);
    case "entity_table":
      return generateEntityTable(filePath, ir);
    case "auth_scaffold":
      return generateAuthScaffold(filePath);
    case "api_service":
      return generateAPIService(filePath, ir);
    case "generic_component":
      return generateGenericComponent(filePath);
    default:
      return null;
  }
}

function generateAppEntry(ir: IR): string {
  const imports: string[] = [];
  const routes: string[] = [];

  for (const page of ir.pages) {
    const componentName = page.name.replace(/\s+/g, "");
    const pagePath = `/pages/${componentName}`;
    imports.push(`import ${componentName} from ".${pagePath}";`);
    routes.push(`      <Route path="${page.route || `/${componentName.toLowerCase()}`}" element={<${componentName} />} />`);
  }

  return `import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
${imports.join("\n")}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<${ir.pages[0]?.name.replace(/\s+/g, "") || "Home"} />} />
${routes.join("\n")}
      </Routes>
    </BrowserRouter>
  );
}
`;
}

function generateCRUDPage(filePath: string, ir: IR): string {
  const pageName = filePath.match(/\/pages\/(\w+)Page/)?.[1] || "Item";
  const entity = ir.entities[pageName.toLowerCase()] || Object.values(ir.entities)[0];
  const fields = entity?.fields || [
    { name: "name", type: "string", required: true },
    { name: "description", type: "string" },
    { name: "status", type: "string" },
  ];

  const fieldList = fields.map(f => `"${f.name}"`).join(", ");

  return `import React, { useState, useEffect } from "react";

const FIELDS = [${fieldList}];

export default function ${pageName}Page() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    // TODO: Fetch ${pageName.toLowerCase()} data from API
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${pageName}s</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          {showForm ? "Cancel" : "Add ${pageName}"}
        </button>
      </div>

      {showForm && (
        <div className="p-4 border rounded-lg bg-card space-y-4">
          {FIELDS.map(field => (
            <div key={field}>
              <label className="block text-sm font-medium text-muted-foreground mb-1 capitalize">{field}</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-lg bg-background"
                placeholder={\`Enter \${field}\`}
              />
            </div>
          ))}
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
            Save ${pageName}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No ${pageName.toLowerCase()}s yet. Create your first one!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item, i) => (
            <div key={i} className="p-4 border rounded-lg bg-card hover:shadow-md transition">
              <pre className="text-sm">{JSON.stringify(item, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`;
}

function generateDashboardPage(ir: IR): string {
  const entityNames = Object.keys(ir.entities).slice(0, 4);
  const statCards = entityNames.map(
    (name, i) =>
      `        <div key="${name}" className="p-6 bg-card border rounded-xl">
          <p className="text-sm text-muted-foreground capitalize">${name}</p>
          <p className="text-3xl font-bold mt-1">${(i + 1) * 42}</p>
          <p className="text-xs text-green-500 mt-1">+${(i + 1) * 3}% this week</p>
        </div>`
  );

  return `import React from "react";

export default function Dashboard() {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your workspace</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
${statCards.join("\n") || '        <div className="p-6 bg-card border rounded-xl"><p className="text-sm text-muted-foreground">Total Items</p><p className="text-3xl font-bold mt-1">0</p></div>'}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-card border rounded-xl">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {/* TODO: Render recent activity feed */}
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        </div>
        <div className="p-6 bg-card border rounded-xl">
          <h3 className="font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {/* TODO: Add domain-specific quick actions */}
            <p className="text-sm text-muted-foreground">Configure your quick actions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
`;
}

function generateEntityContext(filePath: string, ir: IR): string {
  const entityName = filePath.match(/\/contexts\/(\w+)Context/)?.[1] || "Entity";
  const entity = ir.entities[entityName.toLowerCase()];
  const fields = entity?.fields || [{ name: "name", type: "string" }];

  return `import React, { createContext, useContext, useState, useCallback } from "react";

const ${entityName}Context = createContext(undefined);

export function ${entityName}Provider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Fetch ${entityName.toLowerCase()} records from API
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (data) => {
    // TODO: Create ${entityName.toLowerCase()} via API
    setItems(prev => [...prev, { id: Date.now().toString(), ...data }]);
  }, []);

  const update = useCallback(async (id, data) => {
    // TODO: Update ${entityName.toLowerCase()} via API
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...data } : item));
  }, []);

  const remove = useCallback(async (id) => {
    // TODO: Delete ${entityName.toLowerCase()} via API
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return (
    <${entityName}Context.Provider value={{ items, loading, fetchAll, create, update, remove }}>
      {children}
    </${entityName}Context.Provider>
  );
}

export function use${entityName}() {
  const ctx = useContext(${entityName}Context);
  if (!ctx) throw new Error("use${entityName} must be used within ${entityName}Provider");
  return ctx;
}
`;
}

function generateDataHook(filePath: string, ir: IR): string {
  const hookName = filePath.match(/\/hooks\/(use\w+)/)?.[1] || "useData";
  const entityName = hookName.replace(/^use/, "");

  return `import { useState, useEffect, useCallback } from "react";

export function ${hookName}() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch${entityName} = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Fetch ${entityName.toLowerCase()} data from API
      setData([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch${entityName}();
  }, [fetch${entityName}]);

  const create = useCallback(async (item) => {
    // TODO: Create ${entityName.toLowerCase()} via API
    setData(prev => [...prev, { id: Date.now().toString(), ...item }]);
  }, []);

  const update = useCallback(async (id, updates) => {
    // TODO: Update ${entityName.toLowerCase()} via API
    setData(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const remove = useCallback(async (id) => {
    // TODO: Delete ${entityName.toLowerCase()} via API
    setData(prev => prev.filter(d => d.id !== id));
  }, []);

  return { data, loading, error, refetch: fetch${entityName}, create, update, remove };
}
`;
}

function generateLayoutComponent(filePath: string, ir: IR): string {
  const name = filePath.match(/\/components\/(\w+)/)?.[1] || "Layout";

  if (name === "Sidebar" || name === "Navigation") {
    const navItems = ir.pages
      .slice(0, 8)
      .map(p => `    { label: "${p.name}", path: "${p.route || `/${p.name.toLowerCase().replace(/\s+/g, "-")}`}" },`)
      .join("\n");

    return `import React from "react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
${navItems || '    { label: "Home", path: "/" },'}
];

export default function ${name}() {
  return (
    <nav className="w-64 h-screen bg-card border-r p-4 space-y-1">
      <h2 className="text-lg font-bold mb-4 px-3">Menu</h2>
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            \`block px-3 py-2 rounded-lg text-sm transition \${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }\`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
`;
  }

  return `import React from "react";

export default function ${name}({ children }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
`;
}

function generateEntityForm(filePath: string, ir: IR): string {
  const entityName = filePath.match(/\/forms\/(\w+)Form/)?.[1] || "Entity";
  const entity = ir.entities[entityName.toLowerCase()];
  const fields = entity?.fields || [
    { name: "name", type: "string", required: true },
    { name: "description", type: "string" },
  ];

  const fieldInputs = fields.map(f => {
    const inputType = f.type === "number" ? "number" : f.type === "email" ? "email" : "text";
    return `      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">${f.name}</label>
        <input
          type="${inputType}"
          name="${f.name}"
          value={formData.${f.name} || ""}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-lg bg-background"
          ${f.required ? "required" : ""}
        />
      </div>`;
  });

  const defaultValues = fields.map(f => `    ${f.name}: ""`).join(",\n");

  return `import React, { useState } from "react";

export default function ${entityName}Form({ onSubmit, initialData, onCancel }) {
  const [formData, setFormData] = useState(initialData || {
${defaultValues}
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Validate form data
    onSubmit?.(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
${fieldInputs.join("\n")}
      <div className="flex gap-2">
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
          Save
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-muted">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
`;
}

function generateEntityTable(filePath: string, ir: IR): string {
  const entityName = filePath.match(/\/tables\/(\w+)Table/)?.[1] || "Entity";
  const entity = ir.entities[entityName.toLowerCase()];
  const fields = entity?.fields || [
    { name: "name", type: "string" },
    { name: "status", type: "string" },
  ];

  const headers = fields.map(f => `          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground capitalize">${f.name}</th>`).join("\n");
  const cells = fields.map(f => `            <td className="px-4 py-3 text-sm">{row.${f.name}}</td>`).join("\n");

  return `import React from "react";

export default function ${entityName}Table({ data = [], onRowClick }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No ${entityName.toLowerCase()} records found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full">
        <thead className="bg-muted/50 border-b">
          <tr>
${headers}
            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className="hover:bg-muted/30 cursor-pointer transition"
            >
${cells}
              <td className="px-4 py-3 text-right">
                <button className="text-sm text-primary hover:underline">View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
}

function generateAuthScaffold(filePath: string): string {
  if (filePath.includes("LoginPage") || filePath.includes("SignupPage")) {
    const isLogin = filePath.includes("Login");
    return `import React, { useState } from "react";

export default function ${isLogin ? "Login" : "Signup"}Page() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // TODO: Implement ${isLogin ? "login" : "signup"} via auth API
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 bg-card border rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-6">${isLogin ? "Sign In" : "Create Account"}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-background" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-background" required />
          </div>
          <button type="submit" disabled={loading} className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50">
            {loading ? "..." : "${isLogin ? "Sign In" : "Sign Up"}"}
          </button>
        </form>
      </div>
    </div>
  );
}
`;
  }

  if (filePath.includes("ProtectedRoute")) {
    return `import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  // TODO: Check auth state from AuthContext
  const isAuthenticated = true;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}
`;
  }

  // AuthContext
  return `import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Check session on mount
    setLoading(false);
  }, []);

  const signIn = async (email, password) => {
    // TODO: Implement sign in
  };

  const signUp = async (email, password) => {
    // TODO: Implement sign up
  };

  const signOut = async () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
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

function generateAPIService(filePath: string, ir: IR): string {
  const serviceName = filePath.match(/\/(?:api|services)\/(\w+)/)?.[1] || "api";

  return `// ${serviceName} API Service
// Auto-generated — replace TODOs with real API calls

const BASE_URL = typeof window !== "undefined" && window.__SUPABASE_URL__
  ? window.__SUPABASE_URL__ + "/functions/v1/project-api"
  : "/api";

export async function fetchAll(resource) {
  // TODO: Implement real API fetch
  const res = await fetch(\`\${BASE_URL}?resource=\${resource}\`);
  if (!res.ok) throw new Error("Failed to fetch " + resource);
  const json = await res.json();
  return json.data || [];
}

export async function fetchById(resource, id) {
  // TODO: Implement real API fetch by ID
  const res = await fetch(\`\${BASE_URL}?resource=\${resource}&id=\${id}\`);
  if (!res.ok) throw new Error("Not found");
  const json = await res.json();
  return json.data;
}

export async function create(resource, data) {
  // TODO: Implement real API create
  return { id: Date.now().toString(), ...data };
}

export async function update(resource, id, data) {
  // TODO: Implement real API update
  return { id, ...data };
}

export async function remove(resource, id) {
  // TODO: Implement real API delete
  return { success: true };
}
`;
}

function generateGenericComponent(filePath: string): string {
  const name = filePath.match(/\/components\/(\w+)/)?.[1] || "Component";

  return `import React from "react";

export default function ${name}() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">${name}</h2>
      {/* TODO: Implement ${name} component */}
    </div>
  );
}
`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function deriveFileManifest(ir: IR): string[] {
  const files: string[] = ["/App.jsx"];

  // Pages
  for (const page of ir.pages) {
    const name = page.name.replace(/\s+/g, "");
    files.push(`/pages/${name}.jsx`);
  }

  // Entity contexts and hooks
  for (const entityName of Object.keys(ir.entities)) {
    const capitalized = entityName.charAt(0).toUpperCase() + entityName.slice(1);
    files.push(`/contexts/${capitalized}Context.jsx`);
    files.push(`/hooks/use${capitalized}.js`);
    files.push(`/components/forms/${capitalized}Form.jsx`);
    files.push(`/components/tables/${capitalized}Table.jsx`);
  }

  // Layout
  if (ir.pages.length > 1) {
    files.push("/components/Sidebar.jsx");
  }

  // Auth (if any route requires it)
  if (ir.pages.some(p => p.auth)) {
    files.push("/contexts/AuthContext.jsx");
    files.push("/components/ProtectedRoute.jsx");
    files.push("/pages/LoginPage.jsx");
  }

  return [...new Set(files)];
}

function isStructuralFile(path: string): boolean {
  return /\/(components|pages|contexts|hooks|layouts|services)\//i.test(path) &&
    !/kanban|chart|graph|drag|wizard|flow|calendar|timeline|map/i.test(path);
}

function buildAIGap(
  filePath: string,
  gapType: AIGap["gapType"],
  reason: string,
  ir: IR,
  requirements: string
): AIGap {
  const entityNames = Object.keys(ir.entities);
  const relatedEntity = entityNames.find(e =>
    filePath.toLowerCase().includes(e.toLowerCase())
  );

  const entityContext = relatedEntity
    ? `\nEntity "${relatedEntity}" has fields: ${ir.entities[relatedEntity].fields.map(f => f.name).join(", ")}`
    : "";

  return {
    file: filePath,
    gapType,
    description: reason,
    microPrompt: `Generate the implementation for ${filePath}.
${reason}.
${entityContext}

User requirements excerpt: "${requirements.slice(0, 500)}"

RULES:
- Use React functional components
- Use Tailwind CSS for styling with semantic tokens (bg-background, text-foreground, etc.)
- Use relative imports only (no @/ aliases)
- Export default the main component
- Keep it focused — only implement what's needed for this specific file`,
    contextFiles: [],
    maxTokens: gapType === "custom_ui" ? 4000 : 2500,
  };
}

function classifyGapType(todoText: string): AIGap["gapType"] {
  if (/calculat|formula|comput|algorithm/i.test(todoText)) return "computation";
  if (/drag|sort|animation|interactive/i.test(todoText)) return "custom_ui";
  if (/workflow|state.?machine|approval|transition/i.test(todoText)) return "workflow";
  if (/validat|check|rule|constraint/i.test(todoText)) return "validation";
  if (/api|fetch|external|webhook|integrat/i.test(todoText)) return "integration";
  return "business_logic";
}

function buildMicroPrompt(
  filePath: string,
  description: string,
  gapType: AIGap["gapType"],
  ir: IR,
  requirements: string
): string {
  return `Implement "${description}" in ${filePath}.

Gap type: ${gapType}
Requirements context: "${requirements.slice(0, 300)}"

RULES:
- Produce ONLY the code for the specified function/section
- Use relative imports, no @/ aliases
- Use Tailwind semantic tokens for any UI
- Keep implementation focused and minimal`;
}

function findRelatedFiles(filePath: string, workspace: Workspace): string[] {
  const related: string[] = [];
  const baseName = filePath.match(/\/(\w+)\.\w+$/)?.[1]?.toLowerCase() || "";

  for (const file of workspace.listFiles()) {
    if (file === filePath) continue;
    if (file.toLowerCase().includes(baseName)) {
      related.push(file);
    }
  }

  return related.slice(0, 5);
}
