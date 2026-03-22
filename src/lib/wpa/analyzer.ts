/**
 * WPA+ (Universal Analyzer)
 * 
 * Analyzes UFMResult from any source type and produces a unified
 * App Understanding Model (AUM). Uses deterministic pattern matching
 * for client-side analysis and optionally AI for deeper analysis.
 */

import type { UFMResult } from "../ufm/types";
import type { AppUnderstandingModel, AppType, AUMFeature, AUMFlow, AUMComponent, AUMNavigation, AUMForm, AUMCTA, AUMIntegration, AUMTechHint } from "./aum";

export type { AppUnderstandingModel } from "./aum";

/**
 * Analyze a UFMResult and produce an App Understanding Model.
 * This is the deterministic (client-side) analyzer. For deeper analysis,
 * the AI-enhanced version should be used via an edge function.
 */
export function analyzeSource(ufm: UFMResult): AppUnderstandingModel {
  const appType = detectAppType(ufm);
  const features = detectFeatures(ufm);
  const flows = detectFlows(ufm);
  const components = mapComponents(ufm);
  const navigation = detectNavigation(ufm);
  const forms = detectForms(ufm);
  const ctas = detectCTAs(ufm);
  const integrations = detectIntegrations(ufm);
  const techHints = detectTechHints(ufm);

  return {
    sourceType: ufm.sourceType,
    sourceRef: ufm.title,
    appType,
    appName: ufm.title || "Untitled App",
    appDescription: ufm.meta.description || ufm.text.slice(0, 200),
    features,
    flows,
    components,
    navigation,
    forms,
    ctas,
    pricing: detectPricing(ufm),
    integrations,
    techHints,
    layout: {
      hasNavbar: ufm.layout.hasNavbar,
      hasSidebar: ufm.layout.hasSidebar,
      hasFooter: ufm.layout.hasFooter,
      hasHero: ufm.layout.hasHero,
      hasDashboard: ufm.layout.hasDashboard,
      pageCount: Math.max(1, ufm.headings.filter((h) => h.level === 1).length),
      sections: ufm.layout.sections,
    },
    confidence: calculateConfidence(ufm),
    rawAnalysis: ufm.raw.slice(0, 5000),
  };
}

// ─── App Type Detection ────────────────────────────────────────────────────

function detectAppType(ufm: UFMResult): AppType {
  const text = (ufm.text + " " + ufm.headings.map((h) => h.text).join(" ")).toLowerCase();

  const scores: Record<AppType, number> = {
    "landing-page": 0, dashboard: 0, ecommerce: 0, "blog-cms": 0, crm: 0,
    "project-management": 0, "chat-app": 0, portfolio: 0, "admin-panel": 0,
    "social-network": 0, marketplace: 0, saas: 0, documentation: 0, "form-builder": 0, unknown: 0,
  };

  // Landing page signals
  if (ufm.layout.hasHero) scores["landing-page"] += 3;
  if (/\b(pricing|plans?|subscribe|get started|sign up free)\b/i.test(text)) scores["landing-page"] += 2;
  if (/\b(testimonial|review|social proof)\b/i.test(text)) scores["landing-page"] += 2;

  // Dashboard signals
  if (ufm.layout.hasDashboard) scores["dashboard"] += 4;
  if (/\b(dashboard|analytics|metrics|kpi|stats|chart|graph)\b/i.test(text)) scores["dashboard"] += 3;
  if (ufm.layout.hasSidebar) scores["dashboard"] += 1;

  // E-commerce signals
  if (/\b(cart|checkout|add to cart|buy now|shop|product|price|order)\b/i.test(text)) scores["ecommerce"] += 3;
  if (/\b(\$\d+|\€\d+|USD|EUR)\b/i.test(text)) scores["ecommerce"] += 2;

  // Blog/CMS signals
  if (/\b(blog|article|post|author|publish|category|tag|read more)\b/i.test(text)) scores["blog-cms"] += 3;

  // CRM signals
  if (/\b(crm|contact|lead|deal|pipeline|customer|prospect|sales)\b/i.test(text)) scores["crm"] += 3;

  // Project management signals
  if (/\b(kanban|sprint|task|project|board|backlog|agile|scrum|ticket)\b/i.test(text)) scores["project-management"] += 3;

  // Chat app signals
  if (/\b(chat|message|conversation|inbox|dm|direct message)\b/i.test(text)) scores["chat-app"] += 3;

  // Portfolio signals
  if (/\b(portfolio|project gallery|my work|about me|hire me|freelanc)\b/i.test(text)) scores["portfolio"] += 3;

  // Admin panel signals
  if (/\b(admin|manage|users?|roles?|permissions?|settings?)\b/i.test(text) && ufm.layout.hasSidebar) scores["admin-panel"] += 3;

  // SaaS signals
  if (/\b(saas|subscription|api|integration|workflow|automat)\b/i.test(text)) scores["saas"] += 2;

  // Documentation signals
  if (/\b(docs?|documentation|api reference|guide|tutorial|getting started)\b/i.test(text)) scores["documentation"] += 3;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? (sorted[0][0] as AppType) : "unknown";
}

