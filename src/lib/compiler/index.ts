/**
 * Build Compiler v1.0 — Public API
 * 
 * Single entry point for the entire compiler system.
 */

// Core
export { compile } from "./compiler";
export type { CompileOptions, CompileCallbacks } from "./compiler";

// IR Extractor
export { extractIRWithModel, createEmptyIR } from "./irExtractor";

// Types
export type {
  BuildContext,
  BuildIntent,
  BuildResult,
  BuildStatus,
  BuildTrace,
  CompilerTask,
  TaskGraph,
  TaskType,
  TaskStatus,
  IRManifest,
  IREntity,
  IRRole,
  IRRoute,
  IRWorkflow,
  IRModule,
  VerificationResult,
  VerificationIssue,
  IssueCategory,
  IssueSeverity,
  RepairAction,
  RepairActionType,
  FileEntry,
  SymbolIndex,
  ImportRef,
  PassTiming,
  TaskTrace,
} from "./types";

// Sub-modules (for advanced usage)
export { assembleBuildContext, detectBuildIntent, extractIRFromRequirements } from "./context";
export { planTaskGraph, topologicalSort } from "./planner";
export { Workspace } from "./workspace";
export { verifyWorkspace } from "./verifier";
export { classifyRepairActions, applyDeterministicFix, MAX_REPAIR_ROUNDS, MAX_REPAIR_ACTIONS_TOTAL } from "./repair";
export { createTrace, printTrace } from "./observability";
export { lintDesignQuality, formatLintSummary, type DesignLintResult, type DesignLintIssue } from "./designLint";
export { DESIGN_THEMES, getDesignThemePrompt, detectDesignTheme, type DesignTheme } from "./designThemes";
