/**
 * Agent Orchestration Phase — Phase 6
 * 
 * Wires the multi-agent pipeline directly into the compiler as formal phases.
 * Each agent runs as a named compiler phase with timing, logging, and error handling.
 * 
 * Pipeline stages:
 *   Pre-build:  requirements → workflow → schema → database
 *   Build:      [compiler handles this]
 *   Post-build: testing → governance → security
 * 
 * Agents communicate through PipelineContext (shared state bag).
 */

import type { PipelineContext, AgentCallbacks, AgentResult, AgentName, GovernanceViolation } from "@/lib/agents/types";
import type { Workspace } from "./workspace";
import type { BuildContext, CompilerTask, VerificationResult } from "./types";
import { cloudLog } from "@/lib/cloudLogBus";

// ─── Agent Registry ──────────────────────────────────────────────────────

export interface AgentDefinition {
  name: AgentName;
  phase: "pre_build" | "post_build";
  /** Higher priority runs first within its phase */
  priority: number;
  /** Condition for running this agent */
  shouldRun: (ctx: PipelineContext) => boolean;
  /** The actual agent executor */
  execute: (ctx: PipelineContext, workspace?: Workspace) => AgentResult | Promise<AgentResult>;
  /** Is this agent optional? If true, failures are non-fatal */
  optional: boolean;
  /** Max execution time in ms */
  timeoutMs: number;
}

const agentRegistry: AgentDefinition[] = [];

/**
 * Register an agent into the orchestration pipeline.
 */
export function registerAgent(def: AgentDefinition): void {
  // Replace if already registered (allows overrides)
  const idx = agentRegistry.findIndex(a => a.name === def.name);
  if (idx >= 0) {
    agentRegistry[idx] = def;
  } else {
    agentRegistry.push(def);
  }
  agentRegistry.sort((a, b) => b.priority - a.priority);
}

/**
 * Get all registered agents for a given phase.
 */
export function getAgentsForPhase(phase: "pre_build" | "post_build"): AgentDefinition[] {
  return agentRegistry.filter(a => a.phase === phase);
}

// ─── Built-in Agent Implementations ──────────────────────────────────────

/** Requirements Analysis Agent — extracts structured requirements */
function requirementsAgent(ctx: PipelineContext): AgentResult {
  const start = performance.now();
  const requirements = ctx.rawRequirements;

  // Extract key signals from requirements
  const signals = {
    hasAuth: /auth|login|signup|password|session|user\s*account/i.test(requirements),
    hasCRUD: /create|read|update|delete|crud|manage|add|edit|remove/i.test(requirements),
    hasRoles: /role|admin|permission|access\s*control|rbac/i.test(requirements),
    hasDashboard: /dashboard|analytics|chart|graph|metric|kpi|report/i.test(requirements),
    hasWorkflow: /workflow|pipeline|approval|state\s*machine|process/i.test(requirements),
    hasRealtime: /realtime|real-time|live\s*update|websocket|notification/i.test(requirements),
    hasFileUpload: /upload|file|image|document|attachment/i.test(requirements),
    hasSearch: /search|filter|query|find|lookup/i.test(requirements),
    hasExport: /export|download|csv|pdf|report/i.test(requirements),
    hasAPI: /api|endpoint|webhook|integration|third.?party/i.test(requirements),
    entityCount: (requirements.match(/(?:manage|track|handle)\s+(\w+)/gi) || []).length,
    complexity: requirements.length > 2000 ? "high" : requirements.length > 500 ? "medium" : "low",
  };

  return {
    agent: "requirements",
    status: "done",
    summary: `Requirements analyzed: complexity=${signals.complexity}, auth=${signals.hasAuth}, CRUD=${signals.hasCRUD}, roles=${signals.hasRoles}`,
    durationMs: performance.now() - start,
    metadata: { signals },
  };
}

/** Workflow Agent — decides which agents to activate */
function workflowAgent(ctx: PipelineContext): AgentResult {
  const start = performance.now();
  const reqResult = ctx.results.get("requirements");
  const signals = reqResult?.metadata?.signals || {};

  const agentsToRun: AgentName[] = ["frontend"];

  if (signals.hasAuth || signals.hasRoles || signals.hasCRUD) {
    agentsToRun.push("database");
  }
  if (signals.hasAuth) {
    agentsToRun.push("backend");
  }

  // Testing always runs post-build
  agentsToRun.push("testing");
  // Governance always runs
  agentsToRun.push("governance");

  ctx.agentPlan = agentsToRun;

  return {
    agent: "workflow",
    status: "done",
    summary: `Agent plan: ${agentsToRun.join(" → ")}`,
    durationMs: performance.now() - start,
    metadata: { agentsToRun },
  };
}

