/**
 * Smart Suggestion Engine v2
 * 
 * Generates context-aware quick actions based on:
 * 1. Recent conversation (what was just built/discussed)
 * 2. Project type & build state
 * 3. What's missing vs. what exists
 * 
 * Key change from v1: suggestions follow from the LAST action,
 * not from a static feature checklist.
 */

export interface SmartSuggestion {
  label: string;
  prompt: string;
  icon: string;
}

// ─── Conversation-Aware Analysis ──────────────────────────────────────────

interface ProjectState {
  projectType: string;
  recentAction: string;        // what the user just did / asked
  buildPhase: "empty" | "initial" | "iterating" | "polishing";
  detectedFeatures: Set<string>;
  recentTopics: string[];       // last 3 user messages' topics
}

function analyzeProject(
  code: string,
  chatMessages: Array<{ role: string; content: string }>
): ProjectState {
  const userMessages = chatMessages
    .filter(m => m.role === "user")
    .map(m => typeof m.content === "string" ? m.content : "");

  const lastMsg = userMessages[userMessages.length - 1] || "";
  const last3 = userMessages.slice(-3).join(" ").toLowerCase();
  const allText = userMessages.join(" ").toLowerCase();
  const lower = code.toLowerCase();

  // Detect what type of project this is
  const projectType = detectProjectType(allText, lower);

  // Detect recent action from last message
  const recentAction = categorizeAction(lastMsg);

  // Determine build phase
  const buildPhase: ProjectState["buildPhase"] =
    !code && userMessages.length === 0 ? "empty" :
    userMessages.length <= 2 ? "initial" :
    userMessages.length <= 6 ? "iterating" : "polishing";

  // Detect features present in the code
  const detectedFeatures = detectFeatures(lower);

  // Extract recent topics
  const recentTopics = extractRecentTopics(last3);

  return { projectType, recentAction, buildPhase, detectedFeatures, recentTopics };
}

function detectProjectType(chat: string, code: string): string {
  const combined = chat + " " + code;
  const types: [RegExp, string][] = [
    [/kanban|board|task|trello|project.?manage/i, "project-management"],
    [/e.?commerce|shop|product|cart|store|checkout/i, "ecommerce"],
    [/dashboard|analytics|metric|admin.?panel/i, "dashboard"],
    [/blog|article|post|writing|cms/i, "blog"],
    [/portfolio|resume|personal|showcase/i, "portfolio"],
    [/saas|subscription|pricing|tier/i, "saas"],
    [/social|feed|profile|follow|timeline/i, "social"],
    [/chat|messaging|conversation|inbox/i, "chat-app"],
    [/crm|customer|lead|pipeline|sales/i, "crm"],
    [/todo|task.?list|checklist/i, "todo"],
    [/booking|appointment|calendar|schedule/i, "booking"],
    [/survey|form.?builder|questionnaire/i, "forms"],
  ];
  for (const [rx, type] of types) {
    if (rx.test(combined)) return type;
  }
  return "general";
}

function categorizeAction(lastMsg: string): string {
  const l = lastMsg.toLowerCase();
  if (!l) return "none";
  if (/fix|bug|error|broken|issue|problem|crash|not.?work/i.test(l)) return "debugging";
  if (/build|create|make|generate|add/i.test(l)) return "building";
  if (/change|update|modify|edit|tweak|adjust/i.test(l)) return "modifying";
  if (/design|style|color|theme|look|prettier|beautiful|ui/i.test(l)) return "designing";
  if (/deploy|publish|ship|launch/i.test(l)) return "deploying";
  if (/test|verify|check/i.test(l)) return "testing";
  return "general";
}

function detectFeatures(code: string): Set<string> {
  const features = new Set<string>();
  const checks: [RegExp, string][] = [
    [/login|signup|sign.?in|auth|useauth|authcontext/i, "auth"],
    [/navbar|nav.?bar|navigation|<nav/i, "nav"],
    [/footer|<footer/i, "footer"],
    [/dark.?mode|theme.?toggle|usetheme/i, "darkmode"],
    [/framer.?motion|animate|keyframes/i, "animations"],
    [/chart|recharts|graph|bar.?chart/i, "charts"],
    [/table|thead|datagrid/i, "table"],
    [/search|filter/i, "search"],
    [/modal|dialog|drawer/i, "modals"],
    [/form|input.*type|onsubmit/i, "forms"],
    [/cart|checkout|add.?to.?cart/i, "cart"],
    [/pagination|loadmore|next.*page/i, "pagination"],
    [/toast|notification|alert/i, "notifications"],
    [/sidebar|sidenav/i, "sidebar"],
    [/skeleton|spinner|loading/i, "loading-states"],
    [/drag|dnd|sortable/i, "drag-drop"],
    [/responsive|mobile.*menu|hamburger/i, "responsive"],
  ];
  for (const [rx, feature] of checks) {
    if (rx.test(code)) features.add(feature);
  }
  return features;
}

