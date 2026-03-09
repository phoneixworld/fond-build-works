/**
 * Build Observability — structured timing and metrics for the build pipeline.
 * 
 * Tracks: model latency, validation latency, merge latency, bundler latency,
 * retry counts, file counts, and sizes per task.
 */

export interface TaskMetrics {
  taskId: string;
  taskTitle: string;
  startTime: number;
  endTime?: number;
  modelLatencyMs?: number;
  validationLatencyMs?: number;
  mergeLatencyMs?: number;
  retryCount: number;
  fileCount: number;
  totalFileSize: number;
  cached: boolean;
  status: "success" | "failed" | "stubbed" | "skipped";
}

export interface BuildMetrics {
  buildId: string;
  startTime: number;
  endTime?: number;
  planningLatencyMs?: number;
  assemblyLatencyMs?: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  stubbedFiles: number;
  totalRetries: number;
  cacheHits: number;
  tasks: TaskMetrics[];
  parallelGroups?: number;
}

let currentBuild: BuildMetrics | null = null;

export function startBuild(totalTasks: number): BuildMetrics {
  currentBuild = {
    buildId: `build-${Date.now().toString(36)}`,
    startTime: performance.now(),
    totalTasks,
    completedTasks: 0,
    failedTasks: 0,
    stubbedFiles: 0,
    totalRetries: 0,
    cacheHits: 0,
    tasks: [],
  };
  return currentBuild;
}

export function recordPlanningLatency(ms: number): void {
  if (currentBuild) currentBuild.planningLatencyMs = ms;
}

export function startTask(taskId: string, taskTitle: string): TaskMetrics {
  const metrics: TaskMetrics = {
    taskId,
    taskTitle,
    startTime: performance.now(),
    retryCount: 0,
    fileCount: 0,
    totalFileSize: 0,
    cached: false,
    status: "success",
  };
  currentBuild?.tasks.push(metrics);
  return metrics;
}

export function completeTask(
  metrics: TaskMetrics,
  result: {
    fileCount: number;
    totalFileSize: number;
    modelLatencyMs: number;
    validationLatencyMs: number;
    mergeLatencyMs: number;
    retryCount: number;
    cached: boolean;
    status: "success" | "failed" | "stubbed" | "skipped";
  }
): void {
  metrics.endTime = performance.now();
  metrics.modelLatencyMs = result.modelLatencyMs;
  metrics.validationLatencyMs = result.validationLatencyMs;
  metrics.mergeLatencyMs = result.mergeLatencyMs;
  metrics.retryCount = result.retryCount;
  metrics.fileCount = result.fileCount;
  metrics.totalFileSize = result.totalFileSize;
  metrics.cached = result.cached;
  metrics.status = result.status;

  if (currentBuild) {
    if (result.status === "success" || result.status === "stubbed") currentBuild.completedTasks++;
    if (result.status === "failed") currentBuild.failedTasks++;
    if (result.status === "stubbed") currentBuild.stubbedFiles++;
    currentBuild.totalRetries += result.retryCount;
    if (result.cached) currentBuild.cacheHits++;
  }
}

export function finishBuild(): BuildMetrics | null {
  if (!currentBuild) return null;
  currentBuild.endTime = performance.now();

  const totalMs = currentBuild.endTime - currentBuild.startTime;
  const taskDetails = currentBuild.tasks.map(t => {
    const dur = t.endTime ? (t.endTime - t.startTime).toFixed(0) : "?";
    return `  ${t.status === "success" ? "✅" : t.status === "stubbed" ? "⚠️" : t.status === "skipped" ? "⏭️" : "❌"} ${t.taskTitle} — ${dur}ms (model: ${t.modelLatencyMs?.toFixed(0) || "?"}ms, validate: ${t.validationLatencyMs?.toFixed(0) || "?"}ms, merge: ${t.mergeLatencyMs?.toFixed(0) || "?"}ms) [${t.fileCount} files, ${(t.totalFileSize / 1024).toFixed(1)}KB${t.cached ? ", CACHED" : ""}${t.retryCount > 0 ? `, ${t.retryCount} retries` : ""}]`;
  });

  console.log(
    `\n📊 BUILD METRICS — ${currentBuild.buildId}\n` +
    `  Total: ${totalMs.toFixed(0)}ms | Planning: ${currentBuild.planningLatencyMs?.toFixed(0) || "N/A"}ms | Assembly: ${currentBuild.assemblyLatencyMs?.toFixed(0) || "N/A"}ms\n` +
    `  Tasks: ${currentBuild.completedTasks}/${currentBuild.totalTasks} done, ${currentBuild.failedTasks} failed\n` +
    `  Retries: ${currentBuild.totalRetries} | Cache hits: ${currentBuild.cacheHits} | Stubbed: ${currentBuild.stubbedFiles}\n` +
    (currentBuild.parallelGroups ? `  Parallel groups: ${currentBuild.parallelGroups}\n` : "") +
    `  Per-task breakdown:\n${taskDetails.join("\n")}\n`
  );

  const result = currentBuild;
  currentBuild = null;
  return result;
}

// ─── Timer utility ────────────────────────────────────────────────────────

export function timer(): { elapsed: () => number } {
  const start = performance.now();
  return { elapsed: () => performance.now() - start };
}
