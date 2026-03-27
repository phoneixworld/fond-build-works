/**
 * Intent Router — THE SINGLE decision point for all user messages.
 * 
 * INVARIANT: No secondary regex layers, no server re-classification.
 * This function is called once, its result is final.
 * 
 * Decision tree:
 *   1. Auto-fix → build
 *   2. URL detected → url_analyze
 *   3. Pending confirmation → resolve_pending
 *   4. Noise/non-actionable → chat
 *   5. Stop/explain-only → chat
 *   6. Greeting/small-talk → chat
 *   7. Question-only (no action verb) → chat
 *   8. Explicit build + template match + NO existing project template → build (fresh)
 *   9. Explicit build + existing project template → edit (enhancement)
 *  10. Edit verb + existing code → edit
 *  11. Build verb + no existing code → build
 *  12. Fallback → chat
 */

import { matchTemplate, type PageTemplate } from "@/lib/pageTemplates";
import type { ProjectIdentity } from "@/lib/projectIdentity";

export type IntentRoute = "build" | "edit" | "chat" | "auto_fix" | "url_analyze" | "resolve_pending";

export interface RouteDecision {
  route: IntentRoute;
  reason: string;
  /** Matched template (if any) */
  template: PageTemplate | null;
  /** Whether this is an enhancement to the existing project template */
  isEnhancement: boolean;
  /** Whether to skip confirmation */
  skipConfirmation: boolean;
}

