/**
 * Build Pipeline Service — client-side API for the server-side build orchestrator.
 * 
 * Provides:
 * - triggerBuild: submit files to server-side build pipeline
 * - getBuild: fetch build status and artifacts
 * - listBuilds: list all builds for a project
 * - subscribeToBuild: realtime build status updates
 */

import { supabase } from "@/integrations/supabase/client";

export interface BuildJob {
  id: string;
  project_id: string;
  user_id: string;
  status: "queued" | "building" | "validating" | "storing" | "complete" | "failed";
  file_count: number;
  total_size_bytes: number;
  build_duration_ms: number | null;
  preview_url: string | null;
  artifact_path: string | null;
  error: string | null;
  build_config: Record<string, unknown>;
  validation_results: {
    valid: boolean;
    errors: Array<{ file: string; message: string; severity: string }>;
    warnings: Array<{ file: string; message: string; severity: string }>;
  };
  build_log: string[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BuildResult {
  build_id: string;
  status: string;
  preview_url: string | null;
  artifact_path: string | null;
  file_count: number;
  total_size_bytes: number;
  validation: {
    errors: number;
    warnings: number;
    details: Array<{ file: string; message: string; severity: string }>;
  };
  duration_ms: number;
  build_log: string[];
}

export interface BuildListItem {
  id: string;
  status: string;
  file_count: number;
  total_size_bytes: number;
  build_duration_ms: number | null;
  preview_url: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  build_config: Record<string, unknown>;
}

// triggerBuild has been REMOVED — all builds go through compile() in @/lib/compiler.
// This service now provides read-only access to build history and artifacts.

/**
 * Get a specific build's details.
 */
export async function getBuild(buildId: string): Promise<BuildJob> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/build-preview?build_id=${buildId}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to fetch build");
  }

  return response.json();
}

/**
 * List builds for a project.
 */
export async function listBuilds(
  projectId: string,
  options: { limit?: number; status?: string } = {}
): Promise<BuildListItem[]> {
  const params = new URLSearchParams({ project_id: projectId });
  if (options.limit) params.set("limit", String(options.limit));
  if (options.status) params.set("status", options.status);

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/build-preview?${params}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to list builds");
  }

  const data = await response.json();
  return data.builds;
}

/**
 * Get build source files.
 */
export async function getBuildFiles(
  buildId: string,
  filePath?: string
): Promise<{ files?: Record<string, string>; file_path?: string; content?: string }> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/build-preview`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ build_id: buildId, file_path: filePath }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to fetch build files");
  }

  return response.json();
}

/**
 * Subscribe to realtime build status updates.
 * Returns an unsubscribe function.
 */
export function subscribeToBuild(
  buildId: string,
  onUpdate: (build: Partial<BuildJob>) => void
): () => void {
  const channel = supabase
    .channel(`build-${buildId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "build_jobs",
        filter: `id=eq.${buildId}`,
      },
      (payload) => {
        onUpdate(payload.new as Partial<BuildJob>);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to all build updates for a project.
 */
export function subscribeToProjectBuilds(
  projectId: string,
  onUpdate: (build: Partial<BuildJob>) => void
): () => void {
  const channel = supabase
    .channel(`project-builds-${projectId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "build_jobs",
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        onUpdate(payload.new as Partial<BuildJob>);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