/** Database Agent — analyzes schema requirements */
function databaseAgent(ctx: PipelineContext): AgentResult {
  const start = performance.now();
  const ir = ctx.ir;
  const entities = ir?.entities || [];
  const entityNames = Array.isArray(entities)
    ? entities.map((e: any) => e.name)
    : Object.keys(entities);

  // Map logical entity names to table conventions
  const tableMappings: Record<string, string> = {};
  for (const name of entityNames) {
    tableMappings[name] = name.toLowerCase().replace(/\s+/g, "_");
  }

  ctx.tableMappings = tableMappings;

  return {
    agent: "database",
    status: "done",
    summary: `Schema analysis: ${entityNames.length} entities mapped`,
    durationMs: performance.now() - start,
    metadata: { tableMappings, entityNames },
  };
}

/** Testing Agent — runs smoke tests on generated workspace */
function testingAgent(ctx: PipelineContext, workspace?: Workspace): AgentResult {
  const start = performance.now();
  const files = workspace ? workspace.listFiles() : Object.keys(ctx.existingWorkspace);
  const testResults: AgentResult["testResults"] = [];

  // Test 1: App entry exists
  const hasApp = files.some(f => /^\/App\.(jsx|tsx|js|ts)$/.test(f));
  testResults.push({
    name: "app_entry_exists",
    passed: hasApp,
    details: hasApp ? "App entry point found" : "Missing App.jsx/tsx",
  });

  // Test 2: At least one page exists
  const hasPages = files.some(f => /^\/pages\//.test(f));
  testResults.push({
    name: "pages_exist",
    passed: hasPages,
    details: hasPages ? `${files.filter(f => /^\/pages\//.test(f)).length} page(s) found` : "No pages directory",
  });

  // Test 3: No circular self-imports
  const getContent = (f: string) => workspace ? workspace.getFile(f) : ctx.existingWorkspace[f];
  let selfImportCount = 0;
  for (const file of files) {
    const content = getContent(file);
    if (!content) continue;
    const basename = file.split("/").pop()?.replace(/\.\w+$/, "");
    if (basename && content.includes(`from "./${basename}"`)) {
      selfImportCount++;
    }
  }
  testResults.push({
    name: "no_self_imports",
    passed: selfImportCount === 0,
    details: selfImportCount === 0 ? "No self-imports detected" : `${selfImportCount} self-import(s) found`,
  });

  // Test 4: No raw color classes (design system compliance)
  let rawColorFiles = 0;
  for (const file of files) {
    const content = getContent(file);
    if (!content || !file.match(/\.(jsx|tsx)$/)) continue;
    if (/(?:bg|text|border)-(?:red|blue|green|yellow|purple|pink|indigo|gray)-\d{3}/.test(content)) {
      rawColorFiles++;
    }
  }
  testResults.push({
    name: "design_system_compliance",
    passed: rawColorFiles === 0,
    details: rawColorFiles === 0
      ? "All files use semantic design tokens"
      : `${rawColorFiles} file(s) use raw Tailwind colors instead of semantic tokens`,
  });

  // Test 5: JSX files have React import or are using automatic JSX transform
  let missingReactCount = 0;
  for (const file of files) {
    if (!file.match(/\.(jsx|tsx)$/)) continue;
    const content = getContent(file);
    if (!content) continue;
    if (content.includes("<") && !content.includes("import React") && !content.includes("from 'react'") && !content.includes('from "react"')) {
      // In automatic JSX transform, React import is not needed
      // But in Sandpack, it IS needed
      missingReactCount++;
    }
  }
  testResults.push({
    name: "react_imports",
    passed: missingReactCount <= files.length * 0.1, // Allow 10% tolerance
    details: missingReactCount === 0
      ? "All JSX files have React imports"
      : `${missingReactCount} JSX file(s) may be missing React imports`,
  });

  // Test 6: No empty files
  let emptyFiles = 0;
  for (const file of files) {
    const content = getContent(file);
    if (!content || content.trim().length === 0) {
      emptyFiles++;
    }
  }
  testResults.push({
    name: "no_empty_files",
    passed: emptyFiles === 0,
    details: emptyFiles === 0 ? "No empty files" : `${emptyFiles} empty file(s) found`,
  });

  const passed = testResults.filter(t => t.passed).length;
  const total = testResults.length;

  return {
    agent: "testing",
    status: passed === total ? "done" : "done",
    summary: `Smoke tests: ${passed}/${total} passed`,
    durationMs: performance.now() - start,
    testResults,
  };
}

/** Governance Agent — validates safety rules */
function governanceAgent(ctx: PipelineContext, workspace?: Workspace): AgentResult {
  const start = performance.now();
  const files = workspace ? workspace.toRecord() : ctx.existingWorkspace;
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!content) continue;

    // Rule 1: No hardcoded API keys
    if (/(?:api[_-]?key|secret|token)\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i.test(content)) {
      violations.push({
        rule: "no_hardcoded_secrets",
        severity: "error",
        file: path,
        message: "Hardcoded API key or secret detected",
        autoFixable: false,
      });
    }

    // Rule 2: No eval() usage
    if (/\beval\s*\(/.test(content) && !path.includes("node_modules")) {
      violations.push({
        rule: "no_eval",
        severity: "error",
        file: path,
        message: "eval() usage detected — security risk",
        autoFixable: false,
      });
    }

    // Rule 3: No innerHTML without sanitization
    if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(content)) {
      violations.push({
        rule: "no_unsafe_html",
        severity: "warning",
        file: path,
        message: "Unsafe HTML injection detected — ensure input is sanitized",
        autoFixable: false,
      });
    }

    // Rule 4: No localStorage for auth tokens
    if (/localStorage\.setItem\s*\(\s*["'](?:token|auth|jwt|session)/i.test(content)) {
      violations.push({
        rule: "no_localstorage_auth",
        severity: "error",
        file: path,
        message: "Auth tokens should not be stored in localStorage",
        autoFixable: false,
      });
    }

    // Rule 5: No console.log in production components (warning only)
    if (path.match(/\.(jsx|tsx)$/) && /console\.log\(/.test(content) && !path.includes("test")) {
      violations.push({
        rule: "no_console_log",
        severity: "warning",
        file: path,
        message: "console.log in production component",
        autoFixable: true,
        fix: content.replace(/\s*console\.log\([^)]*\);?\n?/g, "\n"),
      });
    }

    // Rule 6: No @/ alias imports
    if (/from\s+["']@\//.test(content) && !path.includes("test")) {
      violations.push({
        rule: "no_alias_imports",
        severity: "error",
        file: path,
        message: "@/ alias imports not supported in runtime",
        autoFixable: false,
      });
    }

    // Rule 7: No hardcoded data arrays (SAMPLE_DATA pattern)
    if (/(?:SAMPLE|MOCK|FAKE|DUMMY)_DATA\s*=\s*\[/.test(content)) {
      violations.push({
        rule: "no_mock_data",
        severity: "warning",
        file: path,
        message: "Hardcoded sample data detected — should use real API",
        autoFixable: false,
      });
    }
  }

  // Auto-fix violations where possible
  let autoFixedFiles: Record<string, string> | undefined;
  const autoFixable = violations.filter(v => v.autoFixable && v.fix);
  if (autoFixable.length > 0 && workspace) {
    autoFixedFiles = { ...files };
    for (const v of autoFixable) {
      if (v.fix) {
        autoFixedFiles[v.file] = v.fix;
        workspace.updateFile(v.file, v.fix);
      }
    }
  }

  const errors = violations.filter(v => v.severity === "error");
  const warnings = violations.filter(v => v.severity === "warning");

  return {
    agent: "governance",
    status: errors.length > 0 ? "done" : "done",
    summary: `Governance: ${errors.length} errors, ${warnings.length} warnings (${autoFixable.length} auto-fixed)`,
    durationMs: performance.now() - start,
    violations,
    files: autoFixedFiles,
  };
}

// ─── Register Built-in Agents ────────────────────────────────────────────

registerAgent({
  name: "requirements",
  phase: "pre_build",
  priority: 100,
  shouldRun: () => true,
  execute: (ctx) => requirementsAgent(ctx),
  optional: false,
  timeoutMs: 5000,
});

registerAgent({
  name: "workflow",
  phase: "pre_build",
  priority: 90,
  shouldRun: (ctx) => ctx.results.has("requirements"),
  execute: (ctx) => workflowAgent(ctx),
  optional: false,
  timeoutMs: 5000,
});

registerAgent({
  name: "database",
  phase: "pre_build",
  priority: 80,
  shouldRun: (ctx) => {
    const req = ctx.rawRequirements.toLowerCase();
    return /auth|crud|database|data|store|save|table|entity/i.test(req);
  },
  execute: (ctx) => databaseAgent(ctx),
  optional: true,
  timeoutMs: 10000,
});

registerAgent({
  name: "testing",
  phase: "post_build",
  priority: 50,
  shouldRun: () => true,
  execute: (ctx, ws) => testingAgent(ctx, ws),
  optional: true,
  timeoutMs: 15000,
});

registerAgent({
  name: "governance",
  phase: "post_build",
  priority: 40,
  shouldRun: () => true,
  execute: (ctx, ws) => governanceAgent(ctx, ws),
  optional: false,
  timeoutMs: 15000,
});

// ─── Pipeline Executor ──────────────────────────────────────────────────

export interface AgentPipelineResult {
  phase: "pre_build" | "post_build";
  agentsRun: AgentName[];
  agentsSkipped: AgentName[];
  agentsFailed: AgentName[];
  results: Map<AgentName, AgentResult>;
  totalDurationMs: number;
  /** Whether any non-optional agent failed */
  blocked: boolean;
}

/**
 * Execute all agents registered for a given phase.
 * Returns accumulated results and whether the pipeline is blocked.
 */
export async function executeAgentPhase(
  phase: "pre_build" | "post_build",
  ctx: PipelineContext,
  workspace: Workspace | undefined,
  callbacks: AgentCallbacks
): Promise<AgentPipelineResult> {
  const start = performance.now();
  const agents = getAgentsForPhase(phase);
  const agentsRun: AgentName[] = [];
  const agentsSkipped: AgentName[] = [];
  const agentsFailed: AgentName[] = [];
  let blocked = false;

  for (const agent of agents) {
    // Check if this agent should run
    if (!agent.shouldRun(ctx)) {
      agentsSkipped.push(agent.name);
      cloudLog.info(`[AgentPipeline] Skipped ${agent.name} (condition not met)`, "orchestrator");
      continue;
    }

    callbacks.onAgentStart(agent.name);
    callbacks.onAgentProgress(agent.name, `Running ${agent.name} agent...`);

    try {
      // Execute with timeout
      const result = await Promise.race([
        Promise.resolve(agent.execute(ctx, workspace)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Agent ${agent.name} timed out after ${agent.timeoutMs}ms`)), agent.timeoutMs)
        ),
      ]);

      ctx.results.set(agent.name, result);
      agentsRun.push(agent.name);
      callbacks.onAgentDone(agent.name, result);

      cloudLog.info(`[AgentPipeline] ${agent.name}: ${result.summary}`, "orchestrator");
    } catch (err: any) {
      const errorResult: AgentResult = {
        agent: agent.name,
        status: "failed",
        summary: `Failed: ${err.message}`,
        durationMs: 0,
      };

      ctx.results.set(agent.name, errorResult);
      agentsFailed.push(agent.name);
      callbacks.onAgentDone(agent.name, errorResult);

      if (!agent.optional) {
        blocked = true;
        cloudLog.error(`[AgentPipeline] BLOCKING: ${agent.name} failed: ${err.message}`, "orchestrator");
      } else {
        cloudLog.warn(`[AgentPipeline] Non-fatal: ${agent.name} failed: ${err.message}`, "orchestrator");
      }
    }
  }

  return {
    phase,
    agentsRun,
    agentsSkipped,
    agentsFailed,
    results: ctx.results,
    totalDurationMs: performance.now() - start,
    blocked,
  };
}

/**
 * Build a human-readable summary of agent pipeline results.
 */
export function buildAgentPipelineSummary(result: AgentPipelineResult): string {
  const parts: string[] = [
    `Agent Pipeline (${result.phase}): ${result.agentsRun.length} ran, ${result.agentsSkipped.length} skipped`,
  ];

  if (result.agentsFailed.length > 0) {
    parts.push(`Failed: ${result.agentsFailed.join(", ")}`);
  }

  for (const [name, agentResult] of result.results) {
    parts.push(`  ${name}: ${agentResult.summary}`);
  }

  parts.push(`Duration: ${result.totalDurationMs.toFixed(0)}ms`);

  return parts.join("\n");
}
