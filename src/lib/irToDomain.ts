/**
 * IR-to-DomainModel Converter — bridges the IR state to the build engine's
 * DomainModel format, enabling deterministic scaffold generation from
 * user-defined intent without LLM round-trips.
 *
 * This is a zero-latency, pure-function transform.
 */

import type { IRState, IRRoute, IRDataModel, IRField } from "./irTypes";
import type { DomainModel, DomainEntity, DomainField, DomainRelationship, ApiEndpoint } from "./domainTemplates";

// ─── Field Type Mapping ───────────────────────────────────────────────────

const IR_TO_DOMAIN_FIELD_TYPE: Record<IRField["type"], DomainField["type"]> = {
  text: "text",
  number: "number",
  boolean: "boolean",
  date: "datetime",
  json: "json",
  email: "email",
  url: "url",
  select: "select",
  relation: "text", // Relations stored as foreign key strings
};

const IR_FIELD_TO_INPUT_TYPE: Record<IRField["type"], string> = {
  text: "text",
  number: "number",
  boolean: "checkbox",
  date: "date",
  json: "textarea",
  email: "email",
  url: "url",
  select: "select",
  relation: "select", // Rendered as a dropdown of related records
};

// ─── Name Utilities ───────────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function pluralize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith("s")) return lower;
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(lower)) return lower.slice(0, -1) + "ies";
  if (lower.endsWith("ch") || lower.endsWith("sh") || lower.endsWith("x") || lower.endsWith("z")) return lower + "es";
  return lower + "s";
}

// ─── Core Converter ───────────────────────────────────────────────────────

function convertField(field: IRField): DomainField {
  return {
    name: field.name,
    type: IR_TO_DOMAIN_FIELD_TYPE[field.type] || "text",
    required: field.required,
    default: field.defaultValue !== undefined ? field.defaultValue : undefined,
    options: field.options,
  };
}

function convertDataModel(model: IRDataModel, allModels: IRDataModel[]): DomainEntity {
  const entityName = toPascalCase(model.collectionName);
  const pluralName = model.collectionName; // collection names are already plural-ish

  const fields: DomainField[] = model.fields.map(convertField);
  const relationships: DomainRelationship[] = [];

  // Detect relations from fields
  for (const field of model.fields) {
    if (field.type === "relation" && field.relationTo) {
      const target = toPascalCase(field.relationTo);
      relationships.push({
        target,
        type: "belongsTo",
        foreignKey: field.name,
      });
    }
  }

  // Detect reverse relations (other models pointing to this one)
  for (const other of allModels) {
    if (other.id === model.id) continue;
    for (const field of other.fields) {
      if (field.type === "relation" && field.relationTo === model.collectionName) {
        relationships.push({
          target: toPascalCase(other.collectionName),
          type: "hasMany",
        });
      }
    }
  }

  return {
    name: entityName,
    pluralName,
    fields,
    relationships,
    seedCount: Math.min(model.fields.length * 3, 20),
  };
}

function buildApiEndpoints(entities: DomainEntity[]): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  for (const entity of entities) {
    const path = `/${entity.pluralName}`;
    endpoints.push(
      { method: "GET", path, entity: entity.name, action: "list", description: `List all ${entity.pluralName}` },
      { method: "POST", path, entity: entity.name, action: "create", description: `Create ${entity.name}` },
      { method: "GET", path: `${path}/:id`, entity: entity.name, action: "get", description: `Get ${entity.name} by ID` },
      { method: "PUT", path: `${path}/:id`, entity: entity.name, action: "update", description: `Update ${entity.name}` },
      { method: "DELETE", path: `${path}/:id`, entity: entity.name, action: "delete", description: `Delete ${entity.name}` },
    );
  }
  return endpoints;
}

