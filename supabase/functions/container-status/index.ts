import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Webhook endpoint called by the container during/after builds.
 * Updates container_builds + container_tasks via Realtime for live streaming.
 *
 * Expected payload:
 * {
 *   build_id: string,
 *   event: "task_start" | "task_complete" | "task_fail" | "build_complete" | "build_fail" | "log",
 *   task_type?: string,
 *   output?: string,
 *   error?: string,
 *   exit_code?: number,
 *   duration_ms?: number,
 *   preview_url?: string,
 *   output_files?: Record<string, string>,
 *   artifact_path?: string,
 *   log_line?: string,
 * }
 */

interface StatusPayload {
  build_id: string;
  event: "task_start" | "task_complete" | "task_fail" | "build_complete" | "build_fail" | "log";
  task_type?: string;
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
  preview_url?: string;
  output_files?: Record<string, string>;
  artifact_path?: string;
  log_line?: string;
  build_duration_ms?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const payload: StatusPayload = await req.json();
    const { build_id, event } = payload;

    if (!build_id || !event) {
      return new Response(JSON.stringify({ error: "build_id and event required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current build
    const { data: build, error: fetchErr } = await adminClient
      .from("container_builds")
      .select("*")
      .eq("id", build_id)
      .single();

    if (fetchErr || !build) {
      return new Response(JSON.stringify({ error: "Build not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buildLog: string[] = build.build_log || [];
    const timestamp = new Date().toISOString();

    switch (event) {
      case "log": {
        if (payload.log_line) {
          buildLog.push(`[${timestamp}] ${payload.log_line}`);
          await adminClient
            .from("container_builds")
            .update({ build_log: buildLog })
            .eq("id", build_id);
        }
        break;
      }

      case "task_start": {
        if (payload.task_type) {
          buildLog.push(`[${timestamp}] ▶ ${payload.task_type} started`);
          await adminClient
            .from("container_tasks")
            .update({ status: "running", updated_at: timestamp })
            .eq("build_id", build_id)
            .eq("task_type", payload.task_type);

          // Map task_type to build status
          const statusMap: Record<string, string> = {
            install: "building",
            lint: "building",
            typecheck: "building",
            test: "testing",
            build: "building",
            publish: "publishing",
          };
          const newStatus = statusMap[payload.task_type] || "building";
          await adminClient
            .from("container_builds")
            .update({ status: newStatus, build_log: buildLog })
            .eq("id", build_id);
        }
        break;
      }

      case "task_complete": {
        if (payload.task_type) {
          buildLog.push(
            `[${timestamp}] ✅ ${payload.task_type} passed (${payload.duration_ms || 0}ms)`
          );
          await adminClient
            .from("container_tasks")
            .update({
              status: "passed",
              output: payload.output || null,
              exit_code: payload.exit_code ?? 0,
              duration_ms: payload.duration_ms || null,
              updated_at: timestamp,
            })
            .eq("build_id", build_id)
            .eq("task_type", payload.task_type);

          await adminClient
            .from("container_builds")
            .update({ build_log: buildLog })
            .eq("id", build_id);
        }
        break;
      }

      case "task_fail": {
        if (payload.task_type) {
          buildLog.push(`[${timestamp}] ❌ ${payload.task_type} failed: ${payload.error || "unknown"}`);
          await adminClient
            .from("container_tasks")
            .update({
              status: "failed",
              error: payload.error || null,
              output: payload.output || null,
              exit_code: payload.exit_code ?? 1,
              duration_ms: payload.duration_ms || null,
              updated_at: timestamp,
            })
            .eq("build_id", build_id)
            .eq("task_type", payload.task_type);

          // Skip downstream tasks
          const { data: allTasks } = await adminClient
            .from("container_tasks")
            .select("id, depends_on, status, task_type")
            .eq("build_id", build_id);

          if (allTasks) {
            const failedTaskId = allTasks.find(
              (t: any) => t.task_type === payload.task_type
            )?.id;

            if (failedTaskId) {
              const downstream = allTasks.filter(
                (t: any) =>
                  t.status === "pending" &&
                  t.depends_on?.includes(failedTaskId)
              );
              for (const dt of downstream) {
                await adminClient
                  .from("container_tasks")
                  .update({ status: "skipped", updated_at: timestamp })
                  .eq("id", dt.id);
              }
            }
          }

          await adminClient
            .from("container_builds")
            .update({ build_log: buildLog })
            .eq("id", build_id);
        }
        break;
      }

      case "build_complete": {
        buildLog.push(
          `[${timestamp}] 🎉 Build complete (${payload.build_duration_ms || 0}ms)`
        );
        await adminClient
          .from("container_builds")
          .update({
            status: "complete",
            preview_url: payload.preview_url || null,
            output_files: payload.output_files || {},
            artifact_path: payload.artifact_path || null,
            build_log: buildLog,
            build_duration_ms: payload.build_duration_ms || null,
            completed_at: timestamp,
          })
          .eq("id", build_id);
        break;
      }

      case "build_fail": {
        buildLog.push(`[${timestamp}] 💥 Build failed: ${payload.error || "unknown"}`);
        await adminClient
          .from("container_builds")
          .update({
            status: "failed",
            error: payload.error || "Build failed",
            build_log: buildLog,
            build_duration_ms: payload.build_duration_ms || null,
            completed_at: timestamp,
          })
          .eq("id", build_id);
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("container-status error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