function extractRecentTopics(text: string): string[] {
  const topics: string[] = [];
  const checks: [RegExp, string][] = [
    [/auth|login|signup/, "auth"],
    [/nav|header|menu/, "navigation"],
    [/style|design|color|theme/, "design"],
    [/data|api|fetch|backend/, "data"],
    [/deploy|publish|domain/, "deployment"],
    [/mobile|responsive/, "responsive"],
    [/bug|fix|error/, "bugfix"],
    [/page|route|screen/, "pages"],
    [/button|click|action/, "interactions"],
    [/image|photo|gallery/, "media"],
  ];
  for (const [rx, topic] of checks) {
    if (rx.test(text)) topics.push(topic);
  }
  return topics;
}

// ─── Suggestion Rules ─────────────────────────────────────────────────────

interface SuggestionRule {
  label: string;
  prompt: string;
  icon: string;
  /** Returns a relevance score (0 = don't show, higher = more relevant) */
  score: (state: ProjectState) => number;
}

const RULES: SuggestionRule[] = [
  // ── Post-build follow-ups (highest priority — react to what just happened) ──
  {
    label: "Test it out",
    prompt: "Please verify the app works correctly end-to-end — check all pages, forms, and interactions",
    icon: "✅",
    score: (s) => s.recentAction === "building" ? 20 : 0,
  },
  {
    label: "Fix remaining issues",
    prompt: "Check for any bugs, broken imports, or missing functionality and fix them",
    icon: "🔧",
    score: (s) => s.recentAction === "debugging" ? 18 : 0,
  },
  {
    label: "Improve the design",
    prompt: "Polish the visual design — improve spacing, colors, typography, and add subtle animations for a professional feel",
    icon: "🎨",
    score: (s) => s.recentAction === "building" ? 12 :
                  s.recentAction === "modifying" ? 10 : 0,
  },

  // ── Project-type specific next steps ──
  {
    label: "Add board columns",
    prompt: "Add drag-and-drop columns to the board (To Do, In Progress, Done) with the ability to move cards between them",
    icon: "📋",
    score: (s) => s.projectType === "project-management" && !s.detectedFeatures.has("drag-drop") ? 15 : 0,
  },
  {
    label: "Add task details",
    prompt: "Add a task detail modal with description, due date, assignee, labels, and comments",
    icon: "📝",
    score: (s) => s.projectType === "project-management" && s.detectedFeatures.has("modals") ? 0 :
                  s.projectType === "project-management" ? 13 : 0,
  },
  {
    label: "Add product catalog",
    prompt: "Add a product grid with images, prices, categories, and an Add to Cart button on each card",
    icon: "🛍️",
    score: (s) => s.projectType === "ecommerce" && !s.detectedFeatures.has("cart") ? 15 : 0,
  },
  {
    label: "Add checkout flow",
    prompt: "Add a checkout page with cart summary, shipping form, payment section, and order confirmation",
    icon: "💳",
    score: (s) => s.projectType === "ecommerce" && s.detectedFeatures.has("cart") ? 15 : 0,
  },
  {
    label: "Add analytics charts",
    prompt: "Add interactive charts (line, bar, pie) with real-time data and summary stat cards on the dashboard",
    icon: "📊",
    score: (s) => s.projectType === "dashboard" && !s.detectedFeatures.has("charts") ? 15 : 0,
  },
  {
    label: "Add data table",
    prompt: "Add a sortable, filterable data table with row actions, bulk select, and export functionality",
    icon: "📋",
    score: (s) => s.projectType === "dashboard" && !s.detectedFeatures.has("table") ? 13 : 0,
  },
  {
    label: "Add blog editor",
    prompt: "Add a rich text editor for creating and editing blog posts with image uploads and preview",
    icon: "✍️",
    score: (s) => s.projectType === "blog" ? 14 : 0,
  },
  {
    label: "Add pricing tiers",
    prompt: "Add a pricing page with 3 tiers, feature comparison table, and highlighted recommended plan",
    icon: "💰",
    score: (s) => s.projectType === "saas" ? 14 : 0,
  },
  {
    label: "Add user profiles",
    prompt: "Add user profile pages with avatar, bio, activity feed, and settings",
    icon: "👤",
    score: (s) => s.projectType === "social" ? 14 : 0,
  },
  {
    label: "Add message thread",
    prompt: "Add real-time message threads with typing indicators, read receipts, and message reactions",
    icon: "💬",
    score: (s) => s.projectType === "chat-app" ? 14 : 0,
  },

  // ── Common missing features (medium priority) ──
  {
    label: "Add authentication",
    prompt: "Add login and signup pages with form validation, error handling, and protected routes",
    icon: "🔐",
    score: (s) => !s.detectedFeatures.has("auth") && s.buildPhase !== "empty" ? 11 : 0,
  },
  {
    label: "Add navigation",
    prompt: "Add a responsive navigation bar with logo, links, and a mobile hamburger menu",
    icon: "🧭",
    score: (s) => !s.detectedFeatures.has("nav") && s.buildPhase !== "empty" ? 10 : 0,
  },
  {
    label: "Add search & filter",
    prompt: "Add a search bar with real-time filtering, category filters, and sort options",
    icon: "🔍",
    score: (s) => !s.detectedFeatures.has("search") && (s.detectedFeatures.has("table") || s.detectedFeatures.has("cart")) ? 9 : 0,
  },
  {
    label: "Add dark mode",
    prompt: "Add a dark mode toggle with smooth color transitions and persistent user preference",
    icon: "🌙",
    score: (s) => !s.detectedFeatures.has("darkmode") && s.buildPhase === "polishing" ? 8 : 0,
  },
  {
    label: "Make it responsive",
    prompt: "Make the app fully responsive — optimize layouts for mobile, tablet, and desktop breakpoints",
    icon: "📱",
    score: (s) => !s.detectedFeatures.has("responsive") && s.buildPhase !== "empty" ? 8 : 0,
  },
  {
    label: "Add animations",
    prompt: "Add smooth page transitions, entrance animations, and hover micro-interactions using Framer Motion",
    icon: "✨",
    score: (s) => !s.detectedFeatures.has("animations") && s.buildPhase === "polishing" ? 7 : 0,
  },
  {
    label: "Add loading states",
    prompt: "Add skeleton loaders, spinners, and error boundaries throughout the app for better UX",
    icon: "⏳",
    score: (s) => !s.detectedFeatures.has("loading-states") && s.buildPhase === "iterating" ? 7 : 0,
  },
  {
    label: "Add notifications",
    prompt: "Add a toast notification system for success, error, and info feedback on user actions",
    icon: "🔔",
    score: (s) => !s.detectedFeatures.has("notifications") && s.detectedFeatures.has("forms") ? 6 : 0,
  },
];

