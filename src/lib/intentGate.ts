export type GuardIntentCategory =
  | "conversation"
  | "greeting"
  | "small_talk"
  | "general_question"
  | "explanation_request"
  | "stop_request"
  | "generation_request"
  | "refactor_request"
  | "fix_request"
  | "high_impact_change_request";

export type GuardRouteHint = "chat" | "build" | "edit";

export interface GuardClassification {
  category: GuardIntentCategory;
  routeHint: GuardRouteHint;
  requiresConfirmation: boolean;
  requiresSecondConfirmation: boolean;
  isAmbiguous: boolean;
}

// ── Greeting patterns ──
const GREETING_PATTERNS = /^(hello|hi|hey|yo|good morning|good evening|good afternoon|what'?s up|how are you|hello there|hey phoenix|sup|hiya|evening|morning|howdy|greetings|hey there|hi there|heya|hola|namaste|salut|bonjour|g'day)\b/i;

// ── Small talk patterns ──
const SMALL_TALK_PATTERNS = /^(how'?s it going|what are you doing|can you talk|are you there|what'?s new|tell me something|how have you been|what'?s happening|how do you do|nice to meet you|long time no see|what'?s good)\b/i;

// ── Explicit action verbs — ONLY these should trigger build/edit/refactor ──
const EXPLICIT_ACTION_VERBS = /\b(create|generate|build|add|update|fix|refactor|modify|delete|implement|scaffold|produce|write code for|change|patch|repair|replace)\b/i;
const GENERATION_VERBS = /\b(create|generate|build|add|update|modify|delete|implement|scaffold|produce|write code for)\b/i;
const ACTIONABLE_EDIT_VERBS = /\b(fix|change|update|modify|refactor|patch|repair|replace|add|remove|delete)\b/i;

