/**
 * Agent Orchestrator — The invisible conductor.
 * 
 * Coordinates all agents through a single pipeline.
 * The user sees one unified build experience; the orchestrator
 * sequences requirements → workflow → schema validation → database → frontend → testing → governance
 * behind the scenes.
 * 
 * SCHEMA-FIRST GATE: If the intent includes auth/CRUD/data/roles/storage,
 * schema validation MUST pass before any backend or frontend code is generated.
 */

import type { AgentName, AgentResult, AgentCallbacks, PipelineContext } from "./types";
import { planAgentWorkflow } from "./workflowAgent";
import { runDatabaseAgent } from "./databaseAgent";
import { runTestingAgent } from "./testingAgent";
import { runGovernanceAgent } from "./governanceAgent";
import { runSchemaPhase, requiresSchemaFirstGate, type SchemaPhaseResult } from "./schemaAgent";
import { cloudLog } from "@/lib/cloudLogBus";

export interface OrchestratorResult {
  status: "success" | "partial" | "failed" | "schema_blocked";
  agentResults: Map<AgentName, AgentResult>;
  /** Merged files from all agents */
  workspace: Record<string, string>;
  /** All test results */
  testResults: AgentResult["testResults"];
  /** All governance violations */
  violations: AgentResult["violations"];
  /** Human-readable summary */
  summary: string;
  totalDurationMs: number;
  /** Schema validation result (if schema-first gate ran) */
  schemaPhaseResult?: SchemaPhaseResult;
}

/**
 * Run the pre-build agent pipeline (before the compiler).
 * Handles: requirements analysis → workflow planning → schema validation → database schema → 
 * Returns enriched context for the compiler.
 */
export async function runPreBuildAgents(
  ctx: PipelineContext,
  callbacks: AgentCallbacks
): Promise<PipelineContext> {
  const start = performance.now();

  // Step 1: Workflow Agent decides which agents to run
  callbacks.onAgentStart("workflow");
  const workflow = planAgentWorkflow(ctx);
  ctx.agentPlan = workflow.agents;
  
  callbacks.onAgentDone("workflow", {
    agent: "workflow",
    status: "done",
    summary: workflow.reasoning,
    durationMs: performance.now() - start,
    metadata: { agents: workflow.agents },
  });

  cloudLog.info(`[Orchestrator] Agent plan: ${workflow.agents.join(" → ")}`, "orchestrator");

  // Step 2: Schema-First Gate (if intent requires backend/data)
  if (requiresSchemaFirstGate(ctx)) {
    callbacks.onAgentStart("database");
    callbacks.onAgentProgress("database", "Running schema-first validation...");

    // Ensure database agent is in the plan
    if (!ctx.agentPlan.includes("database")) {
      ctx.agentPlan = ["database", ...ctx.agentPlan];
    }

    cloudLog.info("[Orchestrator] Schema-first gate activated — schema must validate before code gen", "orchestrator");
  }

  // Step 3: Database Agent (if needed, runs before frontend)
  if (workflow.agents.includes("database") || ctx.agentPlan.includes("database")) {
    if (!ctx.results.has("database")) {
      callbacks.onAgentStart("database");
      callbacks.onAgentProgress("database", "Analyzing data models...");
    }
    
    const dbResult = await runDatabaseAgent(ctx);
    ctx.results.set("database", dbResult);
    callbacks.onAgentDone("database", dbResult);

    cloudLog.info(`[Orchestrator] Database: ${dbResult.summary}`, "orchestrator");
  }

  return ctx;
}

/**
 * Validate schema artifacts produced by the backend-agent.
 * BLOCKS the build if validation fails.
 */
export async function validateSchemaBeforeBuild(
  ctx: PipelineContext,
  schemaFiles: Record<string, string>,
  callbacks: AgentCallbacks
): Promise<SchemaPhaseResult> {
  callbacks.onAgentStart("database");
  callbacks.onAgentProgress("database", "Validating schema artifacts...");

  const result = await runSchemaPhase(ctx, schemaFiles);
  ctx.results.set("database", result);
  callbacks.onAgentDone("database", result);

  if (result.status === "failed") {
    cloudLog.error(
      `[Orchestrator] SCHEMA GATE BLOCKED BUILD: ${result.summary}`,
      "orchestrator"
    );
  }

  return result;
}

/**
 * Run post-build agents (after the compiler produces files).
 * Handles: testing → governance validation
 */
export function runPostBuildAgents(
  ctx: PipelineContext,
  builtWorkspace: Record<string, string>,
  callbacks: AgentCallbacks
): OrchestratorResult {
  const start = performance.now();

  // Update context with built files
  const enrichedCtx = { ...ctx, existingWorkspace: builtWorkspace };
  enrichedCtx.results.set("frontend", {
    agent: "frontend",
    status: "done",
    files: builtWorkspace,
    summary: `${Object.keys(builtWorkspace).length} files generated`,
    durationMs: 0,
  });

  let finalWorkspace = { ...builtWorkspace };

  // Testing Agent
  // Run when explicitly requested OR when a runnable app shell exists.
  // This prevents Runtime Pending for normal app builds while avoiding noise on non-app tasks.
  const hasRunnableApp = Boolean(builtWorkspace["/App.jsx"] || builtWorkspace["/App.tsx"]);
  if (ctx.agentPlan.includes("testing") || hasRunnableApp) {
    callbacks.onAgentStart("testing");
    callbacks.onAgentProgress("testing", "Running smoke tests...");

    const testResult = runTestingAgent(enrichedCtx);
    enrichedCtx.results.set("testing", testResult);
    callbacks.onAgentDone("testing", testResult);

    cloudLog.info(`[Orchestrator] Testing: ${testResult.summary}`, "orchestrator");
  }

  // Governance Agent (always runs)
  callbacks.onAgentStart("governance");
  callbacks.onAgentProgress("governance", "Validating safety & quality...");
  
  const govResult = runGovernanceAgent(enrichedCtx);
  enrichedCtx.results.set("governance", govResult);
  callbacks.onAgentDone("governance", govResult);

  // Apply governance auto-fixes to workspace
  if (govResult.files) {
    finalWorkspace = govResult.files;
  }

  cloudLog.info(`[Orchestrator] Governance: ${govResult.summary}`, "orchestrator");

  // Build orchestrator summary
  const allResults = enrichedCtx.results;
  const testResults = allResults.get("testing")?.testResults || [];
  const violations = allResults.get("governance")?.violations || [];
  const errors = violations.filter(v => v.severity === "error");

  const status: OrchestratorResult["status"] =
    errors.length > 0 ? "partial" :
    testResults.some(t => !t.passed) ? "partial" :
    "success";

  const summaryParts: string[] = [];
  for (const [name, result] of allResults) {
    summaryParts.push(`${name}: ${result.summary}`);
  }

  return {
    status,
    agentResults: allResults,
    workspace: finalWorkspace,
    testResults,
    violations,
    summary: summaryParts.join("\n"),
    totalDurationMs: performance.now() - start,
  };
}

/**
 * Create a fresh pipeline context.
 */
export function createPipelineContext(params: {
  projectId: string;
  techStack: string;
  rawRequirements: string;
  ir?: any;
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
  existingWorkspace: Record<string, string>;
}): PipelineContext {
  return {
    ...params,
    agentPlan: [],
    results: new Map(),
  };
}
