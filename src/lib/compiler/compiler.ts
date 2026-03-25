/**
 * Build Compiler v1.0 — Main Orchestrator
 * 
 * The top-level compile() function that wires everything together:
 * 
 *   Context Assembly → Plan → Execute Passes → Verify → Repair → Complete
 * 
 * This replaces the ad-hoc buildEngine pipeline with a deterministic compiler.
 */

import type { IR } from "@/lib/ir";
import { scaffoldPagesFromIR } from "@/lib/pageScaffolder";
import { scaffoldEntitiesFromIR } from "@/lib/entityScaffolder";
import type {
  BuildContext, BuildResult, BuildStatus,
  CompilerTask, TaskGraph, VerificationResult, RuntimeVerification,
} from "./types";
import { assembleBuildContext } from "./context";
import { planTaskGraph, topologicalSort } from "./planner";
import { extractIRWithModel } from "./irExtractor";
import { Workspace } from "./workspace";
import { executeTask, type ExecutionCallbacks } from "./executor";
import { verifyWorkspace } from "./verifier";
import { classifyRepairActions, buildRepairSummary, applyDeterministicFix, MAX_REPAIR_ROUNDS, MAX_REPAIR_ACTIONS_TOTAL } from "./repair";
import { fixBrokenImports } from "./importFixer";
import { repairMissingModules } from "./missingModuleGen";
import { injectMissingProviders } from "./providerInjector";
import { fixMissingImports, fixProviderOrdering } from "./missingImportFixer";
import { fixExportMismatches } from "./exportMismatchFixer";
import { deduplicateFiles } from "./deduplicator";
import { normalizeGeneratedStructure } from "./structureNormalizer";
import { lintDesignQuality, formatLintSummary } from "./designLint";
import { detectDesignTheme } from "./designThemes";
import {
  createTrace, startPass, endPass,
  traceTaskStart, traceTaskEnd, finalizeTrace, printTrace,
} from "./observability";
import { cloudLog } from "@/lib/cloudLogBus";
import { synthesizeAppJsx } from "./appSynthesizer";
import { getSharedUIComponents, getGlobalStyles, getDomainComponents, generateAuthContext } from "@/lib/templates/scaffoldTemplates";
import {
  runPreBuildAgents, runPostBuildAgents, createPipelineContext,
  type AgentCallbacks, type OrchestratorResult,
} from "@/lib/agents";
import { reconcileSidebarAndRouter } from "./sidebarRouterReconciler";
import { checkBuildInvariants } from "./buildInvariants";
import { fetchServerPlan, serverPlanToTaskGraph } from "@/lib/serverPlanAgent";

// ─── Public API ───────────────────────────────────────────────────────────

export interface CompileOptions {
  rawRequirements: string;
  existingWorkspace: Record<string, string>;
  projectId: string;
  techStack: string;
  semanticSummary?: string;
  ir?: any;
  /** Structured IR from the new type system — if provided, skips AI extraction */
  structuredIR?: IR;
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
}

export interface CompileCallbacks {
  onPhase: (phase: string, detail: string) => void;
  onPlanReady?: (tasks: CompilerTask[]) => void;
  onTaskStart: (task: CompilerTask, index: number, total: number) => void;
  onTaskDelta: (task: CompilerTask, chunk: string) => void;
  onTaskDone: (task: CompilerTask, files: Record<string, string>) => void;
  onTaskError: (task: CompilerTask, error: string) => void;
  onVerification: (result: VerificationResult) => void;
  onRepairStart: (round: number, actionCount: number) => void;
  onComplete: (result: BuildResult) => void;
  /** Optional: agent orchestration callbacks */
  onAgentStart?: (agent: string) => void;
  onAgentProgress?: (agent: string, message: string) => void;
  onAgentDone?: (agent: string, result: any) => void;
}

/**
 * Main entry point: compile requirements into a working application.
 * Now includes invisible multi-agent orchestration:
 *   Pre-build: workflow → database (schema auto-detection)
 *   Compiler: context → plan → execute → verify → repair
 *   Post-build: testing → governance (safety gate)
 */
