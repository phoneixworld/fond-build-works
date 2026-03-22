/**
 * Suggestion Rules — All suggestion categories
 * 
 * Includes: Flow-Completion (FCD), Opportunity Detection (ODE),
 * User-Intent Prediction (UIP), Goal-Driven (GDS),
 * Error-Aware (EAS), Conversation-Mode (CMS)
 */

import type { ProjectStateSnapshot } from "./projectStateAnalyzer";

export interface RankedSuggestion {
  label: string;
  prompt: string;
  icon: string;
  category: "flow-completion" | "opportunity" | "intent-prediction" | "goal-driven" | "error-aware" | "conversation" | "post-build" | "project-type" | "starter";
  score: number;
}

type RuleFn = (state: ProjectStateSnapshot) => RankedSuggestion[];

// ── Flow-Completion Detection (FCD) ────────────────────────────────────

const flowCompletionRules: RuleFn = (state) => {
  return state.incompleteFlows.map(flow => ({
    label: flow.suggestion.length > 40 ? flow.suggestion.slice(0, 37) + "…" : flow.suggestion,
    prompt: flow.suggestion,
    icon: "🔗",
    category: "flow-completion" as const,
    score: 14 + (flow.flow === "auth" ? 3 : 0), // auth flows are higher priority
  }));
};

// ── Opportunity Detection (ODE) ────────────────────────────────────────

const opportunityRules: RuleFn = (state) => {
  const suggestions: RankedSuggestion[] = [];
  const { features, buildPhase, components } = state;

  if (components.length > 15 && !features.has("preloading")) {
    suggestions.push({
      label: "Add predictive preloading",
      prompt: "Add predictive preloading for routes — prefetch likely next pages on hover for instant navigation",
      icon: "⚡", category: "opportunity", score: 10,
    });
  }

  if (state.pages.length > 3 && !features.has("skeletons")) {
    suggestions.push({
      label: "Generate skeleton loaders",
      prompt: "Generate skeleton loader components for all pages to improve perceived load time",
      icon: "💀", category: "opportunity", score: 11,
    });
  }

  if (!features.has("error-boundary") && buildPhase !== "empty") {
    suggestions.push({
      label: "Add error boundaries",
      prompt: "Add React error boundaries with fallback UI to gracefully handle component crashes",
      icon: "🛡️", category: "opportunity", score: 9,
    });
  }

  if (features.has("api-layer") && !features.has("loading-states")) {
    suggestions.push({
      label: "Add loading & error states",
      prompt: "Add loading spinners and error states for all API-driven components",
      icon: "⏳", category: "opportunity", score: 10,
    });
  }

  if (!features.has("responsive") && buildPhase !== "empty" && buildPhase !== "initial") {
    suggestions.push({
      label: "Make fully responsive",
      prompt: "Make the app fully responsive — optimize all layouts for mobile, tablet, and desktop",
      icon: "📱", category: "opportunity", score: 9,
    });
  }

  if (!features.has("darkmode") && buildPhase === "polishing") {
    suggestions.push({
      label: "Add dark mode",
      prompt: "Add a dark mode toggle with smooth transitions and persistent user preference",
      icon: "🌙", category: "opportunity", score: 7,
    });
  }

  if (!features.has("animations") && buildPhase === "polishing") {
    suggestions.push({
      label: "Add animations",
      prompt: "Add smooth page transitions, entrance animations, and hover micro-interactions with Framer Motion",
      icon: "✨", category: "opportunity", score: 7,
    });
  }

  if (features.has("forms") && !features.has("export")) {
    suggestions.push({
      label: "Add data export",
      prompt: "Add CSV/PDF export functionality for data tables and forms",
      icon: "📤", category: "opportunity", score: 6,
    });
  }

  return suggestions;
};

// ── User-Intent Prediction (UIP) ───────────────────────────────────────

const intentPredictionRules: RuleFn = (state) => {
  const suggestions: RankedSuggestion[] = [];
  const { recentActions, projectType, features } = state;

  const actionCounts = recentActions.reduce((acc, a) => {
    acc[a] = (acc[a] || 0) + 1; return acc;
  }, {} as Record<string, number>);

  // If user has been building → suggest testing
  if (actionCounts["building"] >= 2) {
    suggestions.push({
      label: "Test the app",
      prompt: "Verify the app works correctly — check all pages, forms, and interactions for bugs",
      icon: "✅", category: "intent-prediction", score: 16,
    });
  }

  // If user has been designing → suggest responsiveness
  if (actionCounts["designing"] >= 2 && !features.has("responsive")) {
    suggestions.push({
      label: "Check responsiveness",
      prompt: "Review and fix mobile responsiveness across all breakpoints",
      icon: "📱", category: "intent-prediction", score: 12,
    });
  }

  // If user has been debugging → suggest comprehensive fix
  if (actionCounts["debugging"] >= 2) {
    suggestions.push({
      label: "Deep fix scan",
      prompt: "Do a comprehensive scan for bugs — check imports, exports, routes, and data flow",
      icon: "🔬", category: "intent-prediction", score: 15,
    });
  }

  // Dashboard builder → analytics
  if (projectType === "dashboard" && !features.has("charts")) {
    suggestions.push({
      label: "Add analytics charts",
      prompt: "Add interactive charts (line, bar, pie) with summary stat cards",
      icon: "📊", category: "intent-prediction", score: 13,
    });
  }

  // Auth builder → suggest MFA, reset
  if (features.has("auth") && !features.has("mfa")) {
    suggestions.push({
      label: "Add MFA support",
      prompt: "Add multi-factor authentication with TOTP for enhanced security",
      icon: "🔒", category: "intent-prediction", score: 8,
    });
  }

  // CRUD builder → filters/pagination
  if (features.has("crud") && !features.has("search")) {
    suggestions.push({
      label: "Add search & filters",
      prompt: "Add search bar with real-time filtering, category filters, and sort options",
      icon: "🔍", category: "intent-prediction", score: 11,
    });
  }

  return suggestions;
};

