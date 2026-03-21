/**
 * Multi-Agent System — Public API
 * 
 * Single entry point for the invisible agent orchestration system.
 * The user sees one unified build; underneath, specialized agents
 * handle requirements, data modeling, testing, and governance.
 */

// Orchestrator
export { runPreBuildAgents, runPostBuildAgents, createPipelineContext } from "./orchestrator";
export type { OrchestratorResult } from "./orchestrator";

// Types
export type {
  AgentName,
  AgentStatus,
  AgentResult,
  AgentCallbacks,
  PipelineContext,
  TestResult,
  GovernanceViolation,
} from "./types";

// Individual agents (for advanced usage / testing)
export { planAgentWorkflow } from "./workflowAgent";
export { runDatabaseAgent } from "./databaseAgent";
export { runTestingAgent } from "./testingAgent";
export { runGovernanceAgent } from "./governanceAgent";
