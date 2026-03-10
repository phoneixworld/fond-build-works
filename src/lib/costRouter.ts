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

// Model cost tiers (relative)
const MODELS = {
  "google/gemini-2.5-flash-lite": { costTier: 1, maxContext: 32000, label: "Flash Lite" },
  "google/gemini-3-flash-preview": { costTier: 2, maxContext: 64000, label: "Flash 3" },
  "google/gemini-2.5-flash": { costTier: 2, maxContext: 64000, label: "Flash 2.5" },
  "openai/gpt-5-mini": { costTier: 3, maxContext: 64000, label: "GPT-5 Mini" },
  "google/gemini-2.5-pro": { costTier: 4, maxContext: 128000, label: "Pro" },
  "openai/gpt-5": { costTier: 5, maxContext: 128000, label: "GPT-5" },
} as const;

/**
 * Score prompt complexity on a 0-100 scale.
 */
function scoreComplexity(input: CostRouteInput): number {
  let score = 0;
  const t = input.promptText.toLowerCase();

  // ── Size-based scoring (0-30) ──
  if (input.estimatedTokens > 20000) score += 30;
  else if (input.estimatedTokens > 10000) score += 20;
  else if (input.estimatedTokens > 5000) score += 10;
  else if (input.estimatedTokens > 2000) score += 5;

  // ── Structural complexity (0-30) ──
  // Multiple modules / pages mentioned
  const moduleKeywords = t.match(/\b(module|page|section|tab|panel|screen|view|dashboard|form|table|chart)\b/gi);
  if (moduleKeywords && moduleKeywords.length > 8) score += 20;
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
    // Chat never needs expensive models
    model = "google/gemini-2.5-flash-lite";
    reason = `Chat task → Flash Lite (cheapest)`;
  } else if (input.isRetry) {
    // Retries: use flash — retries have focused context
    model = "google/gemini-2.5-flash";
    reason = `Retry → Flash 2.5 (focused fix)`;
  } else if (input.taskType === "schema" || input.taskType === "backend") {
    // Schema/backend: precision matters but input is small
    model = "google/gemini-2.5-flash";
    reason = `${input.taskType} task → Flash 2.5 (precise + affordable)`;
  } else if (complexity >= 70) {
    // High complexity: needs strong reasoning
    model = "google/gemini-2.5-pro";
    reason = `High complexity (${complexity}/100) → Pro`;
  } else if (complexity >= 40) {
    // Medium complexity: Flash 3 is capable enough
    model = "google/gemini-3-flash-preview";
    reason = `Medium complexity (${complexity}/100) → Flash 3`;
  } else if (complexity >= 20) {
    // Low complexity: Flash 2.5 handles well
    model = "google/gemini-2.5-flash";
    reason = `Low complexity (${complexity}/100) → Flash 2.5`;
  } else {
    // Trivial: cheapest option
    model = "google/gemini-2.5-flash-lite";
    reason = `Trivial (${complexity}/100) → Flash Lite`;
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
  
  // Build tasks: scale with input size
  if (input.estimatedTokens > 20000) return 80000;
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
