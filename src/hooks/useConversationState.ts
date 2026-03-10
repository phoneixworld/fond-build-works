/**
 * useConversationState — Enterprise-grade Conversation State Machine
 * 
 * Server-first architecture:
 * - State is persisted to project_conversation_state table
 * - Requirements are parsed, normalized, and stored in project_requirements
 * - Build readiness is computed server-side via compiler-style validation
 * - Client state is a synchronized mirror of server state
 * - All transitions are audited in project_audit_log
 * 
 * Modes: idle → gathering → ready → building → reviewing → complete
 * 
 * Failure recovery:
 * - If client reloads → state persists (restored from server)
 * - If agent fails → state persists (server tracks agent_states)
 * - If build fails → state persists (mode stays, doesn't reset)
 * - If user switches devices → state persists (server-side)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ConversationMode = "idle" | "gathering" | "ready" | "building" | "reviewing" | "complete";

export interface RequirementPhase {
  id: number;
  summary: string;
  rawText: string;
  hasImages: boolean;
  timestamp: number;
  // Server-enriched fields
  parsed?: {
    entities: string[];
    actions: string[];
    constraints: string[];
    uiComponents: string[];
    workflows: string[];
    roles: string[];
    integrations: string[];
  };
  normalized?: Record<string, any>;
  irMappings?: Record<string, any>;
}

export interface BuildReadiness {
  isReady: boolean;
  score: number;
  checks: Array<{
    name: string;
    passed: boolean;
    severity: "error" | "warning" | "info";
    message: string;
  }>;
  missingFields: string[];
  incompleteWorkflows: string[];
  unresolvedRoles: string[];
  underspecifiedComponents: string[];
  missingConstraints: string[];
  recommendation: string;
}

export interface BuildResult {
  filesChanged: string[];
  totalFiles: number;
  chatSummary: string;
  timestamp: number;
}

export interface AgentState {
  status: "idle" | "active" | "complete" | "error";
  lastRun: string | null;
  result: any;
}

const AGENTS = [
  "requirements", "workflow", "backend", "frontend", "auth",
  "persistence", "testing", "governance", "auto-repair", "orchestrator",
] as const;

// Client-side fast signals (advisory — server has final say)
const PHASED_SIGNALS = /\b(phase by phase|step by step|i['']ll give you|ill give you|one at a time|let me explain|first let me|i['']ll share|ill share|i['']ll provide|ill provide|wait for my|before you start|i will share|i will give|phase\s*\d|step\s*\d|part\s*\d|section\s*\d)\b/i;
const INFO_PROVIDING_SIGNALS = /^(these are|here are|here is|this is|below are|following are|attached are|now for|next is|the next|moving on|continuing with|for phase|for step|for part)\b/i;
const BUILD_NOW_SIGNALS = /^(now build|go ahead|build it|start building|that's all|thats all|that's everything|thats everything|you can start|proceed|let's build|lets build|ready to build|start now|begin|execute|generate|now create|do it)\b/i;

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conversation-engine`;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callEngine(body: Record<string, any>): Promise<any> {
  const resp = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error("[ConvState] Engine error:", err);
    throw new Error(err);
  }
  return resp.json();
}

export function useConversationState() {
  const [mode, setMode] = useState<ConversationMode>("idle");
  const [phases, setPhases] = useState<RequirementPhase[]>([]);
  const [lastBuildResult, setLastBuildResult] = useState<BuildResult | null>(null);
  const [buildReadiness, setBuildReadiness] = useState<BuildReadiness | null>(null);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [serverVersion, setServerVersion] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);

  const phaseCounter = useRef(0);
  const currentProjectId = useRef<string | null>(null);

  /**
   * Restore state from server — called on project load and device switch
   */
  const restoreFromServer = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setIsRestoring(true);
    currentProjectId.current = projectId;

    try {
      const result = await callEngine({ action: "get_state", projectId });

      const cs = result.conversationState;
      setMode(cs.mode as ConversationMode);
      setPhases((cs.phases || []).map((p: any, i: number) => ({
        id: p.id || i + 1,
        summary: p.summary || "",
        rawText: p.rawText || p.summary || "",
        hasImages: p.hasImages || false,
        timestamp: p.timestamp ? new Date(p.timestamp).getTime() : Date.now(),
      })));
      setAgentStates(cs.agent_states || {});
      setServerVersion(cs.version || 1);
      phaseCounter.current = (cs.phases || []).length;

      if (result.buildReadiness) {
        setBuildReadiness({
          isReady: result.buildReadiness.is_ready,
          score: result.buildReadiness.score,
          checks: result.buildReadiness.checks || [],
          missingFields: result.buildReadiness.missing_fields || [],
          incompleteWorkflows: result.buildReadiness.incomplete_workflows || [],
          unresolvedRoles: result.buildReadiness.unresolved_roles || [],
          underspecifiedComponents: result.buildReadiness.underspecified_components || [],
          missingConstraints: result.buildReadiness.missing_constraints || [],
          recommendation: result.buildReadiness.recommendation || "",
        });
      }

      console.log(`[ConvState] Restored from server: mode=${cs.mode}, phases=${(cs.phases || []).length}, version=${cs.version}`);
    } catch (err) {
      console.warn("[ConvState] Failed to restore from server, using local state:", err);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  /**
   * Analyze a message — server-first with client fallback
   */
  const analyzeMessage = useCallback(async (text: string, hasImages: boolean, irState?: any): Promise<{
    action: "gather" | "build" | "chat" | "continue";
    reason: string;
  }> => {
    const projectId = currentProjectId.current;

    // Client-side fast path (advisory)
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (BUILD_NOW_SIGNALS.test(lower)) {
      return { action: "build", reason: "User explicitly requested build" };
    }

    // Try server analysis
    if (projectId) {
      try {
        const result = await callEngine({
          action: "analyze_message",
          projectId,
          message: text,
          hasImages,
          irState,
        });
        return { action: result.action, reason: result.reason };
      } catch {
        console.warn("[ConvState] Server analysis failed, using client fallback");
      }
    }

    // Client fallback
    if (mode === "gathering") {
      if (INFO_PROVIDING_SIGNALS.test(lower) || hasImages) {
        return { action: "gather", reason: "User providing additional requirements" };
      }
      if (trimmed.length > 200) {
        return { action: "gather", reason: "Long message during gathering" };
      }
    }

    if (PHASED_SIGNALS.test(lower)) {
      return { action: "gather", reason: "User signaled phased approach" };
    }
    if (INFO_PROVIDING_SIGNALS.test(lower)) {
      return { action: "gather", reason: "User providing information" };
    }

    return { action: "continue", reason: "No conversation state signal detected" };
  }, [mode]);

  /**
   * Synchronous analyze for backward compat — uses client-side only
   */
  const analyzeMessageSync = useCallback((text: string, hasImages: boolean): {
    action: "gather" | "build" | "chat" | "continue";
    reason: string;
  } => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (BUILD_NOW_SIGNALS.test(lower)) {
      return { action: "build", reason: "User explicitly requested build" };
    }

    if (mode === "gathering") {
      if (INFO_PROVIDING_SIGNALS.test(lower) || hasImages) {
        return { action: "gather", reason: "User providing additional requirements" };
      }
      if (trimmed.length > 200) {
        return { action: "gather", reason: "Long message during gathering" };
      }
      if (trimmed.length < 100 && !BUILD_NOW_SIGNALS.test(lower)) {
        return { action: "continue", reason: "Short message during gathering" };
      }
    }

    if (PHASED_SIGNALS.test(lower)) {
      return { action: "gather", reason: "User signaled phased approach" };
    }
    if (INFO_PROVIDING_SIGNALS.test(lower)) {
      return { action: "gather", reason: "User providing information" };
    }

    return { action: "continue", reason: "No conversation state signal detected" };
  }, [mode]);

  /**
   * Add a requirement phase — server-persisted with parsing & normalization
   */
  const addPhase = useCallback(async (text: string, hasImages: boolean, irState?: any): Promise<RequirementPhase> => {
    phaseCounter.current += 1;
    const localPhase: RequirementPhase = {
      id: phaseCounter.current,
      summary: text.slice(0, 200).replace(/\n/g, " "),
      rawText: text,
      hasImages,
      timestamp: Date.now(),
    };

    // Optimistic update
    setPhases(prev => [...prev, localPhase]);
    setMode("gathering");

    const projectId = currentProjectId.current;
    if (projectId) {
      try {
        const result = await callEngine({
          action: "add_requirement",
          projectId,
          message: text,
          hasImages,
          irState,
        });

        // Enrich local phase with server data
        const enriched: RequirementPhase = {
          ...localPhase,
          parsed: result.parsed,
          normalized: result.normalized,
          irMappings: result.irMappings,
        };

        setPhases(prev => prev.map(p => p.id === localPhase.id ? enriched : p));

        if (result.buildReadiness) {
          setBuildReadiness({
            isReady: result.buildReadiness.isReady,
            score: result.buildReadiness.score,
            checks: result.buildReadiness.checks || [],
            missingFields: result.buildReadiness.missingFields || [],
            incompleteWorkflows: result.buildReadiness.incompleteWorkflows || [],
            unresolvedRoles: result.buildReadiness.unresolvedRoles || [],
            underspecifiedComponents: result.buildReadiness.underspecifiedComponents || [],
            missingConstraints: result.buildReadiness.missingConstraints || [],
            recommendation: result.buildReadiness.recommendation || "",
          });
        }

        return enriched;
      } catch (err) {
        console.warn("[ConvState] Server addPhase failed, using local:", err);
      }
    }

    return localPhase;
  }, []);

  /**
   * Get accumulated requirements context for build agent — server-compiled
   */
  const getRequirementsContext = useCallback(async (irState?: any): Promise<string> => {
    const projectId = currentProjectId.current;

    if (projectId) {
      try {
        const result = await callEngine({
          action: "get_compiled_requirements",
          projectId,
          irState,
        });
        return result.context;
      } catch {
        console.warn("[ConvState] Server compilation failed, using local");
      }
    }

    // Local fallback
    if (phases.length === 0) return "";
    let context = `📋 ACCUMULATED REQUIREMENTS (${phases.length} phase${phases.length > 1 ? "s" : ""}):\n\n`;
    phases.forEach((phase, i) => {
      context += `--- Phase ${i + 1} ---\n`;
      context += phase.rawText + "\n";
      if (phase.hasImages) context += "[Images were attached]\n";
      context += "\n";
    });
    context += "--- END REQUIREMENTS ---\n";
    context += "\nBuild the complete application incorporating ALL the above requirements.\n";
    return context;
  }, [phases]);

  /**
   * Sync getRequirementsContext for backward compat
   */
  const getRequirementsContextSync = useCallback((): string => {
    if (phases.length === 0) return "";
    let context = `📋 ACCUMULATED REQUIREMENTS (${phases.length} phase${phases.length > 1 ? "s" : ""}):\n\n`;
    phases.forEach((phase, i) => {
      context += `--- Phase ${i + 1} ---\n`;
      context += phase.rawText + "\n";
      if (phase.hasImages) context += "[Images were attached]\n";
      context += "\n";
    });
    context += "--- END REQUIREMENTS ---\n";
    context += "\nBuild the complete application incorporating ALL the above requirements.\n";
    return context;
  }, [phases]);

  const startBuilding = useCallback(async () => {
    setMode("building");
    const projectId = currentProjectId.current;
    if (projectId) {
      try {
        await callEngine({ action: "get_compiled_requirements", projectId });
      } catch {}
    }
  }, []);

  const completeBuild = useCallback(async (result: BuildResult) => {
    setLastBuildResult(result);
    setMode("complete");

    const projectId = currentProjectId.current;
    if (projectId) {
      try {
        await callEngine({
          action: "build_complete",
          projectId,
          message: result,
        });
      } catch {}
    }
  }, []);

  const reset = useCallback(async () => {
    setMode("idle");
    setPhases([]);
    setLastBuildResult(null);
    setBuildReadiness(null);
    setAgentStates({});
    phaseCounter.current = 0;

    const projectId = currentProjectId.current;
    if (projectId) {
      try {
        await callEngine({ action: "reset", projectId });
      } catch {}
    }
  }, []);

  /**
   * Generate acknowledgment with server-enriched data
   */
  const generateAcknowledgment = useCallback((phase: RequirementPhase): string => {
    const phaseNum = phases.length;

    if (phase.parsed && buildReadiness) {
      // Server-enriched acknowledgment
      let ack = `✅ **Phase ${phaseNum} captured & analyzed.**\n\n`;
      if (phase.parsed.entities.length > 0) ack += `📊 **Entities:** ${phase.parsed.entities.join(", ")}\n`;
      if (phase.parsed.actions.length > 0) ack += `⚡ **Actions:** ${phase.parsed.actions.slice(0, 5).join(", ")}\n`;
      if (phase.parsed.roles.length > 0) ack += `👤 **Roles:** ${phase.parsed.roles.join(", ")}\n`;
      if (phase.parsed.uiComponents.length > 0) ack += `🎨 **UI:** ${phase.parsed.uiComponents.join(", ")}\n`;

      ack += `\n📈 **Build readiness:** ${buildReadiness.score}%`;
      if (buildReadiness.isReady) {
        ack += ` — Ready to build! Say **"build it"** when done.`;
      } else {
        ack += ` — ${buildReadiness.recommendation}`;
        ack += `\nSend the next phase or say **"build it"** to proceed.`;
      }
      return ack;
    }

    // Fallback
    if (phaseNum > 1) {
      return `✅ **Phase ${phaseNum} received.** I now have ${phaseNum} phases of requirements captured. Send the next phase when ready, or say **"build it"** to start generating.`;
    }
    return `✅ **Got it — Phase 1 captured.** I'm ready for the next phase whenever you are. Just say **"build it"** when you've shared everything.`;
  }, [phases, buildReadiness]);

  return {
    // State
    mode,
    setMode,
    phases,
    lastBuildResult,
    buildReadiness,
    agentStates,
    serverVersion,
    isRestoring,

    // Actions
    restoreFromServer,
    analyzeMessage,
    analyzeMessageSync,
    addPhase,
    getRequirementsContext,
    getRequirementsContextSync,
    startBuilding,
    completeBuild,
    reset,
    generateAcknowledgment,

    // Internal
    currentProjectId,
  };
}
