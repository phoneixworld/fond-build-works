import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ContainerBuildStatus =
  | "idle"
  | "pending"
  | "provisioning"
  | "building"
  | "testing"
  | "publishing"
  | "complete"
  | "failed"
  | "cancelled";

export interface ContainerTask {
  id: string;
  task_type: string;
  label: string;
  status: string;
  output: string | null;
  error: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  sort_order: number;
}

export interface ContainerBuildState {
  buildId: string | null;
  status: ContainerBuildStatus;
  tasks: ContainerTask[];
  buildLog: string[];
  previewUrl: string | null;
  error: string | null;
  durationMs: number | null;
}

export function useContainerBuild() {
  const [state, setState] = useState<ContainerBuildState>({
    buildId: null,
    status: "idle",
    tasks: [],
    buildLog: [],
    previewUrl: null,
    error: null,
    durationMs: null,
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to Realtime updates for a build
  const subscribeToBuild = useCallback((buildId: string) => {
    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`container-build-${buildId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "container_builds",
          filter: `id=eq.${buildId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setState((prev) => ({
            ...prev,
            status: row.status as ContainerBuildStatus,
            buildLog: row.build_log || [],
            previewUrl: row.preview_url || null,
            error: row.error || null,
            durationMs: row.build_duration_ms || null,
          }));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "container_tasks",
          filter: `build_id=eq.${buildId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setState((prev) => {
            const existing = prev.tasks.findIndex((t) => t.id === row.id);
            const task: ContainerTask = {
              id: row.id,
              task_type: row.task_type,
              label: row.label,
              status: row.status,
              output: row.output,
              error: row.error,
              exit_code: row.exit_code,
              duration_ms: row.duration_ms,
              sort_order: row.sort_order,
            };

            const tasks = [...prev.tasks];
            if (existing >= 0) {
              tasks[existing] = task;
            } else {
              tasks.push(task);
              tasks.sort((a, b) => a.sort_order - b.sort_order);
            }
            return { ...prev, tasks };
          });
        }
      )
      .subscribe();

    channelRef.current = channel;
  }, []);

  // Start a container build
  const startBuild = useCallback(
    async (
      projectId: string,
      files: Record<string, string>,
      dependencies: Record<string, string>,
      buildConfig?: Record<string, any>
    ) => {
      setState({
        buildId: null,
        status: "pending",
        tasks: [],
        buildLog: [],
        previewUrl: null,
        error: null,
        durationMs: null,
      });

      try {
        const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectRef}.supabase.co/functions/v1/container-build`;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("Not authenticated");
        }

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            project_id: projectId,
            files,
            dependencies,
            build_config: buildConfig || {},
          }),
        });

        const data = await resp.json();

        if (!resp.ok) {
          throw new Error(data.error || "Build request failed");
        }

        setState((prev) => ({
          ...prev,
          buildId: data.build_id,
          status: data.status as ContainerBuildStatus,
        }));

        // Subscribe to Realtime for live updates
        subscribeToBuild(data.build_id);

        return data;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: (err as Error).message,
        }));
        throw err;
      }
    },
    [subscribeToBuild]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startBuild,
    isBuilding: ["pending", "provisioning", "building", "testing", "publishing"].includes(
      state.status
    ),
  };
}