// ─── Feature Detection ─────────────────────────────────────────────────────

function detectFeatures(ufm: UFMResult): AUMFeature[] {
  const features: AUMFeature[] = [];
  const text = ufm.text.toLowerCase();

  const featurePatterns: [RegExp, string, string, AUMFeature["category"]][] = [
    [/\b(login|sign.?in|authentication|auth)\b/i, "Authentication", "User login and authentication system", "auth"],
    [/\b(sign.?up|register|create account)\b/i, "Registration", "User registration flow", "auth"],
    [/\b(dashboard|overview|stats)\b/i, "Dashboard", "Main dashboard with key metrics", "ui"],
    [/\b(search|filter|find)\b/i, "Search & Filter", "Search and filtering capabilities", "data"],
    [/\b(notification|alert|toast)\b/i, "Notifications", "User notification system", "communication"],
    [/\b(profile|account|settings)\b/i, "User Profile", "User profile management", "data"],
    [/\b(upload|import|attach)\b/i, "File Upload", "File upload functionality", "data"],
    [/\b(export|download|report)\b/i, "Data Export", "Export and reporting features", "data"],
    [/\b(chart|graph|analytics|visualization)\b/i, "Data Visualization", "Charts and data visualization", "analytics"],
    [/\b(table|list|grid|data.?grid)\b/i, "Data Tables", "Tabular data display", "ui"],
    [/\b(form|input|submit)\b/i, "Forms", "Form-based data entry", "ui"],
    [/\b(email|mail|send)\b/i, "Email", "Email functionality", "communication"],
    [/\b(payment|billing|invoice|stripe|checkout)\b/i, "Payments", "Payment processing", "integration"],
    [/\b(api|webhook|integration)\b/i, "API Integration", "Third-party API integration", "integration"],
    [/\b(dark mode|theme|appearance)\b/i, "Theming", "Theme and appearance customization", "ui"],
    [/\b(drag|drop|sortable|reorder)\b/i, "Drag & Drop", "Drag and drop interactions", "ui"],
    [/\b(real.?time|live|websocket)\b/i, "Real-time Updates", "Live data updates", "data"],
    [/\b(pagination|infinite scroll|load more)\b/i, "Pagination", "Data pagination", "ui"],
  ];

  for (const [pattern, name, description, category] of featurePatterns) {
    if (pattern.test(text)) {
      features.push({ name, description, priority: "must-have", category });
    }
  }

  return features;
}

// ─── Flow Detection ────────────────────────────────────────────────────────

function detectFlows(ufm: UFMResult): AUMFlow[] {
  const flows: AUMFlow[] = [];
  const text = ufm.text.toLowerCase();

  if (/\b(login|sign.?in)\b/i.test(text)) {
    flows.push({ name: "Authentication", steps: ["Enter credentials", "Validate", "Redirect to dashboard"], entryPoint: "/login" });
  }
  if (/\b(sign.?up|register)\b/i.test(text)) {
    flows.push({ name: "Registration", steps: ["Fill form", "Verify email", "Complete profile"], entryPoint: "/register" });
  }
  if (/\b(checkout|purchase|buy)\b/i.test(text)) {
    flows.push({ name: "Checkout", steps: ["Add to cart", "Review cart", "Enter payment", "Confirm order"], entryPoint: "/cart" });
  }
  if (/\b(create|add new|new item)\b/i.test(text)) {
    flows.push({ name: "Create Item", steps: ["Fill form", "Validate", "Save", "Show confirmation"], entryPoint: "/create" });
  }

  return flows;
}

// ─── Component Mapping ─────────────────────────────────────────────────────

function mapComponents(ufm: UFMResult): AUMComponent[] {
  return ufm.components.map((c) => ({
    type: c.type,
    label: c.label,
    count: 1,
  }));
}

// ─── Navigation Detection ──────────────────────────────────────────────────

function detectNavigation(ufm: UFMResult): AUMNavigation {
  const type = ufm.layout.hasSidebar ? "sidebar" : ufm.layout.hasNavbar ? "topnav" : "none";
  
  // Extract nav items from links
  const navItems = ufm.links
    .filter((l) => l.href.startsWith("/") || l.href.startsWith("#"))
    .slice(0, 10)
    .map((l) => ({ label: l.text || l.href, path: l.href }));

  return { type, items: navItems };
}

// ─── Form Detection ────────────────────────────────────────────────────────

