import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * project-api: Unified Data API with real-table routing.
 *
 * Strategy:
 * 1. Check `project_tables` for a real Postgres table matching the collection
 * 2. If found → query the real table (typed columns, RLS, relational)
 * 3. If not → fall back to `project_data` document store (JSONB)
 *
 * API shape is identical in both paths: { data: [...] }
 */

// Cache real-table lookups per project (within request lifetime)
const tableCache = new Map<string, Record<string, string>>();

async function resolveRealTable(
  supabase: any,
  projectId: string,
  collection: string
): Promise<string | null> {
  const cacheKey = projectId;
  let mappings = tableCache.get(cacheKey);

  if (!mappings) {
    const { data: tables, error } = await supabase
      .from("project_tables")
      .select("table_name, full_table_name")
      .eq("project_id", projectId);

    if (error || !tables) {
      mappings = {};
    } else {
      mappings = {};
      for (const t of tables) {
        mappings[t.table_name] = t.full_table_name;
      }
    }
    tableCache.set(cacheKey, mappings);
  }

  return mappings[collection] || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { project_id, action, collection, data, id, filters } = body;

    if (!project_id || !action || !collection) {
      return jsonResponse({ error: "project_id, action, and collection are required" }, 400);
    }

    // Resolve: real table or document store?
    const realTable = await resolveRealTable(supabase, project_id, collection);

    if (realTable) {
      // ── REAL TABLE PATH ──────────────────────────────────────────
      return await handleRealTable(supabase, realTable, project_id, action, data, id, filters);
    } else {
      // ── DOCUMENT STORE FALLBACK ──────────────────────────────────
      return await handleDocumentStore(supabase, project_id, collection, action, data, id, filters);
    }
  } catch (e) {
    console.error("project-api error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500
    );
  }
});

// ─── Real Table Operations ──────────────────────────────────────────────────

async function handleRealTable(
  supabase: any,
  tableName: string,
  projectId: string,
  action: string,
  data: any,
  id: string | undefined,
  filters: any
): Promise<Response> {
  let result;

  switch (action) {
    case "list": {
      let query = supabase
        .from(tableName)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (filters?.limit) query = query.limit(filters.limit);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.search) query = query.ilike("name", `%${filters.search}%`);

      const { data: rows, error } = await query;
      if (error) throw error;
      result = rows;
      break;
    }

    case "get": {
      if (!id) throw new Error("id is required for get");
      const { data: row, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("id", id)
        .eq("project_id", projectId)
        .single();
      if (error) throw error;
      result = row;
      break;
    }

    case "create": {
      if (!data) throw new Error("data is required for create");
      // Spread data directly — real tables have typed columns
      const { data: row, error } = await supabase
        .from(tableName)
        .insert({ ...data, project_id: projectId })
        .select()
        .single();
      if (error) throw error;
      result = row;
      break;
    }

    case "update": {
      if (!id || !data) throw new Error("id and data are required for update");
      const { data: row, error } = await supabase
        .from(tableName)
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("project_id", projectId)
        .select()
        .single();
      if (error) throw error;
      result = row;
      break;
    }

    case "delete": {
      if (!id) throw new Error("id is required for delete");
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", id)
        .eq("project_id", projectId);
      if (error) throw error;
      result = { deleted: true };
      break;
    }

    case "count": {
      const { count, error } = await supabase
        .from(tableName)
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId);
      if (error) throw error;
      result = { count };
      break;
    }

    default:
      return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  }

  return jsonResponse({ data: result, _source: "real_table", _table: tableName });
}

// ─── Document Store Fallback ────────────────────────────────────────────────

async function handleDocumentStore(
  supabase: any,
  projectId: string,
  collection: string,
  action: string,
  data: any,
  id: string | undefined,
  filters: any
): Promise<Response> {
  let result;

  switch (action) {
    case "list": {
      let query = supabase
        .from("project_data")
        .select("*")
        .eq("project_id", projectId)
        .eq("collection", collection)
        .order("created_at", { ascending: false });

      if (filters?.limit) query = query.limit(filters.limit);
      const { data: rows, error } = await query;
      if (error) throw error;
      result = (rows || []).map((r: any) => ({
        id: r.id,
        ...r.data,
        _created_at: r.created_at,
        _updated_at: r.updated_at,
      }));
      break;
    }

    case "get": {
      if (!id) throw new Error("id is required for get");
      const { data: row, error } = await supabase
        .from("project_data")
        .select("*")
        .eq("id", id)
        .eq("project_id", projectId)
        .single();
      if (error) throw error;
      result = { id: row.id, ...row.data, _created_at: row.created_at, _updated_at: row.updated_at };
      break;
    }

    case "create": {
      if (!data) throw new Error("data is required for create");
      const { data: row, error } = await supabase
        .from("project_data")
        .insert({ project_id: projectId, collection, data })
        .select()
        .single();
      if (error) throw error;
      result = { id: row.id, ...row.data };
      break;
    }

    case "update": {
      if (!id || !data) throw new Error("id and data are required for update");
      const { data: row, error } = await supabase
        .from("project_data")
        .update({ data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("project_id", projectId)
        .select()
        .single();
      if (error) throw error;
      result = { id: row.id, ...row.data };
      break;
    }

    case "delete": {
      if (!id) throw new Error("id is required for delete");
      const { error } = await supabase
        .from("project_data")
        .delete()
        .eq("id", id)
        .eq("project_id", projectId);
      if (error) throw error;
      result = { deleted: true };
      break;
    }

    case "count": {
      const { count, error } = await supabase
        .from("project_data")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("collection", collection);
      if (error) throw error;
      result = { count };
      break;
    }

    default:
      return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  }

  return jsonResponse({ data: result, _source: "document_store", _collection: collection });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
