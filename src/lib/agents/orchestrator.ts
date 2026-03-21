/**
 * Agent Orchestrator — The invisible conductor.
 * 
 * Coordinates all agents through a single pipeline.
 * The user sees one unified build experience; the orchestrator
 * sequences requirements → workflow → database → frontend → testing → governance
 * behind the scenes.
 */

import type { AgentName, AgentResult, AgentCallbacks, PipelineContext } from "./types";
import { planAgentWorkflow } from "./workflowAgent";
import { runDatabaseAgent } from "./databaseAgent";
import { runTestingAgent } from "./testingAgent";
import { runGovernanceAgent } from "./governanceAgent";
import { cloudLog } from "@/lib/cloudLogBus";

export interface OrchestratorResult {
  status: "success" | "partial" | "failed";
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
}

/**
 * Run the pre-build agent pipeline (before the compiler).
 * Handles: requirements analysis → workflow planning → database schema → 
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

  // Step 2: Database Agent (if needed, runs before frontend)
  if (workflow.agents.includes("database")) {
    callbacks.onAgentStart("database");
    callbacks.onAgentProgress("database", "Analyzing data models...");
    
    const dbResult = await runDatabaseAgent(ctx);
    ctx.results.set("database", dbResult);
    callbacks.onAgentDone("database", dbResult);

    cloudLog.info(`[Orchestrator] Database: ${dbResult.summary}`, "orchestrator");
  }

  return ctx;
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
  if (ctx.agentPlan.includes("testing")) {
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
