/**
 * Smart Suggestion Engine v3
 * 
 * Orchestrates PSAL → Rules → SRE → Suppression → Output.
 * 
 * Modules:
 * - PSAL: Project-State Awareness Layer
 * - FCD:  Flow-Completion Detection
 * - ODE:  Opportunity Detection Engine
 * - UIP:  User-Intent Prediction
 * - GDS:  Goal-Driven Suggestions
 * - EAS:  Error-Aware Suggestions
 * - CMS:  Conversation-Mode Suggestions
 * - SRE:  Suggestion Ranking Engine
 * - SL:   Suppression Layer
 */

import { analyzeProjectState, type ProjectStateSnapshot } from "./projectStateAnalyzer";
import { ALL_RULE_SETS, type RankedSuggestion } from "./suggestionRules";

export type { RankedSuggestion } from "./suggestionRules";
export type { ProjectStateSnapshot } from "./projectStateAnalyzer";

// ── Suppression Layer (SL) ─────────────────────────────────────────────

/** Track declined suggestions per session to avoid repeating them */
const declinedLabels = new Set<string>();
const shownLabels = new Map<string, number>(); // label → show count

export function markDeclined(label: string) {
  declinedLabels.add(label);
}

export function resetSuppressions() {
  declinedLabels.clear();
  shownLabels.clear();
}

function shouldSuppress(suggestion: RankedSuggestion, mode: ProjectStateSnapshot["conversationMode"]): boolean {
  // Suppress previously declined
  if (declinedLabels.has(suggestion.label)) return true;

  // Suppress if shown too many times (>3)
  const count = shownLabels.get(suggestion.label) || 0;
  if (count >= 3) return true;

  // Suppress build suggestions in exploring mode
  if (mode === "exploring" && (suggestion.category === "post-build" || suggestion.category === "intent-prediction")) {
    return true;
  }

  // Suppress conversation suggestions in building mode
  if (mode === "building" && suggestion.category === "conversation") {
    return true;
  }

  return false;
}

// ── Suggestion Ranking Engine (SRE) ────────────────────────────────────

function rankAndDeduplicate(suggestions: RankedSuggestion[]): RankedSuggestion[] {
  // Deduplicate by label
  const seen = new Set<string>();
  const unique: RankedSuggestion[] = [];
  for (const s of suggestions) {
    if (!seen.has(s.label)) {
      seen.add(s.label);
      unique.push(s);
    }
  }

  // Sort by score descending
  unique.sort((a, b) => b.score - a.score);

  // Ensure category diversity — no more than 2 from same category in top results
  const result: RankedSuggestion[] = [];
  const categoryCounts: Record<string, number> = {};

  for (const s of unique) {
    const catCount = categoryCounts[s.category] || 0;
    if (catCount < 2) {
      result.push(s);
      categoryCounts[s.category] = catCount + 1;
    }
    if (result.length >= 6) break; // Keep a pool of 6, will trim to 3
  }

  return result;
}

// ── Public API ─────────────────────────────────────────────────────────

export interface SmartSuggestion {
  label: string;
  prompt: string;
  icon: string;
  category: string;
}

/**
 * Generate intelligent, context-aware suggestions.
 * Returns top 3 ranked, deduplicated, suppression-filtered suggestions.
 */
export function generateSmartSuggestionsV3(
  code: string,
  chatMessages: Array<{ role: string; content: string }>,
  maxSuggestions = 3
): SmartSuggestion[] {
  // 1. PSAL — Analyze project state
  const state = analyzeProjectState(code, chatMessages);

  // 2. Run all rule sets
  const allSuggestions: RankedSuggestion[] = [];
  for (const ruleFn of ALL_RULE_SETS) {
    allSuggestions.push(...ruleFn(state));
  }

  // 3. Filter zero-score
  const valid = allSuggestions.filter(s => s.score > 0);

  // 4. SRE — Rank and deduplicate
  const ranked = rankAndDeduplicate(valid);

  // 5. SL — Suppress
  const filtered = ranked.filter(s => !shouldSuppress(s, state.conversationMode));

  // 6. Trim to max
  const final = filtered.slice(0, maxSuggestions);

  // Track shown
  for (const s of final) {
    shownLabels.set(s.label, (shownLabels.get(s.label) || 0) + 1);
  }

  // 7. Return clean output
  return final.map(({ label, prompt, icon, category }) => ({ label, prompt, icon, category }));
}
