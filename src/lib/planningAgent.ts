/**
 * Planning Agent — breaks complex features into sequenced subtasks
 */

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

export type TaskComplexity = "trivial" | "simple" | "medium" | "complex";
export type TaskCategory = "ui" | "backend" | "auth" | "data" | "styling" | "testing" | "config";
export type TaskStatus = "pending" | "in_progress" | "done" | "skipped" | "failed";
export type TaskType = "schema" | "backend" | "frontend";

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  buildPrompt: string;
  complexity: TaskComplexity;
  taskType: TaskType;
  dependsOn: string[];
  filesAffected: string[];
  needsUserInput?: boolean;
  userQuestion?: string;
  category: TaskCategory;
  status: TaskStatus;
}

export interface BuildPlan {
  summary: string;
  overallComplexity: TaskComplexity;
  estimatedSteps: number;
  risks?: string[];
  tasks: PlanTask[];
}

export async function generatePlan(
  prompt: string,
  existingFiles?: string[],
  techStack?: string,
  schemas?: any[],
  knowledge?: string[]
): Promise<BuildPlan> {
  const resp = await fetch(`${BASE_URL}/functions/v1/plan-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({ prompt, existingFiles, techStack, schemas, knowledge }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (resp.status === 402) throw new Error("Usage limit reached.");
    throw new Error("Failed to generate plan");
  }

  const plan = await resp.json();
  // Add status to each task
  plan.tasks = (plan.tasks || []).map((t: any) => ({ ...t, status: "pending" as TaskStatus }));
  return plan;
}

export function getNextTask(plan: BuildPlan): PlanTask | null {
  for (const task of plan.tasks) {
    if (task.status !== "pending") continue;
    const depsComplete = task.dependsOn.every(
      (depId) => plan.tasks.find((t) => t.id === depId)?.status === "done"
    );
    if (depsComplete) return task;
  }
  return null;
}

export function updateTaskStatus(plan: BuildPlan, taskId: string, status: TaskStatus): BuildPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
  };
}

export function getPlanProgress(plan: BuildPlan): { done: number; total: number; percent: number } {
  const total = plan.tasks.length;
  const done = plan.tasks.filter((t) => t.status === "done" || t.status === "skipped").length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function getComplexityColor(complexity: TaskComplexity): string {
  switch (complexity) {
    case "trivial": return "text-[hsl(var(--ide-success))]";
    case "simple": return "text-primary";
    case "medium": return "text-[hsl(var(--ide-warning))]";
    case "complex": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

export function getCategoryIcon(category: TaskCategory): string {
  switch (category) {
    case "ui": return "🎨";
    case "backend": return "⚡";
    case "auth": return "🔐";
    case "data": return "📊";
    case "styling": return "✨";
    case "testing": return "🧪";
    case "config": return "⚙️";
    default: return "📋";
  }
}
