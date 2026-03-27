/**
 * Build State Machine — Phase 4 (Pillar 7)
 *
 * Replaces ad-hoc boolean flags (isLoading, isBuilding, isSending, pipelineStep, currentAgent)
 * with a single finite state machine. Every transition guarantees cleanup of the previous state.
 *
 * States: idle → classifying → [chatting | building | editing | repairing] → completing → idle
 *
 * All state changes go through `transition()` which logs the change and prevents illegal transitions.
 */

import type { PipelineStep } from "@/lib/agentPipeline";

// ─── State Definitions ──────────────────────────────────────────────────

export type BuildState =
  | "idle"
  | "classifying"
  | "chatting"
  | "planning"
  | "generating"
  | "validating"
  | "repairing"
  | "editing"
  | "completing"
  | "error";

export type AgentType = "chat" | "build" | "edit" | "repair" | null;

export interface BuildStateSnapshot {
  state: BuildState;
  agent: AgentType;
  pipelineStep: PipelineStep | null;
  isLoading: boolean;
  isBuilding: boolean;
  buildStep: string;
  startedAt: number | null;
  elapsed: number;
}

export interface FreshBuildGuardContext {
  currentAgent?: AgentType | "clarify" | null;
  pipelineStep?: PipelineStep | null;
}

const EXPLICIT_RESET_PROJECT =
  /\b(reset project|start over|from scratch|regenerate app|new project|rebuild)\b/i;

export type StateChangeListener = (snapshot: BuildStateSnapshot) => void;

// ─── Legal Transitions ──────────────────────────────────────────────────

const LEGAL_TRANSITIONS: Record<BuildState, BuildState[]> = {
  idle: ["classifying", "chatting", "planning", "editing", "generating", "repairing", "error"],
  classifying: ["chatting", "planning", "editing", "generating", "idle", "error"],
  chatting: ["completing", "idle", "planning", "error"],
  planning: ["generating", "completing", "idle", "error"],
  generating: ["validating", "completing", "idle", "error"],
  validating: ["repairing", "completing", "idle", "error"],
  repairing: ["validating", "completing", "idle", "error"],
  editing: ["completing", "idle", "error"],
  completing: ["idle"],
  error: ["idle"],
};

// ─── State Machine ──────────────────────────────────────────────────────

export class BuildStateMachine {
  private _state: BuildState = "idle";
  private _agent: AgentType = null;
  private _pipelineStep: PipelineStep | null = null;
  private _buildStep = "";
  private _startedAt: number | null = null;
  private _listeners: StateChangeListener[] = [];
  private _safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _safetyTimeoutMs: number;

  constructor(safetyTimeoutMs = 600_000) {
    this._safetyTimeoutMs = safetyTimeoutMs;
  }

  // ── Accessors ──

  get state(): BuildState { return this._state; }
  get agent(): AgentType { return this._agent; }
  get pipelineStep(): PipelineStep | null { return this._pipelineStep; }
  get buildStep(): string { return this._buildStep; }
  get isIdle(): boolean { return this._state === "idle"; }
  get isActive(): boolean { return this._state !== "idle" && this._state !== "error"; }
  get isLoading(): boolean { return this._state !== "idle"; }
  get isBuilding(): boolean {
    return ["planning", "generating", "validating", "repairing", "editing"].includes(this._state);
  }

  /**
   * GUARDRAIL: Reject fresh template builds when already in an active state.
   * Only "idle" or "error" states allow fresh builds.
   */
  canStartFreshBuild(requestText = "", context?: FreshBuildGuardContext): boolean {
    const resetRequested = EXPLICIT_RESET_PROJECT.test(requestText || "");
    const enhancementInProgress =
      this._state === "editing" ||
      context?.currentAgent === "edit" ||
      context?.pipelineStep === "editing" ||
      context?.pipelineStep === "resolving";

    if (enhancementInProgress && !resetRequested) {
      console.warn(
        `[StateMachine] Fresh build rejected — enhancement/edit mode active (state=${this._state}, agent=${context?.currentAgent}, step=${context?.pipelineStep})`,
      );
      return false;
    }

    if (this._state === "idle" || this._state === "error") return true;
    if (resetRequested) return true;

    console.warn(`[StateMachine] Fresh build rejected — currently in "${this._state}" state`);
    return false;
  }

  // ── Transition ──

