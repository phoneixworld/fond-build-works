/**
 * Build Compiler v1.0 — Main Orchestrator
 * 
 * The top-level compile() function that wires everything together:
 * 
 *   Context Assembly → Plan → Execute Passes → Verify → Repair → Complete
 * 
 * This replaces the ad-hoc buildEngine pipeline with a deterministic compiler.
 */

import type {
  BuildContext, BuildResult, BuildStatus,
  CompilerTask, TaskGraph, VerificationResult, RuntimeVerification,
} from "./types";
import { assembleBuildContext } from "./context";
import { planTaskGraph, topologicalSort } from "./planner";
import { Workspace } from "./workspace";
import { executeTask, type ExecutionCallbacks } from "./executor";
import { verifyWorkspace } from "./verifier";
import { classifyRepairActions, buildRepairSummary, applyDeterministicFix, MAX_REPAIR_ROUNDS } from "./repair";
import { fixBrokenImports } from "./importFixer";
import { repairMissingModules } from "./missingModuleGen";
import { injectMissingProviders } from "./providerInjector";
import { fixMissingImports, fixProviderOrdering } from "./missingImportFixer";
import { fixExportMismatches } from "./exportMismatchFixer";
import { deduplicateFiles } from "./deduplicator";
import {
  createTrace, startPass, endPass,
  traceTaskStart, traceTaskEnd, finalizeTrace, printTrace,
} from "./observability";
import { cloudLog } from "@/lib/cloudLogBus";
import { synthesizeAppJsx } from "./appSynthesizer";
import { getSharedUIComponents, getGlobalStyles } from "@/lib/templates/scaffoldTemplates";

// ─── Public API ───────────────────────────────────────────────────────────

export interface CompileOptions {
  rawRequirements: string;
  existingWorkspace: Record<string, string>;
  projectId: string;
  techStack: string;
  semanticSummary?: string;
  ir?: any;
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
}

export interface CompileCallbacks {
  onPhase: (phase: string, detail: string) => void;
  onTaskStart: (task: CompilerTask, index: number, total: number) => void;
  onTaskDelta: (task: CompilerTask, chunk: string) => void;
  onTaskDone: (task: CompilerTask, files: Record<string, string>) => void;
  onTaskError: (task: CompilerTask, error: string) => void;
  onVerification: (result: VerificationResult) => void;
  onRepairStart: (round: number, actionCount: number) => void;
  onComplete: (result: BuildResult) => void;
}

