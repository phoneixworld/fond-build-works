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
export { validateFileSyntax, validateAllFiles, buildFileRetryPrompt, type ParseResult } from "./syntaxValidator";
export { checkBuildInvariants, type InvariantResult, type InvariantViolation } from "./buildInvariants";
export { selectLayoutSnippets, formatLayoutSnippetsForPrompt, LAYOUT_SNIPPETS, type LayoutSnippet } from "./layoutSnippets";
export { ANIMATIONS, MOTION_PRESETS, ANIMATION_CSS, ANIMATION_PROMPT_SECTION } from "./animations";
export { applyPolishPass, type PolishResult } from "./polishPass";
export {
  classifyEditIntent,
  executeSurgicalEdit,
  analyzeRenameImpact,
  findUnusedImports,
  removeAllUnusedImports,
  type EditIntentType,
  type ClassifiedIntent,
  type SurgicalEditResult,
} from "./surgicalEditor";
export {
  verifyWithAST,
  formatVerificationSummary,
  type ASTVerificationResult,
  type ASTVerificationIssue,
  type QualityScore,
} from "./astVerifier";

// Phase 5: Hybrid Generation Engine
export {
  classifyFiles,
  saturateWithTemplates,
  analyzeAIGaps,
  gapsToMicroTasks,
  type HybridPlan,
  type FileClassification,
  type GenerationLane,
  type AIGap,
} from "./hybridGenerator";

// Phase 6: Agent Orchestration
export {
  registerAgent,
  getAgentsForPhase,
  executeAgentPhase,
  buildAgentPipelineSummary,
  type AgentDefinition,
  type AgentPipelineResult,
} from "./agentOrchestrationPhase";

// Phase 7: WebContainer Runtime Validation
export {
  validateRuntime,
  validateQuick,
  type RuntimeValidationResult,
  type TierResult,
  type ValidationCheck,
  type FileValidationResult,
} from "./webContainerValidator";
