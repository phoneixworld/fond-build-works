/**
 * IR Serializer — Converts IR JSON into structured prompt sections
 * that are injected into the build-agent system prompt.
 * 
 * This is the bridge between visual IR editing and code generation.
 */

import type { IRState, IRRoute, IRDataModel, IRAuthConfig } from "./irTypes";

// ─── Route Serialization ──────────────────────────────────────────────────

function serializeRoute(route: IRRoute, depth = 0): string {
  const indent = "  ".repeat(depth);
  const protect = route.isProtected ? " [PROTECTED]" : "";
  const icon = route.icon ? ` icon={${route.icon}}` : "";
  const desc = route.description ? ` — ${route.description}` : "";
  let line = `${indent}- ${route.path} → "${route.label}"${icon}${protect}${desc}`;
  
  if (route.children?.length) {
    line += "\n" + route.children.map(c => serializeRoute(c, depth + 1)).join("\n");
  }
  return line;
}

function serializeRoutes(routes: IRRoute[]): string {
  if (!routes.length) return "";
  
  return `## APPLICATION ROUTES (MANDATORY — implement ALL routes)
${routes.map(r => serializeRoute(r)).join("\n")}

RULES:
- Every route MUST have a fully implemented page component
- Use HashRouter with nested <Route> elements
- Add ALL routes to the sidebar/navigation
- Protected routes require auth wrapper`;
}

// ─── Data Model Serialization ─────────────────────────────────────────────

function serializeDataModel(model: IRDataModel): string {
  const fields = model.fields.map(f => {
    let line = `  - ${f.name}: ${f.type}`;
    if (f.required) line += " (required)";
    if (f.defaultValue) line += ` [default: ${f.defaultValue}]`;
    if (f.options?.length) line += ` [options: ${f.options.join(", ")}]`;
    if (f.relationTo) line += ` → ${f.relationTo}`;
    if (f.validation) {
      const parts: string[] = [];
      if (f.validation.min !== undefined) parts.push(`min:${f.validation.min}`);
      if (f.validation.max !== undefined) parts.push(`max:${f.validation.max}`);
      if (f.validation.pattern) parts.push(`pattern:${f.validation.pattern}`);
      if (parts.length) line += ` {${parts.join(", ")}}`;
    }
    return line;
  }).join("\n");

  const extras: string[] = [];
  if (model.timestamps) extras.push("auto timestamps");
  if (model.softDelete) extras.push("soft delete");
  if (model.defaultSort) extras.push(`default sort: ${model.defaultSort.field} ${model.defaultSort.direction}`);

  return `### Collection: "${model.collectionName}"${model.description ? ` — ${model.description}` : ""}
${fields}${extras.length ? `\n  [${extras.join(", ")}]` : ""}`;
}

function serializeDataModels(models: IRDataModel[]): string {
  if (!models.length) return "";
  
  return `## DATA MODELS (use Data API for ALL collections)
${models.map(m => serializeDataModel(m)).join("\n\n")}

RULES:
- Create full CRUD for EACH collection (list, create, edit, delete)
- List views: search, filter, sort, pagination, empty states
- Forms: validation matching field constraints, loading states, toast feedback
- Relations: fetch related data and display inline`;
}

// ─── Auth Serialization ───────────────────────────────────────────────────

function serializeAuth(auth: IRAuthConfig): string {
  if (!auth.enabled) return "";

  let section = `## AUTHENTICATION & AUTHORIZATION (MANDATORY)
- Provider: ${auth.provider}
- Email verification: ${auth.requireEmailVerification ? "required" : "optional"}
- Public routes: ${auth.publicRoutes.join(", ") || "none"}`;

  if (auth.roles.length) {
    section += `\n\n### Roles:
${auth.roles.map(r => `- ${r.name}: ${r.description}`).join("\n")}`;
  }

  if (auth.permissions.length) {
    section += `\n\n### Permissions:
${auth.permissions.map(p => {
  const role = auth.roles.find(r => r.id === p.roleId)?.name || p.roleId;
  return `- ${role} can ${p.actions.join(", ")} on "${p.resource}"`;
}).join("\n")}`;
  }

  section += `\n
RULES:
- Implement AuthContext with login/signup/logout
- ProtectedRoute wrapper for non-public routes
- Role-based access: check permissions before showing actions
- Login/Signup pages with proper form validation`;

  return section;
}

// ─── Main Serializer ──────────────────────────────────────────────────────

/**
 * Serializes an IR state into prompt sections for the build agent.
 * Returns empty string if IR is empty/default.
 */
export function serializeIR(ir: IRState | null | undefined): string {
  if (!ir) return "";
  
  const sections: string[] = [];
  
  // Metadata
  if (ir.metadata?.appName || ir.metadata?.description) {
    sections.push(`## APPLICATION INTENT
- Name: ${ir.metadata.appName || "Untitled"}
- Description: ${ir.metadata.description || "No description"}
${ir.metadata.theme ? `- Design theme: ${ir.metadata.theme}` : ""}`);
  }
  
  // Routes
  const routeSection = serializeRoutes(ir.routes || []);
  if (routeSection) sections.push(routeSection);
  
  // Data Models
  const modelSection = serializeDataModels(ir.dataModels || []);
  if (modelSection) sections.push(modelSection);
  
  // Auth
  const authSection = serializeAuth(ir.auth);
  if (authSection) sections.push(authSection);
  
  if (!sections.length) return "";
  
  return `\n\n# ═══ INTERMEDIATE REPRESENTATION (IR) ═══
# The following sections define the application's intent.
# Implement EVERY item exactly as specified. Do NOT skip or simplify.

${sections.join("\n\n")}

# ═══ END IR ═══`;
}

/**
 * Checks if an IR state has meaningful content beyond defaults.
 */
export function hasIRContent(ir: IRState | null | undefined): boolean {
  if (!ir) return false;
  const hasRoutes = (ir.routes?.length || 0) > 1; // more than just default dashboard
  const hasModels = (ir.dataModels?.length || 0) > 0;
  const hasAuth = ir.auth?.enabled === true;
  return hasRoutes || hasModels || hasAuth;
}
