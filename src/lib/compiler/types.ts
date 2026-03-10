/**
 * Build Compiler v1.0 — Type System
 * 
 * All shared types for the compiler pipeline:
 * BuildContext, TaskGraph, Workspace, VerificationResult, RepairAction, BuildTrace
 */

// ─── Build Intent ─────────────────────────────────────────────────────────

export type BuildIntent = "new_app" | "extend" | "refactor" | "fix";

// ─── Canonical Build Context ──────────────────────────────────────────────

export interface BuildContext {
  /** Raw requirement text from all conversation phases, in order */
  rawRequirements: string;
  /** LLM-extracted semantic summary of what the user wants */
  semanticSummary: string;
  /** Structured IR: entities, roles, workflows, routes, constraints */
  ir: IRManifest;
  /** Current workspace state (file tree + contents) */
  existingWorkspace: Record<string, string>;
  /** What kind of build is this */
  buildIntent: BuildIntent;
  /** Project metadata */
  projectId: string;
  techStack: string;
  /** Optional enrichment */
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
}

export interface IRManifest {
  entities: IREntity[];
  roles: IRRole[];
  workflows: IRWorkflow[];
  routes: IRRoute[];
  modules: IRModule[];
  constraints: string[];
}

export interface IREntity {
  name: string;
  fields: { name: string; type: string; required?: boolean }[];
  relationships?: { target: string; type: "one-to-many" | "many-to-one" | "many-to-many" }[];
}

export interface IRRole {
  name: string;
  permissions: string[];
}

export interface IRWorkflow {
  name: string;
  steps: string[];
  trigger?: string;
}

export interface IRRoute {
  path: string;
  page: string;
  auth?: boolean;
  roles?: string[];
}

export interface IRModule {
  name: string;
  type: "page" | "component" | "context" | "hook" | "util" | "service" | "style";
  description: string;
}

// ─── Task Graph ───────────────────────────────────────────────────────────

export type TaskType = "backend" | "frontend" | "infra" | "tests";
export type TaskStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";

export interface CompilerTask {
  id: string;
  label: string;
  type: TaskType;
  description: string;
  /** Build prompt sent to the AI model for this task */
  buildPrompt: string;
  /** Task IDs this depends on */
  dependsOn: string[];
  /** Files this task is expected to create */
  produces: string[];
  /** Existing files this task may modify */
  touches: string[];
  /** Scheduling priority (lower = earlier within same pass) */
  priority: number;
  /** Runtime state */
  status: TaskStatus;
  /** Retry count for this task */
  retries: number;
  /** Error message if failed */
  error?: string;
}

export interface TaskGraph {
  tasks: CompilerTask[];
  /** Passes: groups of task IDs that can run in the same pass */
  passes: string[][];
}

// ─── Workspace ────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  content: string;
}

export interface SymbolIndex {
  /** path → list of exported symbol names */
  exports: Record<string, string[]>;
  /** path → list of { from: importPath, symbols: string[] } */
  imports: Record<string, ImportRef[]>;
}

export interface ImportRef {
  from: string;
  symbols: string[];
  isDefault: boolean;
}

// ─── Verification ─────────────────────────────────────────────────────────

export type IssueCategory =
  | "syntax_error"
  | "missing_file"
  | "missing_export"
  | "broken_import"
  | "missing_route"
  | "empty_stub"
  | "missing_component";

export type IssueSeverity = "error" | "warning";

export interface VerificationIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  file: string;
  line?: number;
  message: string;
  /** Suggested fix action */
  suggestedFix?: string;
}

export interface VerificationResult {
  ok: boolean;
  issues: VerificationIssue[];
  stats: {
    totalFiles: number;
    parsedOk: number;
    parseFailed: number;
    importsResolved: number;
    importsBroken: number;
    routesOk: number;
    routesMissing: number;
  };
}

// ─── Repair ───────────────────────────────────────────────────────────────

export type RepairActionType =
  | "fix_missing_file"
  | "fix_missing_export"
  | "fix_import"
  | "fix_syntax"
  | "remove_empty_stub";

export interface RepairAction {
  type: RepairActionType;
  targetFile: string;
  issue: VerificationIssue;
  /** Micro-prompt for the AI to fix just this issue */
  prompt: string;
}

// ─── Build Result ─────────────────────────────────────────────────────────

export type BuildStatus = "success" | "partial" | "failed";

export interface BuildResult {
  status: BuildStatus;
  workspace: Record<string, string>;
  verification: VerificationResult;
  trace: BuildTrace;
  /** Human-readable summary */
  summary: string;
  /** Known limitations or unfixed issues */
  knownIssues: string[];
  /** Suggested next actions for the user */
  nextActions: string[];
}

// ─── Observability ────────────────────────────────────────────────────────

export interface PassTiming {
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface TaskTrace {
  taskId: string;
  label: string;
  status: TaskStatus;
  durationMs: number;
  modelTokensUsed?: number;
  cacheHit: boolean;
  retries: number;
  filesProduced: string[];
  error?: string;
}

export interface BuildTrace {
  buildId: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  passes: PassTiming[];
  tasks: TaskTrace[];
  repairRounds: number;
  repairActions: RepairAction[];
  context: {
    intent: BuildIntent;
    taskCount: number;
    passCount: number;
    fileCountBefore: number;
    fileCountAfter: number;
  };
}
