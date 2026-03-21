/**
 * Database Agent — Creates REAL Postgres tables per project
 * via the project-db edge function, replacing the document-store pattern.
 */

import type { AgentResult, PipelineContext } from "./types";
import { supabase } from "@/integrations/supabase/client";

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

interface DetectedSchema {
  collection: string;
  fields: SchemaField[];
  relationships: Array<{ target: string; type: string }>;
}

/**
 * Analyze requirements and IR to detect needed schemas,
 * then create REAL tables via project-db edge function.
 */
export async function runDatabaseAgent(ctx: PipelineContext): Promise<AgentResult> {
  const start = performance.now();

  try {
    // 1. Detect schemas from IR entities
    const detectedSchemas = detectSchemasFromIR(ctx);

    // 2. Detect additional schemas from raw requirements
    const inferredSchemas = inferSchemasFromText(ctx.rawRequirements);

    // 3. Merge and deduplicate
    const allSchemas = mergeSchemas(detectedSchemas, inferredSchemas);

    if (allSchemas.length === 0) {
      return {
        agent: "database",
        status: "done",
        summary: "No schema changes needed",
        durationMs: performance.now() - start,
      };
    }

    // 4. Check existing real tables for this project
    const { data: existingTables } = await supabase
      .from("project_tables")
      .select("table_name, full_table_name, columns")
      .eq("project_id", ctx.projectId);

    const existingNames = new Set((existingTables || []).map((t: any) => t.table_name));

    // 5. Filter to only new schemas
    const newSchemas = allSchemas.filter(s => !existingNames.has(s.collection));

    if (newSchemas.length === 0) {
      // Attach existing table mappings to context for code gen
      ctx.tableMappings = buildTableMappings(existingTables || []);
      return {
        agent: "database",
        status: "done",
        summary: `All ${allSchemas.length} tables already exist`,
        durationMs: performance.now() - start,
        metadata: { tableMappings: ctx.tableMappings },
      };
    }

    // 6. Create REAL tables via project-db edge function
    const tableDefs = newSchemas.map(s => ({
      name: s.collection,
      columns: s.fields,
    }));

    console.log(`[DatabaseAgent] Creating ${tableDefs.length} real tables:`, tableDefs.map(t => t.name));

    const { data: result, error } = await supabase.functions.invoke("project-db", {
      body: {
        project_id: ctx.projectId,
        action: "provision",
        tables: tableDefs,
      },
    });

    if (error) {
      console.warn("[DatabaseAgent] Table creation failed:", error);
      return {
        agent: "database",
        status: "failed",
        summary: `Failed to create tables: ${error.message}`,
        durationMs: performance.now() - start,
      };
    }

    // 7. Also store in project_schemas for backward compatibility
    const insertData = newSchemas.map(s => ({
      project_id: ctx.projectId,
      collection_name: s.collection,
      schema: {
        fields: s.fields,
        relationships: s.relationships,
      },
    }));

    await supabase
      .from("project_schemas")
      .insert(insertData as any);

    // 8. Refresh table mappings for downstream agents
    const { data: refreshedTables } = await supabase
      .from("project_tables")
      .select("table_name, full_table_name, columns")
      .eq("project_id", ctx.projectId);

    ctx.tableMappings = buildTableMappings(refreshedTables || []);

    const created = result?.data?.results?.filter((r: any) => r.success) || [];
    console.log(`[DatabaseAgent] Created ${created.length} real Postgres tables`);

    return {
      agent: "database",
      status: "done",
      summary: `Created ${created.length} real tables: ${created.map((r: any) => r.name).join(", ")}`,
      durationMs: performance.now() - start,
      metadata: {
        created: created.map((r: any) => r.name),
        tableMappings: ctx.tableMappings,
        total: allSchemas.length,
      },
    };
  } catch (err: any) {
    return {
      agent: "database",
      status: "failed",
      summary: `Database agent error: ${err.message}`,
      durationMs: performance.now() - start,
    };
  }
}

