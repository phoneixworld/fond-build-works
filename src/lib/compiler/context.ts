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

export function detectBuildIntent(
  rawRequirements: string,
  hasExistingWorkspace: boolean
): BuildIntent {
  if (FIX_PATTERNS.test(rawRequirements)) return "fix";
  if (REFACTOR_PATTERNS.test(rawRequirements)) return "refactor";
  if (hasExistingWorkspace && EXTEND_PATTERNS.test(rawRequirements)) return "extend";
  if (hasExistingWorkspace) return "extend";
  return "new_app";
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
