/**
 * Repair Pipeline — Pillar 4: Unified Build-Error Repair Loop
 * 
 * Single entry point that unifies:
 * 1. errorBridge.ts — parses raw WebContainer/tsc/Vite error strings
 * 2. errorClassifier.ts — AST-based structural error detection
 * 3. repairExecutor.ts — deterministic + AI repair execution
 * 
 * Flow:  Raw Build Output → Parse → Classify → Repair → Rebuild → Verify → (loop)
 */

import type { ASTStore } from "../ast/store";
import { BuildErrorClassifier, type ClassifiedError, type RepairStrategy } from "./errorClassifier";
import { RepairExecutor, type RepairConfig, type RepairLoopResult, type RepairRoundResult } from "./repairExecutor";
import { classifyBuildError, classifyBuildErrors, type ClassifiedBuildError } from "../buildEngine/errorBridge";
import { RepairMetrics, type RepairMetricsSnapshot } from "./repairMetrics";

// ─── Pipeline Configuration ──────────────────────────────────────────────

export interface RepairPipelineConfig {
  /** Max repair loop rounds (default: 4) */
  maxRounds: number;
  /** Max total repair actions across all rounds (default: 30) */
  maxActions: number;
  /** Allow AI-assisted repairs (default: true) */
  allowAI: boolean;
  /** Timeout for the entire pipeline in ms (default: 60000) */
  timeoutMs: number;
  /** Callback when AI repair is needed */
  onAIRepairNeeded?: (prompt: string, file: string) => Promise<string | null>;
  /** Callback to trigger a rebuild and capture new errors */
  onRebuild?: () => Promise<RebuildResult>;
  /** Callback for progress updates */
  onProgress?: (event: RepairProgressEvent) => void;
}

export interface RebuildResult {
  /** Raw error strings from build output (tsc stderr, Vite errors, etc.) */
  errors: string[];
  /** Whether the build succeeded */
  success: boolean;
  /** Build duration in ms */
  durationMs: number;
}

export interface RepairProgressEvent {
  phase: "parsing" | "classifying" | "repairing" | "rebuilding" | "verifying" | "complete";
  round: number;
  detail: string;
  errorsRemaining: number;
}

// ─── Pipeline Result ─────────────────────────────────────────────────────

export interface RepairPipelineResult {
  /** Whether all errors were resolved */
  converged: boolean;
  /** Total rounds executed */
  totalRounds: number;
  /** Total repairs applied (deterministic + AI) */
  totalRepairs: number;
  /** Total deterministic repairs (no AI cost) */
  deterministicRepairs: number;
  /** Total AI-assisted repairs */
  aiRepairs: number;
  /** Errors that couldn't be fixed */
  remainingErrors: ClassifiedError[];
  /** Raw build errors that were parsed */
  parsedBuildErrors: ClassifiedBuildError[];
  /** Per-round details */
  rounds: RepairPipelineRound[];
  /** Human-readable summary */
  summary: string;
  /** Duration of the entire pipeline in ms */
  durationMs: number;
  /** Metrics snapshot */
  metrics: RepairMetricsSnapshot;
}

export interface RepairPipelineRound {
  round: number;
  /** Errors at start of round (AST + build) */
  errorsAtStart: number;
  /** Repairs attempted */
  repairsAttempted: number;
  /** Repairs that succeeded */
  repairsSucceeded: number;
  /** Errors remaining after round */
  errorsRemaining: number;
  /** Whether a rebuild was triggered */
  rebuiltAfter: boolean;
  /** New errors found after rebuild */
  newErrorsFromRebuild: number;
}

const DEFAULT_CONFIG: RepairPipelineConfig = {
  maxRounds: 4,
  maxActions: 30,
  allowAI: true,
  timeoutMs: 60_000,
};

// ─── Repair Pipeline ─────────────────────────────────────────────────────

export class RepairPipeline {
  private store: ASTStore;
  private classifier: BuildErrorClassifier;
  private executor: RepairExecutor;
  private metrics: RepairMetrics;
  private config: RepairPipelineConfig;