/** Build a mapping from logical name → real Postgres table name */
function buildTableMappings(tables: any[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  for (const t of tables) {
    mappings[t.table_name] = t.full_table_name;
  }
  return mappings;
}

function detectSchemasFromIR(ctx: PipelineContext): DetectedSchema[] {
  const entities = ctx.ir?.entities || [];
  return entities.map((entity: any) => ({
    collection: entity.name.toLowerCase().replace(/\s+/g, "_"),
    fields: (entity.fields || []).map((f: any) => ({
      name: f.name,
      type: inferFieldType(f.name, f.type),
      required: f.required || false,
    })),
    relationships: (entity.relationships || []).map((r: any) => ({
      target: r.target.toLowerCase().replace(/\s+/g, "_"),
      type: r.type || "one-to-many",
    })),
  }));
}

/**
 * Denylist of words that should NEVER become database tables.
 * These commonly appear in error messages, status reports, and diagnostic text.
 */
const ENTITY_DENYLIST = new Set([
  // Diagnostic noise
  "blank", "missing", "these", "error", "stack", "route", "warning",
  "broken", "crash", "issue", "fix", "bug", "fail", "failed", "undefined",
  "null", "invalid", "unknown", "empty", "stub", "placeholder", "todo",
  // Generic non-entity words
  "complete", "comprehensive", "build", "check", "done", "step", "next",
  "more", "implement", "state", "dynamic", "basic", "dedicated", "go",
]);

function inferSchemasFromText(text: string): DetectedSchema[] {
  const schemas: DetectedSchema[] = [];
  const entityPatterns = [
    /manage\s+(\w+)/gi,
    /(\w+)\s+management/gi,
    /(\w+)\s+(?:list|table|dashboard|page)/gi,
    /track\s+(\w+)/gi,
    /(?:add|create|edit|delete)\s+(\w+)/gi,
  ];

  const detected = new Set<string>();
  const skipWords = new Set([
    "app", "application", "system", "platform", "website", "page", "the",
    "a", "an", "my", "your", "this", "that", "new", "all", "each", "data",
    "feature", "dashboard", "home", "settings", "profile", "login", "signup",
  ]);

  for (const pattern of entityPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const entity = match[1].toLowerCase().replace(/s$/, "");
      if (!skipWords.has(entity) && !ENTITY_DENYLIST.has(entity) && entity.length > 2) {
        detected.add(entity);
      }
    }
  }

  for (const entity of detected) {
    // Final guard: reject if entity name is in the denylist
    if (ENTITY_DENYLIST.has(entity)) continue;
    schemas.push({
      collection: entity,
      fields: inferFieldsForEntity(entity),
      relationships: [],
    });
  }

  return schemas;
}

function inferFieldsForEntity(entity: string): SchemaField[] {
  const baseFields: SchemaField[] = [
    { name: "name", type: "text", required: true },
    { name: "status", type: "text", required: false, defaultValue: "active" },
    { name: "description", type: "textarea", required: false },
  ];

  const entityFields: Record<string, SchemaField[]> = {
    contact: [
      { name: "email", type: "email", required: true },
      { name: "phone", type: "phone", required: false },
      { name: "company", type: "text", required: false },
    ],
    product: [
      { name: "price", type: "number", required: true },
      { name: "category", type: "text", required: false },
      { name: "sku", type: "text", required: false },
    ],
    order: [
      { name: "total", type: "number", required: true },
      { name: "customer_email", type: "email", required: true },
      { name: "order_date", type: "datetime", required: true },
    ],
    student: [
      { name: "email", type: "email", required: true },
      { name: "grade", type: "text", required: false },
      { name: "enrollment_date", type: "datetime", required: false },
    ],
    teacher: [
      { name: "email", type: "email", required: true },
      { name: "subject", type: "text", required: false },
      { name: "department", type: "text", required: false },
    ],
    employee: [
      { name: "email", type: "email", required: true },
      { name: "department", type: "text", required: false },
      { name: "position", type: "text", required: false },
      { name: "salary", type: "number", required: false },
    ],
    task: [
      { name: "priority", type: "text", required: false, defaultValue: "medium" },
      { name: "due_date", type: "datetime", required: false },
      { name: "assigned_to", type: "text", required: false },
    ],
    invoice: [
      { name: "amount", type: "number", required: true },
      { name: "due_date", type: "datetime", required: true },
      { name: "client_email", type: "email", required: true },
    ],
  };

  return [...baseFields, ...(entityFields[entity] || [])];
}

function inferFieldType(name: string, providedType?: string): string {
  if (providedType && providedType !== "string") return providedType;
  const n = name.toLowerCase();
  if (n.includes("email")) return "email";
  if (n.includes("phone") || n.includes("mobile")) return "phone";
  if (n.includes("date") || n.includes("_at") || n.includes("time")) return "datetime";
  if (n.includes("price") || n.includes("amount") || n.includes("total") || n.includes("salary") || n.includes("cost")) return "number";
  if (n.includes("count") || n.includes("quantity") || n.includes("age")) return "number";
  if (n.includes("is_") || n.includes("has_") || n.includes("active") || n.includes("enabled")) return "boolean";
  if (n.includes("description") || n.includes("notes") || n.includes("bio") || n.includes("content")) return "textarea";
  if (n.includes("url") || n.includes("link") || n.includes("website")) return "url";
  if (n.includes("image") || n.includes("avatar") || n.includes("photo")) return "url";
  return "text";
}

function mergeSchemas(a: DetectedSchema[], b: DetectedSchema[]): DetectedSchema[] {
  const map = new Map<string, DetectedSchema>();
  for (const schema of [...a, ...b]) {
    const existing = map.get(schema.collection);
    if (existing) {
      const fieldNames = new Set(existing.fields.map(f => f.name));
      for (const field of schema.fields) {
        if (!fieldNames.has(field.name)) {
          existing.fields.push(field);
        }
      }
      const relTargets = new Set(existing.relationships.map(r => r.target));
      for (const rel of schema.relationships) {
        if (!relTargets.has(rel.target)) {
          existing.relationships.push(rel);
        }
      }
    } else {
      map.set(schema.collection, { ...schema });
    }
  }
  return [...map.values()];
}
