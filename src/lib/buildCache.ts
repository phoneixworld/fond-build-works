/**
 * Build Cache — high-impact caching layer for the build pipeline.
 * 
 * Caches:
 * 1. Task output (key = hash of task prompt + context)
 * 2. Validated file hashes (skip re-validation for unchanged files)
 * 3. Dependency graph (reuse across builds unless plan changes)
 */

// ─── FNV-1a Hash ──────────────────────────────────────────────────────────

function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

// ─── Task Output Cache ────────────────────────────────────────────────────

interface CachedTaskOutput {
  files: Record<string, string>;
  deps: Record<string, string>;
  chatText: string;
  timestamp: number;
}

const taskOutputCache = new Map<string, CachedTaskOutput>();
const MAX_TASK_CACHE_SIZE = 50;
const TASK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getTaskCacheKey(taskPrompt: string, codeContext: string): string {
  // Hash the prompt + a summary of existing code context
  return fnv1a(taskPrompt + "||" + fnv1a(codeContext));
}

export function getCachedTaskOutput(key: string): CachedTaskOutput | null {
  const cached = taskOutputCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > TASK_CACHE_TTL_MS) {
    taskOutputCache.delete(key);
    return null;
  }
  return cached;
}

export function setCachedTaskOutput(key: string, output: CachedTaskOutput): void {
  // Evict oldest entries if at capacity
  if (taskOutputCache.size >= MAX_TASK_CACHE_SIZE) {
    const oldest = [...taskOutputCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) taskOutputCache.delete(oldest[0]);
  }
  taskOutputCache.set(key, { ...output, timestamp: Date.now() });
}

// ─── Validated File Hash Cache ────────────────────────────────────────────

const validatedFileHashes = new Map<string, string>(); // filePath → hash of content

export function isFileValidated(filePath: string, content: string): boolean {
  const hash = fnv1a(content);
  return validatedFileHashes.get(filePath) === hash;
}

export function markFileValidated(filePath: string, content: string): void {
  validatedFileHashes.set(filePath, fnv1a(content));
}

export function clearValidationCache(): void {
  validatedFileHashes.clear();
}

// ─── Dependency Graph Cache ───────────────────────────────────────────────

interface CachedDepGraph {
  planHash: string;
  sortedTaskIds: string[];
  independentGroups: string[][]; // groups of task IDs that can run in parallel
}

let depGraphCache: CachedDepGraph | null = null;

export function getCachedDepGraph(planHash: string): CachedDepGraph | null {
  if (depGraphCache && depGraphCache.planHash === planHash) return depGraphCache;
  return null;
}

export function setCachedDepGraph(cache: CachedDepGraph): void {
  depGraphCache = cache;
}

// ─── File Diff ────────────────────────────────────────────────────────────

export interface FileDiff {
  added: Record<string, string>;
  changed: Record<string, string>;
  removed: string[];
}

/**
 * Compute minimal diff between previous and current file maps.
 * Only files that actually changed (by content hash) are included.
 */
export function computeFileDiff(
  previous: Record<string, string> | null,
  current: Record<string, string>
): FileDiff {
  const diff: FileDiff = { added: {}, changed: {}, removed: [] };
  
  if (!previous) {
    // Everything is new
    diff.added = { ...current };
    return diff;
  }

  const prevKeys = new Set(Object.keys(previous));
  const currKeys = new Set(Object.keys(current));

  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      diff.added[key] = current[key];
    } else if (fnv1a(previous[key]) !== fnv1a(current[key])) {
      diff.changed[key] = current[key];
    }
  }

  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      diff.removed.push(key);
    }
  }

  return diff;
}

export function isDiffEmpty(diff: FileDiff): boolean {
  return (
    Object.keys(diff.added).length === 0 &&
    Object.keys(diff.changed).length === 0 &&
    diff.removed.length === 0
  );
}

// ─── Clear All Caches ─────────────────────────────────────────────────────

export function clearAllCaches(): void {
  taskOutputCache.clear();
  validatedFileHashes.clear();
  depGraphCache = null;
}