export async function compile(
  options: CompileOptions,
  callbacks: CompileCallbacks
): Promise<BuildResult> {

  // ── Phase 1: Context Assembly ──────────────────────────────────────

  callbacks.onPhase("context", "Assembling build context...");

  const ctx = assembleBuildContext({
    rawRequirements: options.rawRequirements,
    semanticSummary: options.semanticSummary,
    ir: options.ir,
    existingWorkspace: options.existingWorkspace,
    projectId: options.projectId,
    techStack: options.techStack,
    schemas: options.schemas,
    knowledge: options.knowledge,
    designTheme: options.designTheme,
    model: options.model,
  });

  cloudLog.info(`Build started: intent=${ctx.buildIntent}, ${ctx.ir.entities.length} entities, ${ctx.ir.routes.length} routes`, "compiler");
  console.log(`[Compiler] Context assembled: intent=${ctx.buildIntent}, entities=${ctx.ir.entities.length}, routes=${ctx.ir.routes.length}, modules=${ctx.ir.modules.length}`);

  // ── Phase 1.5: Pre-Build Agents (invisible) ─────────────────────────

  const agentCallbacks: AgentCallbacks = {
    onAgentStart: (agent) => {
      callbacks.onAgentStart?.(agent);
      callbacks.onPhase("agents", `Agent: ${agent}...`);
    },
    onAgentProgress: (agent, message) => {
      callbacks.onAgentProgress?.(agent, message);
    },
    onAgentDone: (agent, result) => {
      callbacks.onAgentDone?.(agent, result);
      cloudLog.info(`[Agent:${agent}] ${result.summary}`, "orchestrator");
    },
  };

  const pipelineCtx = createPipelineContext({
    projectId: options.projectId,
    techStack: options.techStack,
    rawRequirements: options.rawRequirements,
    ir: options.ir,
    schemas: options.schemas,
    knowledge: options.knowledge,
    designTheme: options.designTheme,
    model: options.model,
    existingWorkspace: options.existingWorkspace,
  });

  try {
    const enrichedCtx = await runPreBuildAgents(pipelineCtx, agentCallbacks);
    if (enrichedCtx.schemas && enrichedCtx.schemas.length > 0) {
      ctx.schemas = enrichedCtx.schemas;
    }
    if (enrichedCtx.tableMappings && Object.keys(enrichedCtx.tableMappings).length > 0) {
      ctx.tableMappings = enrichedCtx.tableMappings;
      console.log(`[Compiler] Table mappings injected:`, ctx.tableMappings);
    }
  } catch (err: any) {
    console.warn("[Compiler] Pre-build agents failed (non-fatal):", err.message);
  }

  // ── Phase 1.8: Server-Side Planning (plan-agent) ─────────────────────────
  // Try server-side plan-agent first — it produces contract-driven task graphs
  // with interface contracts and dependency declarations. Falls back to client-side
  // IR extraction + planning if server call fails.

  callbacks.onPhase("planning", "Planning build with server-side agent...");

  let structuredIR: IR | undefined = options.structuredIR;
  let taskGraph: TaskGraph;
  let usedServerPlan = false;

  console.log(`[Compiler] 🔍 Server plan gate: buildIntent=${ctx.buildIntent}, structuredIR=${!!structuredIR}, existingFiles=${Object.keys(options.existingWorkspace).length}`);

  if (ctx.buildIntent === "new_app" && !structuredIR) {
    try {
      console.log("[Compiler] 📡 Invoking plan-agent...");
      const serverPlan = await fetchServerPlan({
        prompt: ctx.rawRequirements,
        existingFiles: Object.keys(options.existingWorkspace),
        techStack: options.techStack,
        schemas: options.schemas,
        knowledge: options.knowledge,
      });

      if (serverPlan && serverPlan.tasks.length > 0) {
        taskGraph = serverPlanToTaskGraph(serverPlan);
        usedServerPlan = true;
        cloudLog.info(`[Compiler] Using server plan: ${serverPlan.mode}, ${taskGraph.tasks.length} tasks`, "compiler");
        console.log(`[Compiler] ✅ Server plan-agent: ${serverPlan.mode}, ${taskGraph.tasks.length} tasks, complexity=${serverPlan.overallComplexity}`);
      } else {
        console.warn("[Compiler] ⚠️ Server plan returned null/empty, falling back to client planner");
      }
    } catch (err: any) {
      console.warn("[Compiler] ❌ Server plan-agent failed (falling back to client):", err.message);
    }
  } else {
    console.log(`[Compiler] ⏭️ Skipping plan-agent: buildIntent=${ctx.buildIntent}, structuredIR=${!!structuredIR}`);
  }

  // Fallback: client-side IR extraction + planning
  if (!usedServerPlan) {
    if (!structuredIR) {
      callbacks.onPhase("ir-extraction", "Extracting structured IR from requirements...");
      try {
        structuredIR = await extractIRWithModel(ctx.rawRequirements, {
          projectId: options.projectId,
          techStack: options.techStack,
          model: options.model,
        });
        cloudLog.info(`[Compiler] IR extracted: ${Object.keys(structuredIR.entities).length} entities, ${structuredIR.pages.length} pages`, "compiler");
      } catch (err: any) {
        console.warn("[Compiler] IR extraction failed (non-fatal):", err.message);
      }
    }

    // Attach structured IR to context for downstream consumption
    (ctx as any).structuredIR = structuredIR;

    callbacks.onPhase("planning", "Building task graph...");
    taskGraph = planTaskGraph(ctx, structuredIR);
  }

  cloudLog.info(`Task graph: ${taskGraph!.tasks.length} tasks across ${taskGraph!.passes.length} passes`, "compiler");
  console.log(`[Compiler] Task graph: ${taskGraph!.tasks.length} tasks, ${taskGraph!.passes.length} passes (server=${usedServerPlan})`);
  
  // Notify UI with all task labels upfront
  callbacks.onPlanReady?.(taskGraph!.tasks);
  
  for (let i = 0; i < taskGraph!.passes.length; i++) {
    const passTaskLabels = taskGraph!.passes[i].map(id =>
      taskGraph!.tasks.find(t => t.id === id)?.label || id
    );
    console.log(`[Compiler]   Pass ${i + 1}: ${passTaskLabels.join(", ")}`);
  }

  // ── Initialize trace ──────────────────────────────────────────────

  const trace = createTrace({
    intent: ctx.buildIntent,
    taskCount: taskGraph.tasks.length,
    passCount: taskGraph.passes.length,
    fileCountBefore: Object.keys(ctx.existingWorkspace).length,
  });

  // ── Phase 3: Execution ─────────────────────────────────────────────

  callbacks.onPhase("executing", `Running ${taskGraph.tasks.length} tasks across ${taskGraph.passes.length} passes...`);

  const workspace = new Workspace(ctx.existingWorkspace);

  // ── Pre-scaffold UI component library into workspace ──────────────
  // These are the "pre-built" components referenced by the planner's infra task.
  // Without this step, generated pages import from /components/ui/ but find empty files.
  const uiComponents = getSharedUIComponents();
  let scaffoldedCount = 0;
  for (const [path, content] of Object.entries(uiComponents)) {
    if (!workspace.hasFile(path)) {
      workspace.addFile(path, content);
      scaffoldedCount++;
    }
  }
  // Also inject globals.css with design tokens + animations
  if (!workspace.hasFile("/styles/globals.css")) {
    workspace.addFile("/styles/globals.css", getGlobalStyles());
    scaffoldedCount++;
  }
  // Pre-scaffold domain components (StatCard, StatusBadge, etc.) as reliable fallbacks
  const domainComponents = getDomainComponents();
  for (const [path, content] of Object.entries(domainComponents)) {
    if (!workspace.hasFile(path)) {
      workspace.addFile(path, content);
      scaffoldedCount++;
    }
  }
  if (scaffoldedCount > 0) {
    cloudLog.info(`Pre-scaffolded ${scaffoldedCount} UI + domain components + design tokens`, "compiler");
    console.log(`[Compiler] 🎨 Pre-scaffolded ${scaffoldedCount} UI + domain components into workspace`);
  }

  // ── Phase 2.5: Deterministic IR page scaffolding ─────────────────────
  // Seed the workspace with page files and App.jsx generated from structured IR
  // BEFORE any model code is streamed. The model refines these instead of inventing them.
  if (structuredIR && structuredIR.pages.length > 0) {
    let irScaffoldCount = 0;

    // Seed mock APIs + contexts for every entity
    const entityFiles = scaffoldEntitiesFromIR(structuredIR);
    for (const [path, content] of Object.entries(entityFiles)) {
      if (!workspace.hasFile(path)) {
        workspace.addFile(path, content);
        irScaffoldCount++;
      }
    }

    // Seed page files from IR
    const irPages = scaffoldPagesFromIR(structuredIR);
    for (const [path, content] of Object.entries(irPages)) {
      if (!workspace.hasFile(path)) {
        workspace.addFile(path, content);
        irScaffoldCount++;
      }
    }

    // App.jsx will be synthesized AFTER task execution in Phase 3.10
    // using workspace-driven synthesizeAppJsx — NOT IR-based synthesis.
    // This ensures imports match actual generated files.

    if (irScaffoldCount > 0) {
      cloudLog.info(`IR scaffolder: seeded ${irScaffoldCount} files (entities + pages + App.jsx) from structured IR`, "compiler");
      console.log(`[Compiler] 📄 IR scaffolder: seeded ${irScaffoldCount} files from structured IR`);
    }
  }

  const sortedTasks = topologicalSort(taskGraph.tasks);

  const executionCallbacks: ExecutionCallbacks = {
    onTaskStart: callbacks.onTaskStart,
    onTaskDelta: callbacks.onTaskDelta,
    onTaskDone: callbacks.onTaskDone,
    onTaskError: callbacks.onTaskError,
    onPassStart: (passIndex, taskIds) => {
      callbacks.onPhase("executing", `Pass ${passIndex + 1}/${taskGraph.passes.length}`);
    },
  };

  let buildAborted = false;
  try {
    for (let passIdx = 0; passIdx < taskGraph.passes.length; passIdx++) {
      const passTaskIds = taskGraph.passes[passIdx];
      const passTiming = startPass(trace, `pass-${passIdx + 1}`);
      executionCallbacks.onPassStart(passIdx, passTaskIds);

      // Execute tasks in this pass sequentially
      for (const taskId of passTaskIds) {
        const task = taskGraph.tasks.find(t => t.id === taskId)!;
        const taskIdx = sortedTasks.findIndex(t => t.id === taskId);
        const taskTrace = traceTaskStart(trace, task);
        const taskStartTime = performance.now();

        task.status = "in_progress";
        callbacks.onTaskStart(task, taskIdx, sortedTasks.length);

        try {
          const taskFiles = await executeTask(
            task, ctx, workspace, taskIdx, sortedTasks.length, executionCallbacks
          );

          const producedFiles = workspace.applyPatch(taskFiles);
          task.status = "done";

          callbacks.onTaskDone(task, taskFiles);
          traceTaskEnd(taskTrace, taskStartTime, {
            status: "done",
            filesProduced: producedFiles,
            retries: task.retries,
            cacheHit: false,
          });

          cloudLog.info(`Task '${task.label}' completed: ${producedFiles.length} files`, "compiler");
          console.log(`[Compiler] ✅ Task '${task.label}' done: ${producedFiles.length} files`);
        } catch (err: any) {
          task.status = "failed";
          task.error = err.message;

          callbacks.onTaskError(task, err.message);
          traceTaskEnd(taskTrace, taskStartTime, {
            status: "failed",
            filesProduced: [],
            retries: task.retries,
            cacheHit: false,
            error: err.message,
          });

          cloudLog.error(`Task '${task.label}' failed: ${err.message}`, "compiler");
          console.error(`[Compiler] ❌ Task '${task.label}' failed:`, err.message);

          // ── FAIL-FAST on credit/billing errors ──
          const isCreditError = /usage limit|credit|402|rate limit|429/i.test(err.message);
          if (isCreditError) {
            cloudLog.error(`[Compiler] ⛔ Aborting build — AI gateway credit/rate limit hit`, "compiler");
            // Mark all remaining tasks as skipped
            for (const remainingId of passTaskIds.slice(passTaskIds.indexOf(taskId) + 1)) {
              const rt = taskGraph.tasks.find(t => t.id === remainingId);
              if (rt) { rt.status = "failed"; rt.error = "Skipped — AI usage limit reached"; }
            }
            for (let futurePass = passIdx + 1; futurePass < taskGraph.passes.length; futurePass++) {
              for (const futureId of taskGraph.passes[futurePass]) {
                const ft = taskGraph.tasks.find(t => t.id === futureId);
                if (ft) { ft.status = "failed"; ft.error = "Skipped — AI usage limit reached"; }
              }
            }
            endPass(passTiming);
            throw new Error("AI_USAGE_LIMIT_REACHED");
          }
        }
      }

      endPass(passTiming);
    }
  } catch (abortErr: any) {
    if (abortErr.message === "AI_USAGE_LIMIT_REACHED") {
      buildAborted = true;
      callbacks.onPhase("verifying", "Build aborted — AI usage limit reached. Verifying partial output...");
      cloudLog.error(`Build aborted due to AI usage limit. Partial output will be verified.`, "compiler");
    } else {
      throw abortErr;
    }
  }

  // ── Phase 3.45: File Deduplication ───────────────────────────────────

  callbacks.onPhase("deduplicating", "Removing duplicate content blocks...");

  const deduplicatedCount = deduplicateFiles(workspace);
  if (deduplicatedCount > 0) {
    cloudLog.warn(`Deduplicator: cleaned ${deduplicatedCount} file(s) with duplicate content`, "compiler");
    console.log(`[Compiler] 🧹 Deduplicator: cleaned ${deduplicatedCount} file(s) with duplicate content`);
  }

  // ── Phase 3.5: Deterministic Import Fix ─────────────────────────────

  callbacks.onPhase("fixing-imports", "Fixing broken import paths...");

  const importsFixed = fixBrokenImports(workspace);
  if (importsFixed > 0) {
    cloudLog.info(`Import fixer: corrected ${importsFixed} broken import path(s)`, "compiler");
    console.log(`[Compiler] 🔗 Import fixer: corrected ${importsFixed} broken import path(s)`);
  }

  // ── Phase 3.6: Missing Module Generation ───────────────────────────

  callbacks.onPhase("generating-stubs", "Generating missing modules...");

  const { created: stubsCreated, issues: missingModules } = repairMissingModules(workspace);
  if (stubsCreated.length > 0) {
    cloudLog.warn(`Generated ${stubsCreated.length} missing module stub(s): ${stubsCreated.join(", ")}`, "compiler");
    console.log(`[Compiler] 📦 Generated ${stubsCreated.length} missing module stub(s)`);
    
    // Re-run import fixer since new files may enable better path resolution
    const extraFixes = fixBrokenImports(workspace);
    if (extraFixes > 0) {
      console.log(`[Compiler] 🔗 Post-stub import fixer: corrected ${extraFixes} more path(s)`);
    }
  }

  // ── Phase 3.7: Provider Injection ──────────────────────────────────

  callbacks.onPhase("injecting-providers", "Checking for missing providers...");

  const providersInjected = injectMissingProviders(workspace);
  if (providersInjected > 0) {
    cloudLog.info(`Provider injector: added ${providersInjected} missing provider(s) to App`, "compiler");
    console.log(`[Compiler] 💉 Provider injector: added ${providersInjected} missing provider(s)`);
  }

  // ── Phase 3.8: Missing Import Injection ─────────────────────────────

  callbacks.onPhase("fixing-missing-imports", "Injecting missing imports...");

  const missingImportsFixed = fixMissingImports(workspace);
  if (missingImportsFixed > 0) {
    cloudLog.info(`Missing import fixer: injected ${missingImportsFixed} missing import(s)`, "compiler");
    console.log(`[Compiler] 📥 Missing import fixer: injected ${missingImportsFixed} missing import(s)`);
  }

  // ── Phase 3.85: AuthContext Guard ───────────────────────────────────
  // If the LLM regenerated AuthContext with useNavigate, replace it with
  // the hardened router-agnostic template.
  {
    const authPath = workspace.hasFile("/contexts/AuthContext.jsx")
      ? "/contexts/AuthContext.jsx"
      : workspace.hasFile("/contexts/AuthContext.tsx")
        ? "/contexts/AuthContext.tsx"
        : null;

    if (authPath) {
      const currentAuth = workspace.getFile(authPath) || "";
      if (currentAuth.includes("useNavigate")) {
        workspace.updateFile(authPath, generateAuthContext());
        cloudLog.info("AuthContext guard: replaced useNavigate version with hardened template", "compiler");
        console.log("[Compiler] 🔐 AuthContext guard: replaced useNavigate version with hardened template");
      }
    }
  }



  callbacks.onPhase("fixing-provider-order", "Validating provider nesting order...");

  const providerOrderFixed = fixProviderOrdering(workspace);
  if (providerOrderFixed) {
    cloudLog.info("Provider ordering fixed: ToastProvider now wraps AuthProvider", "compiler");
    console.log("[Compiler] 🔄 Fixed provider ordering: ToastProvider now wraps AuthProvider");
  }

  // ── Phase 3.95: Export Mismatch Fix ──────────────────────────────────

  callbacks.onPhase("fixing-export-mismatches", "Fixing default/named export mismatches...");

  const exportMismatchesFixed = fixExportMismatches(workspace);
  if (exportMismatchesFixed > 0) {
    cloudLog.info(`Export mismatch fixer: fixed ${exportMismatchesFixed} default/named mismatch(es)`, "compiler");
    console.log(`[Compiler] 🔀 Export mismatch fixer: fixed ${exportMismatchesFixed} default/named mismatch(es)`);
  }

  // ── Phase 3.96: Structural Normalization ─────────────────────────────

  callbacks.onPhase("normalizing-structure", "Normalizing generated file structure and provider wiring...");

  const structureFixes = normalizeGeneratedStructure(workspace);
  if (structureFixes > 0) {
    cloudLog.info(`Structure normalizer: applied ${structureFixes} structural fix(es)`, "compiler");
    console.log(`[Compiler] 🧱 Structure normalizer: applied ${structureFixes} structural fix(es)`);
  }

  // ── Phase 3.10: Ensure App.jsx exists and has valid imports ──────────

  const appEntryPoints = ["/App.jsx", "/App.tsx", "/App.js", "/App.ts"];
  const hasAppEntry = appEntryPoints.some(p => workspace.hasFile(p));

  if (!hasAppEntry) {
    callbacks.onPhase("synthesizing-app", "Generating App entry point...");
    const synthesizedApp = synthesizeAppJsx(workspace);
    workspace.addFile("/App.jsx", synthesizedApp);
    cloudLog.warn("App.jsx was missing after build — synthesized from available components", "compiler");
    console.log(`[Compiler] 🏗️ Synthesized missing App.jsx from available workspace components`);
  } else {
    // Validate App.jsx imports resolve to actual workspace files
    // If too many are broken, re-synthesize to prevent "Element type is invalid" errors
    const appPath = appEntryPoints.find(p => workspace.hasFile(p))!;
    const appContent = workspace.getFile(appPath)!;
    const appImports = appContent.matchAll(/import\s+\w+\s+from\s+["'](\.[^"']+)["']/g);
    let brokenImports = 0;
    let totalLocalImports = 0;
    for (const m of appImports) {
      totalLocalImports++;
      const resolved = workspace.resolveImport(appPath, m[1]);
      if (!resolved || !workspace.hasFile(resolved)) {
        brokenImports++;
        console.warn(`[Compiler] ⚠️ App.jsx import unresolved: ${m[1]}`);
      }
    }
    // If more than half of local imports are broken, re-synthesize
    if (totalLocalImports > 0 && brokenImports > 0 && brokenImports / totalLocalImports > 0.3) {
      callbacks.onPhase("synthesizing-app", "Re-synthesizing App.jsx (too many broken imports)...");
      const synthesizedApp = synthesizeAppJsx(workspace);
      workspace.updateFile(appPath, synthesizedApp);
      cloudLog.warn(`App.jsx had ${brokenImports}/${totalLocalImports} broken imports — re-synthesized`, "compiler");
      console.log(`[Compiler] 🏗️ Re-synthesized App.jsx: ${brokenImports}/${totalLocalImports} imports were broken`);
    }
  }

  // ── Phase 3.97: Sidebar–Router Reconciliation ────────────────────────
  
  callbacks.onPhase("reconciling-sidebar", "Ensuring sidebar navigation matches routes...");

  const reconciliation = reconcileSidebarAndRouter(workspace);
  if (reconciliation.routesAdded > 0 || reconciliation.stubsGenerated.length > 0) {
    cloudLog.info(`Sidebar reconciler: added ${reconciliation.routesAdded} route(s), generated ${reconciliation.stubsGenerated.length} stub(s)`, "compiler");
    console.log(`[Compiler] 🔗 Sidebar reconciler: ${reconciliation.routesAdded} routes added, ${reconciliation.stubsGenerated.length} stubs generated`);
  }

  // ── Phase 3.11: Re-run export mismatch fix on synthesized App.jsx ──
  // The synthesizer may produce default imports for files that only have named exports.
  // Running the fixer again catches these post-synthesis mismatches.
  {
    const postSynthFixes = fixExportMismatches(workspace);
    if (postSynthFixes > 0) {
      cloudLog.info(`Post-synthesis export mismatch fixer: fixed ${postSynthFixes} mismatch(es)`, "compiler");
      console.log(`[Compiler] 🔀 Post-synthesis export fix: ${postSynthFixes} mismatch(es)`);
    }
  }

  // ── Phase 4: Verification ──────────────────────────────────────────

  callbacks.onPhase("verifying", "Verifying workspace...");

  let verification = verifyWorkspace(workspace, taskGraph);
  callbacks.onVerification(verification);

  cloudLog.info(`Verification: ${verification.ok ? "PASS" : "FAIL"} — ${verification.issues.length} issues`, "compiler");
  console.log(`[Compiler] Verification: ${verification.ok ? "PASS" : "FAIL"} — ${verification.issues.length} issues (${verification.stats.parsedOk} parsed, ${verification.stats.importsBroken} broken imports)`);

  // ── Phase 4.5: Structural Invariant Checks ─────────────────────────
  
  const invariants = checkBuildInvariants(workspace, ctx.ir.routes.length, ctx.tableMappings);
  if (!invariants.passed) {
    const errors = invariants.violations.filter(v => v.severity === "error");
    console.warn(`[Compiler] ⚠️ ${errors.length} invariant violation(s):`, errors.map(v => v.message));
  }
  for (const v of invariants.violations) {
    console.log(`[Compiler] [Invariant:${v.invariant}] ${v.severity}: ${v.message}`);
  }

  // ── Phase 5: Auto-Repair ───────────────────────────────────────────

  let repairRound = 0;
  let totalRepairActions = 0;
  let totalAIRepairs = 0;
  const repairStartTime = Date.now();
  const REPAIR_TIMEOUT_MS = 90_000; // 90 second max for all repairs

  while (!verification.ok && repairRound < MAX_REPAIR_ROUNDS) {
    repairRound++;

    // Check timeout
    if (Date.now() - repairStartTime > REPAIR_TIMEOUT_MS) {
      console.warn(`[Compiler] Repair timeout (${REPAIR_TIMEOUT_MS}ms) — shipping with remaining issues`);
      cloudLog.warn(`Repair timeout after ${repairRound} rounds`, "compiler");
      break;
    }

    const repairTiming = startPass(trace, `repair-${repairRound}`);

    const actions = classifyRepairActions(verification.issues, workspace);
    if (actions.length === 0) break;

    // Cap AI repairs to prevent long builds
    const remainingBudget = MAX_REPAIR_ACTIONS_TOTAL - totalAIRepairs;
    if (remainingBudget <= 0) {
      console.warn(`[Compiler] AI repair budget exhausted (${MAX_REPAIR_ACTIONS_TOTAL} max) — shipping with remaining issues`);
      cloudLog.warn(`AI repair budget exhausted after ${totalAIRepairs} repairs`, "compiler");
      break;
    }

    callbacks.onRepairStart(repairRound, actions.length);
    callbacks.onPhase("repairing", `Repair round ${repairRound}: ${actions.length} issues...`);
    trace.repairActions.push(...actions);

    cloudLog.warn(`Repair round ${repairRound}: ${actions.length} actions (budget: ${remainingBudget})`, "compiler");
    console.log(`[Compiler] Repair round ${repairRound}: ${actions.length} actions (AI budget: ${remainingBudget})`);

    for (const action of actions) {
      // Check timeout inside loop too
      if (Date.now() - repairStartTime > REPAIR_TIMEOUT_MS) {
        console.warn(`[Compiler] Repair timeout mid-round — stopping`);
        break;
      }

      try {
        // Handle deterministic repairs without AI (these are free, no cap)
        if (action.type === "fix_deterministic") {
          const fixed = applyDeterministicFix(action, workspace);
          if (fixed) {
            totalRepairActions++;
            cloudLog.info(`Deterministic fix: ${action.targetFile} (${action.issue.category})`, "compiler");
            console.log(`[Compiler]   🔧 Deterministic fix: ${action.targetFile} (${action.issue.category})`);
            continue;
          }
        }

        // Check AI budget before making AI call
        if (totalAIRepairs >= MAX_REPAIR_ACTIONS_TOTAL) {
          console.warn(`[Compiler]   ⏭️ Skipping AI repair for ${action.targetFile} — budget exhausted`);
          continue;
        }

        // Create a micro-task for AI repair
        const repairTask: CompilerTask = {
          id: `repair-${repairRound}-${action.targetFile}`,
          label: `repair:${action.type}:${action.targetFile}`,
          type: "frontend",
          description: action.prompt,
          buildPrompt: action.prompt,
          dependsOn: [],
          produces: [action.targetFile],
          touches: [],
          priority: 0,
          status: "in_progress",
          retries: 0,
        };

        const repairFiles = await executeTask(
          repairTask, ctx, workspace, 0, 1, executionCallbacks
        );

        workspace.applyPatch(repairFiles);
        totalRepairActions++;
        totalAIRepairs++;

        cloudLog.info(`Repaired: ${action.targetFile} (${totalAIRepairs}/${MAX_REPAIR_ACTIONS_TOTAL})`, "compiler");
        console.log(`[Compiler]   🔧 Repaired: ${action.targetFile} (${totalAIRepairs}/${MAX_REPAIR_ACTIONS_TOTAL})`);
      } catch (err: any) {
        console.warn(`[Compiler]   ⚠️ Repair failed for ${action.targetFile}:`, err.message);
      }
    }

    endPass(repairTiming);

    // Re-verify
    verification = verifyWorkspace(workspace, taskGraph);
    callbacks.onVerification(verification);
  }

  trace.repairRounds = repairRound;

  // ── Phase 5.5: Post-Build Agents (invisible) ──────────────────────
  // Testing Agent runs smoke tests; Governance Agent validates safety.

  let orchestratorResult: OrchestratorResult | null = null;
  try {
    orchestratorResult = runPostBuildAgents(
      pipelineCtx,
      workspace.toRecord(),
      agentCallbacks
    );

    // Apply governance auto-fixes back to workspace
    if (orchestratorResult.workspace) {
      for (const [path, content] of Object.entries(orchestratorResult.workspace)) {
        if (workspace.hasFile(path) && workspace.getFile(path) !== content) {
          workspace.updateFile(path, content);
        }
      }
    }

    cloudLog.info(`[Orchestrator] Post-build: ${orchestratorResult.summary}`, "compiler");
  } catch (err: any) {
    console.warn("[Compiler] Post-build agents failed (non-fatal):", err.message);
  }

  // ── Phase 5.5: Domain Coherence Gate ──────────────────────────────────

  callbacks.onPhase("coherence-check", "Verifying domain coherence...");

  const { checkDomainCoherence } = await import("./domainCoherence");
  const coherenceResult = checkDomainCoherence(ctx.rawRequirements, workspace);

  if (!coherenceResult.passed) {
    cloudLog.error(
      `Domain coherence FAILED: ${coherenceResult.reason}`,
      "compiler"
    );
    console.error(
      `[Compiler] ❌ DOMAIN COHERENCE FAILED\n` +
      `  Requested: ${coherenceResult.requestedTokens.slice(0, 5).join(", ")}\n` +
      `  Generated: ${coherenceResult.generatedTokens.slice(0, 5).join(", ")}\n` +
      `  Overlap: ${coherenceResult.overlapCount}/${coherenceResult.requestedTokens.length}`
    );
    // Non-fatal warning — log but don't abort (the build may still be usable)
    // The user can see the mismatch in the build summary
  } else {
    cloudLog.info(`Domain coherence passed: ${coherenceResult.reason}`, "compiler");
    console.log(`[Compiler] ✅ Domain coherence: ${coherenceResult.reason}`);
  }

  // ── Phase 6: Completion ────────────────────────────────────────────

  callbacks.onPhase("complete", "Build complete.");
  finalizeTrace(trace, workspace.fileCount());
  printTrace(trace);

  const errorCount = verification.issues.filter(i => i.severity === "error").length;
  const doneTasks = taskGraph.tasks.filter(t => t.status === "done").length;
  const totalTasks = taskGraph.tasks.length;
  const runtime = deriveRuntimeVerification(orchestratorResult);

  // Determine build status (static + runtime)
  let status: BuildStatus;
  if (errorCount === 0 && doneTasks === totalTasks && runtime.runtimeStatus !== "failed") {
    status = "success";
  } else if (doneTasks > 0) {
    status = "partial";
  } else {
    status = "failed";
  }

  cloudLog.info(`Build ${status}: ${doneTasks}/${totalTasks} tasks, ${workspace.fileCount()} files`, "compiler");

  // Build summary — includes agent results
  const agentSummaryParts: string[] = [];
  if (orchestratorResult) {
    const testResults = orchestratorResult.testResults || [];
    const violations = orchestratorResult.violations || [];
    const testsPassed = testResults.filter(t => t.passed).length;
    if (testResults.length > 0) {
      agentSummaryParts.push(`Smoke tests: ${testsPassed}/${testResults.length} passed`);
    }
    if (violations.length > 0) {
      const govErrors = violations.filter(v => v.severity === "error").length;
      agentSummaryParts.push(`Governance: ${govErrors} errors, ${violations.length - govErrors} warnings`);
    }
  }

  const summary = [
    `Build ${status}: ${doneTasks}/${totalTasks} tasks completed`,
    `${workspace.fileCount()} files in workspace (${(workspace.totalSize() / 1024).toFixed(1)}KB)`,
    verification.ok ? "Static checks passed ✅" : `${errorCount} errors, ${verification.issues.length - errorCount} warnings`,
    runtime.runtimeStatus === "passed"
      ? "Runtime checks passed ✅"
      : runtime.runtimeStatus === "failed"
        ? runtime.runtimeSummary
        : "",
    repairRound > 0 ? buildRepairSummary(repairRound, totalRepairActions, verification.issues) : "",
    ...agentSummaryParts,
  ].filter(Boolean).join("\n");

  const knownIssues = [
    ...verification.issues
      .filter(i => i.severity === "error")
      .map(i => `${i.file}: ${i.message}`),
    ...runtime.runtimeChecks
      .filter(check => !check.passed)
      .map(check => `runtime: ${check.name} — ${check.details}`),
  ];

  const nextActions = buildNextActions(verification, taskGraph, runtime);

  const result: BuildResult = {
    status,
    workspace: workspace.toRecord(),
    verification,
    runtime,
    trace,
    summary,
    knownIssues,
    nextActions,
  };

  callbacks.onComplete(result);
  return result;
}