function buildSuggestedPages(routes: IRRoute[], entities: DomainEntity[]): DomainModel["suggestedPages"] {
  const pages: DomainModel["suggestedPages"] = [];

  // From IR routes
  for (const route of routes) {
    const matchedEntity = entities.find(e =>
      route.path.toLowerCase().includes(e.pluralName.toLowerCase()) ||
      route.path.toLowerCase().includes(e.name.toLowerCase())
    );

    let type: "list" | "detail" | "form" | "dashboard" | "static" = "static";
    const pathLower = route.path.toLowerCase();
    const labelLower = route.label.toLowerCase();

    if (pathLower === "/" || pathLower === "/dashboard" || labelLower.includes("dashboard") || labelLower.includes("overview")) {
      type = "dashboard";
    } else if (route.path.includes(":id") || route.path.includes(":")) {
      type = "detail";
    } else if (labelLower.includes("add") || labelLower.includes("create") || labelLower.includes("new") || labelLower.includes("form")) {
      type = "form";
    } else if (matchedEntity) {
      type = "list";
    }

    pages.push({
      path: route.path,
      title: route.label,
      entity: matchedEntity?.name,
      type,
    });

    // Auto-generate detail route if we have a list route for an entity
    if (type === "list" && matchedEntity) {
      const detailPath = `${route.path}/:id`;
      if (!routes.some(r => r.path === detailPath)) {
        pages.push({
          path: detailPath,
          title: `${matchedEntity.name} Detail`,
          entity: matchedEntity.name,
          type: "detail",
        });
      }
    }

    // Recurse into children
    if (route.children?.length) {
      for (const child of route.children) {
        const childEntity = entities.find(e =>
          child.path.toLowerCase().includes(e.pluralName.toLowerCase())
        );
        pages.push({
          path: child.path,
          title: child.label,
          entity: childEntity?.name,
          type: child.path.includes(":") ? "detail" : childEntity ? "list" : "static",
        });
      }
    }
  }

  // Ensure entities without routes get list pages
  for (const entity of entities) {
    const hasPage = pages.some(p => p.entity === entity.name);
    if (!hasPage) {
      pages.push({
        path: `/${entity.pluralName}`,
        title: entity.name + "s",
        entity: entity.name,
        type: "list",
      });
    }
  }

  return pages;
}

