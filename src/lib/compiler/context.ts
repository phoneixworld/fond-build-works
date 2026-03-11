/**
 * Build Compiler v1.0 — Canonical Context Assembly
 * 
 * Assembles one canonical BuildContext from raw inputs.
 * This is the ONLY thing downstream steps read.
 */

import type { BuildContext, BuildIntent, IRManifest, IREntity, IRRole, IRRoute, IRModule } from "./types";

// ─── Intent Detection ─────────────────────────────────────────────────────

const FIX_PATTERNS = /\b(fix|error|bug|broken|crash|blank|not working|issue|SyntaxError|TypeError|ReferenceError)\b/i;
const REFACTOR_PATTERNS = /\b(refactor|restructure|reorganize|clean up|simplify|optimize)\b/i;
const EXTEND_PATTERNS = /\b(add|extend|integrate|include|implement|create new|build new)\b/i;

// Patterns that strongly indicate "build me an app" — takes precedence over fix/refactor
const NEW_APP_PATTERNS = /\b(build\s+(?:a|an|the|me|my)\s+\w|create\s+(?:a|an|the|me|my)\s+\w|School\s+ERP|CRM|e-?commerce|dashboard|management\s+system|admin\s+panel|project\s+manager|task\s+board|inventory|booking|scheduling)\b/i;
const BUILD_TRIGGER_PATTERNS = /\b(build\s+it|generate|start\s+building|create\s+the\s+app)\b/i;

export function detectBuildIntent(
  rawRequirements: string,
  hasExistingWorkspace: boolean
): BuildIntent {
  // "Build it" or "build me a School ERP" is always new_app regardless of other words
  if (!hasExistingWorkspace && (BUILD_TRIGGER_PATTERNS.test(rawRequirements) || NEW_APP_PATTERNS.test(rawRequirements))) {
    return "new_app";
  }
  if (!hasExistingWorkspace) return "new_app";
  if (FIX_PATTERNS.test(rawRequirements)) return "fix";
  if (REFACTOR_PATTERNS.test(rawRequirements)) return "refactor";
  if (EXTEND_PATTERNS.test(rawRequirements)) return "extend";
  return "extend";
}

// ─── IR Extraction (deterministic, regex-based) ───────────────────────────

export function extractIRFromRequirements(raw: string): IRManifest {
  const entities = extractEntities(raw);
  const roles = extractRoles(raw);
  const routes = extractRoutes(raw);
  const modules = inferModules(entities, routes);
  const constraints = extractConstraints(raw);

  return {
    entities,
    roles,
    workflows: [], // workflows are extracted by the LLM semantic pass
    routes,
    modules,
    constraints,
  };
}