// ── Patterns ──
const GREETING = /^(hello|hi|hey|yo|good morning|good evening|good afternoon|what'?s up|how are you|howdy|greetings|hola|hey there|hi there)\b/i;
const SMALL_TALK = /^(how'?s it going|what are you doing|can you talk|are you there|what'?s new|tell me something)\b/i;
const STOP_EXPLAIN = /\b(do not build|don't build|dont build|do not edit|don't edit|dont edit|just explain|only explain|root cause only|without fixing|stop building)\b/i;
const NON_ACTIONABLE = /^[\s!?.,:;\-—…'"()*#@&^%$~`]+$|^(fuck|shit|damn|hell|wtf|omg|ugh|lol|hmm|huh|meh|bruh|stop|quit|bye|go away|leave|shut up|whatever|forget it|never ?mind|screw|crap|bloody|rubbish|useless|hate|sucks?|annoying|terrible|horrible|awful|worst|lame|pathetic)\b/i;
const CONFIRM_ONLY = /^(yes|yep|yeah|go ahead|proceed|do it|ok|okay|sure|continue|start|build it|just do it)\s*[.!]?$/i;
const QUESTION_ONLY = /^(why|what|where|who|how|when|can|could|would|should|is|are|do|does|explain|tell me)\b/i;
const BUILD_VERB = /\b(build|create|generate|scaffold|implement|develop|make|produce)\b/i;
const EDIT_VERB = /\b(fix|change|update|modify|refactor|patch|repair|replace|add|remove|delete)\b/i;
const EXPLICIT_REBUILD = /\b(rebuild|from scratch|start over|regenerate app|new app|new project)\b/i;
const RUNTIME_SIGNAL = /\b(bug|error|not working|doesn't work|doesnt work|broken|crash|failed|fails|preview|runtime|problem|issue)\b/i;

// ── Assistant Output Detection ──
// Phoenix / assistant messages must NEVER be routed as build/edit.
const ASSISTANT_FINGERPRINT = /\b(I('ve| have) (built|created|generated|scaffolded|implemented|produced)|here('s| is) (the|your)|successfully (built|created|generated)|✅|files? (created|generated|updated)|Build complete|code has been|I'll (build|create|generate)|Let me (build|create|generate))\b/i;

/**
 * Sanitize text by stripping assistant-style build verb phrases.
 * This prevents cached or echoed Phoenix output from triggering fresh builds.
 */
function sanitizeAssistantLeakage(text: string): string {
  // Strip phrases that look like assistant output, not user commands
  return text
    .replace(/I('ve| have) (built|created|generated|scaffolded|implemented|produced)\b[^.!?\n]*/gi, "")
    .replace(/here('s| is) (the|your) [^.!?\n]*/gi, "")
    .replace(/successfully (built|created|generated)[^.!?\n]*/gi, "")
    .replace(/Build complete[^.!?\n]*/gi, "")
    .replace(/✅[^.!?\n]*/gi, "")
    .trim();
}

/**
 * THE single intent router. Called once per user message. Result is final.
 * 
 * GUARDRAIL: If the text looks like assistant output (Phoenix fingerprint),
 * it is immediately routed to chat — never to build or edit.
 */
export function routeIntent(
  text: string,
  images: string[],
  identity: ProjectIdentity,
  hasExistingCode: boolean,
  hasPendingExecution: boolean,
  /** Set to true if this text originates from an assistant message (e.g. echoed, cached). Never route to build. */
  isAssistantOrigin = false,
): RouteDecision {
  const trimmed = (text || "").trim();

  // ── GUARDRAIL 1: Assistant origin flag — immediate chat ──
  if (isAssistantOrigin) {
    return { route: "chat", reason: "Assistant-origin message — blocked from routing", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // ── GUARDRAIL 2: Assistant fingerprint detection — immediate chat ──
  if (ASSISTANT_FINGERPRINT.test(trimmed)) {
    console.warn(`[IntentRouter] Blocked assistant-fingerprinted text from routing: "${trimmed.slice(0, 80)}..."`);
    return { route: "chat", reason: "Text matches assistant output fingerprint", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // Sanitize any residual assistant leakage from the text
  const sanitized = sanitizeAssistantLeakage(trimmed);
  const lower = (sanitized || trimmed).toLowerCase();

  // 1. Auto-fix
  if (trimmed.startsWith("🔧")) {
    return { route: "auto_fix", reason: "Auto-fix trigger", template: null, isEnhancement: false, skipConfirmation: true };
  }

  // 2. Pending confirmation resolution
  if (hasPendingExecution) {
    return { route: "resolve_pending", reason: "Resolving pending confirmation", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 3. Empty
  if (!trimmed && images.length === 0) {
    return { route: "chat", reason: "Empty input", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 4. Non-actionable noise
  if (NON_ACTIONABLE.test(trimmed)) {
    return { route: "chat", reason: "Non-actionable input", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 5. Stop/explain directives
  if (STOP_EXPLAIN.test(lower)) {
    return { route: "chat", reason: "Explicit stop/explain directive", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 6. Greeting/small-talk
  if (GREETING.test(lower) || SMALL_TALK.test(lower)) {
    return { route: "chat", reason: "Greeting or small talk", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 7. Bare confirmations (with nothing pending) → chat
  if (CONFIRM_ONLY.test(trimmed) && !hasPendingExecution) {
    return { route: "chat", reason: "Confirmation with nothing pending", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 8. Question-only with no edit/build verb
  const hasEditVerb = EDIT_VERB.test(lower);
  const hasBuildVerb = BUILD_VERB.test(lower);
  if ((trimmed.endsWith("?") || QUESTION_ONLY.test(lower)) && !hasEditVerb && !hasBuildVerb) {
    return { route: "chat", reason: "Question without action verb", template: null, isEnhancement: false, skipConfirmation: false };
  }

  // 9. Template matching
  const template = matchTemplate(sanitized || trimmed);
  const isExplicitRebuild = EXPLICIT_REBUILD.test(lower);
  const projectHasTemplate = !!identity.template;

  // ── GUARDRAIL 3: Enhancement mode overrides ALL build verbs when template exists ──
  // If project already has a template identity, build verbs become enhancements
  // unless the user explicitly says "rebuild", "start over", "from scratch", etc.
  if (hasBuildVerb && projectHasTemplate && !isExplicitRebuild) {
    return {
      route: "edit",
      reason: `Template "${identity.template!.templateName}" exists — "${trimmed.slice(0, 60)}" routed to enhancement, not fresh build`,
      template: template || null,
      isEnhancement: true,
      skipConfirmation: true,
    };
  }

  // 10. Build verb + template match (no existing template identity)
  if (hasBuildVerb && template) {
    // If the project already has code but no template identity → still route to edit
    if (hasExistingCode && !isExplicitRebuild) {
      return {
        route: "edit",
        reason: `Project already has code — "${trimmed}" routed to enhancement, not rebuild`,
        template,
        isEnhancement: true,
        skipConfirmation: true,
      };
    }
    // Fresh build
    return {
      route: "build",
      reason: `Template "${template.name}" matched for fresh build`,
      template,
      isEnhancement: false,
      skipConfirmation: true,
    };
  }

  // 11. Build verb (no template) + no existing code → build
  if (hasBuildVerb && !hasExistingCode && !isExplicitRebuild) {
    return {
      route: "build",
      reason: "Build verb with no existing code",
      template: null,
      isEnhancement: false,
      skipConfirmation: true,
    };
  }

  // 12. Edit verb + existing code → edit
  if (hasEditVerb && hasExistingCode) {
    return {
      route: "edit",
      reason: "Edit verb with existing code",
      template: null,
      isEnhancement: false,
      skipConfirmation: true,
    };
  }

  // 13. Runtime signals + existing code → edit
  if (RUNTIME_SIGNAL.test(lower) && hasExistingCode && hasEditVerb) {
    return {
      route: "edit",
      reason: "Runtime issue with edit verb",
      template: null,
      isEnhancement: false,
      skipConfirmation: true,
    };
  }

  // 14. Build verb + existing code + explicit rebuild → build
  if (hasBuildVerb && hasExistingCode && isExplicitRebuild) {
    return {
      route: "build",
      reason: "Explicit rebuild request",
      template,
      isEnhancement: false,
      skipConfirmation: false, // Needs confirmation for rebuild
    };
  }

  // 15. Build verb + existing code (no rebuild) → edit
  if (hasBuildVerb && hasExistingCode) {
    return {
      route: "edit",
      reason: "Build verb on existing project → enhancement",
      template: null,
      isEnhancement: true,
      skipConfirmation: true,
    };
  }

  // 16. Has images → treat as build/edit depending on code state
  if (images.length > 0) {
    if (hasExistingCode) {
      return { route: "edit", reason: "Image input on existing project", template: null, isEnhancement: true, skipConfirmation: true };
    }
    return { route: "build", reason: "Image input for new project", template: null, isEnhancement: false, skipConfirmation: true };
  }

  // 17. Fallback → chat
  return { route: "chat", reason: "No actionable pattern matched", template: null, isEnhancement: false, skipConfirmation: false };
}
