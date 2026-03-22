/**
 * Smart Suggestions — Public API barrel
 */
export { generateSmartSuggestionsV3, markDeclined, resetSuppressions } from "./suggestionEngine";
export type { SmartSuggestion, RankedSuggestion, ProjectStateSnapshot } from "./suggestionEngine";
export { analyzeProjectState } from "./projectStateAnalyzer";
