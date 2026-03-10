/**
 * IR Serializer — Converts IR JSON into structured prompt sections
 * that are injected into the build-agent system prompt.
 * 
 * Enterprise-grade: produces exact file manifests, component names,
 * import maps, and field-to-input-type mappings so the LLM generates
 * near-identical code on every run.
 */

import type { IRState, IRRoute, IRDataModel, IRAuthConfig } from "./irTypes";
import { generateFileManifest, generateFieldInputMap, generateImportMap } from "./irToDomain";

// ─── Route Serialization ──────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase());
}

function serializeRoute(route: IRRoute, depth = 0): string {
  const indent = "  ".repeat(depth);
  const protect = route.isProtected ? " [PROTECTED]" : "";
  const icon = route.icon ? ` icon={${route.icon}}` : "";
  const desc = route.description ? ` — ${route.description}` : "";
  
  // Generate exact component path for deterministic output
  const pageName = toPascalCase(route.label);
  const componentPath = route.component || `/pages/${pageName}/${pageName}.jsx`;
  
  let line = `${indent}- ${route.path} → "${route.label}"${icon}${protect}${desc}`;
  line += `\n${indent}  Component: ${componentPath}`;
  
  if (route.children?.length) {
    line += "\n" + route.children.map(c => serializeRoute(c, depth + 1)).join("\n");
  }
  return line;
}

function serializeRoutes(routes: IRRoute[]): string {
  if (!routes.length) return "";
  
  // Build exact Route JSX snippet
  const routeLines = routes
    .filter(r => !r.path.includes(":"))
    .map(r => {
      const pageName = toPascalCase(r.label);
      const path = r.path === "/" ? 'index' : `path="${r.path.replace(/^\//, "")}"`;
      return `  <Route ${path} element={<${pageName} />} />`;
    }).join("\n");

  return `## APPLICATION ROUTES (MANDATORY — implement ALL routes)
${routes.map(r => serializeRoute(r)).join("\n")}

### Exact Route JSX (copy into App.jsx):
\`\`\`jsx
<Route path="/" element={<AppLayout />}>
${routeLines}
  <Route path="*" element={<Navigate to="${routes[0]?.path || "/"}" />} />
</Route>
\`\`\`

RULES:
- Every route MUST have a fully implemented page component at the exact path shown
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
    if (f.displayInList) line += " [show in table]";
    if (f.searchable) line += " [searchable]";
    return line;
  }).join("\n");

  const extras: string[] = [];
  if (model.timestamps) extras.push("auto timestamps");
  if (model.softDelete) extras.push("soft delete");
  if (model.defaultSort) extras.push(`default sort: ${model.defaultSort.field} ${model.defaultSort.direction}`);

  // Generate exact file paths for this model
  const name = toPascalCase(model.collectionName);
  const fileManifest = [
    `/pages/${name}/${name}List.jsx — DataTable + search + filter + pagination`,
    `/pages/${name}/${name}Detail.jsx — Full record view with edit/delete`,
    `/pages/${name}/${name}Form.jsx — Create/edit form with validation`,
    `/hooks/use${name}.js — CRUD hook (list, create, update, delete)`,
  ].map(f => `    ${f}`).join("\n");

  return `### Collection: "${model.collectionName}"${model.description ? ` — ${model.description}` : ""}
${fields}${extras.length ? `\n  [${extras.join(", ")}]` : ""}
  Files to generate:
${fileManifest}`;
}

function serializeDataModels(models: IRDataModel[]): string {
  if (!models.length) return "";
  
  // List columns for each model
  const listColumns = models.map(m => {
    const name = toPascalCase(m.collectionName);
    const displayFields = m.fields.filter(f => f.displayInList !== false).slice(0, 6);
    const cols = displayFields.map(f => `{ key: "${f.name}", label: "${f.name.charAt(0).toUpperCase() + f.name.slice(1)}" }`);
    return `  ${name}: [${cols.join(", ")}]`;
  }).join("\n");

  return `## DATA MODELS (use Data API for ALL collections)
${models.map(m => serializeDataModel(m)).join("\n\n")}

### Table columns for list views:
${listColumns}

RULES:
- Create full CRUD for EACH collection (list, create, edit, delete)
- List views: search, filter, sort, pagination, empty states
- Forms: validation matching field constraints, loading states, toast feedback
- Relations: fetch related data and display inline
- Use /hooks/use<Entity>.js for ALL data fetching — NEVER hardcode mock data`;
}

// ─── Auth Serialization ───────────────────────────────────────────────────

function serializeAuth(auth: IRAuthConfig | undefined | null): string {
  if (!auth || !auth.enabled) return "";

  let section = `## AUTHENTICATION & AUTHORIZATION (MANDATORY)
- Provider: ${auth.provider}
- Email verification: ${auth.requireEmailVerification ? "required" : "optional"}
- Public routes: ${auth.publicRoutes.join(", ") || "none"}

### Files to generate:
  /contexts/AuthContext.jsx — login/signup/logout + session state
  /components/ProtectedRoute.jsx — route wrapper checking auth
  /pages/Login/Login.jsx — login form with email + password
  /pages/Signup/Signup.jsx — signup form with validation`;

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
- Implement AuthContext with login/signup/logout via project-auth API
- ProtectedRoute wrapper for non-public routes
- Role-based access: check permissions before showing actions
- Login/Signup pages with proper form validation
- Persist auth state in AuthContext (no localStorage for role checks)`;

  return section;
}

// ─── Main Serializer ──────────────────────────────────────────────────────

/**
 * Serializes an IR state into structured, deterministic prompt sections.
 * Includes exact file manifests, component names, import maps, and
 * field-to-input-type mappings for near-identical LLM output every time.
 * 
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
  
  // Routes (with exact component paths)
  const routeSection = serializeRoutes(ir.routes || []);
  if (routeSection) sections.push(routeSection);
  
  // Data Models (with file manifests per model)
  const modelSection = serializeDataModels(ir.dataModels || []);
  if (modelSection) sections.push(modelSection);
  
  // Auth (with exact auth file paths)
  const authSection = serializeAuth(ir.auth);
  if (authSection) sections.push(authSection);
  
  // Field-to-input mappings for form generation
  if (ir.dataModels?.length) {
    const fieldMap = generateFieldInputMap(ir.dataModels);
    if (fieldMap) {
      sections.push(`## FORM FIELD SPECIFICATIONS\n${fieldMap}`);
    }
  }
  
  // Import map for consistent cross-file imports
  const importMap = generateImportMap(ir);
  if (importMap) sections.push(importMap);
  
  // Complete file manifest
  const manifest = generateFileManifest(ir);
  if (manifest) {
    sections.push(`## FILE MANIFEST (generate EXACTLY these files)\n${manifest}`);
  }
  
  if (!sections.length) return "";
  
  return `\n\n# ═══ INTERMEDIATE REPRESENTATION (IR) — DETERMINISTIC SPEC ═══
# The following sections define the application's exact structure.
# Implement EVERY item exactly as specified. Do NOT skip, simplify, or rename.
# Use the EXACT file paths, component names, and import paths shown.

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
