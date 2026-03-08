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
    const body = await req.json();
    const { project_id, function_name, params } = body;

    if (!project_id || !function_name) {
      return new Response(JSON.stringify({ error: "project_id and function_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the function code
    const { data: fn, error } = await supabase
      .from("project_functions")
      .select("code")
      .eq("project_id", project_id)
      .eq("name", function_name)
      .single();

    if (error || !fn) {
      return new Response(JSON.stringify({ error: `Function '${function_name}' not found` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a sandboxed execution context
    // The function code gets access to a `ctx` object with helpers
    const apiBase = `${supabaseUrl}/functions/v1`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const wrappedCode = `
      const ctx = {
        params: ${JSON.stringify(params || {})},
        projectId: "${project_id}",
        
        // Data helper
        async db(action, collection, data) {
          const resp = await fetch("${apiBase}/project-api", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer ${anonKey}" },
            body: JSON.stringify({ project_id: "${project_id}", action, collection, ...data })
          });
          return (await resp.json()).data;
        },

        // Fetch helper
        async fetch(url, options) {
          return fetch(url, options);
        }
      };

      // User function
      const userFn = new Function("ctx", \`return (async (ctx) => { ${fn.code} })(ctx)\`);
      return await userFn(ctx);
    `;

    // Execute using Function constructor (sandboxed to some degree)
    const executor = new Function("fetch", `return (async () => { ${wrappedCode} })()`);
    const result = await executor(fetch);

    return new Response(JSON.stringify({ data: result ?? { success: true } }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("project-exec error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Execution error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
