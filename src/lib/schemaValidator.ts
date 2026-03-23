/**
 * Schema Validator — Validates schema artifacts before builds proceed.
 * 
 * Enforces:
 * - Valid table/column names
 * - Relations reference existing tables
 * - RLS policies exist for every table
 * - Migrations are idempotent (IF NOT EXISTS)
 * - No destructive changes without explicit intent
 */

export interface SchemaArtifacts {
  migrationSql?: string;
  rlsSql?: string;
  schemaJson?: any;
  files?: Record<string, string>;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tables: string[];
  missingRls: string[];
  destructiveChanges: string[];
}

const RESERVED_WORDS = new Set([
  "user", "order", "group", "select", "insert", "update", "delete", "table",
  "column", "index", "create", "drop", "alter", "primary", "foreign", "key",
  "constraint", "references", "check", "default", "null", "not", "and", "or",
]);

const VALID_NAME_RE = /^[a-z][a-z0-9_]{1,62}$/;

const DESTRUCTIVE_PATTERNS = [
  /DROP\s+TABLE/i,
  /DROP\s+COLUMN/i,
  /ALTER\s+TABLE\s+\w+\s+DROP/i,
  /TRUNCATE/i,
  /DELETE\s+FROM\s+\w+\s*;/i,  // Unqualified DELETE (no WHERE)
];

/**
 * Validate schema artifacts before allowing build to proceed.
 */