function buildSuggestedNavItems(routes: IRRoute[], entities: DomainEntity[]): DomainModel["suggestedNavItems"] {
  const navItems: DomainModel["suggestedNavItems"] = [];

  for (const route of routes) {
    if (route.path.includes(":")) continue; // Skip detail routes
    navItems.push({
      label: route.label,
      path: route.path,
      icon: route.icon || "LayoutDashboard",
    });
  }

  // Add nav items for entities without routes
  for (const entity of entities) {
    const hasNav = navItems.some(n => n.path.includes(entity.pluralName));
    if (!hasNav) {
      navItems.push({
        label: toPascalCase(entity.pluralName),
        path: `/${entity.pluralName}`,
        icon: "List",
      });
    }
  }

  return navItems;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Converts an IRState into a DomainModel for the build engine.
 * Returns null if the IR has no meaningful content (no models, ≤1 route).
 * 
 * This is a pure, synchronous function — zero latency, zero network calls.
 */
export function irToDomainModel(ir: IRState | null | undefined): DomainModel | null {
  if (!ir) return null;

  const hasModels = (ir.dataModels?.length || 0) > 0;
  const hasRoutes = (ir.routes?.length || 0) > 1;
  const hasAuth = ir.auth?.enabled === true;

  // Need at least data models OR multiple routes to justify a domain model
  if (!hasModels && !hasRoutes) return null;

  const entities = (ir.dataModels || []).map(m => convertDataModel(m, ir.dataModels || []));
  const apiEndpoints = buildApiEndpoints(entities);
  const suggestedPages = buildSuggestedPages(ir.routes || [], entities);
  const suggestedNavItems = buildSuggestedNavItems(ir.routes || [], entities);

  const appName = ir.metadata?.appName || "App";

  return {
    templateId: `ir-${appName.toLowerCase().replace(/\s+/g, "-")}`,
    templateName: appName,
    entities,
    requiresAuth: hasAuth,
    apiEndpoints,
    suggestedPages,
    suggestedNavItems,
  };
}

/**
 * Generates a file manifest from the IR — exact file paths and component names
 * that the build engine should produce. Used to constrain LLM output.
 */
export function generateFileManifest(ir: IRState | null | undefined): string {
  if (!ir) return "";

  const files: string[] = [];
  const routes = ir.routes || [];
  const models = ir.dataModels || [];

  // Entry point
  files.push("/App.tsx");
  files.push("/layout/AppLayout.tsx");
  files.push("/layout/Sidebar.tsx");

  // Pages from routes
  for (const route of routes) {
    if (route.path.includes(":")) continue;
    const pageName = toPascalCase(route.label.replace(/[^a-zA-Z0-9\s]/g, ""));
    files.push(`/pages/${pageName}/${pageName}.tsx`);
  }

  // CRUD pages + hooks for data models
  for (const model of models) {
    const name = toPascalCase(model.collectionName);
    const plural = pluralize(name);
    files.push(`/pages/${name}/${name}List.tsx`);
    files.push(`/pages/${name}/${name}Detail.tsx`);
    files.push(`/pages/${name}/${name}Form.tsx`);
    files.push(`/hooks/use${name}.ts`);
    files.push(`/data/${toCamelCase(name)}Columns.ts`);
  }

  // Auth files
  if (ir.auth?.enabled) {
    files.push("/contexts/AuthContext.tsx");
    files.push("/components/ProtectedRoute.tsx");
    files.push("/pages/Login/Login.tsx");
    files.push("/pages/Signup/Signup.tsx");
  }

  // Shared UI
  files.push("/components/ui/Card.tsx");
  files.push("/components/ui/Button.tsx");
  files.push("/components/ui/Modal.tsx");
  files.push("/components/ui/DataTable.tsx");
  files.push("/components/ui/Toast.tsx");
  files.push("/components/ui/Spinner.tsx");
  files.push("/hooks/useApi.ts");
  files.push("/styles/globals.css");

  return files.join("\n");
}

/**
 * Generates field-to-input-type mapping for form generation.
 * Gives the LLM exact instructions on what form controls to use.
 */
export function generateFieldInputMap(models: IRDataModel[]): string {
  if (!models.length) return "";

  const sections: string[] = [];

  for (const model of models) {
    const name = toPascalCase(model.collectionName);
    const fieldLines = model.fields.map(f => {
      const inputType = IR_FIELD_TO_INPUT_TYPE[f.type] || "text";
      let line = `  - ${f.name}: <input type="${inputType}"`;
      if (f.required) line += ` required`;
      if (f.validation?.min !== undefined) line += ` min="${f.validation.min}"`;
      if (f.validation?.max !== undefined) line += ` max="${f.validation.max}"`;
      if (f.validation?.pattern) line += ` pattern="${f.validation.pattern}"`;
      if (f.type === "select" && f.options?.length) line += ` options={${JSON.stringify(f.options)}}`;
      if (f.type === "relation" && f.relationTo) line += ` → fetch options from "${f.relationTo}" collection`;
      if (f.defaultValue !== undefined) line += ` defaultValue="${f.defaultValue}"`;
      line += ` />`;
      if (f.validation?.message) line += ` // Error: "${f.validation.message}"`;
      return line;
    });

    sections.push(`### ${name}Form fields:\n${fieldLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * Generates the import map — exactly which components import what.
 * Constrains the LLM to use consistent import paths.
 */
export function generateImportMap(ir: IRState): string {
  const lines: string[] = [];

  lines.push("## IMPORT MAP (use EXACTLY these paths)");
  lines.push('- App.jsx: import AppLayout from "./layout/AppLayout"');
  lines.push('- AppLayout.jsx: import Sidebar from "./Sidebar", import { Outlet } from "react-router-dom"');

  for (const model of ir.dataModels || []) {
    const name = toPascalCase(model.collectionName);
    lines.push(`- ${name}List.jsx: import use${name} from "../../hooks/use${name}", import DataTable from "../../components/ui/DataTable"`);
    lines.push(`- ${name}Form.jsx: import use${name} from "../../hooks/use${name}", import { showToast } from "../../components/ui/Toast"`);
  }

  if (ir.auth?.enabled) {
    lines.push('- ProtectedRoute.jsx: import { useAuth } from "../contexts/AuthContext"');
    lines.push('- Login.jsx: import { useAuth } from "../../contexts/AuthContext"');
  }

  return lines.join("\n");
}
