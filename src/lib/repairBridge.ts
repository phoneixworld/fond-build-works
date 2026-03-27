/**
 * Repair Bridge — Phase 3: Connects runtime errors to the formal RepairPipeline.
 *
 * Tries deterministic AST-based repair first. If errors remain,
 * returns them for the chat-based fallback in useSelfHealing.
 */

import { getASTWorkspace } from "@/lib/buildEngine/astBridge";
import { RepairPipeline, type RepairPipelineResult, type RepairProgressEvent } from "@/lib/compiler/repairPipeline";

// Singleton metrics persistence across builds
let _lastRepairResult: RepairPipelineResult | null = null;
let _repairListeners: Array<(event: RepairProgressEvent) => void> = [];

export function onRepairProgress(listener: (event: RepairProgressEvent) => void): () => void {
  _repairListeners.push(listener);
  return () => {
    _repairListeners = _repairListeners.filter(l => l !== listener);
  };
}

export function getLastRepairResult(): RepairPipelineResult | null {
  return _lastRepairResult;
}

/**
 * Attempt deterministic repair of runtime/build errors via the RepairPipeline.
 *
 * @param errors Raw error strings from the preview/build
 * @param workspaceFiles Current sandbox files (used to populate AST store)
 * @returns The pipeline result — check `converged` to decide if chat fallback is needed
 */
export async function attemptDeterministicRepair(
  errors: string[],
  workspaceFiles: Record<string, string>,
): Promise<RepairPipelineResult> {
  const ws = getASTWorkspace();

  // Populate/refresh AST store with current workspace files
  for (const [path, content] of Object.entries(workspaceFiles)) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    // Only re-parse if content changed
    const existing = ws.store.getFile(normalizedPath);
    if (!existing || existing.source !== content) {
      ws.store.setFile(normalizedPath, content);
    }
  }

  const pipeline = new RepairPipeline(ws.store, {
    maxRounds: 3,
    maxActions: 20,
    allowAI: false, // Deterministic only — no AI calls
    timeoutMs: 15_000,
    onProgress: (event) => {
      for (const listener of _repairListeners) {
        try { listener(event); } catch {}
      }
    },
  });

  const result = await pipeline.heal(errors);
  _lastRepairResult = result;

  console.log(`[RepairBridge] ${result.converged ? "✅ Converged" : "⚠️ Partial"} — ${result.totalRepairs} repairs in ${result.totalRounds} round(s), ${result.remainingErrors.length} remaining`);

  return result;
}

/**
 * Get repaired files from the AST store after a successful repair.
 * Returns a map of file path → new source code for files that were modified.
 */
export function getRepairedFiles(originalFiles: Record<string, string>): Record<string, string> {
  const ws = getASTWorkspace();
  const repaired: Record<string, string> = {};

  for (const path of Object.keys(originalFiles)) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const entry = ws.store.getFile(normalizedPath);
    if (entry && entry.source !== originalFiles[path]) {
      repaired[path] = entry.source;
    }
  }

  return repaired;
}

/**
 * Format repair metrics as a concise report string.
 */
export function formatRepairReport(): string {
  if (!_lastRepairResult) return "No repair data available.";

  const r = _lastRepairResult;
  const lines = [
    `Repair: ${r.converged ? "✅ All fixed" : `⚠️ ${r.remainingErrors.length} remaining`}`,
    `Rounds: ${r.totalRounds} | Repairs: ${r.totalRepairs} (${r.deterministicRepairs} deterministic, ${r.aiRepairs} AI)`,
    `Duration: ${(r.durationMs / 1000).toFixed(1)}s`,
  ];

  if (r.metrics.hotFiles.length > 0) {
    lines.push(`Hot files: ${r.metrics.hotFiles.slice(0, 3).map(f => f.file).join(", ")}`);
  }

  return lines.join("\n");
}