function extractEntities(raw: string): IREntity[] {
  const entities: IREntity[] = [];
  // Match patterns like "- EntityName (field1, field2 [type], ...)"
  const entityRegex = /[-•]\s*(\w+)\s*\(([^)]+)\)/g;
  let match;
  while ((match = entityRegex.exec(raw)) !== null) {
    const name = match[1];
    const fieldsRaw = match[2];
    // Skip if it looks like a page/route pattern
    if (name.startsWith("/") || ["login", "dashboard", "settings", "page"].includes(name.toLowerCase())) continue;

    const fields = fieldsRaw.split(",").map(f => {
      const trimmed = f.trim();
      const bracketMatch = trimmed.match(/(\w+)\s*\[([^\]]+)\]/);
      if (bracketMatch) {
        return { name: bracketMatch[1], type: bracketMatch[2], required: true };
      }
      return { name: trimmed.replace(/\s+/g, "_"), type: "string", required: false };
    });

    entities.push({ name, fields });
  }

  // ── Semantic entity extraction from natural language ──
  // If regex found nothing, try to infer entities from domain keywords
  if (entities.length === 0) {
    const domainEntityPatterns: Array<{ pattern: RegExp; name: string; fields: Array<{name: string; type: string; required: boolean}> }> = [
      { pattern: /\b(student|pupil|learner)s?\b/i, name: "Student", fields: [
        { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
        { name: "grade", type: "string", required: false }, { name: "status", type: "string", required: false },
      ]},
      { pattern: /\b(teacher|instructor|staff|faculty)\b/i, name: "Teacher", fields: [
        { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
        { name: "subject", type: "string", required: false }, { name: "department", type: "string", required: false },
      ]},
      { pattern: /\b(parent|guardian)\b/i, name: "Parent", fields: [
        { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
        { name: "phone", type: "string", required: false },
      ]},
      { pattern: /\b(class|course|subject)\b/i, name: "Class", fields: [
        { name: "name", type: "string", required: true }, { name: "teacher", type: "string", required: false },
        { name: "schedule", type: "string", required: false },
      ]},
      { pattern: /\b(attendance)\b/i, name: "Attendance", fields: [
        { name: "student_id", type: "string", required: true }, { name: "date", type: "date", required: true },
        { name: "status", type: "string", required: true },
      ]},
      { pattern: /\b(grade|mark|score|assessment)\b/i, name: "Grade", fields: [
        { name: "student_id", type: "string", required: true }, { name: "subject", type: "string", required: true },
        { name: "score", type: "number", required: true },
      ]},
      { pattern: /\b(fee|payment|billing|invoice)\b/i, name: "Fee", fields: [
        { name: "student_id", type: "string", required: true }, { name: "amount", type: "number", required: true },
        { name: "status", type: "string", required: true }, { name: "due_date", type: "date", required: false },
      ]},
      { pattern: /\b(contact|lead|customer|client)\b/i, name: "Contact", fields: [
        { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
        { name: "company", type: "string", required: false }, { name: "status", type: "string", required: false },
      ]},
      { pattern: /\b(deal|opportunity|pipeline)\b/i, name: "Deal", fields: [
        { name: "title", type: "string", required: true }, { name: "value", type: "number", required: true },
        { name: "stage", type: "string", required: true }, { name: "contact_id", type: "string", required: false },
      ]},
      { pattern: /\b(task|ticket|issue)\b/i, name: "Task", fields: [
        { name: "title", type: "string", required: true }, { name: "description", type: "string", required: false },
        { name: "status", type: "string", required: true }, { name: "assignee", type: "string", required: false },
        { name: "priority", type: "string", required: false },
      ]},
      { pattern: /\b(project)\b/i, name: "Project", fields: [
        { name: "name", type: "string", required: true }, { name: "description", type: "string", required: false },
        { name: "status", type: "string", required: true }, { name: "deadline", type: "date", required: false },
      ]},
      { pattern: /\b(product|item|inventory)\b/i, name: "Product", fields: [
        { name: "name", type: "string", required: true }, { name: "price", type: "number", required: true },
        { name: "quantity", type: "number", required: true }, { name: "category", type: "string", required: false },
      ]},
      { pattern: /\b(order|purchase)\b/i, name: "Order", fields: [
        { name: "customer", type: "string", required: true }, { name: "total", type: "number", required: true },
        { name: "status", type: "string", required: true }, { name: "date", type: "date", required: true },
      ]},
      { pattern: /\b(employee|worker|team\s*member)\b/i, name: "Employee", fields: [
        { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
        { name: "role", type: "string", required: false }, { name: "department", type: "string", required: false },
      ]},
    ];

    const seenNames = new Set<string>();
    for (const ep of domainEntityPatterns) {
      if (ep.pattern.test(raw) && !seenNames.has(ep.name)) {
        entities.push({ name: ep.name, fields: ep.fields });
        seenNames.add(ep.name);
      }
    }
  }

  return entities;
}

function extractRoles(raw: string): IRRole[] {
  const roles: IRRole[] = [];
  const roleMatch = raw.match(/roles?:\s*([^\n]+)/i);
  if (roleMatch) {
    const roleNames = roleMatch[1].split(/[,/]/).map(r => r.trim().toLowerCase()).filter(Boolean);
    for (const name of roleNames) {
      roles.push({
        name,
        permissions: name === "admin" ? ["read", "write", "delete", "manage"] : ["read", "write"],
      });
    }
  }
  return roles;
}

function extractRoutes(raw: string): IRRoute[] {
  const routes: IRRoute[] = [];
  const routeRegex = /[-•]\s*(\/[\w/:]+)\s*(?:—|[-–])\s*(.+)/g;
  let match;
  while ((match = routeRegex.exec(raw)) !== null) {
    const path = match[1];
    const desc = match[2].trim();
    const page = path.split("/").filter(Boolean)[0] || "Home";
    const pageName = page.charAt(0).toUpperCase() + page.slice(1) + "Page";
    routes.push({
      path,
      page: pageName,
      auth: !path.includes("login") && !path.includes("signup"),
    });
  }
  return routes;
}

function extractConstraints(raw: string): string[] {
  const constraints: string[] = [];
  if (/AUTH:\s*Enabled/i.test(raw)) constraints.push("auth_required");
  if (/drag.?and.?drop/i.test(raw)) constraints.push("drag_and_drop");
  if (/real.?time/i.test(raw)) constraints.push("realtime");
  if (/CRUD/i.test(raw)) constraints.push("full_crud");
  if (/sidebar/i.test(raw)) constraints.push("sidebar_navigation");
  return constraints;
}

function inferModules(entities: IREntity[], routes: IRRoute[]): IRModule[] {
  const modules: IRModule[] = [];

  // Auth module if any route requires auth
  if (routes.some(r => r.auth)) {
    modules.push({ name: "AuthContext", type: "context", description: "Authentication provider with login/signup" });
    modules.push({ name: "LoginPage", type: "page", description: "Login and signup page" });
  }

  // Pages from routes
  for (const route of routes) {
    if (!modules.some(m => m.name === route.page)) {
      modules.push({ name: route.page, type: "page", description: `Page for ${route.path}` });
    }
  }

  // CRUD components for entities
  for (const entity of entities) {
    modules.push({ name: `${entity.name}List`, type: "component", description: `List view for ${entity.name}` });
    modules.push({ name: `${entity.name}Form`, type: "component", description: `Create/edit form for ${entity.name}` });
  }

  // App entry
  modules.push({ name: "App", type: "component", description: "Root app component with routing" });

  return modules;
}

// ─── Context Assembly ─────────────────────────────────────────────────────

export function assembleBuildContext(params: {
  rawRequirements: string;
  semanticSummary?: string;
  ir?: Partial<IRManifest>;
  existingWorkspace: Record<string, string>;
  projectId: string;
  techStack: string;
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
}): BuildContext {
  const hasExisting = Object.keys(params.existingWorkspace).length > 0;
  const extractedIR = extractIRFromRequirements(params.rawRequirements);

  // Merge provided IR with extracted IR (provided takes precedence)
  const mergedIR: IRManifest = {
    entities: params.ir?.entities?.length ? params.ir.entities : extractedIR.entities,
    roles: params.ir?.roles?.length ? params.ir.roles : extractedIR.roles,
    workflows: params.ir?.workflows?.length ? params.ir.workflows : extractedIR.workflows,
    routes: params.ir?.routes?.length ? params.ir.routes : extractedIR.routes,
    modules: params.ir?.modules?.length ? params.ir.modules : extractedIR.modules,
    constraints: [...new Set([...(params.ir?.constraints || []), ...extractedIR.constraints])],
  };

  return {
    rawRequirements: params.rawRequirements,
    semanticSummary: params.semanticSummary || "",
    ir: mergedIR,
    existingWorkspace: params.existingWorkspace,
    buildIntent: detectBuildIntent(params.rawRequirements, hasExisting),
    projectId: params.projectId,
    techStack: params.techStack,
    schemas: params.schemas,
    knowledge: params.knowledge,
    designTheme: params.designTheme,
    model: params.model,
  };
}