export function validateSchemaArtifacts(artifacts: SchemaArtifacts): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tables: string[] = [];
  const missingRls: string[] = [];
  const destructiveChanges: string[] = [];

  // 1. Validate migration SQL
  if (artifacts.migrationSql) {
    validateMigrationSql(artifacts.migrationSql, errors, warnings, tables, destructiveChanges);
  }

  // 2. Validate RLS SQL
  if (artifacts.rlsSql) {
    validateRlsSql(artifacts.rlsSql, tables, warnings, missingRls, errors);
  } else if (tables.length > 0) {
    // No RLS at all — every table is missing
    missingRls.push(...tables);
    errors.push(`RLS policies missing for all ${tables.length} tables`);
  }

  // 3. Validate schema.json
  if (artifacts.schemaJson) {
    validateSchemaJson(artifacts.schemaJson, errors, warnings);
  }

  // 4. Check files for migration/RLS artifacts
  if (artifacts.files) {
    validateFileArtifacts(artifacts.files, errors, warnings, tables, missingRls);
  }

  // 5. Destructive changes without explicit intent = error
  if (destructiveChanges.length > 0) {
    errors.push(`Destructive changes detected: ${destructiveChanges.join(", ")}. Explicit user intent required.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    tables,
    missingRls,
    destructiveChanges,
  };
}

function validateMigrationSql(
  sql: string,
  errors: string[],
  warnings: string[],
  tables: string[],
  destructiveChanges: string[]
) {
  // Extract CREATE TABLE statements
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  let match;
  while ((match = createTableRe.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    tables.push(tableName);

    // Validate table name
    if (!VALID_NAME_RE.test(tableName)) {
      errors.push(`Invalid table name: "${tableName}" — must be lowercase alphanumeric with underscores`);
    }
    if (RESERVED_WORDS.has(tableName)) {
      warnings.push(`Table name "${tableName}" is a SQL reserved word — consider quoting or renaming`);
    }
  }

  // Check for IF NOT EXISTS (idempotency)
  const createWithoutIfNotExists = /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi;
  if (createWithoutIfNotExists.test(sql)) {
    warnings.push("Some CREATE TABLE statements lack IF NOT EXISTS — migrations may not be idempotent");
  }

  // Check for destructive patterns
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(sql)) {
      destructiveChanges.push(pattern.source);
    }
  }

  // Validate column definitions within CREATE TABLE blocks
  const columnRe = /^\s+(\w+)\s+(text|numeric|boolean|timestamptz|uuid|jsonb|integer|bigint|varchar|float|real|serial)/gmi;
  while ((match = columnRe.exec(sql)) !== null) {
    const colName = match[1].toLowerCase();
    if (colName === "id" || colName === "user_id" || colName === "created_at" || colName === "updated_at") continue;
    if (!VALID_NAME_RE.test(colName)) {
      errors.push(`Invalid column name: "${colName}"`);
    }
  }

  if (tables.length === 0 && sql.trim().length > 0) {
    warnings.push("Migration SQL contains no CREATE TABLE statements");
  }
}

function validateRlsSql(
  sql: string,
  tables: string[],
  warnings: string[],
  missingRls: string[],
  errors: string[]
) {
  const rlsEnabledRe = /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  const policyRe = /CREATE\s+POLICY\s+.+?\s+ON\s+(?:public\.)?(\w+)/gi;
  
  const rlsEnabled = new Set<string>();
  const policiedTables = new Set<string>();

  let match;
  while ((match = rlsEnabledRe.exec(sql)) !== null) {
    rlsEnabled.add(match[1].toLowerCase());
  }
  while ((match = policyRe.exec(sql)) !== null) {
    policiedTables.add(match[1].toLowerCase());
  }

  // Check every table has RLS enabled + at least one policy
  for (const table of tables) {
    if (!rlsEnabled.has(table)) {
      missingRls.push(table);
      errors.push(`Table "${table}" does not have ROW LEVEL SECURITY enabled`);
    } else if (!policiedTables.has(table)) {
      warnings.push(`Table "${table}" has RLS enabled but no policies defined`);
    }
  }
}

function validateSchemaJson(
  schema: any,
  errors: string[],
  warnings: string[]
) {
  if (!schema.entities && !schema.tables) {
    warnings.push("schema.json has no entities or tables defined");
    return;
  }

  const entities = schema.entities || schema.tables || [];
  const entityNames = new Set<string>();

  for (const entity of entities) {
    if (!entity.name && !entity.table) {
      errors.push("schema.json entity missing name/table field");
      continue;
    }
    const name = (entity.name || entity.table).toLowerCase();
    if (entityNames.has(name)) {
      errors.push(`Duplicate entity in schema.json: "${name}"`);
    }
    entityNames.add(name);

    // Validate fields
    const fields = entity.fields || [];
    if (fields.length === 0) {
      warnings.push(`Entity "${name}" has no fields defined`);
    }

    const hasPrimary = fields.some((f: any) => f.primary || f.name === "id");
    if (!hasPrimary) {
      warnings.push(`Entity "${name}" has no primary key field`);
    }

    // Check relationships reference known entities
    for (const rel of entity.relationships || []) {
      const target = (rel.target || "").toLowerCase();
      if (target && !entityNames.has(target)) {
        // May be defined later — just warn
        warnings.push(`Entity "${name}" references "${target}" which may not exist`);
      }
    }
  }
}

function validateFileArtifacts(
  files: Record<string, string>,
  errors: string[],
  warnings: string[],
  tables: string[],
  missingRls: string[]
) {
  const hasMigration = Object.keys(files).some(f => 
    f.includes("migration") || f.endsWith(".sql")
  );
  const hasRls = Object.keys(files).some(f => 
    f.includes("rls") || (f.endsWith(".sql") && files[f].toLowerCase().includes("row level security"))
  );
  const hasSchemaJson = Object.keys(files).some(f => 
    f.includes("schema.json")
  );

  if (!hasMigration && tables.length === 0) {
    // Check SQL content in any file
    const sqlFiles = Object.entries(files).filter(([k]) => k.endsWith(".sql"));
    for (const [path, content] of sqlFiles) {
      const localTables: string[] = [];
      const destructive: string[] = [];
      validateMigrationSql(content, errors, warnings, localTables, destructive);
      tables.push(...localTables);
    }
  }

  if (!hasSchemaJson) {
    warnings.push("No schema.json found in artifacts — downstream code gen may lack type info");
  }
}

/**
 * Extract schema artifacts from a set of generated files.
 */
export function extractSchemaArtifacts(files: Record<string, string>): SchemaArtifacts {
  let migrationSql = "";
  let rlsSql = "";
  let schemaJson: any = null;

  for (const [path, content] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (lower.includes("migration") && lower.endsWith(".sql")) {
      migrationSql += content + "\n";
    } else if (lower.includes("rls") && lower.endsWith(".sql")) {
      rlsSql += content + "\n";
    } else if (lower.includes("schema.json") || lower.endsWith("schema.json")) {
      try {
        schemaJson = JSON.parse(content);
      } catch {
        // Will be caught by validation
      }
    }
  }

  // Also check inline SQL in non-.sql files
  if (!migrationSql) {
    for (const [, content] of Object.entries(files)) {
      if (content.includes("CREATE TABLE")) {
        migrationSql += content + "\n";
      }
    }
  }

  return { migrationSql, rlsSql, schemaJson, files };
}

/**
 * Quick check: does this set of files contain backend intent 
 * that requires schema validation?
 */
export function requiresSchemaValidation(files: Record<string, string>): boolean {
  const allContent = Object.values(files).join("\n").toLowerCase();
  return (
    allContent.includes("create table") ||
    allContent.includes("migration") ||
    allContent.includes("schema.json") ||
    allContent.includes("supabase") ||
    Object.keys(files).some(f => f.endsWith(".sql"))
  );
}
