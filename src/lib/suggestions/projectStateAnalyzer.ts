/**
 * Project-State Awareness Layer (PSAL)
 * 
 * Reads the current project state and produces a structured snapshot
 * used by all downstream suggestion modules.
 */

export interface ProjectStateSnapshot {
  // Detected features/components
  pages: string[];
  components: string[];
  routes: string[];
  entities: string[];

  // Feature presence
  features: Set<string>;

  // Detected issues
  errors: DetectedError[];

  // Incomplete flows
  incompleteFlows: IncompleteFlow[];

  // Build phase
  buildPhase: "empty" | "initial" | "iterating" | "polishing";

  // Project type
  projectType: string;

  // Recent user actions (last 3 messages categorized)
  recentActions: string[];

  // User's stated goal (if any)
  userGoal: string | null;

  // Conversation mode
  conversationMode: "exploring" | "building" | "debugging" | "polishing";
}

export interface DetectedError {
  type: "missing-export" | "broken-import" | "undefined-symbol" | "route-mismatch" | "hydration" | "missing-component";
  file?: string;
  detail: string;
}

export interface IncompleteFlow {
  flow: string;
  missing: string;
  suggestion: string;
}

// ── Feature Detection ──────────────────────────────────────────────────

const FEATURE_PATTERNS: [RegExp, string][] = [
  [/login|signup|sign.?in|auth|useauth|authcontext/i, "auth"],
  [/password.?reset|forgot.?password|reset.?password/i, "password-reset"],
  [/verify|email.?confirm|verification/i, "email-verification"],
  [/mfa|two.?factor|2fa|totp/i, "mfa"],
  [/navbar|nav.?bar|navigation|<nav/i, "nav"],
  [/footer|<footer/i, "footer"],
  [/sidebar|sidenav/i, "sidebar"],
  [/dark.?mode|theme.?toggle|usetheme/i, "darkmode"],
  [/framer.?motion|animate|keyframes/i, "animations"],
  [/chart|recharts|graph|bar.?chart|pie.?chart/i, "charts"],
  [/table|thead|datagrid|sortable.*table/i, "table"],
  [/search|filter/i, "search"],
  [/modal|dialog|drawer/i, "modals"],
  [/form|input.*type|onsubmit|useform/i, "forms"],
  [/validation|yup|zod.*schema|validate/i, "form-validation"],
  [/cart|checkout|add.?to.?cart/i, "cart"],
  [/pagination|loadmore|next.*page/i, "pagination"],
  [/toast|notification|sonner/i, "notifications"],
  [/skeleton|shimmer/i, "skeletons"],
  [/loading|spinner|isloading/i, "loading-states"],
  [/drag|dnd|sortable|draggable/i, "drag-drop"],
  [/responsive|mobile.*menu|hamburger|useMediaQuery/i, "responsive"],
  [/error.?boundary|errorboundary/i, "error-boundary"],
  [/preload|prefetch|lazy/i, "preloading"],
  [/crud|create.*read.*update|list.*view.*edit/i, "crud"],
  [/api|fetch|axios|useSWR|useQuery/i, "api-layer"],
  [/stripe|payment|billing|subscription/i, "payments"],
  [/webhook|hook.*handler/i, "webhooks"],
  [/upload|file.*input|dropzone/i, "file-upload"],
  [/export|download|csv|pdf.*gen/i, "export"],
  [/settings|preferences|config.*page/i, "settings-page"],
  [/profile|account.*page|user.*page/i, "profile-page"],
  [/dashboard/i, "dashboard"],
  [/landing|hero.*section/i, "landing-page"],
  [/onboard|welcome.*wizard|setup.*wizard/i, "onboarding"],
];

// ── Project Type Detection ─────────────────────────────────────────────

const PROJECT_TYPES: [RegExp, string][] = [
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
  [/billing|invoice|payment.*track/i, "billing"],
  [/hospital|medical|patient|health/i, "healthcare"],
  [/school|student|course|grade|lms/i, "education"],
];

// ── Page & Component Extraction ────────────────────────────────────────