  constructor(store: ASTStore, config: Partial<RepairPipelineConfig> = {}) {
    this.store = store;
    this.classifier = new BuildErrorClassifier(store);
    this.executor = new RepairExecutor(store);
    this.metrics = new RepairMetrics();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: heal a build from raw error output.
   * 
   * 1. Parse raw build errors (tsc/Vite strings)
   * 2. Merge with AST-detected structural errors
   * 3. Run repair loop (deterministic first, AI fallback)
   * 4. Optionally rebuild and feed new errors back
   * 5. Repeat until converged or max rounds
   */
  async heal(buildOutput?: string | string[]): Promise<RepairPipelineResult> {
    const startTime = Date.now();
    const rounds: RepairPipelineRound[] = [];
    let totalRepairs = 0;
    let deterministicRepairs = 0;
    let aiRepairs = 0;
    let parsedBuildErrors: ClassifiedBuildError[] = [];

    // Step 1: Parse raw build errors if provided
    if (buildOutput) {
      const rawErrors = Array.isArray(buildOutput) ? buildOutput : this.splitBuildOutput(buildOutput);
      parsedBuildErrors = classifyBuildErrors(rawErrors);
      this.emitProgress("parsing", 0, `Parsed ${parsedBuildErrors.length} build errors`, parsedBuildErrors.length);

      // Inject parsed errors into the AST store for unified handling
      this.injectBuildErrorsIntoStore(parsedBuildErrors);
    }

    // Step 2: Run repair rounds
    for (let round = 1; round <= this.config.maxRounds; round++) {
      // Check timeout
      if (Date.now() - startTime > this.config.timeoutMs) {
        this.emitProgress("complete", round, "Timeout reached", 0);
        break;
      }

      // Classify all errors (AST structural + injected build errors)
      this.emitProgress("classifying", round, "Analyzing workspace for errors...", 0);
      const errors = this.classifier.classify();
      const actionableErrors = errors.filter(e => e.severity === "error");

      if (actionableErrors.length === 0) {
        // All clear — converged!
        this.metrics.recordRound(round, 0, 0, true);
        rounds.push({
          round,
          errorsAtStart: 0,
          repairsAttempted: 0,
          repairsSucceeded: 0,
          errorsRemaining: 0,
          rebuiltAfter: false,
          newErrorsFromRebuild: 0,
        });
        break;
      }

      // Execute repairs for this round
      this.emitProgress("repairing", round, `Repairing ${actionableErrors.length} errors...`, actionableErrors.length);
      const roundResult = await this.executeRepairRound(round, actionableErrors);

      totalRepairs += roundResult.repairsSucceeded;
      deterministicRepairs += roundResult.deterministicCount;
      aiRepairs += roundResult.aiCount;

      // Record metrics
      this.metrics.recordRound(round, actionableErrors.length, roundResult.repairsSucceeded, false);
      for (const err of actionableErrors) {
        this.metrics.recordError(err.category, err.file);
      }

      // Re-classify after repairs
      const remainingErrors = this.classifier.classify().filter(e => e.severity === "error");

      let rebuiltAfter = false;
      let newErrorsFromRebuild = 0;

      // Step 3: Rebuild and feed back if we have a rebuild callback
      if (this.config.onRebuild && roundResult.repairsSucceeded > 0) {
        this.emitProgress("rebuilding", round, "Rebuilding to check for new errors...", remainingErrors.length);
        try {
          const rebuildResult = await this.config.onRebuild();
          rebuiltAfter = true;

          if (!rebuildResult.success && rebuildResult.errors.length > 0) {
            const newParsed = classifyBuildErrors(rebuildResult.errors);
            newErrorsFromRebuild = newParsed.length;
            this.injectBuildErrorsIntoStore(newParsed);
            parsedBuildErrors.push(...newParsed);
          }
        } catch (err) {
          console.warn("[RepairPipeline] Rebuild failed:", err);
        }
      }

      const errorsAfterRebuild = this.classifier.classify().filter(e => e.severity === "error").length;

      rounds.push({
        round,
        errorsAtStart: actionableErrors.length,
        repairsAttempted: roundResult.repairsAttempted,
        repairsSucceeded: roundResult.repairsSucceeded,
        errorsRemaining: errorsAfterRebuild,
        rebuiltAfter,
        newErrorsFromRebuild,
      });

      // Stop if no progress was made
      if (roundResult.repairsSucceeded === 0) {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const remainingErrors = this.classifier.classify().filter(e => e.severity === "error");
    const converged = remainingErrors.length === 0;

    this.emitProgress("complete", rounds.length, converged ? "All errors resolved" : `${remainingErrors.length} errors remain`, remainingErrors.length);

    const result: RepairPipelineResult = {
      converged,
      totalRounds: rounds.length,
      totalRepairs,
      deterministicRepairs,
      aiRepairs,
      remainingErrors,
      parsedBuildErrors,
      rounds,
      summary: this.buildSummary(rounds, remainingErrors, durationMs),
      durationMs,
      metrics: this.metrics.snapshot(),
    };

    return result;
  }

  /**
   * Quick heal — run only deterministic repairs (no AI, no rebuild).
   * Useful for fast pre-build cleanup.
   */
  async healQuick(): Promise<RepairPipelineResult> {
    return this.heal();
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): RepairMetricsSnapshot {
    return this.metrics.snapshot();
  }

  /**
   * Reset metrics (e.g., between builds).
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  // ─── Internal: Execute a Single Repair Round ───────────────────────────

  private async executeRepairRound(
    round: number,
    errors: ClassifiedError[]
  ): Promise<{
    repairsAttempted: number;
    repairsSucceeded: number;
    deterministicCount: number;
    aiCount: number;
  }> {
    let repairsAttempted = 0;
    let repairsSucceeded = 0;
    let deterministicCount = 0;
    let aiCount = 0;

    // Sort by strategy priority: deterministic first
    const priorityOrder: Record<RepairStrategy, number> = {
      deterministic: 0,
      template: 1,
      remove: 2,
      ai_targeted: 3,
      ai_full_file: 4,
      skip: 5,
    };

    const sorted = [...errors].sort(
      (a, b) => (priorityOrder[a.strategy] ?? 5) - (priorityOrder[b.strategy] ?? 5)
    );

    for (const error of sorted) {
      if (repairsAttempted >= this.config.maxActions) break;
      if (error.strategy === "skip") continue;
      if (!this.config.allowAI && (error.strategy === "ai_targeted" || error.strategy === "ai_full_file")) continue;

      repairsAttempted++;
      const result = await this.executor.repairError(error, {
        maxRounds: 1,
        maxActions: 1,
        allowAI: this.config.allowAI,
        onAIRepairNeeded: this.config.onAIRepairNeeded,
      });

      if (result.success) {
        repairsSucceeded++;
        if (result.strategy === "deterministic" || result.strategy === "template" || result.strategy === "remove") {
          deterministicCount++;
          this.metrics.recordRepair(error.category, "deterministic", true);
        } else {
          aiCount++;
          this.metrics.recordRepair(error.category, "ai", true);
        }
      } else {
        this.metrics.recordRepair(error.category, result.strategy === "deterministic" ? "deterministic" : "ai", false);
      }
    }

    return { repairsAttempted, repairsSucceeded, deterministicCount, aiCount };
  }

  // ─── Internal: Parse Build Output ──────────────────────────────────────

  private splitBuildOutput(output: string): string[] {
    // Split on common error delimiters
    const lines = output.split("\n");
    const errors: string[] = [];
    let currentError = "";

    for (const line of lines) {
      const isErrorStart =
        /^\s*(error|Error|ERROR)\b/.test(line) ||
        /\.tsx?\(\d+,\d+\):\s*error/.test(line) ||
        /SyntaxError:/.test(line) ||
        /Cannot find/.test(line) ||
        /Failed to resolve/.test(line) ||
        /Module not found/.test(line);

      if (isErrorStart) {
        if (currentError) errors.push(currentError.trim());
        currentError = line;
      } else if (currentError) {
        currentError += "\n" + line;
      }
    }

    if (currentError) errors.push(currentError.trim());
    return errors.filter(e => e.length > 10);
  }

  // ─── Internal: Inject Build Errors Into AST Store ──────────────────────

  private injectBuildErrorsIntoStore(buildErrors: ClassifiedBuildError[]): void {
    for (const err of buildErrors) {
      if (!err.filePath) continue;

      // If the file exists in the store but has no parse errors,
      // the build error is likely a type error or missing dependency.
      // We let the classifier pick these up on re-run.
      // If the file doesn't exist, we note it for the classifier.
      if (!this.store.hasFile(err.filePath)) {
        // Create a minimal entry so the classifier can detect it
        this.store.setFile(err.filePath, `// PLACEHOLDER — file missing, detected from build error: ${err.raw}`);
      }
    }
  }

  // ─── Internal: Progress Emission ───────────────────────────────────────

  private emitProgress(
    phase: RepairProgressEvent["phase"],
    round: number,
    detail: string,
    errorsRemaining: number
  ): void {
    if (this.config.onProgress) {
      this.config.onProgress({ phase, round, detail, errorsRemaining });
    }
    console.log(`[RepairPipeline] Round ${round} — ${phase}: ${detail}`);
  }

  // ─── Internal: Summary Builder ─────────────────────────────────────────

  private buildSummary(
    rounds: RepairPipelineRound[],
    remaining: ClassifiedError[],
    durationMs: number
  ): string {
    const totalRepairs = rounds.reduce((s, r) => s + r.repairsSucceeded, 0);
    const totalRebuilds = rounds.filter(r => r.rebuiltAfter).length;
    const durationSec = (durationMs / 1000).toFixed(1);

    if (remaining.length === 0) {
      return `✅ All errors resolved: ${totalRepairs} repairs in ${rounds.length} round(s), ${totalRebuilds} rebuild(s) [${durationSec}s]`;
    }

    const lines = [
      `⚠️ ${remaining.length} errors remain after ${rounds.length} round(s), ${totalRepairs} repairs applied [${durationSec}s]:`,
      ...remaining.slice(0, 10).map(e => `  ❌ ${e.file}: ${e.message} [${e.strategy}]`),
    ];

    if (remaining.length > 10) {
      lines.push(`  ... and ${remaining.length - 10} more`);
    }

    return lines.join("\n");
  }
}
