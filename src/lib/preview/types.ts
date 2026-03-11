/**
 * Phoenix Preview Architecture — Core Types
 * 
 * Defines the contracts for the multi-engine preview system.
 * All engines (ESM, Sandpack, future Vite) implement PreviewEngine.
 */

// ─── Session ────────────────────────────────────────────────────────────────

export type PreviewEngineType = "esm" | "sandpack" | "vite";
export type PreviewSessionStatus = "initializing" | "ready" | "error" | "expired";

export interface PreviewSession {
  id: string;
  workspaceId: string;
  engine: PreviewEngineType;
  createdAt: number;
  lastActiveAt: number;
  status: PreviewSessionStatus;
  entryUrl: string;
  /** Complexity score 0–100, used for engine selection */
  complexityScore: number;
  /** Diagnostics collected during build */
  diagnostics: PreviewDiagnostic[];
  /** Telemetry metrics */
  metrics: PreviewMetrics;
}

// ─── Workspace Snapshot ─────────────────────────────────────────────────────

export interface WorkspaceSnapshot {
  files: Record<string, string>;
  dependencies: Record<string, string>;
  projectId: string;
  /** Computed metadata */
  fileCount: number;
  totalSizeBytes: number;
  complexityScore: number;
  hasRouting: boolean;
  hasAuth: boolean;
  entryFile: string | null;
  /** Supabase config for runtime injection */
  supabaseUrl?: string;
  supabaseKey?: string;
}

// ─── Build Result ───────────────────────────────────────────────────────────

export interface PreviewBuildResult {
  htmlShell: string;
  importMap: Record<string, string>;
  modules: Record<string, string>;
  assets: Record<string, string>;
  entryFile: string;
  diagnostics: PreviewDiagnostic[];
  metrics: PreviewMetrics;
}

// ─── Engine Contract ────────────────────────────────────────────────────────

export interface PreviewEngine {
  readonly name: PreviewEngineType;
  canHandle(snapshot: WorkspaceSnapshot): boolean;
  build(session: PreviewSession, snapshot: WorkspaceSnapshot): PreviewBuildResult;
  getEntryHtml(result: PreviewBuildResult): string;
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCategory =
  | "import-map-missing"
  | "entrypoint-missing"
  | "root-element-missing"
  | "asset-resolution-failure"
  | "esm-syntax-error"
  | "compile-error"
  | "circular-import"
  | "unresolved-import"
  | "complexity-warning";

export interface PreviewDiagnostic {
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  message: string;
  file?: string;
  line?: number;
  timestamp: number;
}

// ─── Telemetry ──────────────────────────────────────────────────────────────

export interface PreviewMetrics {
  buildStartMs: number;
  buildEndMs: number;
  buildDurationMs: number;
  fileCount: number;
  moduleCount: number;
  dependencyCount: number;
  totalSizeBytes: number;
  errorCount: number;
  warningCount: number;
}

// ─── Import Map Provider ────────────────────────────────────────────────────

export interface ImportMapProvider {
  /** Resolve a bare specifier to a full URL */
  resolve(specifier: string, version?: string): string;
  /** Bulk resolve all specifiers */
  resolveAll(specifiers: BareImport[]): Record<string, string>;
}

export interface BareImport {
  specifier: string;
  subpath?: string;
  version?: string;
}

// ─── Compiled Module ────────────────────────────────────────────────────────

export interface CompiledModule {
  path: string;
  originalPath: string;
  code: string;
  imports: string[];
  exports: string[];
  hasDefaultExport: boolean;
  sizeBytes: number;
}

// ─── Orchestrator Config ────────────────────────────────────────────────────

export interface PreviewOrchestratorConfig {
  /** Max files before complexity warning */
  maxFiles: number;
  /** Max total size in bytes */
  maxTotalSize: number;
  /** Session TTL in milliseconds */
  sessionTtlMs: number;
  /** Complexity threshold for ESM vs Sandpack */
  esmComplexityThreshold: number;
  /** CDN base URL */
  cdnBaseUrl: string;
  /** Supabase config for runtime injection */
  supabase?: {
    url: string;
    anonKey: string;
  };
}

export const DEFAULT_ORCHESTRATOR_CONFIG: PreviewOrchestratorConfig = {
  maxFiles: 200,
  maxTotalSize: 5 * 1024 * 1024, // 5MB
  sessionTtlMs: 30 * 60 * 1000,  // 30 minutes
  esmComplexityThreshold: 10,     // Score below this → Sandpack
  cdnBaseUrl: "https://esm.sh",
  supabase: undefined,
};
