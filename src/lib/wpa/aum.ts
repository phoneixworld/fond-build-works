/**
 * AUM (App Understanding Model) — Unified output from WPA+
 * 
 * A single structured model that represents complete understanding of any
 * analyzed source (URL, PDF, DOCX, image), used by BSAG to generate apps.
 */

import type { UFMSourceType } from "../ufm/types";

export type AppType =
  | "landing-page"
  | "dashboard"
  | "ecommerce"
  | "blog-cms"
  | "crm"
  | "project-management"
  | "chat-app"
  | "portfolio"
  | "admin-panel"
  | "social-network"
  | "marketplace"
  | "saas"
  | "documentation"
  | "form-builder"
  | "unknown";

export interface AUMFeature {
  name: string;
  description: string;
  priority: "must-have" | "nice-to-have" | "optional";
  category: "auth" | "data" | "ui" | "integration" | "navigation" | "communication" | "analytics" | "other";
}

export interface AUMFlow {
  name: string;
  steps: string[];
  entryPoint: string;
}

export interface AUMComponent {
  type: string;
  label?: string;
  count?: number;
  props?: Record<string, string>;
}

export interface AUMNavigation {
  type: "sidebar" | "topnav" | "tabs" | "drawer" | "bottom-nav" | "none";
  items: Array<{ label: string; path?: string }>;
}

export interface AUMForm {
  name: string;
  fields: Array<{ name: string; type: string; required?: boolean }>;
  action?: string;
}

export interface AUMCTA {
  text: string;
  type: "primary" | "secondary";
  action?: string;
}

export interface AUMPricing {
  tiers: Array<{
    name: string;
    price?: string;
    features: string[];
  }>;
}

export interface AUMIntegration {
  name: string;
  type: string;
  description?: string;
}

export interface AUMTechHint {
  name: string;
  confidence: "high" | "medium" | "low";
}

export interface AppUnderstandingModel {
  /** Source type that produced this AUM */
  sourceType: UFMSourceType;
  /** Original source (URL, filename, etc.) */
  sourceRef: string;

  /** App-level understanding */
  appType: AppType;
  appName: string;
  appDescription: string;

  /** Detected features */
  features: AUMFeature[];

  /** User flows */
  flows: AUMFlow[];

  /** UI components detected */
  components: AUMComponent[];

  /** Navigation structure */
  navigation: AUMNavigation;

  /** Forms detected */
  forms: AUMForm[];

  /** CTAs detected */
  ctas: AUMCTA[];

  /** Pricing (if detected) */
  pricing?: AUMPricing;

  /** Third-party integrations */
  integrations: AUMIntegration[];

  /** Tech stack hints */
  techHints: AUMTechHint[];

  /** Layout information */
  layout: {
    hasNavbar: boolean;
    hasSidebar: boolean;
    hasFooter: boolean;
    hasHero: boolean;
    hasDashboard: boolean;
    pageCount: number;
    sections: string[];
  };

  /** Confidence score 0-1 */
  confidence: number;

  /** Raw analysis text for debugging */
  rawAnalysis: string;
}
