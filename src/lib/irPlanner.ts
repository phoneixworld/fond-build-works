// src/lib/irPlanner.ts

import type { IR } from "./ir";
import { sanitizeName, sanitizeRoute } from "./nameSanitizer";

/**
 * Generic interface for calling your LLM.
 * You should adapt this to your existing AI pipeline (e.g. streamBuildAgent, callChatModel, etc.).
 */
export interface IRPlannerLLM {
  (options: {
    system: string;
    user: string;
  }): Promise<string>;
}

/**
 * High-level IR planner.
 *
 * Given the raw product requirements, it asks the model to emit a SINGLE JSON object
 * matching the IR type and returns the parsed + normalized IR.
 *
 * You call this BEFORE your existing task-graph planner, then pass the result as `structuredIR`.
 */
export async function planIRFromRequirements(
  llm: IRPlannerLLM,
  rawRequirements: string
): Promise<IR> {
  const system = buildIRSystemPrompt();
  const user = buildUserPrompt(rawRequirements);
  const raw = await llm({ system, user });
  const json = extractJson(raw);
  const ir = JSON.parse(json) as IR;
  return normalizeIR(ir);
}

function buildIRSystemPrompt(): string {
  return `
You are the IR Planner for an AI IDE called Nimbus.

Your ONLY job is to take a natural language product request and emit a COMPLETE, COHERENT app specification as a JSON object matching this TypeScript type:

type FieldType = "string" | "number" | "boolean" | "date" | "relation";

interface IREntityField {
  type: FieldType;
  required?: boolean;
  relation?: { entity: string; type: "one" | "many" };
}

interface IREntity {
  fields: Record<string, IREntityField>;
  flows: Array<"list" | "view" | "create" | "edit" | "delete" | string>;
}

interface IRPage {
  name: string;
  type: "list" | "view" | "edit" | "create" | "dashboard" | "custom";
  entity?: string;
  path: string;
}

interface IRNavItem {
  label: string;
  path: string;
  icon?: string;
}

interface IRContext {
  name: string;
  provides: string[];
}

interface IR {
  entities: Record<string, IREntity>;
  pages: IRPage[];
  navigation: IRNavItem[];
  components: string[];
  contexts: IRContext[];
  mockApi: Record<string, {
    list: string;
    create: string;
    update: string;
    delete: string;
  }>;
  backend?: {
    provider: "supabase" | "none";
    config?: any;
  };
}

RULES:
1. You MUST output a SINGLE JSON object that conforms to IR.
2. Do NOT wrap in backticks, markdown, or prose. JSON ONLY.
3. "entities" must cover all core domain objects implied by the request.
4. Each entity must have realistic fields and flows (list, view, create, edit, delete where appropriate).
5. "pages" must cover:
   - at least one dashboard (if the domain suggests it),
   - list pages for each main entity,
   - view/edit/create pages where flows require them.
6. "navigation" must be a usable sidebar/top-nav for a React Router v6 app.
7. "components" should list reusable UI primitives and domain components (e.g. "Sidebar", "Navbar", "DataTable", "Form", "Modal").
8. "contexts" should include:
   - AuthContext ONLY if the request implies authentication (login, signup, users, roles, permissions, protected pages). Do NOT include AuthContext for simple CRUD apps, landing pages, or tools without user accounts.
   - AppContext (global app state),
   - domain-specific contexts where useful (e.g. "InventoryContext").
9. "mockApi" must define list/create/update/delete endpoints for each entity, even if they are mock URLs (e.g. "/mock/contacts").
10. "backend" should default to { "provider": "none" } unless the user explicitly asks for Supabase or another backend.

You are designing for a Shadcn + Tailwind + React Router v6 front-end.
You are NOT generating code here — only the IR.
Be opinionated and complete: the first run of the app must feel like a real, usable product, not a skeleton.
`.trim();
}

function buildUserPrompt(rawRequirements: string): string {
  return [
    `User request:`,
    ``,
    rawRequirements,
    ``,
    `You MUST respond with a single JSON object matching the IR TypeScript type above.`,
    `No prose, no markdown, no explanation. Only JSON.`,
  ].join("\n");
}

/**
 * Extract the first JSON object from a possibly noisy LLM response.
 */
function extractJson(raw: string): string {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("[IRPlanner] Could not find JSON object in model output");
  }
  return raw.slice(firstBrace, lastBrace + 1);
}

/**
 * Light normalization to keep downstream code simple.
 */
function normalizeIR(ir: IR): IR {
  // P0 FIX: Sanitize page names to valid JS identifiers (no spaces, special chars)
  const pages = ir.pages.map((p) => ({
    ...p,
    name: sanitizeComponentName(p.name),
    path: p.path || inferPathFromName(p.name),
  }));

  const navigation =
    ir.navigation && ir.navigation.length > 0
      ? ir.navigation
      : buildDefaultNavigation(pages);

  return {
    ...ir,
    pages,
    navigation,
    backend: ir.backend ?? { provider: "none" },
  };
}

/**
 * Convert any page name to a valid PascalCase JS identifier.
 * "Create Event" → "CreateEvent"
 * "Admission Detail" → "AdmissionDetail"
 * "my-cool page!" → "MyCoolPage"
 */
function sanitizeComponentName(name: string): string {
  // Split on non-alphanumeric chars
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return "UnnamedPage";
  
  // PascalCase each part
  const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  
  // Ensure starts with letter
  if (/^[0-9]/.test(pascal)) return "Page" + pascal;
  
  return pascal;
}

function inferPathFromName(name: string): string {
  if (name.toLowerCase().includes("dashboard")) return "/";
  const base = name.replace(/Page$/i, "");
  return `/${kebabCase(base)}`;
}

function buildDefaultNavigation(pages: IR["pages"]): IR["navigation"] {
  const main = pages.filter((p) => p.type === "dashboard");
  const rest = pages.filter((p) => p.type !== "dashboard");

  const items: IR["navigation"] = [];

  if (main[0]) {
    items.push({
      label: "Dashboard",
      path: main[0].path,
      icon: "layout-dashboard",
    });
  }

  for (const p of rest) {
    items.push({
      label: humanize(p.name),
      path: p.path,
    });
  }

  return items;
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function humanize(value: string): string {
  return value
    .replace(/Page$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
