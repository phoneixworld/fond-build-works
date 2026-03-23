// src/lib/irPlanner.ts

import type { IR } from "./ir";
import { sanitizeName, sanitizeRoute } from "./nameSanitizer";

/**
 * Generic interface for calling your LLM.
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
 */
export async function planIRFromRequirements(
  llm: IRPlannerLLM,
  rawRequirements: string
): Promise<IR> {
  const trimmed = rawRequirements.trim();

  // ── GUARDRAIL 1: Minimum length ──
  if (trimmed.length < 50) {
    throw new Error(
      `IRPlanner: requirements too short to plan a build (${trimmed.length} chars). ` +
      `Received: "${trimmed.slice(0, 40)}". The build pipeline must pass accumulated requirements, not a trigger phrase.`
    );
  }

  // ── GUARDRAIL 2: Domain keyword presence ──
  const DOMAIN_KEYWORDS = /\b(dashboard|employee|department|attendance|logbook|e-?log|university|student|hr|erp|crm|ecommerce|shop|product|invoice|patient|hospital|school|task|project|blog|chat|user|admin|auth|login|signup|form|table|list|report|analytics|calendar|schedule|booking|inventory|order|payment|notification|profile|settings|role|permission|workflow|approval|ticket|support|contact|lead|pipeline|kanban|board|chart|graph|widget|module|page|screen|view|faculty|competency|assessment|rotation|posting|curriculum|exam|grade|course|enrollment|ward|diagnosis|prescription|pharmacy|appointment|clinic|medical|postgraduate|cbme|training|supervisor|mentor|guide|evaluation|portfolio|milestone|certification|accreditation|residency|fellowship|specialty|onboarding|roster|shift|timesheet|payroll|salary|leave|benefit|compliance|grievance|recruit|candidate|appraisal|supplier|warehouse|purchase|stock|shipping|catalog|fee|admission|timetable|syllabus|classroom|announcement|parent|teacher)\b/i;
  if (!DOMAIN_KEYWORDS.test(trimmed)) {
    throw new Error(
      `IRPlanner: requirements missing domain context. No recognizable domain keywords found. ` +
      `The build pipeline must pass structured requirements describing what to build.`
    );
  }

  // ── GUARDRAIL 3: Detect complexity tier ──
  const complexityTier = detectComplexityTier(trimmed);

  const system = buildIRSystemPrompt(complexityTier);
  const user = buildUserPrompt(rawRequirements, complexityTier);
  const raw = await llm({ system, user });
  const json = extractJson(raw);
  const ir = JSON.parse(json) as IR;
  return normalizeIR(ir);
}

type ComplexityTier = "simple" | "standard" | "complex";

/**
 * Detect how complex the requirements are to tailor the IR prompt.
 */
function detectComplexityTier(requirements: string): ComplexityTier {
  const lower = requirements.toLowerCase();
  const wordCount = requirements.split(/\s+/).length;

  // Complex indicators: multiple roles, modules, workflows, or very long FRD
  const COMPLEX_SIGNALS = [
    /\brole[\s-]?based\b/i,
    /\b(platform admin|super admin|university admin|institution admin)\b/i,
    /\b(hod|head of department|faculty|supervisor|mentor|primary guide)\b/i,
    /\b(cbme|competency.based|competency framework)\b/i,
    /\b(module\s*\d|phase\s*\d|section\s*\d)/i,
    /\b(onboarding|rotation|posting|assessment template)\b/i,
    /\b(eligibility|accreditation|certification)\b/i,
    /\b(multi.?tenant|white.?label)\b/i,
    /\b(audit.?trail|audit.?log)\b/i,
  ];

  const complexHits = COMPLEX_SIGNALS.filter(p => p.test(requirements)).length;

  if (complexHits >= 3 || wordCount > 2000) return "complex";
  if (complexHits >= 1 || wordCount > 500) return "standard";
  return "simple";
}

