import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const buildId = url.searchParams.get("build_id");
    const projectId = url.searchParams.get("project_id");

    if (!buildId && !projectId) {
      return new Response(
        JSON.stringify({ error: "build_id or project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === "GET" && buildId) {
      // Serve a specific build's preview
      const { data: build, error } = await adminClient
        .from("build_jobs")
        .select("*")
        .eq("id", buildId)
        .single();

      if (error || !build) {
        return new Response(
          JSON.stringify({ error: "Build not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (build.status !== "complete") {
        return new Response(
          JSON.stringify({
            build_id: build.id,
            status: build.status,
            error: build.error,
            build_log: build.build_log,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return build info with preview URL
      return new Response(
        JSON.stringify({
          build_id: build.id,
          status: build.status,
          preview_url: build.preview_url,
          artifact_path: build.artifact_path,
          file_count: build.file_count,
          total_size_bytes: build.total_size_bytes,
          duration_ms: build.build_duration_ms,
          validation: build.validation_results,
          created_at: build.created_at,
          completed_at: build.completed_at,
          build_log: build.build_log,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "GET" && projectId) {
      // List builds for a project
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const status = url.searchParams.get("status");

      let query = adminClient
        .from("build_jobs")
        .select("id, status, file_count, total_size_bytes, build_duration_ms, preview_url, error, created_at, completed_at, build_config")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) {
        query = query.eq("status", status);
      }

      const { data: builds, error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch builds" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ builds: builds || [], total: builds?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Get build artifacts (source files)
    if (req.method === "POST") {
      const { build_id: reqBuildId, file_path } = await req.json();

      if (!reqBuildId) {
        return new Response(
          JSON.stringify({ error: "build_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: build, error } = await adminClient
        .from("build_jobs")
        .select("artifact_path, output_files, source_files")
        .eq("id", reqBuildId)
        .single();

      if (error || !build) {
        return new Response(
          JSON.stringify({ error: "Build not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (file_path) {
        // Return a specific file from source
        const source = build.source_files as Record<string, string>;
        const content = source[file_path] || source[`/${file_path}`];
        if (!content) {
          return new Response(
            JSON.stringify({ error: `File not found: ${file_path}` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ file_path, content }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return all source files
      return new Response(
        JSON.stringify({
          build_id: reqBuildId,
          files: build.source_files,
          artifact_path: build.artifact_path,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Build preview error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
