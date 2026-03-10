/**
 * Build Compiler v1.0 — Observability
 * 
 * Structured logging and tracing for every compiler pass.
 * Produces a BuildTrace that can be exported as JSON.
 */

import type { BuildTrace, PassTiming, TaskTrace, CompilerTask, BuildIntent } from "./types";

// ─── Trace Builder ────────────────────────────────────────────────────────

export function createTrace(params: {
  intent: BuildIntent;
  taskCount: number;
  passCount: number;
  fileCountBefore: number;
}): BuildTrace {
  return {
    buildId: `build-${Date.now().toString(36)}`,
    startTime: performance.now(),
    passes: [],
    tasks: [],
    repairRounds: 0,
    repairActions: [],
    context: {
      intent: params.intent,
      taskCount: params.taskCount,
      passCount: params.passCount,
      fileCountBefore: params.fileCountBefore,
      fileCountAfter: 0,
    },
  };
}

// ─── Pass Timing ──────────────────────────────────────────────────────────

export function startPass(trace: BuildTrace, name: string): PassTiming {
  const timing: PassTiming = {
    name,
    startMs: performance.now(),
    endMs: 0,
    durationMs: 0,
  };
  trace.passes.push(timing);
  return timing;
}

export function endPass(timing: PassTiming): void {
  timing.endMs = performance.now();
  timing.durationMs = timing.endMs - timing.startMs;
}

// ─── Task Tracing ─────────────────────────────────────────────────────────

export function traceTaskStart(trace: BuildTrace, task: CompilerTask): TaskTrace {
  const taskTrace: TaskTrace = {
    taskId: task.id,
    label: task.label,
    status: "in_progress",
    durationMs: 0,
    cacheHit: false,
    retries: 0,
    filesProduced: [],
  };
  trace.tasks.push(taskTrace);
  return taskTrace;
}

export function traceTaskEnd(
  taskTrace: TaskTrace,
  startTime: number,
  result: {
    status: "done" | "failed" | "skipped";
    filesProduced: string[];
    retries: number;
    cacheHit: boolean;
    error?: string;
  }
): void {
  taskTrace.durationMs = performance.now() - startTime;
  taskTrace.status = result.status;
  taskTrace.filesProduced = result.filesProduced;
  taskTrace.retries = result.retries;
  taskTrace.cacheHit = result.cacheHit;
  taskTrace.error = result.error;
}

// ─── Finalize Trace ───────────────────────────────────────────────────────

export function finalizeTrace(trace: BuildTrace, fileCountAfter: number): void {
  trace.endTime = performance.now();
  trace.totalDurationMs = trace.endTime - trace.startTime;
  trace.context.fileCountAfter = fileCountAfter;
}

// ─── Print Trace ──────────────────────────────────────────────────────────

export function printTrace(trace: BuildTrace): void {
  const statusIcon = (s: string) =>
    s === "done" ? "✅" : s === "failed" ? "❌" : s === "skipped" ? "⏭️" : "⏳";

  const passLines = trace.passes.map(p =>
    `  [${p.name}] ${p.durationMs.toFixed(0)}ms`
  );

  const taskLines = trace.tasks.map(t =>
    `  ${statusIcon(t.status)} ${t.label} — ${t.durationMs.toFixed(0)}ms` +
    ` [${t.filesProduced.length} files${t.cacheHit ? ", CACHED" : ""}${t.retries > 0 ? `, ${t.retries} retries` : ""}]` +
    (t.error ? ` ⚠️ ${t.error}` : "")
  );

  const doneCount = trace.tasks.filter(t => t.status === "done").length;
  const failedCount = trace.tasks.filter(t => t.status === "failed").length;

  console.log(
    `\n📊 BUILD TRACE — ${trace.buildId}\n` +
    `  Intent: ${trace.context.intent} | Tasks: ${doneCount}/${trace.context.taskCount} done` +
    (failedCount > 0 ? `, ${failedCount} failed` : "") + "\n" +
    `  Files: ${trace.context.fileCountBefore} → ${trace.context.fileCountAfter}\n` +
    `  Total: ${trace.totalDurationMs?.toFixed(0) || "?"}ms\n` +
    (trace.repairRounds > 0 ? `  Repair: ${trace.repairRounds} rounds, ${trace.repairActions.length} actions\n` : "") +
    `  Passes:\n${passLines.join("\n")}\n` +
    `  Tasks:\n${taskLines.join("\n")}\n`
  );
}
