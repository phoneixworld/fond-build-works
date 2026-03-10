/**
 * conversation-engine — Server-side conversation state management
 * 
 * Enterprise-grade enforcement:
 * - Server decides conversation mode transitions
 * - Server validates requirements completeness
 * - Server persists all state changes with audit trails
 * - Server orchestrates multi-agent coordination
 * - Client-side logic is advisory only
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Conversation Mode FSM ───────────────────────────────────────────────
type ConversationMode = "idle" | "gathering" | "ready" | "building" | "reviewing" | "complete";

const VALID_TRANSITIONS: Record<ConversationMode, ConversationMode[]> = {
  idle: ["gathering", "building"],
  gathering: ["gathering", "ready", "building", "idle"],
  ready: ["building", "gathering", "idle"],
  building: ["reviewing", "complete", "idle"],
  reviewing: ["complete", "building", "idle"],
  complete: ["idle", "gathering", "building"],
};

// ─── Signal Detection ────────────────────────────────────────────────────
const PHASED_SIGNALS = /\b(phase by phase|step by step|i['']ll give you|one at a time|let me explain|first let me|i['']ll share|i['']ll provide|wait for my|before you start|i will share|i will give|phase\s*\d|step\s*\d|part\s*\d|section\s*\d)\b/i;
const INFO_SIGNALS = /^(these are|here are|here is|this is|below are|following are|attached are|now for|next is|the next|moving on|continuing with|for phase|for step|for part)\b/i;
const BUILD_SIGNALS = /^(now build|go ahead|build it|start building|that['']s all|that['']s everything|you can start|proceed|let['']s build|ready to build|start now|begin|execute|generate|now create|do it)\b/i;
const CHAT_SIGNALS = /^(what is|how do|can you explain|tell me|describe|compare|difference between|help me understand|why|what are)\b/i;

// ─── Requirement Parser ─────────────────────────────────────────────────
interface ParsedRequirement {
  entities: string[];
  actions: string[];
  constraints: string[];
  uiComponents: string[];
  workflows: string[];
  roles: string[];
  integrations: string[];
}

function parseRequirements(text: string): ParsedRequirement {
  const lower = text.toLowerCase();
  
  // Entity extraction
  const entityPatterns = /\b(user|customer|product|order|task|project|team|member|item|category|comment|message|notification|invoice|payment|report|dashboard|profile|setting|role|permission)\b/gi;
  const entities = [...new Set((text.match(entityPatterns) || []).map(e => e.toLowerCase()))];

  // Action extraction
  const actionPatterns = /\b(create|read|update|delete|list|search|filter|sort|export|import|upload|download|share|invite|approve|reject|assign|notify|schedule|track|monitor|analyze|report|authenticate|authorize|login|logout|register|signup)\b/gi;
  const actions = [...new Set((text.match(actionPatterns) || []).map(a => a.toLowerCase()))];

  // Constraint extraction
  const constraintPatterns = /\b(must|should|required|mandatory|optional|maximum|minimum|at least|no more than|only|restrict|limit|validate|verify|ensure)\b/gi;
  const constraints = [...new Set((text.match(constraintPatterns) || []).map(c => c.toLowerCase()))];

  // UI Component extraction
  const uiPatterns = /\b(table|form|chart|graph|modal|dialog|sidebar|navbar|header|footer|card|list|grid|calendar|map|timeline|kanban|dashboard|wizard|stepper|tab|accordion|dropdown|menu|button|input|search bar|filter panel|pagination)\b/gi;
  const uiComponents = [...new Set((text.match(uiPatterns) || []).map(u => u.toLowerCase()))];

  // Workflow extraction
  const workflowPatterns = /\b(when .+? then|if .+? then|after .+? should|on .+? trigger|flow|pipeline|process|workflow|sequence|step \d|phase \d)\b/gi;
  const workflows = (text.match(workflowPatterns) || []).map(w => w.trim());

  // Role extraction
  const rolePatterns = /\b(admin|administrator|manager|editor|viewer|moderator|superadmin|owner|member|guest|student|teacher|instructor|parent|doctor|patient|client|vendor|supplier)\b/gi;
  const roles = [...new Set((text.match(rolePatterns) || []).map(r => r.toLowerCase()))];

  // Integration extraction
  const integrationPatterns = /\b(api|webhook|email|sms|push notification|stripe|paypal|google|facebook|github|slack|twilio|sendgrid|aws|firebase|oauth|sso|ldap|saml)\b/gi;
  const integrations = [...new Set((text.match(integrationPatterns) || []).map(i => i.toLowerCase()))];

  return { entities, actions, constraints, uiComponents, workflows, roles, integrations };
}

// ─── Normalize & Merge Requirements ──────────────────────────────────────
function normalizeRequirement(parsed: ParsedRequirement): Record<string, any> {
  return {
    dataModels: parsed.entities.map(e => ({
      name: e,
      suggestedFields: inferFields(e),
      crudActions: parsed.actions.filter(a => ["create", "read", "update", "delete", "list", "search"].includes(a)),
    })),
    authConfig: {
      requiresAuth: parsed.roles.length > 0 || parsed.actions.some(a => ["login", "logout", "register", "signup", "authenticate", "authorize"].includes(a)),
      roles: parsed.roles,
      permissions: parsed.roles.map(r => ({ role: r, resources: parsed.entities, actions: parsed.actions })),
    },
    uiLayout: {
      components: parsed.uiComponents,
      suggestedPages: inferPages(parsed),
    },
    workflows: parsed.workflows,
    integrations: parsed.integrations,
    constraints: parsed.constraints,
  };
}

function inferFields(entity: string): string[] {
  const commonFields: Record<string, string[]> = {
    user: ["name", "email", "avatar", "role", "status"],
    product: ["name", "description", "price", "image", "category", "stock"],
    order: ["total", "status", "items", "shipping_address", "payment_method"],
    task: ["title", "description", "status", "priority", "assignee", "due_date"],
    project: ["name", "description", "status", "owner", "members", "deadline"],
    message: ["content", "sender", "recipient", "read", "timestamp"],
    invoice: ["number", "amount", "status", "due_date", "line_items"],
    customer: ["name", "email", "phone", "company", "address"],
  };
  return commonFields[entity] || ["name", "description", "status"];
}

function inferPages(parsed: ParsedRequirement): string[] {
  const pages: string[] = [];
  if (parsed.entities.length > 0) pages.push("Dashboard");
  if (parsed.roles.length > 0 || parsed.actions.includes("login")) pages.push("Login", "Register");
  parsed.entities.forEach(e => {
    pages.push(`${e.charAt(0).toUpperCase() + e.slice(1)} List`);
    pages.push(`${e.charAt(0).toUpperCase() + e.slice(1)} Detail`);
  });
  if (parsed.uiComponents.includes("dashboard") || parsed.uiComponents.includes("chart")) pages.push("Analytics");
  if (parsed.actions.includes("report")) pages.push("Reports");
  return [...new Set(pages)];
}

function mergeNormalized(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  return {
    dataModels: dedupeByName([...(existing.dataModels || []), ...(incoming.dataModels || [])]),
    authConfig: {
      requiresAuth: existing.authConfig?.requiresAuth || incoming.authConfig?.requiresAuth,
      roles: [...new Set([...(existing.authConfig?.roles || []), ...(incoming.authConfig?.roles || [])])],
      permissions: [...(existing.authConfig?.permissions || []), ...(incoming.authConfig?.permissions || [])],
    },
    uiLayout: {
      components: [...new Set([...(existing.uiLayout?.components || []), ...(incoming.uiLayout?.components || [])])],
      suggestedPages: [...new Set([...(existing.uiLayout?.suggestedPages || []), ...(incoming.uiLayout?.suggestedPages || [])])],
    },
    workflows: [...(existing.workflows || []), ...(incoming.workflows || [])],
    integrations: [...new Set([...(existing.integrations || []), ...(incoming.integrations || [])])],
    constraints: [...new Set([...(existing.constraints || []), ...(incoming.constraints || [])])],
  };
}

function dedupeByName(arr: any[]): any[] {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

// ─── IR Mapping ──────────────────────────────────────────────────────────
function mapToIR(normalized: Record<string, any>): Record<string, any> {
  return {
    routes: (normalized.uiLayout?.suggestedPages || []).map((page: string, i: number) => ({
      id: `route-${i}`,
      path: `/${page.toLowerCase().replace(/\s+/g, "-")}`,
      label: page,
      isProtected: normalized.authConfig?.requiresAuth && !["Login", "Register"].includes(page),
    })),
    dataModels: (normalized.dataModels || []).map((dm: any, i: number) => ({
      id: `model-${i}`,
      collectionName: dm.name,
      description: `${dm.name} entity`,
      fields: (dm.suggestedFields || []).map((f: string) => ({
        name: f,
        type: inferFieldType(f),
        required: ["name", "email", "title"].includes(f),
      })),
      timestamps: true,
      softDelete: false,
    })),
    auth: {
      enabled: normalized.authConfig?.requiresAuth || false,
      provider: "email",
      requireEmailVerification: false,
      roles: (normalized.authConfig?.roles || []).map((r: string, i: number) => ({
        id: `role-${i}`,
        name: r,
        description: `${r} role`,
      })),
      permissions: [],
      publicRoutes: ["/login", "/register", "/"],
    },
  };
}

function inferFieldType(field: string): string {
  if (field.includes("email")) return "email";
  if (field.includes("url") || field.includes("image") || field.includes("avatar")) return "url";
  if (field.includes("price") || field.includes("amount") || field.includes("total") || field.includes("stock") || field.includes("count")) return "number";
  if (field.includes("date") || field.includes("deadline") || field.includes("timestamp")) return "date";
  if (field.includes("status") || field.includes("role") || field.includes("priority") || field.includes("type") || field.includes("category")) return "select";
  if (field.includes("active") || field.includes("read") || field.includes("published") || field.includes("verified")) return "boolean";
  if (field.includes("items") || field.includes("members") || field.includes("tags")) return "json";
  return "text";
}

// ─── Build Readiness Compiler ────────────────────────────────────────────
interface ReadinessCheck {
  name: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
}

function compileBuildReadiness(
  irState: Record<string, any>,
  requirements: any[],
  normalized: Record<string, any>
): {
  isReady: boolean;
  score: number;
  checks: ReadinessCheck[];
  missingFields: string[];
  incompleteWorkflows: string[];
  unresolvedRoles: string[];
  underspecifiedComponents: string[];
  missingConstraints: string[];
  recommendation: string;
} {
  const checks: ReadinessCheck[] = [];
  const missingFields: string[] = [];
  const incompleteWorkflows: string[] = [];
  const unresolvedRoles: string[] = [];
  const underspecifiedComponents: string[] = [];
  const missingConstraints: string[] = [];

  // Check 1: Are there any requirements at all?
  checks.push({
    name: "requirements_exist",
    passed: requirements.length > 0,
    severity: "error",
    message: requirements.length > 0 ? `${requirements.length} requirement phase(s) captured` : "No requirements captured yet",
  });

  // Check 2: Are IR routes defined?
  const routes = irState?.routes || [];
  checks.push({
    name: "routes_defined",
    passed: routes.length > 0,
    severity: "error",
    message: routes.length > 0 ? `${routes.length} route(s) defined` : "No routes defined — app has no pages",
  });

  // Check 3: Are data models defined?
  const models = irState?.dataModels || normalized?.dataModels || [];
  checks.push({
    name: "data_models_defined",
    passed: models.length > 0,
    severity: "warning",
    message: models.length > 0 ? `${models.length} data model(s) defined` : "No data models — app has no persistence layer",
  });

  // Check 4: Are entities missing fields?
  for (const model of models) {
    const fields = model.fields || model.suggestedFields || [];
    if (fields.length < 2) {
      missingFields.push(`${model.name || model.collectionName}: needs more field definitions`);
    }
  }
  checks.push({
    name: "entity_fields_complete",
    passed: missingFields.length === 0,
    severity: "warning",
    message: missingFields.length === 0 ? "All entities have sufficient fields" : `${missingFields.length} entity(ies) need more fields`,
  });

  // Check 5: Auth consistency
  const authEnabled = irState?.auth?.enabled || normalized?.authConfig?.requiresAuth;
  const protectedRoutes = routes.filter((r: any) => r.isProtected);
  if (authEnabled && protectedRoutes.length === 0 && routes.length > 0) {
    checks.push({
      name: "auth_consistency",
      passed: false,
      severity: "warning",
      message: "Auth is enabled but no routes are marked as protected",
    });
  } else {
    checks.push({
      name: "auth_consistency",
      passed: true,
      severity: "info",
      message: authEnabled ? `Auth enabled with ${protectedRoutes.length} protected route(s)` : "No auth required",
    });
  }

  // Check 6: Roles resolved
  const definedRoles = irState?.auth?.roles || normalized?.authConfig?.roles || [];
  const referencedRoles = normalized?.authConfig?.roles || [];
  for (const role of referencedRoles) {
    const roleName = typeof role === "string" ? role : role.name;
    if (!definedRoles.some((r: any) => (typeof r === "string" ? r : r.name) === roleName)) {
      unresolvedRoles.push(roleName);
    }
  }
  checks.push({
    name: "roles_resolved",
    passed: unresolvedRoles.length === 0,
    severity: "warning",
    message: unresolvedRoles.length === 0 ? "All roles resolved" : `${unresolvedRoles.length} role(s) referenced but not defined`,
  });

  // Check 7: UI components specified
  const uiComponents = normalized?.uiLayout?.components || [];
  if (uiComponents.length === 0 && requirements.length > 0) {
    underspecifiedComponents.push("No UI components specified — will use defaults");
  }
  checks.push({
    name: "ui_specified",
    passed: uiComponents.length > 0 || requirements.length === 0,
    severity: "info",
    message: uiComponents.length > 0 ? `${uiComponents.length} UI component(s) specified` : "UI layout will be auto-generated",
  });

  // Check 8: Workflows complete
  const workflows = normalized?.workflows || [];
  for (const wf of workflows) {
    if (typeof wf === "string" && wf.includes("...")) {
      incompleteWorkflows.push(wf);
    }
  }
  checks.push({
    name: "workflows_complete",
    passed: incompleteWorkflows.length === 0,
    severity: "warning",
    message: incompleteWorkflows.length === 0 ? `${workflows.length} workflow(s) defined` : `${incompleteWorkflows.length} workflow(s) are incomplete`,
  });

  // Score calculation
  const errorChecks = checks.filter(c => c.severity === "error");
  const warningChecks = checks.filter(c => c.severity === "warning");
  const passedErrors = errorChecks.filter(c => c.passed).length;
  const passedWarnings = warningChecks.filter(c => c.passed).length;
  const totalWeight = errorChecks.length * 3 + warningChecks.length * 1;
  const earnedWeight = passedErrors * 3 + passedWarnings * 1;
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  const isReady = errorChecks.every(c => c.passed) && score >= 50;

  let recommendation = "";
  if (isReady) {
    recommendation = score >= 80 
      ? "All critical checks passed. Ready to build with high confidence."
      : "Core requirements met. Some optional specs are missing — build will use smart defaults.";
  } else {
    const failedErrors = errorChecks.filter(c => !c.passed).map(c => c.message);
    recommendation = `Cannot build yet. Fix: ${failedErrors.join("; ")}`;
  }

  return {
    isReady, score, checks, missingFields, incompleteWorkflows,
    unresolvedRoles, underspecifiedComponents, missingConstraints, recommendation,
  };
}

// ─── Agent Registry ──────────────────────────────────────────────────────
const AGENTS = [
  "requirements", "workflow", "backend", "frontend", "auth",
  "persistence", "testing", "governance", "auto-repair", "orchestrator",
] as const;
type AgentName = typeof AGENTS[number];

interface AgentState {
  status: "idle" | "active" | "complete" | "error";
  lastRun: string | null;
  result: any;
}

function getDefaultAgentStates(): Record<AgentName, AgentState> {
  const states: Record<string, AgentState> = {};
  for (const agent of AGENTS) {
    states[agent] = { status: "idle", lastRun: null, result: null };
  }
  return states as Record<AgentName, AgentState>;
}

// ─── Main Handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, projectId, userId, message, hasImages, irState } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET: Load current state ───
    if (action === "get_state") {
      const { data: convState } = await supabase
        .from("project_conversation_state")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const { data: requirements } = await supabase
        .from("project_requirements")
        .select("*")
        .eq("project_id", projectId)
        .order("phase_number", { ascending: true });

      const { data: readiness } = await supabase
        .from("project_build_readiness")
        .select("*")
        .eq("project_id", projectId)
        .single();

      const { data: recentAudit } = await supabase
        .from("project_audit_log")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({
        conversationState: convState || { mode: "idle", version: 1, phases: [], agent_states: getDefaultAgentStates() },
        requirements: requirements || [],
        buildReadiness: readiness || { is_ready: false, score: 0, checks: [], recommendation: "No requirements yet" },
        recentAudit: recentAudit || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ANALYZE: Determine action for incoming message ───
    if (action === "analyze_message") {
      const text = (message || "").trim();
      const lower = text.toLowerCase();

      // Load current state
      const { data: convState } = await supabase
        .from("project_conversation_state")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const currentMode: ConversationMode = convState?.mode || "idle";

      let recommendedAction: "gather" | "build" | "chat" | "continue" = "continue";
      let reason = "";

      // Server-side signal detection
      if (BUILD_SIGNALS.test(lower)) {
        recommendedAction = "build";
        reason = "User explicitly requested build";
      } else if (CHAT_SIGNALS.test(lower)) {
        recommendedAction = "chat";
        reason = "User asking a question";
      } else if (currentMode === "gathering") {
        if (INFO_SIGNALS.test(lower) || hasImages || text.length > 200) {
          recommendedAction = "gather";
          reason = "Additional requirements during gathering phase";
        } else if (text.length < 100) {
          recommendedAction = "continue";
          reason = "Short message during gathering — ambiguous";
        } else {
          recommendedAction = "gather";
          reason = "Content message during gathering";
        }
      } else if (PHASED_SIGNALS.test(lower)) {
        recommendedAction = "gather";
        reason = "User signaled phased approach";
      } else if (INFO_SIGNALS.test(lower) || text.length > 300) {
        recommendedAction = "gather";
        reason = "User providing information";
      } else {
        recommendedAction = "continue";
        reason = "No strong signal — defer to classifier";
      }

      // Validate transition
      const targetMode: ConversationMode = recommendedAction === "gather" ? "gathering"
        : recommendedAction === "build" ? "building"
        : currentMode;

      const isValidTransition = VALID_TRANSITIONS[currentMode]?.includes(targetMode) ?? true;

      return new Response(JSON.stringify({
        action: recommendedAction,
        reason,
        currentMode,
        targetMode,
        isValidTransition,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ADD REQUIREMENT: Parse, normalize, store, audit ───
    if (action === "add_requirement") {
      const text = (message || "").trim();
      if (!text) {
        return new Response(JSON.stringify({ error: "message required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current phase count
      const { count } = await supabase
        .from("project_requirements")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId);

      const phaseNumber = (count || 0) + 1;

      // Parse & normalize
      const parsed = parseRequirements(text);
      const normalized = normalizeRequirement(parsed);
      const irMappings = mapToIR(normalized);

      // Store requirement
      const { data: req, error: reqError } = await supabase
        .from("project_requirements")
        .insert({
          project_id: projectId,
          phase_number: phaseNumber,
          raw_text: text,
          parsed,
          normalized,
          ir_mappings: irMappings,
          has_images: hasImages || false,
          status: "active",
        })
        .select()
        .single();

      if (reqError) throw reqError;

      // Get all requirements for merged view
      const { data: allReqs } = await supabase
        .from("project_requirements")
        .select("normalized")
        .eq("project_id", projectId);

      // Merge all normalized requirements
      let mergedNormalized: Record<string, any> = {};
      for (const r of (allReqs || [])) {
        mergedNormalized = mergeNormalized(mergedNormalized, r.normalized as Record<string, any>);
      }

      // Update conversation state
      const { data: convState } = await supabase
        .from("project_conversation_state")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const newVersion = (convState?.version || 0) + 1;
      const phases = [...(convState?.phases as any[] || []), {
        id: phaseNumber,
        summary: text.slice(0, 200),
        timestamp: new Date().toISOString(),
        hasImages: hasImages || false,
      }];

      await supabase
        .from("project_conversation_state")
        .insert({
          project_id: projectId,
          version: newVersion,
          mode: "gathering",
          phases,
          agent_states: convState?.agent_states || getDefaultAgentStates(),
          metadata: { last_requirement_id: req.id },
        });

      // Compile build readiness
      const readiness = compileBuildReadiness(irState || {}, allReqs || [], mergedNormalized);
      const { error: readinessError } = await supabase
        .from("project_build_readiness")
        .upsert({
          project_id: projectId,
          is_ready: readiness.isReady,
          score: readiness.score,
          checks: readiness.checks,
          missing_fields: readiness.missingFields,
          incomplete_workflows: readiness.incompleteWorkflows,
          unresolved_roles: readiness.unresolvedRoles,
          underspecified_components: readiness.underspecifiedComponents,
          missing_constraints: readiness.missingConstraints,
          recommendation: readiness.recommendation,
          updated_at: new Date().toISOString(),
        }, { onConflict: "project_id" });
      if (readinessError) {
        console.error("[conversation-engine] Build readiness upsert error:", JSON.stringify(readinessError));
      }

      // Audit log
      await supabase
        .from("project_audit_log")
        .insert({
          project_id: projectId,
          user_id: userId || null,
          agent_name: "requirements",
          action: "requirement_added",
          entity_type: "requirement",
          entity_id: req.id,
          after_state: { parsed, normalized, irMappings },
          metadata: { phaseNumber, hasImages: hasImages || false },
        });

      return new Response(JSON.stringify({
        requirement: req,
        phaseNumber,
        parsed,
        normalized,
        irMappings,
        mergedNormalized,
        buildReadiness: readiness,
        acknowledgment: generateAcknowledgment(phaseNumber, parsed, readiness),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET COMPILED REQUIREMENTS: For build agent ───
    if (action === "get_compiled_requirements") {
      const { data: allReqs } = await supabase
        .from("project_requirements")
        .select("*")
        .eq("project_id", projectId)
        .order("phase_number", { ascending: true });

      let mergedNormalized: Record<string, any> = {};
      for (const r of (allReqs || [])) {
        mergedNormalized = mergeNormalized(mergedNormalized, r.normalized as Record<string, any>);
      }

      const compiledIR = mapToIR(mergedNormalized);
      const readiness = compileBuildReadiness(irState || {}, allReqs || [], mergedNormalized);

      // Build the context string for the build agent
      let context = `📋 COMPILED REQUIREMENTS (${(allReqs || []).length} phases):\n\n`;
      for (const req of (allReqs || [])) {
        context += `--- Phase ${req.phase_number} ---\n${req.raw_text}\n\n`;
      }
      context += `--- STRUCTURED ANALYSIS ---\n`;
      context += `Entities: ${mergedNormalized.dataModels?.map((d: any) => d.name).join(", ") || "none"}\n`;
      context += `Auth: ${mergedNormalized.authConfig?.requiresAuth ? "Required" : "Not required"}\n`;
      context += `Roles: ${mergedNormalized.authConfig?.roles?.join(", ") || "none"}\n`;
      context += `UI Components: ${mergedNormalized.uiLayout?.components?.join(", ") || "auto"}\n`;
      context += `Pages: ${mergedNormalized.uiLayout?.suggestedPages?.join(", ") || "auto"}\n`;
      context += `\nBuild readiness: ${readiness.score}% (${readiness.isReady ? "READY" : "NOT READY"})\n`;
      context += `${readiness.recommendation}\n`;

      // Update conversation state to building
      const { data: convState } = await supabase
        .from("project_conversation_state")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const newVersion = (convState?.version || 0) + 1;
      await supabase
        .from("project_conversation_state")
        .insert({
          project_id: projectId,
          version: newVersion,
          mode: "building",
          phases: convState?.phases || [],
          agent_states: {
            ...(convState?.agent_states || getDefaultAgentStates()),
            orchestrator: { status: "active", lastRun: new Date().toISOString(), result: null },
          },
        });

      // Audit
      await supabase
        .from("project_audit_log")
        .insert({
          project_id: projectId,
          user_id: userId || null,
          agent_name: "orchestrator",
          action: "build_started",
          entity_type: "build",
          metadata: { requirementCount: (allReqs || []).length, readinessScore: readiness.score },
        });

      return new Response(JSON.stringify({
        context,
        compiledIR,
        mergedNormalized,
        buildReadiness: readiness,
        requirementCount: (allReqs || []).length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BUILD COMPLETE: Record completion ───
    if (action === "build_complete") {
      const { data: convState } = await supabase
        .from("project_conversation_state")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const newVersion = (convState?.version || 0) + 1;
      const agentStates = {
        ...(convState?.agent_states || getDefaultAgentStates()),
        orchestrator: { status: "complete", lastRun: new Date().toISOString(), result: message },
      };

      await supabase
        .from("project_conversation_state")
        .insert({
          project_id: projectId,
          version: newVersion,
          mode: "complete",
          phases: convState?.phases || [],
          agent_states: agentStates,
          metadata: { completedAt: new Date().toISOString(), ...(message || {}) },
        });

      await supabase
        .from("project_audit_log")
        .insert({
          project_id: projectId,
          user_id: userId || null,
          agent_name: "orchestrator",
          action: "build_completed",
          entity_type: "build",
          before_state: { mode: convState?.mode },
          after_state: { mode: "complete" },
          metadata: message || {},
        });

      return new Response(JSON.stringify({ success: true, version: newVersion }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESET: Clear state for new conversation ───
    if (action === "reset") {
      const { data: convState } = await supabase
        .from("project_conversation_state")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const newVersion = (convState?.version || 0) + 1;
      await supabase
        .from("project_conversation_state")
        .insert({
          project_id: projectId,
          version: newVersion,
          mode: "idle",
          phases: [],
          agent_states: getDefaultAgentStates(),
        });

      await supabase
        .from("project_audit_log")
        .insert({
          project_id: projectId,
          user_id: userId || null,
          agent_name: "system",
          action: "conversation_reset",
          entity_type: "conversation",
          before_state: { mode: convState?.mode, phases: convState?.phases },
          after_state: { mode: "idle", phases: [] },
        });

      return new Response(JSON.stringify({ success: true, version: newVersion }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[conversation-engine] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateAcknowledgment(phaseNumber: number, parsed: ParsedRequirement, readiness: any): string {
  const entityList = parsed.entities.length > 0 ? parsed.entities.join(", ") : null;
  const actionList = parsed.actions.length > 0 ? parsed.actions.slice(0, 5).join(", ") : null;

  let ack = `✅ **Phase ${phaseNumber} captured & analyzed.**\n\n`;
  
  if (entityList) ack += `📊 **Entities detected:** ${entityList}\n`;
  if (actionList) ack += `⚡ **Actions:** ${actionList}\n`;
  if (parsed.roles.length > 0) ack += `👤 **Roles:** ${parsed.roles.join(", ")}\n`;
  if (parsed.uiComponents.length > 0) ack += `🎨 **UI:** ${parsed.uiComponents.join(", ")}\n`;

  ack += `\n📈 **Build readiness:** ${readiness.score}%`;
  
  if (readiness.isReady) {
    ack += ` — Ready to build! Say **"build it"** when you're done, or send more phases.`;
  } else {
    ack += ` — ${readiness.recommendation}`;
    ack += `\n\nSend the next phase when ready, or say **"build it"** to proceed with what we have.`;
  }

  return ack;
}
