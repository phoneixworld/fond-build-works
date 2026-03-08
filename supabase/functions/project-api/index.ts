import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Expected: /project-api or called via invoke
    
    const body = await req.json();
    const { project_id, action, collection, data, id, filters } = body;

    if (!project_id || !action || !collection) {
      return new Response(JSON.stringify({ error: "project_id, action, and collection are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;

    switch (action) {
      case "list": {
        let query = supabase
          .from("project_data")
          .select("*")
          .eq("project_id", project_id)
          .eq("collection", collection)
          .order("created_at", { ascending: false });
        
        if (filters?.limit) query = query.limit(filters.limit);
        const { data: rows, error } = await query;
        if (error) throw error;
        result = rows.map((r: any) => ({ id: r.id, ...r.data, _created_at: r.created_at, _updated_at: r.updated_at }));
        break;
      }

      case "get": {
        if (!id) throw new Error("id is required for get");
        const { data: row, error } = await supabase
          .from("project_data")
          .select("*")
          .eq("id", id)
          .eq("project_id", project_id)
          .single();
        if (error) throw error;
        result = { id: row.id, ...row.data, _created_at: row.created_at, _updated_at: row.updated_at };
        break;
      }

      case "create": {
        if (!data) throw new Error("data is required for create");
        const { data: row, error } = await supabase
          .from("project_data")
          .insert({ project_id, collection, data })
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
          .eq("project_id", project_id)
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
          .eq("project_id", project_id);
        if (error) throw error;
        result = { deleted: true };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ data: result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("project-api error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