// ── Goal-Driven Suggestions (GDS) ──────────────────────────────────────

const goalDrivenRules: RuleFn = (state) => {
  const suggestions: RankedSuggestion[] = [];
  const { userGoal, features } = state;
  if (!userGoal) return suggestions;

  const goal = userGoal.toLowerCase();

  if (/billing|invoice|payment/i.test(goal)) {
    if (!features.has("payments")) suggestions.push({
      label: "Add payment integration",
      prompt: "Add Stripe integration with subscription management and payment processing",
      icon: "💳", category: "goal-driven", score: 18,
    });
    if (!features.has("dashboard")) suggestions.push({
      label: "Add billing dashboard",
      prompt: "Add a billing dashboard with revenue charts, invoice tracking, and payment history",
      icon: "📊", category: "goal-driven", score: 16,
    });
  }

  if (/saas|subscription/i.test(goal)) {
    if (!features.has("auth")) suggestions.push({
      label: "Add SaaS auth",
      prompt: "Add authentication with signup, login, team management, and role-based access",
      icon: "🔐", category: "goal-driven", score: 18,
    });
    if (!features.has("settings-page")) suggestions.push({
      label: "Add settings page",
      prompt: "Add account settings with profile, billing, team members, and preferences",
      icon: "⚙️", category: "goal-driven", score: 14,
    });
  }

  if (/crm|customer.*manage/i.test(goal)) {
    suggestions.push({
      label: "Add contact pipeline",
      prompt: "Add a visual sales pipeline with drag-and-drop deal stages and contact cards",
      icon: "📋", category: "goal-driven", score: 17,
    });
  }

  if (/ecommerce|store|shop/i.test(goal)) {
    if (!features.has("cart")) suggestions.push({
      label: "Add shopping cart",
      prompt: "Add a shopping cart with product cards, quantity controls, and checkout flow",
      icon: "🛒", category: "goal-driven", score: 18,
    });
  }

  return suggestions;
};

// ── Error-Aware Suggestions (EAS) ──────────────────────────────────────

const errorAwareRules: RuleFn = (state) => {
  return state.errors.map(error => ({
    label: `Fix: ${error.type.replace(/-/g, " ")}`,
    prompt: `I detected a potential issue: ${error.detail}. Please scan and fix it.`,
    icon: "⚠️",
    category: "error-aware" as const,
    score: 20, // Errors are highest priority
  }));
};

// ── Conversation-Mode Suggestions (CMS) ────────────────────────────────

const conversationModeRules: RuleFn = (state) => {
  if (state.conversationMode !== "exploring") return [];

  const suggestions: RankedSuggestion[] = [
    {
      label: "Analyze my project",
      prompt: "Analyze my current project — what features exist, what's missing, and what could be improved?",
      icon: "🔍", category: "conversation", score: 12,
    },
    {
      label: "Show missing flows",
      prompt: "What incomplete flows exist in my project? Show me what needs to be finished.",
      icon: "📋", category: "conversation", score: 10,
    },
  ];

  if (state.pages.length > 2) {
    suggestions.push({
      label: "Architecture overview",
      prompt: "Give me a high-level overview of my current app architecture — pages, components, and data flow",
      icon: "🏗️", category: "conversation", score: 9,
    });
  }

  return suggestions;
};

// ── Post-Build Follow-ups ──────────────────────────────────────────────

const postBuildRules: RuleFn = (state) => {
  const suggestions: RankedSuggestion[] = [];
  const lastAction = state.recentActions[state.recentActions.length - 1];

  if (lastAction === "building") {
    suggestions.push({
      label: "Test it out",
      prompt: "Verify the app works correctly — check all pages, forms, and interactions",
      icon: "✅", category: "post-build", score: 20,
    });
    suggestions.push({
      label: "Improve the design",
      prompt: "Polish the visual design — improve spacing, colors, typography, and add subtle animations",
      icon: "🎨", category: "post-build", score: 12,
    });
  }

  if (lastAction === "debugging") {
    suggestions.push({
      label: "Fix remaining issues",
      prompt: "Check for any remaining bugs, broken imports, or missing functionality and fix them",
      icon: "🔧", category: "post-build", score: 18,
    });
  }

  return suggestions;
};

// ── Starter Suggestions ────────────────────────────────────────────────

const starterRules: RuleFn = (state) => {
  if (state.buildPhase !== "empty") return [];
  return [
    { label: "Landing page", prompt: "Build a modern landing page with hero section, features grid, testimonials, and call-to-action", icon: "🚀", category: "starter" as const, score: 25 },
    { label: "Dashboard", prompt: "Build a data dashboard with sidebar navigation, charts, stat cards, and a data table", icon: "📊", category: "starter" as const, score: 25 },
    { label: "E-commerce", prompt: "Build an online store with product listing, shopping cart, and checkout page", icon: "🛒", category: "starter" as const, score: 25 },
    { label: "Task board", prompt: "Build a Kanban-style task board with drag-and-drop columns and task cards", icon: "📋", category: "starter" as const, score: 25 },
  ];
};

// ── Aggregate All Rules ────────────────────────────────────────────────

export const ALL_RULE_SETS: RuleFn[] = [
  starterRules,
  errorAwareRules,
  postBuildRules,
  goalDrivenRules,
  flowCompletionRules,
  intentPredictionRules,
  opportunityRules,
  conversationModeRules,
];
