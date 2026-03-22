/**
 * BSAG (Build Similar App Generator)
 * 
 * Takes an AUM (App Understanding Model) from any source and generates
 * a requirements prompt that feeds into the existing build pipeline.
 * 
 * BSAG doesn't care where the AUM came from — it just reads it,
 * maps features to templates, and produces build instructions.
 */

import type { AppUnderstandingModel, AppType } from "../wpa/aum";

// ─── Template Mapping ──────────────────────────────────────────────────────

const APP_TYPE_TO_TEMPLATE: Record<AppType, string> = {
  "landing-page": "saas-landing",
  "dashboard": "dashboard",
  "ecommerce": "ecommerce",
  "blog-cms": "blog-cms",
  "crm": "crm",
  "project-management": "project-mgmt",
  "chat-app": "chat-app",
  "portfolio": "portfolio",
  "admin-panel": "dashboard",
  "social-network": "chat-app",
  "marketplace": "ecommerce",
  "saas": "saas-landing",
  "documentation": "blog-cms",
  "form-builder": "dashboard",
  "unknown": "saas-landing",
};

/**
 * Generate a structured build prompt from an AUM.
 * This prompt is fed directly into the build pipeline.
 */
export function generateBuildPromptFromAUM(aum: AppUnderstandingModel): string {
  const lines: string[] = [];

  // App overview
  lines.push(`Build a ${aum.appType.replace(/-/g, " ")} application called "${aum.appName}".`);
  if (aum.appDescription) {
    lines.push(`Description: ${aum.appDescription.slice(0, 300)}`);
  }
  lines.push("");

  // Layout
  const layoutParts: string[] = [];
  if (aum.layout.hasNavbar) layoutParts.push("a top navigation bar");
  if (aum.layout.hasSidebar) layoutParts.push("a sidebar with navigation links");
  if (aum.layout.hasHero) layoutParts.push("a hero section");
  if (aum.layout.hasFooter) layoutParts.push("a footer");
  if (aum.layout.hasDashboard) layoutParts.push("a dashboard with stat cards and charts");
  if (layoutParts.length) {
    lines.push(`Layout: Include ${layoutParts.join(", ")}.`);
  }

  // Navigation
  if (aum.navigation.items.length > 0) {
    const navItems = aum.navigation.items.map((i) => i.label).join(", ");
    lines.push(`Navigation (${aum.navigation.type}): ${navItems}`);
  }

  // Features
  const mustHave = aum.features.filter((f) => f.priority === "must-have");
  if (mustHave.length > 0) {
    lines.push("");
    lines.push("Required Features:");
    for (const f of mustHave) {
      lines.push(`- ${f.name}: ${f.description}`);
    }
  }

  // Components
  if (aum.components.length > 0) {
    lines.push("");
    lines.push("UI Components needed:");
    for (const c of aum.components) {
      lines.push(`- ${c.type}${c.label ? ` (${c.label})` : ""}`);
    }
  }

  // Forms
  if (aum.forms.length > 0) {
    lines.push("");
    lines.push("Forms:");
    for (const form of aum.forms) {
      const fields = form.fields.map((f) => `${f.name} (${f.type})`).join(", ");
      lines.push(`- ${form.name}: ${fields}`);
    }
  }

  // CTAs
  if (aum.ctas.length > 0) {
    lines.push("");
    lines.push(`Call-to-Action buttons: ${aum.ctas.map((c) => `"${c.text}"`).join(", ")}`);
  }

  // Pricing
  if (aum.pricing && aum.pricing.tiers.length > 0) {
    lines.push("");
    lines.push("Include a pricing section with these tiers:");
    for (const tier of aum.pricing.tiers) {
      lines.push(`- ${tier.name}${tier.price ? ` (${tier.price})` : ""}`);
    }
  }

  // Flows
  if (aum.flows.length > 0) {
    lines.push("");
    lines.push("User Flows:");
    for (const flow of aum.flows) {
      lines.push(`- ${flow.name}: ${flow.steps.join(" → ")}`);
    }
  }

  // Style
  lines.push("");
  lines.push("Make it visually polished with modern design, hover effects, and responsive layout.");

  return lines.join("\n");
}

/**
 * Get the best matching template ID for an AUM.
 */
export function getTemplateForAUM(aum: AppUnderstandingModel): string {
  return APP_TYPE_TO_TEMPLATE[aum.appType] || "saas-landing";
}

/**
 * Generate the confirmation message shown to users before building.
 */
export function generateConfirmationMessage(aum: AppUnderstandingModel): string {
  const featureCount = aum.features.length;
  const componentCount = aum.components.length;

  let msg = `I analyzed this ${aum.sourceType === "url" ? "website" : aum.sourceType === "image" ? "screenshot" : "document"}.\n\n`;
  msg += `**Detected:** ${aum.appType.replace(/-/g, " ")} application`;
  if (aum.appName && aum.appName !== "Untitled App") {
    msg += ` — "${aum.appName}"`;
  }
  msg += "\n";

  if (featureCount > 0) {
    msg += `**Features:** ${featureCount} detected (${aum.features.slice(0, 3).map((f) => f.name).join(", ")}${featureCount > 3 ? "…" : ""})\n`;
  }
  if (componentCount > 0) {
    msg += `**Components:** ${componentCount} UI elements detected\n`;
  }
  if (aum.navigation.items.length > 0) {
    msg += `**Navigation:** ${aum.navigation.type} with ${aum.navigation.items.length} items\n`;
  }

  msg += `\nDo you want me to build a similar application inside your project?`;

  return msg;
}