// ─── Starter suggestions (empty project) ──────────────────────────────────

const STARTERS: SmartSuggestion[] = [
  { label: "Landing page", prompt: "Build a modern landing page with hero section, features grid, testimonials, and call-to-action", icon: "🚀" },
  { label: "Dashboard", prompt: "Build a data dashboard with sidebar navigation, charts, stat cards, and a data table", icon: "📊" },
  { label: "E-commerce", prompt: "Build an online store with product listing, shopping cart, and checkout page", icon: "🛒" },
  { label: "Task board", prompt: "Build a Kanban-style task board with drag-and-drop columns and task cards", icon: "📋" },
];

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Generate context-aware suggestions that follow logically
 * from what the user just did.
 */
export function generateSmartSuggestions(
  code: string,
  chatMessages: Array<{ role: string; content: string }>,
  maxSuggestions = 4
): SmartSuggestion[] {
  // Empty project → starters
  if (!code && chatMessages.length === 0) {
    return STARTERS;
  }

  const state = analyzeProject(code, chatMessages);

  // Score all rules, filter out zero-score, sort descending
  const scored = RULES
    .map(rule => ({ ...rule, s: rule.score(state) }))
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, maxSuggestions)
    .map(({ label, prompt, icon }) => ({ label, prompt, icon }));

  // If we have fewer than 2 suggestions, pad with generic ones
  if (scored.length < 2) {
    const fallbacks: SmartSuggestion[] = [
      { label: "Improve design", prompt: "Polish the visual design — improve spacing, colors, typography, and add subtle animations", icon: "🎨" },
      { label: "Add a new page", prompt: "Add a new page to the app with navigation link and appropriate content", icon: "📄" },
    ];
    for (const fb of fallbacks) {
      if (scored.length >= maxSuggestions) break;
      if (!scored.some(s => s.label === fb.label)) scored.push(fb);
    }
  }

  return scored;
}
