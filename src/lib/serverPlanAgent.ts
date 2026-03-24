/**
 * Server-side Plan Agent client.
 * 
 * Calls the plan-agent edge function to generate a contract-driven
 * task graph with interface contracts and dependency declarations.
 * This replaces client-only planning for new_app builds.
 */

import type { IR } from "@/lib/ir";
import type { CompilerTask, TaskGraph, TaskType } from "@/lib/compiler/types";
import { cloudLog } from "@/lib/cloudLogBus";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

export interface ServerPlanResult {
  mode: "single_shot" | "multi_task";
  summary: string;
  overallComplexity: string;
  estimatedSteps: number;
  risks?: string[];
  tasks: ServerPlanTask[];
}

export interface ServerPlanTask {
  id: string;
  title: string;
  description: string;
  buildPrompt: string;
  complexity: string;
  taskType: "schema" | "backend" | "frontend";
  profile: string;
  dependsOn: string[];
  filesAffected: string[];
  needsUserInput?: boolean;
  userQuestion?: string;
  category: string;
  contractShape?: {
    exports: string[];
    components?: string[];
    routes?: string[];
    types?: string[];
    api?: string[];
  };
  requires?: {
    components?: string[];
    hooks?: string[];
    backend?: string[];
    schemas?: string[];
  };
}

/**
 * Call the server-side plan-agent to generate a contract-driven build plan.
 * Falls back to null on failure (caller should use client-side planner as fallback).
 */
export async function fetchServerPlan(options: {
  prompt: string;
  existingFiles?: string[];
  techStack?: string;
  schemas?: any[];
  knowledge?: string[];
  domainModel?: any;
}): Promise<ServerPlanResult | null> {
  try {
    const resp = await fetch(`${BASE_URL}/functions/v1/plan-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({
        prompt: options.prompt,
        existingFiles: options.existingFiles,
        techStack: options.techStack,
        schemas: options.schemas,
        knowledge: options.knowledge,
        domainModel: options.domainModel,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      cloudLog.warn(`[ServerPlan] plan-agent returned ${resp.status}: ${errorText.slice(0, 200)}`, "planner");
      return null;
    }

    const plan: ServerPlanResult = await resp.json();

    if (!plan.tasks || plan.tasks.length === 0) {
      cloudLog.warn("[ServerPlan] plan-agent returned empty task list", "planner");
      return null;
    }

    cloudLog.info(
      `[ServerPlan] Server plan: mode=${plan.mode}, ${plan.tasks.length} tasks, complexity=${plan.overallComplexity}`,
      "planner"
    );

    return plan;
  } catch (err: any) {
    cloudLog.warn(`[ServerPlan] Failed to call plan-agent: ${err.message}`, "planner");
    return null;
  }
}

/**
 * Convert a server plan into the compiler's TaskGraph format.
 * Maps plan-agent's contract-driven tasks into CompilerTask objects.
 */
export function serverPlanToTaskGraph(plan: ServerPlanResult): TaskGraph {
  const taskTypeMap: Record<string, TaskType> = {
    schema: "backend",
    backend: "backend",
    frontend: "frontend",
  };

  const profileToType: Record<string, TaskType> = {
    "schema.migration": "backend",
    "schema.rls": "backend",
    "backend.api": "backend",
    "backend.auth": "frontend", // auth UI is frontend
    "frontend.layout": "frontend",
    "frontend.routing": "frontend",
    "frontend.page": "frontend",
    "frontend.module": "frontend",
  };

  const tasks: CompilerTask[] = plan.tasks.map((t) => ({
    id: t.id,
    label: t.title,
    type: profileToType[t.profile] || taskTypeMap[t.taskType] || "frontend",
    description: t.buildPrompt || t.description,
    buildPrompt: t.buildPrompt || t.description,
    dependsOn: t.dependsOn || [],
    produces: t.filesAffected || [],
    touches: [],
    priority: t.taskType === "schema" ? 0 : t.taskType === "backend" ? 1 : 2,
    status: "pending" as const,
    retries: 0,
  }));

  // Build pass ordering: group by priority (schema → backend → frontend)
  const passes: string[][] = [];
  const byPriority = new Map<number, string[]>();
  for (const task of tasks) {
    const p = task.priority;
    if (!byPriority.has(p)) byPriority.set(p, []);
    byPriority.get(p)!.push(task.id);
  }
  for (const priority of [...byPriority.keys()].sort()) {
    passes.push(byPriority.get(priority)!);
  }

  return { tasks, passes };
}
