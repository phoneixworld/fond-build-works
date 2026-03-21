/**
 * Multi-Agent System — Shared Types
 * 
 * All agents are invisible to the user. They coordinate through the
 * Orchestrator, which presents a single unified interface.
 */

export type AgentName =
  | "requirements"
  | "workflow"
  | "frontend"
  | "backend"
  | "database"
  | "testing"
  | "governance"
  | "orchestrator";

export type AgentStatus = "idle" | "running" | "done" | "failed" | "skipped";

export interface AgentResult {
  agent: AgentName;
  status: AgentStatus;
  /** Files produced or modified */
  files?: Record<string, string>;
  /** Schema migrations to run */
  migrations?: string[];
  /** Test results */
  testResults?: TestResult[];
  /** Governance violations */
  violations?: GovernanceViolation[];
  /** Human-readable summary (internal, not shown to user) */
  summary: string;
  /** Duration in ms */
  durationMs: number;
  /** Any metadata */
  metadata?: Record<string, any>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  file?: string;
}

export interface GovernanceViolation {
  rule: string;
  severity: "error" | "warning";
  file: string;
  message: string;
  autoFixable: boolean;
  fix?: string;
}

export interface PipelineContext {
  projectId: string;
  techStack: string;
  rawRequirements: string;
  ir?: any;
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
  existingWorkspace: Record<string, string>;
  /** Which agents the workflow agent decided to run */
  agentPlan: AgentName[];
  /** Accumulated results from each agent */
  results: Map<AgentName, AgentResult>;
}

export interface AgentCallbacks {
  onAgentStart: (agent: AgentName) => void;
  onAgentProgress: (agent: AgentName, message: string) => void;
  onAgentDone: (agent: AgentName, result: AgentResult) => void;
}
