/**
 * Build Compiler v1.0 — Planner
 * 
 * Turns a BuildContext into a TaskGraph (DAG of build tasks).
 * Deterministic: same inputs → same graph.
 */

import type { BuildContext, CompilerTask, TaskGraph, TaskType } from "./types";

let taskCounter = 0;
function nextId(): string {
  return `task-${++taskCounter}`;
}

// ─── Task Graph Generation ────────────────────────────────────────────────

export function planTaskGraph(ctx: BuildContext): TaskGraph {
  taskCounter = 0;
  const tasks: CompilerTask[] = [];
  const { ir, buildIntent } = ctx;

  // ── Pass 1: Infrastructure (contexts, shared UI, styles) ──────────

  const infraTask = createTask({
    label: "infra",
    type: "infra",
    description: "Shared UI components, design tokens, global styles",
    produces: [
      "/components/ui/Toast.jsx",
      "/components/ui/Spinner.jsx",
      "/components/ui/DataTable.jsx",
      "/styles/globals.css",
    ],
    priority: 0,
  });
  tasks.push(infraTask);

  // ── Pass 2: Auth (always generated — build prompt mandates AuthContext) ──

  const authTask = createTask({
    label: "auth",
    type: "frontend",
    description: `Auth system with roles: ${ir.roles.map(r => r.name).join(", ") || "user"}. Must create AuthContext, LoginPage, and ProtectedRoute.`,
    produces: [
      "/contexts/AuthContext.jsx",
      "/pages/Auth/LoginPage.jsx",
      "/components/ProtectedRoute.jsx",
    ],
    dependsOn: [infraTask.id],
    priority: 1,
  });
  tasks.push(authTask);
  const authTaskId = authTask.id;

  // ── Pass 3: Data models / backend services ────────────────────────

  const modelTaskIds: string[] = [];
  for (const entity of ir.entities) {
    const modelTask = createTask({
      label: `model:${entity.name.toLowerCase()}`,
      type: "backend",
      description: `Data model, hooks, and API service for ${entity.name} (fields: ${entity.fields.map(f => f.name).join(", ")})`,
      produces: [
        `/hooks/use${entity.name}.jsx`,
        `/services/${entity.name.toLowerCase()}Service.js`,
      ],
      dependsOn: [infraTask.id, authTaskId],
      priority: 2,
    });
    tasks.push(modelTask);
    modelTaskIds.push(modelTask.id);
  }

  // ── Pass 4: Pages / UI ────────────────────────────────────────────

  const pageTaskIds: string[] = [];
  for (const route of ir.routes) {
    if (route.page === "LoginPage" && authTaskId) continue; // Already handled

    const deps = [...modelTaskIds];
    if (authTaskId && route.auth) deps.push(authTaskId);
    if (deps.length === 0) deps.push(infraTask.id, authTaskId);

    const pageTask = createTask({
      label: `page:${route.page}`,
      type: "frontend",
      description: `Page component for ${route.path}: ${route.page}`,
      produces: [`/pages/${route.page}.jsx`],
      dependsOn: deps,
      priority: 3,
    });
    tasks.push(pageTask);
    pageTaskIds.push(pageTask.id);
  }

  // ── Pass 5: App entry + routing ───────────────────────────────────

  const appTask = createTask({
    label: "app:routing",
    type: "frontend",
    description: `App.jsx with routing for: ${ir.routes.map(r => r.path).join(", ")}`,
    produces: ["/App.jsx"],
    dependsOn: [...pageTaskIds, authTaskId],
    touches: ["/App.jsx"],
    priority: 4,
  });
  tasks.push(appTask);

  // ── Build passes ──────────────────────────────────────────────────

  const passes = buildPasses(tasks);

  return { tasks, passes };
}

// ─── Pass Grouping ────────────────────────────────────────────────────────

/**
 * Group tasks into passes based on dependency resolution.
 * Tasks in the same pass have no inter-dependencies and can run in parallel.
 */
function buildPasses(tasks: CompilerTask[]): string[][] {
  const passes: string[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(tasks.map(t => t.id));

  while (remaining.size > 0) {
    const pass: string[] = [];

    for (const taskId of remaining) {
      const task = tasks.find(t => t.id === taskId)!;
      const depsReady = task.dependsOn.every(d => completed.has(d));
      if (depsReady) {
        pass.push(taskId);
      }
    }

    if (pass.length === 0) {
      // Circular dependency — force remaining into a single pass
      console.warn("[Planner] Circular dependency detected, forcing remaining tasks");
      passes.push([...remaining]);
      break;
    }

    // Sort by priority within pass
    pass.sort((a, b) => {
      const ta = tasks.find(t => t.id === a)!;
      const tb = tasks.find(t => t.id === b)!;
      return ta.priority - tb.priority;
    });

    passes.push(pass);
    for (const id of pass) {
      completed.add(id);
      remaining.delete(id);
    }
  }

  return passes;
}

// ─── Topological Sort ─────────────────────────────────────────────────────

export function topologicalSort(tasks: CompilerTask[]): CompilerTask[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const sorted: CompilerTask[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const task = taskMap.get(id);
    if (!task) return;
    for (const dep of task.dependsOn) visit(dep);
    sorted.push(task);
  }

  for (const task of tasks) visit(task.id);
  return sorted;
}

// ─── Task Factory ─────────────────────────────────────────────────────────

function createTask(params: {
  label: string;
  type: TaskType;
  description: string;
  produces: string[];
  dependsOn?: string[];
  touches?: string[];
  priority: number;
}): CompilerTask {
  return {
    id: nextId(),
    label: params.label,
    type: params.type,
    description: params.description,
    buildPrompt: "", // Filled by executor with full context
    dependsOn: params.dependsOn || [],
    produces: params.produces,
    touches: params.touches || [],
    priority: params.priority,
    status: "pending",
    retries: 0,
  };
}
