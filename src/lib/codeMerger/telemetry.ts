/**
 * Merge Telemetry — structured logging for codeMerger operations.
 * 
 * Every merge conflict, dropped route, failed hunk, and deduped import
 * is captured here for observability. This replaces silent failures
 * with actionable diagnostics.
 */

import type { MergeTelemetry } from "./types";

const TELEMETRY_BUFFER: MergeTelemetry[] = [];
const MAX_BUFFER = 50;

export function recordMergeTelemetry(telemetry: MergeTelemetry): void {
  // Console summary
  const {
    totalIncoming, mergedFiles, skippedProtected, appendOnly,
    astMerged, diffMerged, overwritten, failedAstMerges,
    droppedRoutes, dedupedImports, failedHunks, conflicts,
  } = telemetry;

  console.log(
    `[CodeMerger:telemetry] Merge complete: ` +
    `${mergedFiles} merged, ${skippedProtected} protected, ${appendOnly} appended, ` +
    `${astMerged} AST-merged, ${diffMerged} diff-merged, ${overwritten} overwritten`
  );

  if (failedAstMerges.length > 0) {
    console.warn(`[CodeMerger:telemetry] ⚠️ AST merge failures (fell back to overwrite): ${failedAstMerges.join(", ")}`);
  }

  if (droppedRoutes.length > 0) {
    console.warn(`[CodeMerger:telemetry] ⚠️ Dropped routes during merge: ${droppedRoutes.join(", ")}`);
  }

  if (failedHunks.length > 0) {
    for (const { file, count } of failedHunks) {
      console.warn(`[CodeMerger:telemetry] ⚠️ ${file}: ${count} failed diff hunk(s) — changes may be lost`);
    }
  }

  if (dedupedImports.length > 0) {
    console.log(`[CodeMerger:telemetry] Deduped imports in ${dedupedImports.length} file(s)`);
  }

  if (conflicts.length > 0) {
    console.log(`[CodeMerger:telemetry] Conflict summary:\n  - ${conflicts.join("\n  - ")}`);
  }

  // Buffer for programmatic access
  TELEMETRY_BUFFER.push(telemetry);
  if (TELEMETRY_BUFFER.length > MAX_BUFFER) {
    TELEMETRY_BUFFER.shift();
  }
}

export function getRecentMergeTelemetry(): MergeTelemetry[] {
  return [...TELEMETRY_BUFFER];
}

export function getLastMergeTelemetry(): MergeTelemetry | null {
  return TELEMETRY_BUFFER.length > 0 ? TELEMETRY_BUFFER[TELEMETRY_BUFFER.length - 1] : null;
}

export function clearMergeTelemetry(): void {
  TELEMETRY_BUFFER.length = 0;
}
