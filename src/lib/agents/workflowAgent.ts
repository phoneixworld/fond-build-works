/**
 * Workflow Agent — Decides which agents are needed for a given request.
 * 
 * This is the "router" that analyzes requirements and determines the
 * optimal agent pipeline. The user never sees this decision.
 */

import type { AgentName, PipelineContext } from "./types";

interface WorkflowDecision {
  agents: AgentName[];
  reasoning: string;
}

/**
 * Analyze requirements and determine which agents to run.
 * Always runs: requirements → frontend
 * Conditionally: backend, database, testing, governance
 */
export function planAgentWorkflow(ctx: PipelineContext): WorkflowDecision {
  const req = ctx.rawRequirements.toLowerCase();
  const agents: AgentName[] = [];
  const reasons: string[] = [];

  // Requirements agent always runs first
  agents.push("requirements");
  reasons.push("Requirements analysis is mandatory");

  // Backend agent — if Supabase features are needed
  const needsBackend = detectBackendNeeds(req, ctx);
  if (needsBackend) {
    agents.push("backend");
    reasons.push("Backend features detected (auth, API, data persistence)");
  }

  // Database agent — if schema changes are needed
  const needsDatabase = detectDatabaseNeeds(req, ctx);
  if (needsDatabase) {
    agents.push("database");
    reasons.push("Schema/data model changes detected");
  }

  // Frontend agent always runs (it's the main code generator)
  agents.push("frontend");
  reasons.push("Frontend generation is mandatory");

  // Testing agent — for complex apps or when explicitly requested
  const needsTesting = detectTestingNeeds(req, ctx);
  if (needsTesting) {
    agents.push("testing");
    reasons.push("Complex app — smoke tests recommended");
  }

  // Governance agent always runs last as a gate
  agents.push("governance");
  reasons.push("Governance validation is mandatory");

  return {
    agents,
    reasoning: reasons.join("; "),
  };
}

function detectBackendNeeds(req: string, ctx: PipelineContext): boolean {
  const backendKeywords = [
    "auth", "login", "signup", "register", "password",
    "database", "persist", "save data", "store data",
    "api", "endpoint", "server", "backend",
    "user account", "session", "token",
    "upload", "file storage", "image upload",
    "email", "notification", "send email",
    "payment", "stripe", "subscription",
    "real-time", "realtime", "websocket", "live update",
  ];
  return backendKeywords.some(kw => req.includes(kw));
}

function detectDatabaseNeeds(req: string, ctx: PipelineContext): boolean {
  const dbKeywords = [
    "database", "table", "schema", "migration",
    "crud", "create read update delete",
    "entity", "model", "collection",
    "store", "persist", "save",
    "users table", "products table", "orders table",
  ];
  
  // Also check if IR has entities that don't have schemas yet
  const irEntities = ctx.ir?.entities || [];
  const existingSchemas = ctx.schemas || [];
  const existingNames = new Set(existingSchemas.map((s: any) => s.collection_name?.toLowerCase()));
  const unmappedEntities = irEntities.filter((e: any) => !existingNames.has(e.name?.toLowerCase()));
  
  return dbKeywords.some(kw => req.includes(kw)) || unmappedEntities.length > 0;
}

function detectTestingNeeds(req: string, ctx: PipelineContext): boolean {
  const testKeywords = ["test", "testing", "validate", "verify", "qa", "quality"];
  if (testKeywords.some(kw => req.includes(kw))) return true;
  
  // Auto-enable for complex apps (many entities or routes)
  const entityCount = ctx.ir?.entities?.length || 0;
  const routeCount = ctx.ir?.routes?.length || 0;
  return entityCount >= 3 || routeCount >= 5;
}