function buildIRSystemPrompt(tier: ComplexityTier): string {
  const base = `
You are the IR Planner for an AI IDE called Nimbus.

Your ONLY job is to take a natural language product request and emit a COMPLETE, COHERENT app specification as a JSON object matching the IR TypeScript type.

type FieldType = "string" | "number" | "boolean" | "date" | "relation";

interface IREntityField {
  type: FieldType;
  required?: boolean;
  relation?: { entity: string; type: "one" | "many" };
}

interface IREntity {
  fields: Record<string, IREntityField>;
  flows: Array<"list" | "view" | "create" | "edit" | "delete" | string>;
  module?: string;
}

interface IRPage {
  name: string;
  type: "list" | "view" | "edit" | "create" | "dashboard" | "custom";
  entity?: string;
  path: string;
  module?: string;
  allowedRoles?: string[];
}

interface IRNavItem {
  label: string;
  path: string;
  icon?: string;
  module?: string;
  children?: IRNavItem[];
}

interface IRContext {
  name: string;
  provides: string[];
}

interface IRRole {
  name: string;
  label: string;
  permissions: string[];
  dashboardPage?: string;
}

interface IRWorkflow {
  name: string;
  steps: Array<{
    name: string;
    entity?: string;
    action: "create" | "review" | "approve" | "reject" | "notify" | "custom";
    assignedRole?: string;
  }>;
}

interface IRModule {
  name: string;
  label: string;
  icon?: string;
  entities: string[];
  pages: string[];
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
  roles?: IRRole[];
  workflows?: IRWorkflow[];
  modules?: IRModule[];
}

RULES:
1. You MUST output a SINGLE JSON object that conforms to IR.
2. Do NOT wrap in backticks, markdown, or prose. JSON ONLY.
3. "entities" must cover ALL core domain objects implied by the request.
4. Each entity must have realistic fields and flows (list, view, create, edit, delete where appropriate).
5. "pages" must cover:
   - at least one dashboard (or role-specific dashboards),
   - list pages for each main entity,
   - view/edit/create pages where flows require them.
6. "navigation" must be a usable sidebar for a React Router v6 app.
   For complex apps, use grouped navigation with "children" for module sections.
7. "components" should list reusable UI primitives and domain components.
8. "contexts" should include:
   - AuthContext ONLY if the request implies authentication (login, signup, users, roles, permissions, protected pages).
   - AppContext (global app state),
   - domain-specific contexts where useful.
9. "mockApi" must define list/create/update/delete endpoints for each entity.
10. "backend" should default to { "provider": "none" } unless the user explicitly asks for Supabase or another backend.

You are designing for a Shadcn + Tailwind + React Router v6 front-end.
You are NOT generating code here — only the IR.
Be opinionated and complete: the first run of the app must feel like a real, usable product, not a skeleton.
`.trim();

  if (tier === "complex") {
    return base + `

COMPLEX APPLICATION RULES (this is a large-scale FRD):
11. "roles" is REQUIRED. Extract ALL user roles from the requirements (e.g., Platform Admin, University Admin, Faculty, Student).
    Each role must have a name, label, and list of page/entity permissions.
12. "modules" is REQUIRED. Group related entities and pages into logical modules (e.g., "Academic Management", "Clinical Training", "Reports & Analytics").
13. "workflows" is REQUIRED if the FRD describes any multi-step processes (e.g., log entry → faculty review → assessment).
14. Navigation MUST use grouped sections matching modules, with nested "children" items.
15. Create role-specific dashboards where the FRD specifies different views per role.
16. For very large entity sets (10+), prioritize the CORE entities first. Every entity must have at least name, id, and 3-5 domain-relevant fields.
17. DO NOT simplify or summarize. Capture EVERY entity, role, workflow, and module described in the FRD.
`;
  }

  if (tier === "standard") {
    return base + `

STANDARD APPLICATION RULES:
11. If roles are mentioned, include "roles" array with proper permissions.
12. If the app has 5+ entities, consider grouping them into "modules".
13. Include "workflows" if multi-step processes are described.
`;
  }

  return base;
}

function buildUserPrompt(rawRequirements: string, tier: ComplexityTier): string {
  const lines = [
    `User request:`,
    ``,
    rawRequirements,
    ``,
    `You MUST respond with a single JSON object matching the IR TypeScript type above.`,
    `No prose, no markdown, no explanation. Only JSON.`,
  ];

  if (tier === "complex") {
    lines.push(
      ``,
      `IMPORTANT: This is a complex FRD. You MUST include roles[], modules[], and workflows[] in your response.`,
      `Capture ALL entities, ALL roles, ALL modules mentioned in the document.`,
      `Use grouped navigation with children[] for module sections.`,
    );
  }

  return lines.join("\n");
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
  // Sanitize page names to valid PascalCase JS identifiers
  const pages = ir.pages.map((p) => ({
    ...p,
    name: sanitizeName(p.name),
    path: p.path ? sanitizeRoute(p.path.replace(/^\//, "")) || inferPathFromName(p.name) : inferPathFromName(p.name),
  }));

  const navigation =
    ir.navigation && ir.navigation.length > 0
      ? ir.navigation
      : buildDefaultNavigation(pages, ir.modules);

  return {
    ...ir,
    pages,
    navigation,
    backend: ir.backend ?? { provider: "none" },
    roles: ir.roles || [],
    workflows: ir.workflows || [],
    modules: ir.modules || [],
  };
}

function inferPathFromName(name: string): string {
  if (name.toLowerCase().includes("dashboard")) return "/";
  const base = name.replace(/Page$/i, "");
  return `/${kebabCase(base)}`;
}

function buildDefaultNavigation(pages: IR["pages"], modules?: IR["modules"]): IR["navigation"] {
  // If modules exist, build grouped navigation
  if (modules && modules.length > 0) {
    const items: IR["navigation"] = [];

    // Dashboard first
    const dashPages = pages.filter((p) => p.type === "dashboard");
    if (dashPages[0]) {
      items.push({
        label: "Dashboard",
        path: dashPages[0].path,
        icon: "layout-dashboard",
      });
    }

    // Group by module
    for (const mod of modules) {
      const modulePages = pages.filter(p => mod.pages.includes(p.name));
      if (modulePages.length === 0) continue;

      items.push({
        label: mod.label,
        path: modulePages[0]?.path || "#",
        icon: mod.icon,
        module: mod.name,
        children: modulePages.map(p => ({
          label: humanize(p.name),
          path: p.path,
        })),
      });
    }

    // Ungrouped pages
    const groupedPageNames = new Set(modules.flatMap(m => m.pages));
    const ungrouped = pages.filter(p => !groupedPageNames.has(p.name) && p.type !== "dashboard");
    for (const p of ungrouped) {
      items.push({ label: humanize(p.name), path: p.path });
    }

    return items;
  }

  // Default flat navigation
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
