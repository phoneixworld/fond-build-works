/**
 * costRouter — Dynamic model & token routing based on prompt complexity scoring.
 * 
 * Replaces hardcoded thresholds with a scoring system that evaluates:
 * - Input size (tokens)
 * - Task type (schema, iteration, fresh build)
 * - Prompt complexity (structural indicators)
 * - Whether it's a retry
 * 
 * Output: cheapest model that can handle the task + appropriate max_tokens.
 */

export type TaskType = "schema" | "backend" | "build" | "iterate" | "chat" | "retry";

export interface CostRouteInput {
  /** Estimated input tokens (chars / 4) */
  estimatedTokens: number;
  /** Type of task being performed */
  taskType: TaskType;
  /** User-selected model override (if any) */
  userModel?: string;
  /** Whether this is a retry attempt */
  isRetry: boolean;
  /** Whether existing code is being modified (iteration) */
  hasExistingCode: boolean;
  /** Number of existing files in project */
  fileCount: number;
  /** Raw prompt text for complexity analysis */
  promptText: string;
}

export interface CostRouteResult {
  model: string;
  maxTokens: number;
  temperature: number;
  /** Why this model was selected — useful for logging */
  reason: string;
  /** Estimated relative cost tier: 1 (cheapest) to 5 (most expensive) */
  costTier: number;
}

// Lovable AI Gateway model tiers
const MODELS = {
  "google/gemini-2.5-flash": { costTier: 1, maxContext: 1000000, label: "Gemini 2.5 Flash" },
  "google/gemini-2.5-pro": { costTier: 3, maxContext: 1000000, label: "Gemini 2.5 Pro" },
} as const;

/**
 * Score prompt complexity on a 0-100 scale.
 */
function scoreComplexity(input: CostRouteInput): number {
  let score = 0;
  const t = input.promptText.toLowerCase();

  // ── Size-based scoring (0-40) — accumulated requirements are large ──
  if (input.estimatedTokens > 20000) score += 40;
  else if (input.estimatedTokens > 10000) score += 30;
  else if (input.estimatedTokens > 5000) score += 20;
  else if (input.estimatedTokens > 2000) score += 10;
  else if (input.estimatedTokens > 1000) score += 5;

  // ── Multi-phase requirements (0-25) — phased builds are always complex ──
  const phaseMatches = t.match(/phase\s*\d/gi);
  if (phaseMatches && phaseMatches.length >= 5) score += 25;
  else if (phaseMatches && phaseMatches.length >= 3) score += 20;
  else if (phaseMatches && phaseMatches.length >= 2) score += 15;

  // ── Structural complexity (0-30) ──
  const moduleKeywords = t.match(/\b(module|page|section|tab|panel|screen|view|dashboard|form|table|chart|entity|model|schema|workflow|pipeline|assessment|competency|curriculum|attendance|grade|enrollment|report|analytics)\b/gi);
  if (moduleKeywords && moduleKeywords.length > 15) score += 30;
  else if (moduleKeywords && moduleKeywords.length > 8) score += 20;
  else if (moduleKeywords && moduleKeywords.length > 4) score += 12;
  else if (moduleKeywords && moduleKeywords.length > 2) score += 6;

  // CRUD operations
  if (/\b(crud|create.*read.*update|list.*add.*edit.*delete)\b/i.test(t)) score += 10;

  // ── Feature complexity (0-20) ──
  const complexFeatures = [
    /\b(authentication|auth|login.*signup)\b/i,
    /\b(real-?time|websocket|live)\b/i,
    /\b(chart|graph|visualization|analytics)\b/i,
    /\b(drag.?and.?drop|sortable|reorder)\b/i,
    /\b(file.?upload|image.?upload)\b/i,
    /\b(multi.?step|wizard|workflow)\b/i,
    /\b(role|permission|rbac|access.?control)\b/i,
    /\b(search|filter|pagination)\b/i,
  ];
  const featureMatches = complexFeatures.filter(r => r.test(t)).length;
  score += Math.min(featureMatches * 4, 20);

  // ── Project scale (0-20) ──
  if (input.fileCount > 20) score += 15;
  else if (input.fileCount > 10) score += 10;
  else if (input.fileCount > 5) score += 5;

  // Iteration bonus: modifying existing code is harder than fresh builds
  if (input.hasExistingCode) score += 5;

  // ── Build manifest / AI extraction present (strong signal) ──
  if (/MODULE PLAN|BUILD CHECKLIST|BUILD ORDER|AI-EXTRACTED/i.test(t)) score += 15;

  return Math.min(score, 100);
}

/**
 * Dynamically route to the cheapest model that can handle the task.
 */
export function routeCost(input: CostRouteInput): CostRouteResult {
  // User override always wins
  if (input.userModel) {
    const modelInfo = MODELS[input.userModel as keyof typeof MODELS];
    return {
      model: input.userModel,
      maxTokens: calculateMaxTokens(input),
      temperature: calculateTemperature(input),
      reason: `User selected: ${modelInfo?.label || input.userModel}`,
      costTier: modelInfo?.costTier || 3,
    };
  }

  const complexity = scoreComplexity(input);
  let model: string;
  let reason: string;

  // ── Route based on complexity score ──
  if (input.taskType === "chat") {
    model = "google/gemini-2.5-flash";
    reason = `Chat task → Gemini 2.5 Flash (cheapest)`;
  } else if (input.isRetry) {
    model = "google/gemini-2.5-pro";
    reason = `Retry → Gemini 2.5 Pro (focused fix)`;
  } else if (input.taskType === "schema" || input.taskType === "backend") {
    model = "google/gemini-2.5-pro";
    reason = `${input.taskType} task → Gemini 2.5 Pro`;
  } else if (complexity >= 20) {
    model = "google/gemini-2.5-pro";
    reason = `Complexity (${complexity}/100) → Gemini 2.5 Pro`;
  } else {
    model = "google/gemini-2.5-flash";
    reason = `Trivial (${complexity}/100) → Gemini 2.5 Flash`;
  }

  const modelInfo = MODELS[model as keyof typeof MODELS];

  return {
    model,
    maxTokens: calculateMaxTokens(input),
    temperature: calculateTemperature(input),
    reason,
    costTier: modelInfo?.costTier || 2,
  };
}

function calculateMaxTokens(input: CostRouteInput): number {
  // Scale output tokens based on input complexity
  if (input.isRetry) return 32000; // Retries output focused fixes
  if (input.taskType === "chat") return 4000;
  if (input.taskType === "schema" || input.taskType === "backend") return 16000;
  
  // Build tasks: scale with input size (capped at 64000 for Sonnet 4)
  if (input.estimatedTokens > 10000) return 64000;
  if (input.estimatedTokens > 5000) return 48000;
  return 32000;
}

function calculateTemperature(input: CostRouteInput): number {
  if (input.isRetry) return 0.15;
  if (input.hasExistingCode) return 0.2;
  if (input.taskType === "chat") return 0.5;
  return 0.3;
}

/**
 * Client-side quick route — determines model before sending to edge function.
 * Lighter version that doesn't need full server context.
 */
export function clientRouteModel(
  promptText: string,
  taskType: TaskType,
  fileCount: number,
  userModel?: string,
): string {
  if (userModel) return userModel;

  const result = routeCost({
    estimatedTokens: Math.ceil(promptText.length / 4),
    taskType,
    isRetry: false,
    hasExistingCode: fileCount > 0,
    fileCount,
    promptText,
  });

  console.log(`[CostRouter] ${result.reason} | maxTokens=${result.maxTokens} | tier=${result.costTier}`);
  return result.model;
}