/**
 * Main entry point: compile requirements into a working application.
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

  // ── Phase 2: Planning ──────────────────────────────────────────────

  callbacks.onPhase("planning", "Building task graph...");

  const taskGraph = planTaskGraph(ctx);

  cloudLog.info(`Task graph: ${taskGraph.tasks.length} tasks across ${taskGraph.passes.length} passes`, "compiler");
  console.log(`[Compiler] Task graph: ${taskGraph.tasks.length} tasks, ${taskGraph.passes.length} passes`);
  for (let i = 0; i < taskGraph.passes.length; i++) {
    const passTaskLabels = taskGraph.passes[i].map(id =>
      taskGraph.tasks.find(t => t.id === id)?.label || id
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
  if (scaffoldedCount > 0) {
    cloudLog.info(`Pre-scaffolded ${scaffoldedCount} UI components + design tokens`, "compiler");
    console.log(`[Compiler] 🎨 Pre-scaffolded ${scaffoldedCount} UI components into workspace`);
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

  for (let passIdx = 0; passIdx < taskGraph.passes.length; passIdx++) {
    const passTaskIds = taskGraph.passes[passIdx];
    const passTiming = startPass(trace, `pass-${passIdx + 1}`);
    executionCallbacks.onPassStart(passIdx, passTaskIds);

    // Execute tasks in this pass sequentially
    // (parallel execution is a future optimization)
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
      }
    }

    endPass(passTiming);
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

  // ── Phase 3.9: Provider Ordering Fix ────────────────────────────────

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

  // ── Phase 4: Verification ──────────────────────────────────────────

  callbacks.onPhase("verifying", "Verifying workspace...");

  let verification = verifyWorkspace(workspace, taskGraph);
  callbacks.onVerification(verification);

  cloudLog.info(`Verification: ${verification.ok ? "PASS" : "FAIL"} — ${verification.issues.length} issues`, "compiler");
  console.log(`[Compiler] Verification: ${verification.ok ? "PASS" : "FAIL"} — ${verification.issues.length} issues (${verification.stats.parsedOk} parsed, ${verification.stats.importsBroken} broken imports)`);

  // ── Phase 5: Auto-Repair ───────────────────────────────────────────

  let repairRound = 0;
  let totalRepairActions = 0;

  while (!verification.ok && repairRound < MAX_REPAIR_ROUNDS) {
    repairRound++;
    const repairTiming = startPass(trace, `repair-${repairRound}`);

    const actions = classifyRepairActions(verification.issues, workspace);
    if (actions.length === 0) break;

    callbacks.onRepairStart(repairRound, actions.length);
    callbacks.onPhase("repairing", `Repair round ${repairRound}: ${actions.length} issues...`);
    trace.repairActions.push(...actions);

    cloudLog.warn(`Repair round ${repairRound}: ${actions.length} actions`, "compiler");
    console.log(`[Compiler] Repair round ${repairRound}: ${actions.length} actions`);

    for (const action of actions) {
      try {
        // Handle deterministic repairs without AI
        if (action.type === "fix_deterministic") {
          const fixed = applyDeterministicFix(action, workspace);
          if (fixed) {
            totalRepairActions++;
            cloudLog.info(`Deterministic fix: ${action.targetFile} (${action.issue.category})`, "compiler");
            console.log(`[Compiler]   🔧 Deterministic fix: ${action.targetFile} (${action.issue.category})`);
            continue;
          }
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

        cloudLog.info(`Repaired: ${action.targetFile}`, "compiler");
        console.log(`[Compiler]   🔧 Repaired: ${action.targetFile}`);
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

  // ── Phase 6: Completion ────────────────────────────────────────────

  callbacks.onPhase("complete", "Build complete.");
  finalizeTrace(trace, workspace.fileCount());
  printTrace(trace);

  // Determine build status
  const errorCount = verification.issues.filter(i => i.severity === "error").length;
  const doneTasks = taskGraph.tasks.filter(t => t.status === "done").length;
  const totalTasks = taskGraph.tasks.length;

  let status: BuildStatus;
  if (errorCount === 0 && doneTasks === totalTasks) {
    status = "success";
  } else if (doneTasks > 0) {
    status = "partial";
  } else {
    status = "failed";
  }

  cloudLog.info(`Build ${status}: ${doneTasks}/${totalTasks} tasks, ${workspace.fileCount()} files`, "compiler");

  // Build summary — only claims static verification, never end-to-end
  const summary = [
    `Build ${status}: ${doneTasks}/${totalTasks} tasks completed`,
    `${workspace.fileCount()} files in workspace (${(workspace.totalSize() / 1024).toFixed(1)}KB)`,
    verification.ok ? "Static checks passed ✅" : `${errorCount} errors, ${verification.issues.length - errorCount} warnings`,
    repairRound > 0 ? buildRepairSummary(repairRound, totalRepairActions, verification.issues) : "",
  ].filter(Boolean).join("\n");

  const knownIssues = verification.issues
    .filter(i => i.severity === "error")
    .map(i => `${i.file}: ${i.message}`);

  const nextActions = buildNextActions(verification, taskGraph);

  // Runtime verification: always starts as pending — no runtime checks ran during build
  const runtime: RuntimeVerification = {
    runtimeStatus: "pending",
    runtimeChecks: [],
    runtimeSummary: "Runtime checks not run yet.",
  };

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

// ─── Next Actions ─────────────────────────────────────────────────────────

function buildNextActions(
  verification: VerificationResult,
  taskGraph: TaskGraph
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

  if (actions.length === 0) {
    actions.push("Test the application — runtime checks have not been executed yet");
    actions.push("Add more features");
  }

  return actions;
}
