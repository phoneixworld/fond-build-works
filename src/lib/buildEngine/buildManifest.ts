/**
 * Build Manifest — Pillar 2, Component 5
 * 
 * Tracks what was generated, why, and from which IR node.
 * Provides a complete audit trail for every build cycle.
 */

export interface ManifestEntry {
  /** File path */
  filePath: string;
  /** How this file was produced */
  origin: "template" | "ai_generated" | "ai_edited" | "surgical_patch" | "scaffold" | "user_edit";
  /** IR node that requested this file (if any) */
  irNodeId?: string;
  /** Task label from the build plan */
  taskLabel?: string;
  /** Task index in the plan */
  taskIndex?: number;
  /** Model used for generation */
  model?: string;
  /** Generation timestamp */
  generatedAt: number;
  /** Content hash for change tracking */
  contentHash: string;
  /** Previous content hash (for edit tracking) */
  previousHash?: string;
  /** Number of AST patches applied (0 = full file write) */
  patchCount: number;
}

export interface BuildManifest {
  /** Unique build ID */
  buildId: string;
  /** When the build started */
  startedAt: number;
  /** When the build completed */
  completedAt?: number;
  /** Build duration in ms */
  durationMs?: number;
  /** User prompt that triggered this build */
  prompt: string;
  /** Build type */
  buildType: "new_app" | "edit" | "repair" | "template";
  /** Total files generated/modified */
  totalFiles: number;
  /** Files that used surgical patches vs full replacement */
  surgicalEdits: number;
  fullRewrites: number;
  /** Individual file entries */
  entries: ManifestEntry[];
  /** Errors encountered during build */
  errors: string[];
  /** Whether the build succeeded */
  success: boolean;
}

// ─── Content Hashing ─────────────────────────────────────────────────────

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// ─── Manifest Manager ────────────────────────────────────────────────────

let _currentManifest: BuildManifest | null = null;
let _history: BuildManifest[] = [];
let _buildCounter = 0;

/**
 * Start a new build manifest.
 */
export function startBuildManifest(prompt: string, buildType: BuildManifest["buildType"]): BuildManifest {
  _currentManifest = {
    buildId: `build_${++_buildCounter}_${Date.now()}`,
    startedAt: Date.now(),
    prompt,
    buildType,
    totalFiles: 0,
    surgicalEdits: 0,
    fullRewrites: 0,
    entries: [],
    errors: [],
    success: false,
  };
  return _currentManifest;
}

/**
 * Record a file that was generated or modified.
 */
export function recordFileInManifest(
  filePath: string,
  content: string,
  options: {
    origin: ManifestEntry["origin"];
    irNodeId?: string;
    taskLabel?: string;
    taskIndex?: number;
    model?: string;
    previousContent?: string;
    patchCount?: number;
  }
): void {
  if (!_currentManifest) return;

  const entry: ManifestEntry = {
    filePath,
    origin: options.origin,
    irNodeId: options.irNodeId,
    taskLabel: options.taskLabel,
    taskIndex: options.taskIndex,
    model: options.model,
    generatedAt: Date.now(),
    contentHash: hashContent(content),
    previousHash: options.previousContent ? hashContent(options.previousContent) : undefined,
    patchCount: options.patchCount ?? 0,
  };

  _currentManifest.entries.push(entry);
  _currentManifest.totalFiles = _currentManifest.entries.length;

  if (entry.patchCount > 0) {
    _currentManifest.surgicalEdits++;
  } else {
    _currentManifest.fullRewrites++;
  }
}

/**
 * Record an error during the build.
 */
export function recordBuildError(error: string): void {
  if (!_currentManifest) return;
  _currentManifest.errors.push(error);
}

/**
 * Complete the current build manifest.
 */
export function completeBuildManifest(success: boolean): BuildManifest | null {
  if (!_currentManifest) return null;

  _currentManifest.completedAt = Date.now();
  _currentManifest.durationMs = _currentManifest.completedAt - _currentManifest.startedAt;
  _currentManifest.success = success;

  const manifest = { ..._currentManifest };
  _history.push(manifest);

  // Keep last 20 builds
  if (_history.length > 20) _history = _history.slice(-20);

  console.log(
    `[BuildManifest] Build ${manifest.buildId} ${success ? "✅" : "❌"} — ` +
    `${manifest.totalFiles} files (${manifest.surgicalEdits} surgical, ${manifest.fullRewrites} full) ` +
    `in ${manifest.durationMs}ms`
  );

  _currentManifest = null;
  return manifest;
}

/**
 * Get the current in-progress manifest.
 */
export function getCurrentManifest(): BuildManifest | null {
  return _currentManifest;
}

/**
 * Get build history.
 */
export function getBuildHistory(): BuildManifest[] {
  return [..._history];
}

/**
 * Get the last completed build manifest.
 */
export function getLastBuild(): BuildManifest | null {
  return _history.length > 0 ? _history[_history.length - 1] : null;
}

/**
 * Clear all history (used on project switch).
 */
export function clearBuildHistory(): void {
  _history = [];
  _currentManifest = null;
  _buildCounter = 0;
}