  transition(to: BuildState, opts?: {
    agent?: AgentType;
    pipelineStep?: PipelineStep | null;
    buildStep?: string;
  }): boolean {
    if (this._state === to && !opts) return true; // No-op

    const legal = LEGAL_TRANSITIONS[this._state];
    if (!legal?.includes(to)) {
      console.warn(`[StateMachine] Illegal transition: ${this._state} → ${to}`);
      return false;
    }

    const prev = this._state;
    this._state = to;

    if (opts?.agent !== undefined) this._agent = opts.agent;
    if (opts?.pipelineStep !== undefined) this._pipelineStep = opts.pipelineStep;
    if (opts?.buildStep !== undefined) this._buildStep = opts.buildStep;

    // Track timing
    if (to !== "idle" && to !== "error" && !this._startedAt) {
      this._startedAt = Date.now();
    }
    if (to === "idle" || to === "error") {
      this._startedAt = null;
    }

    // Safety timeout management
    this._resetSafetyTimeout(to);

    console.log(`[StateMachine] ${prev} → ${to} (agent=${this._agent}, step=${this._pipelineStep})`);
    this._notifyListeners();
    return true;
  }

  // ── Convenience transitions ──

  startChat(): void {
    this.transition("chatting", { agent: "chat", pipelineStep: "chatting", buildStep: "Thinking..." });
  }

  startBuild(): void {
    this.transition("planning", { agent: "build", pipelineStep: "planning", buildStep: "🏗️ Planning..." });
  }

  startEdit(): void {
    this.transition("editing", { agent: "edit", pipelineStep: "resolving", buildStep: "Resolving targets..." });
  }

  startRepair(): void {
    this.transition("repairing", { agent: "repair", pipelineStep: "retrying", buildStep: "🔧 Repairing..." });
  }

  setBuildStep(step: string): void {
    this._buildStep = step;
    this._notifyListeners();
  }

  setPipelineStep(step: PipelineStep | null): void {
    this._pipelineStep = step;
    this._notifyListeners();
  }

  /**
   * Finalize the current operation and return to idle.
   * This is the SINGLE cleanup point — replaces all scattered setIsLoading/setIsBuilding/etc.
   */
  finalize(): void {
    this.transition("completing");
    this._agent = null;
    this._pipelineStep = null;
    this._buildStep = "";
    this.transition("idle");
  }

  /**
   * Force-reset to idle (used for abort, clear, or stuck states).
   */
  forceIdle(): void {
    this._state = "idle"; // Skip legal check
    this._agent = null;
    this._pipelineStep = null;
    this._buildStep = "";
    this._startedAt = null;
    this._clearSafetyTimeout();
    console.log("[StateMachine] Force reset to idle");
    this._notifyListeners();
  }

  /**
   * Signal an error state.
   */
  error(step?: string): void {
    this.transition("error", { buildStep: step || "Error occurred", pipelineStep: "error" });
  }

  // ── Snapshot ──

  snapshot(): BuildStateSnapshot {
    return {
      state: this._state,
      agent: this._agent,
      pipelineStep: this._pipelineStep,
      isLoading: this.isLoading,
      isBuilding: this.isBuilding,
      buildStep: this._buildStep,
      startedAt: this._startedAt,
      elapsed: this._startedAt ? Math.floor((Date.now() - this._startedAt) / 1000) : 0,
    };
  }

  // ── Listeners ──

  subscribe(listener: StateChangeListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  // ── Internal ──

  private _notifyListeners(): void {
    const snap = this.snapshot();
    for (const listener of this._listeners) {
      try { listener(snap); } catch {}
    }
  }

  private _resetSafetyTimeout(state: BuildState): void {
    this._clearSafetyTimeout();
    if (state === "idle" || state === "error" || state === "completing") return;

    this._safetyTimeoutId = setTimeout(() => {
      console.warn(`[StateMachine] Safety timeout in state "${this._state}" — forcing idle`);
      this.forceIdle();
    }, this._safetyTimeoutMs);
  }

  private _clearSafetyTimeout(): void {
    if (this._safetyTimeoutId) {
      clearTimeout(this._safetyTimeoutId);
      this._safetyTimeoutId = null;
    }
  }

  destroy(): void {
    this._clearSafetyTimeout();
    this._listeners = [];
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

let _instance: BuildStateMachine | null = null;

export function getBuildStateMachine(): BuildStateMachine {
  if (!_instance) {
    _instance = new BuildStateMachine();
  }
  return _instance;
}

export function resetBuildStateMachine(): void {
  _instance?.destroy();
  _instance = null;
}
