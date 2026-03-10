/**
 * useConversationState — Conversation State Machine
 * 
 * Tracks the conversation mode to enable intelligent routing:
 * - idle: No active session, fresh project
 * - gathering: User is providing requirements phase-by-phase
 * - ready: Enough info to build, can proceed
 * - building: Actively generating code
 * - complete: Build just finished, showing results
 * 
 * Also accumulates structured requirements across messages
 * so the build agent has full context when it's time to generate.
 */

import { useState, useCallback, useRef } from "react";

export type ConversationMode = "idle" | "gathering" | "ready" | "building" | "complete";

export interface RequirementPhase {
  id: number;
  summary: string;
  rawText: string;
  hasImages: boolean;
  timestamp: number;
}

export interface BuildResult {
  filesChanged: string[];
  totalFiles: number;
  chatSummary: string;
  timestamp: number;
}

// Signals that the user wants to provide info incrementally
const PHASED_SIGNALS = /\b(phase by phase|step by step|i'll give you|ill give you|one at a time|let me explain|first let me|i'll share|ill share|i'll provide|ill provide|wait for my|before you start|i will share|i will give|phase\s*\d|step\s*\d|part\s*\d|section\s*\d)\b/i;

// Signals that user is providing info (not requesting a build)
const INFO_PROVIDING_SIGNALS = /^(these are|here are|here is|this is|below are|following are|attached are|now for|next is|the next|moving on|continuing with|for phase|for step|for part)\b/i;

// Signals that user wants to trigger the build now
const BUILD_NOW_SIGNALS = /^(now build|go ahead|build it|start building|that's all|thats all|that's everything|thats everything|you can start|proceed|let's build|lets build|ready to build|start now|begin|execute|generate|now create|do it)\b/i;

// Signals for "give me more" / readiness check
const READINESS_CHECK = /\b(is that enough|anything else|ready to build|shall i build|should i start|do you need more|want more details)\b/i;

export function useConversationState() {
  const [mode, setMode] = useState<ConversationMode>("idle");
  const [phases, setPhases] = useState<RequirementPhase[]>([]);
  const [lastBuildResult, setLastBuildResult] = useState<BuildResult | null>(null);
  const phaseCounter = useRef(0);

  /**
   * Analyze a message and determine what the conversation state should transition to.
   * Returns the recommended action: "gather", "build", "chat", or "continue"
   */
  const analyzeMessage = useCallback((text: string, hasImages: boolean): {
    action: "gather" | "build" | "chat" | "continue";
    reason: string;
  } => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // If user explicitly says "build now" — always build
    if (BUILD_NOW_SIGNALS.test(lower)) {
      return { action: "build", reason: "User explicitly requested build" };
    }

    // If in gathering mode, check what this message is
    if (mode === "gathering") {
      // User providing more requirements
      if (INFO_PROVIDING_SIGNALS.test(lower) || hasImages) {
        return { action: "gather", reason: "User providing additional requirements" };
      }
      // User asking a readiness question
      if (READINESS_CHECK.test(lower)) {
        return { action: "chat", reason: "User checking readiness" };
      }
      // Short confirmations in gathering mode → probably more info coming
      if (trimmed.length < 100 && !BUILD_NOW_SIGNALS.test(lower)) {
        return { action: "continue", reason: "Short message during gathering — waiting for more" };
      }
      // Long message with content → more requirements
      if (trimmed.length > 200) {
        return { action: "gather", reason: "Long message during gathering — more requirements" };
      }
    }

    // Not in gathering mode — detect if user wants phased approach
    if (PHASED_SIGNALS.test(lower)) {
      return { action: "gather", reason: "User signaled phased approach" };
    }

    // Info-providing signals at start
    if (INFO_PROVIDING_SIGNALS.test(lower)) {
      return { action: "gather", reason: "User providing information" };
    }

    // Fall through — let the existing classifier handle it
    return { action: "continue", reason: "No conversation state signal detected" };
  }, [mode]);

  /**
   * Add a requirement phase from user input
   */
  const addPhase = useCallback((text: string, hasImages: boolean) => {
    phaseCounter.current += 1;
    const phase: RequirementPhase = {
      id: phaseCounter.current,
      summary: text.slice(0, 200).replace(/\n/g, " "),
      rawText: text,
      hasImages,
      timestamp: Date.now(),
    };
    setPhases(prev => [...prev, phase]);
    setMode("gathering");
    return phase;
  }, []);

  /**
   * Get accumulated requirements as a structured context string for the build agent
   */
  const getRequirementsContext = useCallback((): string => {
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
   * Transition to building mode
   */
  const startBuilding = useCallback(() => {
    setMode("building");
  }, []);

  /**
   * Record build completion
   */
  const completeBuild = useCallback((result: BuildResult) => {
    setLastBuildResult(result);
    setMode("complete");
    // Don't clear phases — user might iterate
  }, []);

  /**
   * Reset for a new conversation
   */
  const reset = useCallback(() => {
    setMode("idle");
    setPhases([]);
    setLastBuildResult(null);
    phaseCounter.current = 0;
  }, []);

  /**
   * Generate a conversational acknowledgment for gathered requirements
   */
  const generateAcknowledgment = useCallback((phase: RequirementPhase): string => {
    const phaseNum = phases.length + 1; // +1 because this is called before addPhase updates state
    const hasMultiplePhases = phaseNum > 1;
    
    if (hasMultiplePhases) {
      return `✅ **Phase ${phaseNum} received.** I now have ${phaseNum} phases of requirements captured. Send the next phase when ready, or say **"build it"** to start generating.`;
    }
    return `✅ **Got it — Phase 1 captured.** I'm ready for the next phase whenever you are. Just say **"build it"** when you've shared everything.`;
  }, [phases]);

  return {
    mode,
    setMode,
    phases,
    lastBuildResult,
    analyzeMessage,
    addPhase,
    getRequirementsContext,
    startBuilding,
    completeBuild,
    reset,
    generateAcknowledgment,
  };
}