function deriveRuntimeVerification(orchestratorResult: OrchestratorResult | null): RuntimeVerification {
  const testResults = orchestratorResult?.testResults || [];

  if (testResults.length === 0) {
    return {
      runtimeStatus: "pending",
      runtimeChecks: [],
      runtimeSummary: "Runtime checks not run yet.",
    };
  }

  const runtimeChecks = testResults.map((test) => ({
    name: test.name,
    passed: test.passed,
    details: test.details,
  }));

  const failedCount = runtimeChecks.filter((check) => !check.passed).length;

  if (failedCount === 0) {
    return {
      runtimeStatus: "passed",
      runtimeChecks,
      runtimeSummary: `Runtime smoke checks passed (${runtimeChecks.length}/${runtimeChecks.length}).`,
    };
  }

  return {
    runtimeStatus: "failed",
    runtimeChecks,
    runtimeSummary: `Runtime checks found issues (${failedCount}/${runtimeChecks.length} failed).`,
  };
}

// ─── Next Actions ─────────────────────────────────────────────────────────

function buildNextActions(
  verification: VerificationResult,
  taskGraph: TaskGraph,
  runtime: RuntimeVerification
): string[] {
  const actions: string[] = [];

  if (verification.stats.parseFailed > 0) {
    actions.push(`Fix ${verification.stats.parseFailed} syntax error(s)`);
  }
  if (verification.stats.importsBroken > 0) {
    actions.push(`Resolve ${verification.stats.importsBroken} broken import(s)`);
  }
  if (verification.stats.routesMissing > 0) {
    actions.push(`Create ${verification.stats.routesMissing} missing page(s)`);
  }

  const failedTasks = taskGraph.tasks.filter(t => t.status === "failed");
  if (failedTasks.length > 0) {
    actions.push(`Retry failed tasks: ${failedTasks.map(t => t.label).join(", ")}`);
  }

  if (runtime.runtimeStatus === "failed") {
    const failingRuntimeChecks = runtime.runtimeChecks
      .filter((check) => !check.passed)
      .slice(0, 3)
      .map((check) => check.name);

    actions.push(
      failingRuntimeChecks.length > 0
        ? `Fix runtime issues: ${failingRuntimeChecks.join(", ")}`
        : "Address runtime smoke test failures"
    );
  }

  if (actions.length === 0) {
    if (runtime.runtimeStatus === "pending") {
      actions.push("Test the application — runtime checks have not been executed yet");
    }
    actions.push("Add more features");
  }

  return actions;
}
