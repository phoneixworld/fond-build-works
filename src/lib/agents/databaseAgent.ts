/**
 * Database Agent — Autonomously detects schema needs from requirements
 * and generates the necessary schema configurations.
 * 
 * This agent runs BEFORE the frontend agent to ensure data models
 * are available for code generation.
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
 * then create them in the project_schemas table.
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
    
    // 4. Check existing schemas
    const { data: existing } = await supabase
      .from("project_schemas")
      .select("collection_name, schema")
      .eq("project_id", ctx.projectId);
    
    const existingNames = new Set((existing || []).map((s: any) => s.collection_name));
    
    // 5. Create new schemas
    const newSchemas = allSchemas.filter(s => !existingNames.has(s.collection));
    
    if (newSchemas.length > 0) {
      const insertData = newSchemas.map(s => ({
        project_id: ctx.projectId,
        collection_name: s.collection,
        schema: {
          fields: s.fields,
          relationships: s.relationships,
        },
      }));
      
      const { error } = await supabase
        .from("project_schemas")
        .insert(insertData as any);
      
      if (error) {
        console.warn("[DatabaseAgent] Schema creation failed:", error);
        return {
          agent: "database",
          status: "failed",
          summary: `Failed to create schemas: ${error.message}`,
          durationMs: performance.now() - start,
        };
      }
    }
    
    // 6. Update existing schemas with new fields
    const updatedCount = await updateExistingSchemas(ctx.projectId, allSchemas, existing || []);
    
    // 7. Update context with new schemas for downstream agents
    if (newSchemas.length > 0 || updatedCount > 0) {
      const { data: refreshed } = await supabase
        .from("project_schemas")
        .select("*")
        .eq("project_id", ctx.projectId);
      
      if (refreshed) {
        ctx.schemas = refreshed;
      }
    }
    
    console.log(`[DatabaseAgent] Created ${newSchemas.length} schemas, updated ${updatedCount}`);
    
    return {
      agent: "database",
      status: "done",
      summary: `Created ${newSchemas.length} schemas, updated ${updatedCount} existing`,
      durationMs: performance.now() - start,
      metadata: {
        created: newSchemas.map(s => s.collection),
        updated: updatedCount,
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
      const entity = match[1].toLowerCase().replace(/s$/, ""); // singularize
      if (!skipWords.has(entity) && entity.length > 2) {
        detected.add(entity);
      }
    }
  }
  
  for (const entity of detected) {
    schemas.push({
      collection: entity,
      fields: inferFieldsForEntity(entity),
      relationships: [],
    });
  }
  
  return schemas;
}

function inferFieldsForEntity(entity: string): SchemaField[] {
  // Common fields for any entity
  const baseFields: SchemaField[] = [
    { name: "name", type: "text", required: true },
    { name: "status", type: "text", required: false, defaultValue: "active" },
    { name: "description", type: "textarea", required: false },
  ];
  
  // Entity-specific fields
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
      // Merge fields
      const fieldNames = new Set(existing.fields.map(f => f.name));
      for (const field of schema.fields) {
        if (!fieldNames.has(field.name)) {
          existing.fields.push(field);
        }
      }
      // Merge relationships
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

async function updateExistingSchemas(
  projectId: string,
  allSchemas: DetectedSchema[],
  existing: any[]
): Promise<number> {
  let updated = 0;
  
  for (const schema of allSchemas) {
    const existingSchema = existing.find((e: any) => e.collection_name === schema.collection);
    if (!existingSchema) continue;
    
    const existingFields = (existingSchema.schema as any)?.fields || [];
    const existingFieldNames = new Set(existingFields.map((f: any) => f.name));
    const newFields = schema.fields.filter(f => !existingFieldNames.has(f.name));
    
    if (newFields.length > 0) {
      const mergedFields = [...existingFields, ...newFields];
      const { error } = await supabase
        .from("project_schemas")
        .update({
          schema: {
            ...(existingSchema.schema as any),
            fields: mergedFields,
          },
        } as any)
        .eq("project_id", projectId)
        .eq("collection_name", schema.collection);
      
      if (!error) updated++;
    }
  }
  
  return updated;
}