// ── Conversation-first patterns ──
const CONVERSATION_FIRST_PATTERNS = /^(can you help me|can you help|how do i|what should i do|why is this happening|explain|can we|could you|would you|help me|what is|what are|how does|why does)\b/i;
const HELP_SEEKING_ANYWHERE = /\b(can you help|help me|could you help|would you help|i need help|i want help|assist me|i'?m stuck|this is weird|can you check something)\b/i;
const DESIRE_NOT_COMMAND = /^(i want to|i'd like to|i would like to|i wanna|i wish to|i'm thinking of|i am thinking of|i'm looking to|i am looking to)\b/i;
const GENERAL_QUESTION_PATTERNS = /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does)\b/i;
const EXPLANATION_PATTERNS = /\b(explain|why is this happening|why does this happen|what happened|help me understand|root cause|actual issue)\b/i;
const HIGH_IMPACT_PATTERNS = /\b(app\.(jsx|tsx|js)|app\s*layout|applayout|sidebar|routing|router|route|auth|authentication|authcontext|index\s*file|layout)\b/i;

const NEGATIVE_BUILD_EDIT_PATTERNS = /\b(do not build|don't build|dont build|stop building|no build|do not edit|don't edit|dont edit|don't change|do not change|just explain|only explain|no fixing|without fixing|root cause only|why did the build agent|why did build agent|where is the issue|what is the issue)\b/i;
const DIAGNOSTIC_QUESTION_PATTERNS = /^(why|what|where|who|how)\b|\?$/i;

// ── Capability questions (what can you do / what are your skills) ──
const CAPABILITY_QUESTION = /\b(what can you do|what are your .*(skills|capabilities|features)|how does this work|what do you think|your core skills|your abilities)\b/i;

const YES_PATTERNS = /^(yes|yep|yeah|go ahead|proceed|do it|confirm|sure|ok|okay|continue)\b/i;
const NO_PATTERNS = /^(no|nope|cancel|stop|don'?t|do not|not now|skip|abort)\b/i;

const CHAT_RESULT: GuardClassification = {
  category: "conversation",
  routeHint: "chat",
  requiresConfirmation: false,
  requiresSecondConfirmation: false,
  isAmbiguous: false,
};

export function hasExplicitActionVerb(text: string): boolean {
  return EXPLICIT_ACTION_VERBS.test(text.trim());
}

export function classifyIntentGate(text: string, hasExistingCode: boolean): GuardClassification {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return { ...CHAT_RESULT, isAmbiguous: true };
  }

  // ── 1. Greeting — immediate chat, no ambiguity ──
  if (GREETING_PATTERNS.test(lower)) {
    return { ...CHAT_RESULT, category: "greeting" };
  }

  // ── 2. Small talk — immediate chat ──
  if (SMALL_TALK_PATTERNS.test(lower)) {
    return { ...CHAT_RESULT, category: "small_talk" };
  }

  // ── 3. Capability questions ──
  if (CAPABILITY_QUESTION.test(lower)) {
    return { ...CHAT_RESULT, category: "general_question" };
  }

  // ── 4. Explicit stop/no-build/no-edit directives ──
  if (NEGATIVE_BUILD_EDIT_PATTERNS.test(lower)) {
    return { ...CHAT_RESULT, category: "stop_request" };
  }

  // ── 5. Help-seeking / desire phrases → conversation ──
  if (HELP_SEEKING_ANYWHERE.test(lower) || DESIRE_NOT_COMMAND.test(lower)) {
    return CHAT_RESULT;
  }

  // ── 6. Explanation requests ──
  if (EXPLANATION_PATTERNS.test(lower) || trimmed.startsWith("explain")) {
    return { ...CHAT_RESULT, category: "explanation_request" };
  }

  // ── 7. General questions (starts with interrogative or ends with ?) ──
  if (CONVERSATION_FIRST_PATTERNS.test(lower) || trimmed.endsWith("?") || GENERAL_QUESTION_PATTERNS.test(lower)) {
    return { ...CHAT_RESULT, category: "general_question" };
  }

  // ── 8. Diagnostics phrased as questions with no explicit edit verb → chat ──
  if (DIAGNOSTIC_QUESTION_PATTERNS.test(trimmed) && !ACTIONABLE_EDIT_VERBS.test(lower)) {
    return { ...CHAT_RESULT, category: "general_question" };
  }

  // ── 9. No explicit action verb → conversation (ambiguous) ──
  if (!hasExplicitActionVerb(trimmed)) {
    return { ...CHAT_RESULT, isAmbiguous: true };
  }

  // ── 10. Refactor request ──
  if (/\brefactor\b/i.test(lower)) {
    const isHighImpact = HIGH_IMPACT_PATTERNS.test(lower);
    return {
      category: isHighImpact ? "high_impact_change_request" : "refactor_request",
      routeHint: hasExistingCode ? "edit" : "build",
      requiresConfirmation: true,
      requiresSecondConfirmation: isHighImpact,
      isAmbiguous: false,
    };
  }

  // ── 11. Fix request ──
  if (/\bfix\b/i.test(lower)) {
    const isHighImpact = HIGH_IMPACT_PATTERNS.test(lower);
    return {
      category: isHighImpact ? "high_impact_change_request" : "fix_request",
      routeHint: hasExistingCode ? "edit" : "build",
      requiresConfirmation: true,
      requiresSecondConfirmation: isHighImpact,
      isAmbiguous: false,
    };
  }

  // ── 12. Generation request ──
  if (GENERATION_VERBS.test(lower)) {
    const isHighImpact = HIGH_IMPACT_PATTERNS.test(lower);
    const routeHint: GuardRouteHint = hasExistingCode && /\b(update|modify|add|delete|change)\b/i.test(lower) ? "edit" : "build";
    return {
      category: isHighImpact ? "high_impact_change_request" : "generation_request",
      routeHint,
      requiresConfirmation: true,
      requiresSecondConfirmation: isHighImpact,
      isAmbiguous: false,
    };
  }

  // ── 13. Fallback → conversation (ambiguous) ──
  return { ...CHAT_RESULT, isAmbiguous: true };
}

export type ConfirmationReply = "confirm" | "cancel" | "unclear";

export function parseConfirmationReply(text: string): ConfirmationReply {
  const trimmed = text.trim().toLowerCase();
  if (YES_PATTERNS.test(trimmed)) return "confirm";
  if (NO_PATTERNS.test(trimmed)) return "cancel";
  return "unclear";
}
