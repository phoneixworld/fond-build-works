/**
 * Repair Metrics — Pillar 4: Telemetry for the Repair Pipeline
 * 
 * Tracks:
 * - Error frequency by category
 * - Repair success/failure rates
 * - Rounds-to-converge distribution
 * - Most-repaired files (hot spots)
 * - Deterministic vs AI repair ratio
 */

import type { ErrorCategory } from "./errorClassifier";

// ─── Types ───────────────────────────────────────────────────────────────

export interface RepairMetricsSnapshot {
  /** Total errors seen across all builds */
  totalErrors: number;
  /** Total repairs attempted */
  totalRepairs: number;
  /** Total successful repairs */
  successfulRepairs: number;
  /** Overall success rate (0-1) */
  successRate: number;
  /** Deterministic repairs (no AI cost) */
  deterministicRepairs: number;
  /** AI-assisted repairs */
  aiRepairs: number;
  /** Ratio of deterministic to total repairs */
  deterministicRatio: number;
  /** Error frequency by category */
  errorsByCategory: Record<string, number>;
  /** Repair success rate by category */
  successRateByCategory: Record<string, { attempts: number; successes: number; rate: number }>;
  /** Most-repaired files (top 10) */
  hotFiles: Array<{ file: string; errorCount: number }>;
  /** Rounds-to-converge histogram */
  roundsHistogram: Record<number, number>;
  /** Average rounds to converge */
  avgRoundsToConverge: number;
  /** Number of builds that converged vs didn't */
  convergenceRate: number;
  /** Total builds tracked */
  totalBuilds: number;
}

interface ErrorRecord {
  category: string;
  file: string;
  timestamp: number;
}

interface RepairRecord {
  category: string;
  method: "deterministic" | "ai";
  success: boolean;
  timestamp: number;
}

interface RoundRecord {
  round: number;
  errorsAtStart: number;
  repairsApplied: number;
  converged: boolean;
  timestamp: number;
}

// ─── Metrics Collector ───────────────────────────────────────────────────

export class RepairMetrics {
  private errors: ErrorRecord[] = [];
  private repairs: RepairRecord[] = [];
  private rounds: RoundRecord[] = [];
  private buildCount = 0;
  private convergedCount = 0;
  private fileErrorCounts = new Map<string, number>();

  /** Record an error occurrence */
  recordError(category: string, file: string): void {
    this.errors.push({ category, file, timestamp: Date.now() });
    this.fileErrorCounts.set(file, (this.fileErrorCounts.get(file) || 0) + 1);
  }

  /** Record a repair attempt and its outcome */
  recordRepair(category: string, method: "deterministic" | "ai", success: boolean): void {
    this.repairs.push({ category, method, success, timestamp: Date.now() });
  }

  /** Record a repair round */
  recordRound(round: number, errorsAtStart: number, repairsApplied: number, converged: boolean): void {
    this.rounds.push({ round, errorsAtStart, repairsApplied, converged, timestamp: Date.now() });
    if (converged) {
      this.convergedCount++;
      this.buildCount++;
    } else if (round === 1) {
      // Only count as a new build on round 1
      this.buildCount++;
    }
  }

  /** Get a snapshot of all metrics */
  snapshot(): RepairMetricsSnapshot {
    const totalRepairs = this.repairs.length;
    const successfulRepairs = this.repairs.filter(r => r.success).length;
    const deterministicRepairs = this.repairs.filter(r => r.method === "deterministic").length;
    const aiRepairs = this.repairs.filter(r => r.method === "ai").length;

    // Error frequency by category
    const errorsByCategory: Record<string, number> = {};
    for (const err of this.errors) {
      errorsByCategory[err.category] = (errorsByCategory[err.category] || 0) + 1;
    }

    // Success rate by category
    const successRateByCategory: Record<string, { attempts: number; successes: number; rate: number }> = {};
    for (const repair of this.repairs) {
      if (!successRateByCategory[repair.category]) {
        successRateByCategory[repair.category] = { attempts: 0, successes: 0, rate: 0 };
      }
      successRateByCategory[repair.category].attempts++;
      if (repair.success) successRateByCategory[repair.category].successes++;
    }
    for (const cat of Object.keys(successRateByCategory)) {
      const entry = successRateByCategory[cat];
      entry.rate = entry.attempts > 0 ? entry.successes / entry.attempts : 0;
    }

    // Hot files (most errors)
    const hotFiles = [...this.fileErrorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, errorCount]) => ({ file, errorCount }));

    // Rounds histogram — how many times each round count was the final round
    const roundsHistogram: Record<number, number> = {};
    const convergedRounds = this.rounds.filter(r => r.converged);
    for (const r of convergedRounds) {
      roundsHistogram[r.round] = (roundsHistogram[r.round] || 0) + 1;
    }

    const avgRoundsToConverge = convergedRounds.length > 0
      ? convergedRounds.reduce((s, r) => s + r.round, 0) / convergedRounds.length
      : 0;

    return {
      totalErrors: this.errors.length,
      totalRepairs,
      successfulRepairs,
      successRate: totalRepairs > 0 ? successfulRepairs / totalRepairs : 0,
      deterministicRepairs,
      aiRepairs,
      deterministicRatio: totalRepairs > 0 ? deterministicRepairs / totalRepairs : 0,
      errorsByCategory,
      successRateByCategory,
      hotFiles,
      roundsHistogram,
      avgRoundsToConverge,
      convergenceRate: this.buildCount > 0 ? this.convergedCount / this.buildCount : 0,
      totalBuilds: this.buildCount,
    };
  }

  /** Reset all metrics */
  reset(): void {
    this.errors = [];
    this.repairs = [];
    this.rounds = [];
    this.buildCount = 0;
    this.convergedCount = 0;
    this.fileErrorCounts.clear();
  }

  /** Format metrics as a human-readable report */
  formatReport(): string {
    const snap = this.snapshot();
    const lines: string[] = [
      "═══ Repair Pipeline Metrics ═══",
      `Builds: ${snap.totalBuilds} | Convergence: ${(snap.convergenceRate * 100).toFixed(0)}%`,
      `Errors seen: ${snap.totalErrors} | Repairs: ${snap.successfulRepairs}/${snap.totalRepairs} (${(snap.successRate * 100).toFixed(0)}%)`,
      `Deterministic: ${snap.deterministicRepairs} | AI: ${snap.aiRepairs} (ratio: ${(snap.deterministicRatio * 100).toFixed(0)}% deterministic)`,
      `Avg rounds to converge: ${snap.avgRoundsToConverge.toFixed(1)}`,
    ];

    if (Object.keys(snap.errorsByCategory).length > 0) {
      lines.push("", "Top error categories:");
      const sorted = Object.entries(snap.errorsByCategory).sort((a, b) => b[1] - a[1]);
      for (const [cat, count] of sorted.slice(0, 5)) {
        const rate = snap.successRateByCategory[cat];
        lines.push(`  ${cat}: ${count} errors, ${rate ? `${(rate.rate * 100).toFixed(0)}% fix rate` : "no repairs"}`);
      }
    }

    if (snap.hotFiles.length > 0) {
      lines.push("", "Hot files (most errors):");
      for (const { file, errorCount } of snap.hotFiles.slice(0, 5)) {
        lines.push(`  ${file}: ${errorCount} errors`);
      }
    }

    return lines.join("\n");
  }
}
