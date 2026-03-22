export type GuardIntentCategory =
  | "conversation"
  | "general_question"
  | "explanation_request"
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

const EXPLICIT_ACTION_VERBS = /\b(create|generate|build|add|update|fix|refactor|modify|delete)\b/i;
const GENERATION_VERBS = /\b(create|generate|build|add|update|modify|delete)\b/i;
const CONVERSATION_FIRST_PATTERNS = /^(can you help me|can you help|how do i|what should i do|why is this happening|explain|can we|could you|would you|help me|what is|what are|how does|why does)\b/i;
const HELP_SEEKING_ANYWHERE = /\b(can you help|help me|could you help|would you help|i need help|i want help|assist me)\b/i;
const DESIRE_NOT_COMMAND = /^(i want to|i'd like to|i would like to|i wanna|i wish to|i'm thinking of|i am thinking of|i'm looking to|i am looking to)\b/i;
const GENERAL_QUESTION_PATTERNS = /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does)\b/i;
const EXPLANATION_PATTERNS = /\b(explain|why is this happening|why does this happen|what happened|help me understand)\b/i;
const HIGH_IMPACT_PATTERNS = /\b(app\.(jsx|tsx|js)|app\s*layout|applayout|sidebar|routing|router|route|auth|authentication|authcontext|index\s*file|layout)\b/i;

const YES_PATTERNS = /^(yes|yep|yeah|go ahead|proceed|do it|confirm|sure|ok|okay|continue)\b/i;
const NO_PATTERNS = /^(no|nope|cancel|stop|don'?t|do not|not now|skip|abort)\b/i;

export function hasExplicitActionVerb(text: string): boolean {
  return EXPLICIT_ACTION_VERBS.test(text.trim());
}

export function classifyIntentGate(text: string, hasExistingCode: boolean): GuardClassification {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return {
      category: "conversation",
      routeHint: "chat",
      requiresConfirmation: false,
      requiresSecondConfirmation: false,
      isAmbiguous: true,
    };
  }

  if (EXPLANATION_PATTERNS.test(lower) || trimmed.startsWith("explain")) {
    return {
      category: "explanation_request",
      routeHint: "chat",
      requiresConfirmation: false,
      requiresSecondConfirmation: false,
      isAmbiguous: false,
    };
  }

  if (CONVERSATION_FIRST_PATTERNS.test(lower) || trimmed.endsWith("?") || GENERAL_QUESTION_PATTERNS.test(lower)) {
    return {
      category: "general_question",
      routeHint: "chat",
      requiresConfirmation: false,
      requiresSecondConfirmation: false,
      isAmbiguous: false,
    };
  }

  if (!hasExplicitActionVerb(trimmed)) {
    return {
      category: "conversation",
      routeHint: "chat",
      requiresConfirmation: false,
      requiresSecondConfirmation: false,
      isAmbiguous: true,
    };
  }

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

  if (GENERATION_VERBS.test(lower)) {
    const isHighImpact = HIGH_IMPACT_PATTERNS.test(lower);
    const routeHint: GuardRouteHint = hasExistingCode && /\b(update|modify|add|delete)\b/i.test(lower) ? "edit" : "build";
    return {
      category: isHighImpact ? "high_impact_change_request" : "generation_request",
      routeHint,
      requiresConfirmation: true,
      requiresSecondConfirmation: isHighImpact,
      isAmbiguous: false,
    };
  }

  return {
    category: "conversation",
    routeHint: "chat",
    requiresConfirmation: false,
    requiresSecondConfirmation: false,
    isAmbiguous: true,
  };
}

export type ConfirmationReply = "confirm" | "cancel" | "unclear";

export function parseConfirmationReply(text: string): ConfirmationReply {
  const trimmed = text.trim().toLowerCase();
  if (YES_PATTERNS.test(trimmed)) return "confirm";
  if (NO_PATTERNS.test(trimmed)) return "cancel";
  return "unclear";
}