function detectForms(ufm: UFMResult): AUMForm[] {
  const forms: AUMForm[] = [];
  const hasForm = ufm.components.some((c) => c.type === "form");
  
  if (hasForm || /\b(form|input|submit)\b/i.test(ufm.text)) {
    forms.push({
      name: "Main Form",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "email", type: "email", required: true },
      ],
    });
  }

  return forms;
}

// ─── CTA Detection ─────────────────────────────────────────────────────────

function detectCTAs(ufm: UFMResult): AUMCTA[] {
  const ctas: AUMCTA[] = [];
  const ctaPatterns = /\b(get started|sign up|try free|book demo|contact us|learn more|buy now|subscribe|start trial|join now)\b/gi;
  let match;
  while ((match = ctaPatterns.exec(ufm.text))) {
    ctas.push({ text: match[1], type: ctas.length === 0 ? "primary" : "secondary" });
  }
  return ctas.slice(0, 5);
}

// ─── Pricing Detection ────────────────────────────────────────────────────

function detectPricing(ufm: UFMResult) {
  if (!/\b(pricing|plans?|tiers?|free|pro|enterprise|premium)\b/i.test(ufm.text)) return undefined;

  const tiers: Array<{ name: string; price?: string; features: string[] }> = [];
  const tierNames = ufm.text.match(/\b(free|starter|basic|pro|professional|business|enterprise|premium)\b/gi);
  const prices = ufm.text.match(/\$\d+(?:\.\d{2})?(?:\/mo(?:nth)?)?/g);

  if (tierNames) {
    const unique = [...new Set(tierNames.map((t) => t.toLowerCase()))];
    unique.slice(0, 4).forEach((name, i) => {
      tiers.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        price: prices?.[i],
        features: [],
      });
    });
  }

  return tiers.length > 0 ? { tiers } : undefined;
}

// ─── Integration Detection ────────────────────────────────────────────────

function detectIntegrations(ufm: UFMResult): AUMIntegration[] {
  const integrations: AUMIntegration[] = [];
  const text = ufm.text.toLowerCase();

  const integrationPatterns: [RegExp, string, string][] = [
    [/\b(stripe|payment)\b/i, "Stripe", "payment"],
    [/\b(google|firebase)\b/i, "Google", "auth"],
    [/\b(slack)\b/i, "Slack", "communication"],
    [/\b(github)\b/i, "GitHub", "integration"],
    [/\b(aws|amazon)\b/i, "AWS", "cloud"],
    [/\b(twilio)\b/i, "Twilio", "communication"],
    [/\b(sendgrid|mailgun)\b/i, "Email Service", "email"],
    [/\b(openai|ai|gpt)\b/i, "AI/ML", "ai"],
  ];

  for (const [pattern, name, type] of integrationPatterns) {
    if (pattern.test(text)) {
      integrations.push({ name, type });
    }
  }

  return integrations;
}

// ─── Tech Hint Detection ──────────────────────────────────────────────────

function detectTechHints(ufm: UFMResult): AUMTechHint[] {
  const hints: AUMTechHint[] = [];
  const text = (ufm.text + " " + ufm.raw).toLowerCase();

  const techPatterns: [RegExp, string, AUMTechHint["confidence"]][] = [
    [/\breact\b/i, "React", "high"],
    [/\bvue\b/i, "Vue", "high"],
    [/\bangular\b/i, "Angular", "high"],
    [/\bnext\.?js\b/i, "Next.js", "high"],
    [/\btailwind\b/i, "Tailwind CSS", "high"],
    [/\bbootstrap\b/i, "Bootstrap", "high"],
    [/\btypescript\b/i, "TypeScript", "medium"],
    [/\bnode\.?js\b/i, "Node.js", "medium"],
    [/\bpython\b/i, "Python", "medium"],
    [/\bsupabase\b/i, "Supabase", "high"],
    [/\bfirebase\b/i, "Firebase", "high"],
    [/\bpostgres\b/i, "PostgreSQL", "medium"],
    [/\bmongodb\b/i, "MongoDB", "medium"],
    [/\bgraphql\b/i, "GraphQL", "medium"],
  ];

  for (const [pattern, name, confidence] of techPatterns) {
    if (pattern.test(text)) {
      hints.push({ name, confidence });
    }
  }

  return hints;
}

// ─── Confidence Scoring ───────────────────────────────────────────────────

function calculateConfidence(ufm: UFMResult): number {
  let score = 0.3; // base

  if (ufm.title) score += 0.1;
  if (ufm.headings.length > 0) score += 0.1;
  if (ufm.text.length > 200) score += 0.1;
  if (ufm.components.length > 0) score += 0.1;
  if (ufm.links.length > 0) score += 0.05;
  if (ufm.images.length > 0) score += 0.05;
  if (ufm.layout.hasNavbar || ufm.layout.hasSidebar) score += 0.1;
  if (ufm.tables.length > 0) score += 0.05;

  return Math.min(1, score);
}
