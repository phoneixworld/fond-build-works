/**
 * Schema Agent — Orchestrates schema-first workflow.
 * 
 * Ensures schema planning, validation, and migration happen
 * BEFORE any backend or frontend code generation.
 * 
 * Pipeline:
 * 1. schemaPlan = planSchema(requirements)
 * 2. schemaArtifacts = generateSchema(schemaPlan)
 * 3. validateSchema(schemaArtifacts)
 * 4. Return validated artifacts for downstream agents
 */

import type { AgentResult, PipelineContext } from "./types";
import {
  validateSchemaArtifacts,
  extractSchemaArtifacts,
  type SchemaArtifacts,
  type SchemaValidationResult,
} from "@/lib/schemaValidator";
import { cloudLog } from "@/lib/cloudLogBus";

export interface SchemaPhaseResult extends AgentResult {
  schemaArtifacts?: SchemaArtifacts;
  validationResult?: SchemaValidationResult;
  /** Validated migration SQL ready for execution */
  validatedMigrations?: string;
  /** Validated RLS SQL */
  validatedRls?: string;
  /** Parsed schema.json */
  schemaManifest?: any;
}

const MAX_SCHEMA_REPAIR_ATTEMPTS = 2;

/**
 * Run the schema-first phase gate.
 * Returns validated schema artifacts or blocks the build.
 */
export async function runSchemaPhase(
  ctx: PipelineContext,
  schemaFiles: Record<string, string>
): Promise<SchemaPhaseResult> {
  const start = performance.now();

  cloudLog.info("[SchemaAgent] Starting schema-first validation", "schema");

  // 1. Extract schema artifacts from generated files
  const artifacts = extractSchemaArtifacts(schemaFiles);

  // 2. Validate
  let validation = validateSchemaArtifacts(artifacts);
  let attempts = 0;

  // 3. If invalid, attempt repair
  while (!validation.valid && attempts < MAX_SCHEMA_REPAIR_ATTEMPTS) {
    attempts++;
    cloudLog.warn(
      `[SchemaAgent] Schema validation failed (attempt ${attempts}/${MAX_SCHEMA_REPAIR_ATTEMPTS}): ${validation.errors.join("; ")}`,
      "schema"
    );

    // Auto-repair: add missing RLS
    if (validation.missingRls.length > 0 && artifacts.migrationSql) {
      const repairRls = generateRepairRls(validation.missingRls);
      artifacts.rlsSql = (artifacts.rlsSql || "") + "\n" + repairRls;

      // Also inject into files
      if (artifacts.files) {
        artifacts.files["/migrations/002_rls_repair.sql"] = repairRls;
      }
    }

    // Auto-repair: add IF NOT EXISTS
    if (artifacts.migrationSql && !artifacts.migrationSql.includes("IF NOT EXISTS")) {
      artifacts.migrationSql = artifacts.migrationSql.replace(
        /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi,
        "CREATE TABLE IF NOT EXISTS "
      );
    }

    // Re-validate
    validation = validateSchemaArtifacts(artifacts);
  }

  if (!validation.valid) {
    cloudLog.error(
      `[SchemaAgent] Schema validation FAILED after ${attempts} repair attempts: ${validation.errors.join("; ")}`,
      "schema"
    );
    return {
      agent: "database",
      status: "failed",
      summary: `Schema validation failed: ${validation.errors.join("; ")}`,
      durationMs: performance.now() - start,
      schemaArtifacts: artifacts,
      validationResult: validation,
    };
  }

  cloudLog.info(
    `[SchemaAgent] Schema validated: ${validation.tables.length} tables, ${validation.warnings.length} warnings`,
    "schema"
  );

  return {
    agent: "database",
    status: "done",
    summary: `Schema validated: ${validation.tables.length} tables (${validation.warnings.length} warnings)`,
    durationMs: performance.now() - start,
    files: schemaFiles,
    schemaArtifacts: artifacts,
    validationResult: validation,
    validatedMigrations: artifacts.migrationSql || undefined,
    validatedRls: artifacts.rlsSql || undefined,
    schemaManifest: artifacts.schemaJson || undefined,
  };
}

/**
 * Generate repair RLS SQL for tables missing policies.
 */
function generateRepairRls(missingTables: string[]): string {
  let sql = "-- Auto-generated RLS repair\n\n";
  for (const table of missingTables) {
    sql += `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n\n`;
    sql += `CREATE POLICY "Users can view own ${table}" ON ${table}\n`;
    sql += `  FOR SELECT USING (auth.uid() = user_id);\n\n`;
    sql += `CREATE POLICY "Users can create own ${table}" ON ${table}\n`;
    sql += `  FOR INSERT WITH CHECK (auth.uid() = user_id);\n\n`;
    sql += `CREATE POLICY "Users can update own ${table}" ON ${table}\n`;
    sql += `  FOR UPDATE USING (auth.uid() = user_id);\n\n`;
    sql += `CREATE POLICY "Users can delete own ${table}" ON ${table}\n`;
    sql += `  FOR DELETE USING (auth.uid() = user_id);\n\n`;
  }
  return sql;
}

/**
 * Check if the current intent requires the schema-first gate.
 */
export function requiresSchemaFirstGate(ctx: PipelineContext): boolean {
  const req = ctx.rawRequirements.toLowerCase();
  const schemaKeywords = [
    "auth", "crud", "data", "role", "storage", "table", "database",
    "user", "login", "signup", "permission", "backend", "schema",
    "migration", "persist", "save", "store",
  ];
  return schemaKeywords.some(kw => req.includes(kw));
}
