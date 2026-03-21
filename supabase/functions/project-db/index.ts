import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * project-db: Creates REAL Postgres tables per project.
 * 
 * Actions:
 *   - provision: Creates tables from a schema definition
 *   - migrate: Runs a DDL migration
 *   - list_tables: Returns all tables for a project
 *   - drop: Drops a project's tables (cleanup)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { project_id, action } = body;

    if (!project_id || !action) {
      return jsonResponse({ error: "project_id and action are required" }, 400);
    }

    // Generate short prefix from project_id (first 8 chars of UUID)
    const prefix = `pd_${project_id.replace(/-/g, "").substring(0, 12)}`;

    switch (action) {
      case "provision": {
        const { tables } = body;
        if (!tables || !Array.isArray(tables) || tables.length === 0) {
          return jsonResponse({ error: "tables array is required" }, 400);
        }

        const results = [];
        for (const table of tables) {
          const result = await createTable(supabase, dbUrl, project_id, prefix, table);
          results.push(result);
        }

        return jsonResponse({ data: { created: results.filter(r => r.success).length, results } });
      }

      case "migrate": {
        const { name, sql_up, sql_down, version } = body;
        if (!sql_up) {
          return jsonResponse({ error: "sql_up is required" }, 400);
        }

        // Execute the migration DDL
        const { error: execError } = await executeDDL(supabase, sql_up);
        if (execError) {
          return jsonResponse({ error: `Migration failed: ${execError}` }, 500);
        }

        // Track the migration
        const { error: trackError } = await supabase
          .from("project_migrations")
          .insert({
            project_id,
            version: version || 1,
            name: name || "unnamed",
            sql_up,
            sql_down: sql_down || "",
            status: "applied",
          });

        if (trackError) {
          console.warn("Migration tracking failed:", trackError);
        }

        return jsonResponse({ data: { migrated: true, name } });
      }

      case "list_tables": {
        const { data, error } = await supabase
          .from("project_tables")
          .select("*")
          .eq("project_id", project_id)
          .order("created_at", { ascending: true });

        if (error) throw error;
        return jsonResponse({ data });
      }

      case "drop": {
        // Get all tables for this project
        const { data: tables } = await supabase
          .from("project_tables")
          .select("full_table_name")
          .eq("project_id", project_id);

        if (tables && tables.length > 0) {
          for (const t of tables) {
            await executeDDL(supabase, `DROP TABLE IF EXISTS public."${t.full_table_name}" CASCADE;`);
          }

          await supabase
            .from("project_tables")
            .delete()
            .eq("project_id", project_id);

          await supabase
            .from("project_migrations")
            .delete()
            .eq("project_id", project_id);
        }

        return jsonResponse({ data: { dropped: tables?.length || 0 } });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("project-db error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

interface TableDef {
  name: string;
  columns: ColumnDef[];
}

interface ColumnDef {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
  references?: string; // "other_table.column"
}

function mapFieldType(fieldType: string): string {
  switch (fieldType) {
    case "text":
    case "email":
    case "phone":
    case "url":
      return "TEXT";
    case "textarea":
      return "TEXT";
    case "number":
      return "NUMERIC";
    case "boolean":
      return "BOOLEAN";
    case "datetime":
      return "TIMESTAMP WITH TIME ZONE";
    case "date":
      return "DATE";
    case "uuid":
      return "UUID";
    case "json":
    case "jsonb":
      return "JSONB";
    default:
      return "TEXT";
  }
}

async function createTable(
  supabase: any,
  dbUrl: string,
  projectId: string,
  prefix: string,
  table: TableDef
): Promise<{ name: string; fullName: string; success: boolean; error?: string }> {
  const fullName = `${prefix}_${table.name}`;

  // Build column definitions
  const colDefs: string[] = [
    `id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY`,
    `project_id UUID NOT NULL DEFAULT '${projectId}'::uuid`,
  ];

  const columnsMeta: any[] = [
    { name: "id", type: "uuid", primaryKey: true },
    { name: "project_id", type: "uuid" },
  ];

  for (const col of table.columns) {
    if (col.name === "id" || col.name === "project_id") continue;

    const pgType = mapFieldType(col.type);
    let def = `"${col.name}" ${pgType}`;
    if (col.required) def += " NOT NULL";
    if (col.defaultValue !== undefined && col.defaultValue !== "") {
      def += ` DEFAULT ${formatDefault(col.defaultValue, pgType)}`;
    }
    colDefs.push(def);
    columnsMeta.push({ name: col.name, type: col.type, pgType, required: col.required || false });
  }

  // Always add timestamps
  colDefs.push(`created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
  colDefs.push(`updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
  columnsMeta.push({ name: "created_at", type: "datetime", pgType: "TIMESTAMP WITH TIME ZONE" });
  columnsMeta.push({ name: "updated_at", type: "datetime", pgType: "TIMESTAMP WITH TIME ZONE" });

  const createSQL = `CREATE TABLE IF NOT EXISTS public."${fullName}" (\n  ${colDefs.join(",\n  ")}\n);`;

  // RLS: enable + add project-scoped policy
  const rlsSQL = `
    ALTER TABLE public."${fullName}" ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Project data access ${fullName}" ON public."${fullName}"
      FOR ALL TO anon, authenticated
      USING (project_id = '${projectId}'::uuid)
      WITH CHECK (project_id = '${projectId}'::uuid);
    
    CREATE POLICY "Service role access ${fullName}" ON public."${fullName}"
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  `;

  const fullSQL = createSQL + "\n" + rlsSQL;

  const { error } = await executeDDL(supabase, fullSQL);
  if (error) {
    return { name: table.name, fullName, success: false, error };
  }

  // Track in project_tables
  await supabase
    .from("project_tables")
    .upsert({
      project_id: projectId,
      table_name: table.name,
      full_table_name: fullName,
      columns: columnsMeta,
      has_rls: true,
    }, { onConflict: "project_id,table_name" });

  // Track migration
  await supabase
    .from("project_migrations")
    .insert({
      project_id: projectId,
      name: `create_${table.name}`,
      sql_up: fullSQL,
      sql_down: `DROP TABLE IF EXISTS public."${fullName}" CASCADE;`,
      status: "applied",
    });

  return { name: table.name, fullName, success: true };
}

function formatDefault(value: string, pgType: string): string {
  if (pgType === "BOOLEAN") return value === "true" ? "true" : "false";
  if (pgType === "NUMERIC") return value;
  return `'${value.replace(/'/g, "''")}'`;
}

async function executeDDL(supabase: any, sql: string): Promise<{ error?: string }> {
  try {
    // Use rpc to execute raw SQL via a database function
    // We'll use the REST API with service role to execute DDL
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_ddl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ ddl_sql: sql }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { error: `DDL execution failed: ${text}` };
    }

    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
