export interface MergeResult {
  files: Record<string, string>;
  conflicts: string[];
}

export interface MergeTelemetry {
  timestamp: number;
  totalIncoming: number;
  totalExisting: number;
  mergedFiles: number;
  skippedProtected: number;
  appendOnly: number;
  astMerged: number;
  diffMerged: number;
  overwritten: number;
  failedAstMerges: string[];
  droppedRoutes: string[];
  dedupedImports: Array<{ file: string; source: string; specifiers: string[] }>;
  failedHunks: Array<{ file: string; count: number }>;
  conflicts: string[];
}

export function createEmptyTelemetry(): MergeTelemetry {
  return {
    timestamp: Date.now(),
    totalIncoming: 0,
    totalExisting: 0,
    mergedFiles: 0,
    skippedProtected: 0,
    appendOnly: 0,
    astMerged: 0,
    diffMerged: 0,
    overwritten: 0,
    failedAstMerges: [],
    droppedRoutes: [],
    dedupedImports: [],
    failedHunks: [],
    conflicts: [],
  };
}
