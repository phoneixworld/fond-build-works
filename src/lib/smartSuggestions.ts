/**
 * Smart Suggestion Engine
 * Analyzes chat history + generated code to produce context-aware
 * "quick action" suggestions tailored to each project.
 */

export interface SmartSuggestion {
  label: string;
  prompt: string;
  icon: string;
}

// ─── Feature detection from code ────────────────────────────────────────────

interface DetectedFeatures {
  hasAuth: boolean;
  hasNavbar: boolean;
  hasForms: boolean;
  hasCharts: boolean;
  hasDarkMode: boolean;
  hasAnimations: boolean;
  hasCart: boolean;
  hasFooter: boolean;
  hasAPI: boolean;
  hasCRUD: boolean;
  hasSearch: boolean;
  hasImages: boolean;
  hasPagination: boolean;
  hasModals: boolean;
  hasTabs: boolean;
  hasTable: boolean;
  hasMobileMenu: boolean;
  framework: "react" | "html" | "unknown";
}

function detectFeatures(code: string): DetectedFeatures {
  const lower = code.toLowerCase();
  return {
    hasAuth: /login|signup|sign.?in|sign.?up|password|auth|useauth|authcontext/i.test(code),
    hasNavbar: /navbar|nav.?bar|navigation|header.*nav|<nav/i.test(code),
    hasForms: /form|input.*type|textarea|onsubmit|handlesubmit|useform/i.test(code),
    hasCharts: /chart|recharts|d3|graph|bar.?chart|line.?chart|pie.?chart/i.test(code),
    hasDarkMode: /dark.?mode|theme.?toggle|useTheme|dark:|\.dark\s/i.test(code),
    hasAnimations: /framer.?motion|animate|transition|keyframes|@keyframes/i.test(code),
    hasCart: /cart|shopping|checkout|add.?to.?cart|basket|product/i.test(code),
    hasFooter: /footer|<footer/i.test(code),
    hasAPI: /fetch\(|axios|api\/|endpoint|supabase|usequery/i.test(code),
    hasCRUD: /create|update|delete|insert|\.post\(|\.put\(|\.delete\(/i.test(code),
    hasSearch: /search|filter|query.*input|searchbar/i.test(code),
    hasImages: /gallery|image.*grid|carousel|slideshow|lightbox/i.test(code),
    hasPagination: /pagination|page.*number|next.*page|prev.*page|loadmore/i.test(code),
    hasModals: /modal|dialog|popup|overlay|drawer/i.test(code),
    hasTabs: /tabs|tab.*panel|tablist/i.test(code),
    hasTable: /table|thead|tbody|data.?table|datagrid/i.test(code),
    hasMobileMenu: /mobile.*menu|hamburger|menu.*toggle|responsive.*nav/i.test(code),
    framework: /import.*react|useState|useEffect|jsx/i.test(code) ? "react" 
      : /<html|<!doctype/i.test(code) ? "html" : "unknown",
  };
}

// ─── Topic detection from chat history ──────────────────────────────────────

interface ChatContext {
  topics: string[];
  lastUserMessage: string;
  messageCount: number;
  hasAskedAboutDesign: boolean;
  hasAskedAboutBugs: boolean;
  projectType: "ecommerce" | "dashboard" | "blog" | "portfolio" | "saas" | "social" | "general";
}

function analyzeChatHistory(messages: Array<{ role: string; content: string }>): ChatContext {
  const userMessages = messages.filter(m => m.role === "user").map(m => 
    typeof m.content === "string" ? m.content : ""
  );
  const allText = userMessages.join(" ").toLowerCase();

  const projectType: ChatContext["projectType"] = 
    /e.?commerce|shop|product|cart|store|checkout/i.test(allText) ? "ecommerce" :
    /dashboard|analytics|metric|chart|admin/i.test(allText) ? "dashboard" :
    /blog|article|post|writing|cms/i.test(allText) ? "blog" :
    /portfolio|resume|personal|showcase/i.test(allText) ? "portfolio" :
    /saas|subscription|pricing|tier|plan/i.test(allText) ? "saas" :
    /social|feed|profile|follow|comment|like/i.test(allText) ? "social" :
    "general";

  return {
    topics: extractTopics(allText),
    lastUserMessage: userMessages[userMessages.length - 1] || "",
    messageCount: userMessages.length,
    hasAskedAboutDesign: /design|style|color|theme|look|ui|ux|beautiful/i.test(allText),
    hasAskedAboutBugs: /bug|fix|error|broken|issue|problem/i.test(allText),
    projectType,
  };
}

function extractTopics(text: string): string[] {
  const topics: string[] = [];
  const patterns: [RegExp, string][] = [
    [/landing.?page|hero|cta/, "landing-page"],
    [/auth|login|signup/, "authentication"],
    [/form|contact|input/, "forms"],
    [/responsive|mobile/, "responsive"],
    [/animation|motion|transition/, "animations"],
    [/dark.?mode|theme/, "theming"],
    [/api|backend|data/, "api-integration"],
    [/seo|meta|og:/, "seo"],
    [/payment|stripe|billing/, "payments"],
    [/notification|toast|alert/, "notifications"],
    [/testing|test|spec/, "testing"],
  ];
  for (const [rx, topic] of patterns) {
    if (rx.test(text)) topics.push(topic);
  }
  return topics;
}

// ─── Suggestion generator ───────────────────────────────────────────────────

const ALL_SUGGESTIONS: Array<SmartSuggestion & { 
  requires?: (f: DetectedFeatures, c: ChatContext) => boolean;
  priority?: number;
}> = [
  // Missing essential features
  { label: "Add navigation", prompt: "Add a responsive navigation bar with logo, menu links, and a mobile hamburger menu", icon: "🧭",
    requires: (f) => !f.hasNavbar && f.framework !== "unknown", priority: 10 },
  { label: "Add footer", prompt: "Add a professional footer with links, social icons, and copyright", icon: "📋",
    requires: (f) => !f.hasFooter && f.hasNavbar, priority: 8 },
  { label: "Add auth", prompt: "Add a login and signup page with form validation and protected routes", icon: "🔐",
    requires: (f) => !f.hasAuth, priority: 9 },
  { label: "Make responsive", prompt: "Make the entire app fully responsive for mobile, tablet, and desktop", icon: "📱",
    requires: (f) => !f.hasMobileMenu && f.hasNavbar, priority: 9 },
  { label: "Add dark mode", prompt: "Add a dark mode toggle with smooth transitions and persistent preference", icon: "🌙",
    requires: (f) => !f.hasDarkMode, priority: 7 },
  { label: "Add animations", prompt: "Add smooth entrance animations, hover effects, and micro-interactions using Framer Motion", icon: "✨",
    requires: (f) => !f.hasAnimations, priority: 6 },

  // Project-type specific
  { label: "Add product grid", prompt: "Add a product listing grid with images, prices, and Add to Cart buttons", icon: "🛍️",
    requires: (_, c) => c.projectType === "ecommerce" && !_.hasCart, priority: 10 },
  { label: "Add checkout", prompt: "Add a checkout flow with cart summary, shipping form, and order confirmation", icon: "💳",
    requires: (f, c) => c.projectType === "ecommerce" && f.hasCart, priority: 10 },
  { label: "Add charts", prompt: "Add data visualization with bar charts, line charts, and summary stat cards using Recharts", icon: "📊",
    requires: (f, c) => c.projectType === "dashboard" && !f.hasCharts, priority: 10 },
  { label: "Add data table", prompt: "Add a sortable, filterable data table with pagination", icon: "📋",
    requires: (f, c) => c.projectType === "dashboard" && !f.hasTable, priority: 9 },
  { label: "Add blog posts", prompt: "Add a blog post listing page with article cards, tags, and a reading view", icon: "📝",
    requires: (_, c) => c.projectType === "blog", priority: 10 },
  { label: "Add pricing page", prompt: "Add a pricing page with 3 tiers, feature comparison, and CTA buttons", icon: "💰",
    requires: (_, c) => c.projectType === "saas", priority: 10 },
  { label: "Add user feed", prompt: "Add a social feed with posts, likes, and comments", icon: "📰",
    requires: (_, c) => c.projectType === "social", priority: 10 },
  { label: "Add project gallery", prompt: "Add a project showcase gallery with filtering, hover effects, and detail modals", icon: "🖼️",
    requires: (_, c) => c.projectType === "portfolio", priority: 10 },

  // Enhancement suggestions
  { label: "Add search", prompt: "Add a search bar with real-time filtering and highlighted results", icon: "🔍",
    requires: (f) => !f.hasSearch && (f.hasTable || f.hasCRUD), priority: 7 },
  { label: "Add notifications", prompt: "Add a toast notification system for success, error, and info messages", icon: "🔔",
    requires: (f) => !f.hasModals && f.hasForms, priority: 6 },
  { label: "Improve design", prompt: "Improve the overall design — better colors, spacing, typography, and visual hierarchy", icon: "🎨",
    priority: 5 },
  { label: "Add loading states", prompt: "Add skeleton loaders, spinners, and error states throughout the app", icon: "⏳",
    requires: (f) => f.hasAPI || f.hasCRUD, priority: 6 },
  { label: "Fix bugs", prompt: "Review the current app for any bugs or issues and fix them", icon: "🐛",
    requires: (_, c) => c.hasAskedAboutBugs || c.messageCount > 5, priority: 5 },
  { label: "Add SEO", prompt: "Add proper meta tags, Open Graph tags, semantic HTML, and JSON-LD structured data", icon: "🏷️",
    requires: (f) => f.framework === "html", priority: 4 },
  { label: "Add pagination", prompt: "Add pagination or infinite scroll to lists and tables", icon: "📄",
    requires: (f) => !f.hasPagination && (f.hasTable || f.hasCRUD), priority: 5 },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate smart suggestions based on project code + chat history.
 * Returns 4 suggestions sorted by relevance.
 */
export function generateSmartSuggestions(
  code: string,
  chatMessages: Array<{ role: string; content: string }>,
  maxSuggestions = 4
): SmartSuggestion[] {
  // Empty project — return starter suggestions
  if (!code && chatMessages.length === 0) {
    return [
      { label: "Landing page", prompt: "Build a modern landing page with hero section, features grid, testimonials, and CTA", icon: "🚀" },
      { label: "Dashboard", prompt: "Build a data dashboard with sidebar navigation, charts, and summary cards", icon: "📊" },
      { label: "E-commerce", prompt: "Build a modern product listing with shopping cart and checkout", icon: "🛒" },
      { label: "Portfolio", prompt: "Build a personal portfolio with project showcase, about section, and contact form", icon: "🎨" },
    ];
  }

  const features = detectFeatures(code);
  const chatContext = analyzeChatHistory(chatMessages);

  // Score and filter suggestions
  const scored = ALL_SUGGESTIONS
    .filter(s => {
      if (s.requires) return s.requires(features, chatContext);
      return true;
    })
    .map(s => ({
      label: s.label,
      prompt: s.prompt,
      icon: s.icon,
      score: s.priority || 5,
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSuggestions);
}