function extractPages(code: string): string[] {
  const pages: string[] = [];
  const routeMatch = code.match(/<Route[^>]*path=["']([^"']+)["']/gi);
  if (routeMatch) {
    for (const m of routeMatch) {
      const p = m.match(/path=["']([^"']+)["']/);
      if (p) pages.push(p[1]);
    }
  }
  return [...new Set(pages)];
}

function extractComponents(code: string): string[] {
  const comps: string[] = [];
  const matches = code.match(/(?:function|const)\s+([A-Z][a-zA-Z0-9]+)/g);
  if (matches) {
    for (const m of matches) {
      const name = m.replace(/^(function|const)\s+/, "");
      if (name.length > 1) comps.push(name);
    }
  }
  return [...new Set(comps)];
}

// ── Error Detection ────────────────────────────────────────────────────

function detectErrors(code: string): DetectedError[] {
  const errors: DetectedError[] = [];

  // Missing exports
  const defaultExportCount = (code.match(/export\s+default/g) || []).length;
  const functionCount = (code.match(/(?:function|const)\s+[A-Z][a-zA-Z]+/g) || []).length;
  if (functionCount > 0 && defaultExportCount === 0) {
    errors.push({ type: "missing-export", detail: "Component files may be missing default exports" });
  }

  // Broken imports (importing from paths that look suspicious)
  const brokenImports = code.match(/from\s+["']\.\/[^"']*undefined[^"']*["']/gi);
  if (brokenImports?.length) {
    errors.push({ type: "broken-import", detail: `${brokenImports.length} potentially broken import(s) detected` });
  }

  // Undefined references in JSX
  const undefinedRefs = code.match(/<([A-Z][a-zA-Z]+)[^>]*\/?>(?![\s\S]*(?:import|function|const)\s+\1)/g);
  if (undefinedRefs && undefinedRefs.length > 5) {
    errors.push({ type: "undefined-symbol", detail: "Some JSX components may not be imported" });
  }

  return errors;
}

// ── Flow Completion Detection ──────────────────────────────────────────

function detectIncompleteFlows(features: Set<string>, code: string): IncompleteFlow[] {
  const flows: IncompleteFlow[] = [];

  if (features.has("auth") && !features.has("password-reset")) {
    flows.push({ flow: "auth", missing: "password-reset", suggestion: "Add password reset flow to complete authentication" });
  }
  if (features.has("auth") && !features.has("email-verification")) {
    flows.push({ flow: "auth", missing: "email-verification", suggestion: "Add email verification for secure signups" });
  }
  if (features.has("auth") && !features.has("profile-page")) {
    flows.push({ flow: "auth", missing: "profile-page", suggestion: "Add user profile page for account management" });
  }
  if (features.has("dashboard") && !features.has("charts")) {
    flows.push({ flow: "dashboard", missing: "charts", suggestion: "Add data visualizations to the dashboard" });
  }
  if (features.has("forms") && !features.has("form-validation")) {
    flows.push({ flow: "forms", missing: "validation", suggestion: "Add form validation for data integrity" });
  }
  if (features.has("forms") && !features.has("notifications")) {
    flows.push({ flow: "forms", missing: "feedback", suggestion: "Add toast notifications for form submission feedback" });
  }
  if (features.has("table") && !features.has("pagination")) {
    flows.push({ flow: "table", missing: "pagination", suggestion: "Add pagination to data tables" });
  }
  if (features.has("table") && !features.has("search")) {
    flows.push({ flow: "table", missing: "search", suggestion: "Add search and filtering to data tables" });
  }
  if (features.has("crud") && !features.has("loading-states")) {
    flows.push({ flow: "crud", missing: "loading-states", suggestion: "Add loading states for CRUD operations" });
  }
  if (features.has("crud") && !features.has("error-boundary")) {
    flows.push({ flow: "crud", missing: "error-boundary", suggestion: "Add error boundaries for graceful failure handling" });
  }
  if (features.has("api-layer") && !features.has("loading-states")) {
    flows.push({ flow: "api", missing: "loading-states", suggestion: "Add loading and error states for API calls" });
  }
  if (features.has("cart") && !features.has("payments")) {
    flows.push({ flow: "ecommerce", missing: "payments", suggestion: "Add payment processing for checkout" });
  }
  if (features.has("nav") && !features.has("responsive")) {
    flows.push({ flow: "navigation", missing: "responsive", suggestion: "Make navigation responsive for mobile" });
  }

  // Check for pages without skeletons
  const pageCount = (code.match(/<Route/g) || []).length;
  if (pageCount > 2 && !features.has("skeletons")) {
    flows.push({ flow: "ux", missing: "skeletons", suggestion: "Add skeleton loaders for better perceived performance" });
  }

  return flows;
}

// ── Conversation Mode Detection ────────────────────────────────────────

function detectConversationMode(
  userMessages: string[],
  errors: DetectedError[]
): ProjectStateSnapshot["conversationMode"] {
  const last3 = userMessages.slice(-3).join(" ").toLowerCase();

  if (/fix|bug|error|broken|crash|not.?work|issue/i.test(last3)) return "debugging";
  if (/polish|design|style|color|animation|beautiful|pretty/i.test(last3)) return "polishing";
  if (/build|create|add|generate|implement|scaffold/i.test(last3)) return "building";
  return "exploring";
}

// ── Goal Extraction ────────────────────────────────────────────────────

function extractUserGoal(userMessages: string[]): string | null {
  for (const msg of userMessages) {
    const goalMatch = msg.match(/(?:i want to|i need|let's|build me|create|make)\s+(?:a |an )?(.{10,80}?)(?:\.|$|!|\?)/i);
    if (goalMatch) return goalMatch[1].trim();
  }
  return null;
}

// ── Action Categorization ──────────────────────────────────────────────

function categorizeAction(msg: string): string {
  const l = msg.toLowerCase();
  if (!l) return "none";
  if (/fix|bug|error|broken|issue|problem|crash|not.?work/i.test(l)) return "debugging";
  if (/build|create|make|generate|add|scaffold/i.test(l)) return "building";
  if (/change|update|modify|edit|tweak|adjust/i.test(l)) return "modifying";
  if (/design|style|color|theme|look|prettier|beautiful|ui/i.test(l)) return "designing";
  if (/deploy|publish|ship|launch/i.test(l)) return "deploying";
  if (/test|verify|check/i.test(l)) return "testing";
  if (/explain|how|what|why/i.test(l)) return "exploring";
  return "general";
}

// ── Public API ─────────────────────────────────────────────────────────

export function analyzeProjectState(
  code: string,
  chatMessages: Array<{ role: string; content: string }>
): ProjectStateSnapshot {
  const userMessages = chatMessages
    .filter(m => m.role === "user")
    .map(m => typeof m.content === "string" ? m.content : "");

  const allText = userMessages.join(" ").toLowerCase();
  const lower = code.toLowerCase();
  const combined = allText + " " + lower;

  // Detect features
  const features = new Set<string>();
  for (const [rx, feature] of FEATURE_PATTERNS) {
    if (rx.test(combined)) features.add(feature);
  }

  // Detect project type
  let projectType = "general";
  for (const [rx, type] of PROJECT_TYPES) {
    if (rx.test(combined)) { projectType = type; break; }
  }

  // Build phase
  const buildPhase: ProjectStateSnapshot["buildPhase"] =
    !code && userMessages.length === 0 ? "empty" :
    userMessages.length <= 2 ? "initial" :
    userMessages.length <= 6 ? "iterating" : "polishing";

  // Extract structured data
  const pages = extractPages(code);
  const components = extractComponents(code);
  const errors = detectErrors(code);
  const incompleteFlows = detectIncompleteFlows(features, code);
  const recentActions = userMessages.slice(-3).map(categorizeAction);
  const userGoal = extractUserGoal(userMessages);
  const conversationMode = detectConversationMode(userMessages, errors);

  return {
    pages,
    components,
    routes: pages,
    entities: [],
    features,
    errors,
    incompleteFlows,
    buildPhase,
    projectType,
    recentActions,
    userGoal,
    conversationMode,
  };
}
