/**
 * Template Schema Extractor
 * 
 * Extracts entities, routes, and components from template file maps
 * to persist as schema identity for hybrid generation.
 */

import type { SchemaEntity, SchemaField, SchemaRelationship, SchemaRoute, SchemaComponent } from "./projectIdentity";

// Known CRM-domain entities and their typical fields
const DOMAIN_ENTITIES: Record<string, SchemaField[]> = {
  contacts: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email", required: false },
    { name: "phone", type: "text", required: false },
    { name: "company", type: "text", required: false },
    { name: "role", type: "text", required: false },
    { name: "status", type: "select", required: false, options: ["active", "inactive", "lead"] },
    { name: "notes", type: "text", required: false },
  ],
  deals: [
    { name: "title", type: "text", required: true },
    { name: "value", type: "number", required: false },
    { name: "stage", type: "select", required: false, options: ["lead", "qualified", "proposal", "negotiation", "won", "lost"] },
    { name: "probability", type: "number", required: false },
    { name: "company", type: "text", required: false },
    { name: "close_date", type: "date", required: false },
    { name: "contact_id", type: "relation", required: false, relationTo: "contacts" },
    { name: "notes", type: "text", required: false },
  ],
  activities: [
    { name: "title", type: "text", required: true },
    { name: "activity_type", type: "select", required: true, options: ["call", "email", "meeting", "task", "note"] },
    { name: "description", type: "text", required: false },
    { name: "scheduled_at", type: "date", required: false },
    { name: "completed", type: "boolean", required: false },
    { name: "contact_id", type: "relation", required: false, relationTo: "contacts" },
    { name: "deal_id", type: "relation", required: false, relationTo: "deals" },
  ],
  accounts: [
    { name: "name", type: "text", required: true },
    { name: "industry", type: "text", required: false },
    { name: "website", type: "url", required: false },
    { name: "revenue", type: "number", required: false },
    { name: "employees", type: "number", required: false },
    { name: "status", type: "select", required: false, options: ["prospect", "customer", "partner", "churned"] },
  ],
  leads: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email", required: false },
    { name: "source", type: "select", required: false, options: ["web", "referral", "cold-call", "social", "event"] },
    { name: "status", type: "select", required: false, options: ["new", "contacted", "qualified", "converted", "lost"] },
    { name: "score", type: "number", required: false },
  ],
};

const DOMAIN_RELATIONSHIPS: SchemaRelationship[] = [
  { type: "belongs_to", from: "deals", to: "contacts", foreignKey: "contact_id" },
  { type: "belongs_to", from: "activities", to: "contacts", foreignKey: "contact_id" },
  { type: "belongs_to", from: "activities", to: "deals", foreignKey: "deal_id" },
  { type: "has_many", from: "contacts", to: "deals" },
  { type: "has_many", from: "contacts", to: "activities" },
  { type: "has_many", from: "deals", to: "activities" },
];

/**
 * Extract entities from template files by scanning for collection references
 * and matching against known domain schemas.
 */
export function extractEntitiesFromTemplate(
  template: { id: string },
  files: Record<string, string>,
): SchemaEntity[] {
  const fileContent = Object.values(files).join("\n");
  const entities: SchemaEntity[] = [];

  // Check each known entity against template content
  for (const [entityName, fields] of Object.entries(DOMAIN_ENTITIES)) {
    // Look for references in API calls, component names, or variable names
    const patterns = [
      new RegExp(`["'/]${entityName}["'\\]]`, "i"),
      new RegExp(`${entityName}Table|${entityName}List|${entityName}Form`, "i"),
      new RegExp(`collection.*${entityName}`, "i"),
      new RegExp(`fetch.*${entityName}`, "i"),
    ];

    if (patterns.some((p) => p.test(fileContent))) {
      const rels = DOMAIN_RELATIONSHIPS.filter(
        (r) => r.from === entityName || r.to === entityName,
      );
      entities.push({ name: entityName, fields, relationships: rels });
    }
  }

  // Fallback: scan for API fetch patterns like /api/project-api?collection=X
  const collectionRx = /collection[=:]["'](\w+)["']/gi;
  let match;
  while ((match = collectionRx.exec(fileContent)) !== null) {
    const name = match[1].toLowerCase();
    if (!entities.find((e) => e.name === name)) {
      entities.push({
        name,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "text", required: false },
          { name: "status", type: "text", required: false },
        ],
        relationships: [],
      });
    }
  }

  return entities;
}

/**
 * Extract routes from template files by scanning App.jsx or router config.
 */
export function extractRoutesFromTemplate(
  files: Record<string, string>,
): SchemaRoute[] {
  const routes: SchemaRoute[] = [];
  const appFile = files["/App.jsx"] || files["/App.tsx"] || files["/src/App.jsx"] || files["/src/App.tsx"] || "";

  // Match navigation items from sidebar/nav components
  const navPatterns = [
    /label:\s*["']([^"']+)["'].*?(?:path|to|href):\s*["']([^"']+)["']/gi,
    /(?:path|to|href):\s*["']([^"']+)["'].*?label:\s*["']([^"']+)["']/gi,
  ];

  const allContent = Object.values(files).join("\n");

  for (const pattern of navPatterns) {
    let m;
    while ((m = pattern.exec(allContent)) !== null) {
      const label = m[1];
      const path = m[2] || `/${label.toLowerCase()}`;
      if (!routes.find((r) => r.path === path)) {
        routes.push({ path, label, isProtected: false });
      }
    }
  }

  // Scan for page-level state switches (e.g., activePage === "Deals")
  const pageRx = /activePage\s*===?\s*["'](\w+)["']/gi;
  let pm;
  while ((pm = pageRx.exec(allContent)) !== null) {
    const label = pm[1];
    const path = `/${label.toLowerCase()}`;
    if (!routes.find((r) => r.label === label)) {
      routes.push({ path, label, isProtected: false });
    }
  }

  // Default route if none found
  if (routes.length === 0) {
    routes.push({ path: "/", label: "Dashboard", isProtected: false });
  }

  return routes;
}

/**
 * Extract component registry from file map.
 */
export function extractComponentsFromTemplate(
  files: Record<string, string>,
): SchemaComponent[] {
  const components: SchemaComponent[] = [];

  for (const filePath of Object.keys(files)) {
    // Only process component files
    if (!filePath.match(/\.(jsx|tsx)$/) || filePath.includes("node_modules")) continue;

    const fileName = filePath.split("/").pop()?.replace(/\.(jsx|tsx)$/, "") || "";
    if (!fileName || fileName === "index") continue;

    // Infer type from name
    let type: SchemaComponent["type"] = "widget";
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes("page") || lowerName === "App") type = "page";
    else if (lowerName.includes("form") || lowerName.includes("modal")) type = "form";
    else if (lowerName.includes("table") || lowerName.includes("list")) type = "list";
    else if (lowerName.includes("detail") || lowerName.includes("view")) type = "detail";
    else if (lowerName.includes("chart") || lowerName.includes("graph")) type = "chart";
    else if (lowerName.includes("sidebar") || lowerName.includes("header") || lowerName.includes("layout")) type = "layout";

    // Infer entity association
    let entity: string | undefined;
    for (const entityName of Object.keys(DOMAIN_ENTITIES)) {
      if (lowerName.includes(entityName.replace(/s$/, ""))) {
        entity = entityName;
        break;
      }
    }

    components.push({ name: fileName, filePath, entity, type });
  }

  return components;
}
