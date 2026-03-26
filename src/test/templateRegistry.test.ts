/**
 * Template Registry Tests
 */

import { describe, it, expect, beforeEach } from "vitest";

// Import the loader which registers all templates
import {
  getAllTemplates,
  getTemplate,
  getTemplatesByCategory,
  matchTemplate,
  hydrateTemplateFiles,
  getRegistryStats,
} from "../lib/templates/domainTemplates";

describe("Template Registry", () => {
  it("should have templates registered", () => {
    const templates = getAllTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(6);
  });

  it("should get template by id", () => {
    const invoice = getTemplate("invoice");
    expect(invoice).toBeDefined();
    expect(invoice!.name).toBe("Invoice & Billing");
    expect(invoice!.category).toBe("business");
  });

  it("should filter by category", () => {
    const business = getTemplatesByCategory("business");
    expect(business.length).toBeGreaterThanOrEqual(3); // invoice, inventory, hr, pos
  });

  it("should match templates by keywords", () => {
    const match = matchTemplate("I want to build an invoice management app");
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("invoice");
    expect(match!.score).toBeGreaterThan(0);
  });

  it("should match kanban for project management queries", () => {
    const match = matchTemplate("create a kanban board for task management");
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("kanban");
  });

  it("should match POS for restaurant queries", () => {
    const match = matchTemplate("build a point of sale system for my restaurant");
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("pos");
  });

  it("should match analytics for dashboard queries", () => {
    const match = matchTemplate("I need a web analytics dashboard");
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("analytics-dashboard");
  });

  it("should match HR for employee queries", () => {
    const match = matchTemplate("build an employee management system");
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("hr");
  });

  it("should hydrate template variables", () => {
    const template = getTemplate("invoice")!;
    const hydrated = hydrateTemplateFiles(template, { APP_NAME: "MyInvoices" });
    const appFile = hydrated["/App.jsx"];
    expect(appFile).not.toContain("{{APP_NAME}}");
  });

  it("should provide registry stats", () => {
    const stats = getRegistryStats();
    expect(stats.total).toBeGreaterThanOrEqual(6);
    expect(Object.keys(stats.byCategory).length).toBeGreaterThanOrEqual(3);
  });

  it("all templates should have required files", () => {
    const templates = getAllTemplates();
    for (const t of templates) {
      expect(Object.keys(t.files).length).toBeGreaterThanOrEqual(2);
      expect(t.files["/App.jsx"]).toBeDefined();
      expect(t.keywords.length).toBeGreaterThanOrEqual(2);
      expect(t.deps).toBeDefined();
    }
  });

  it("template files should contain valid JSX", () => {
    const templates = getAllTemplates();
    for (const t of templates) {
      for (const [path, code] of Object.entries(t.files)) {
        if (path.endsWith(".jsx")) {
          // Basic validation: should have export default or export
          expect(code).toMatch(/export\s+default|export\s+function/);
          // Should not have {{}} remaining (unhhydrated)
          // Note: APP_NAME is expected to remain until hydration
          const nonAppName = code.replace(/\{\{APP_NAME\}\}/g, "");
          expect(nonAppName).not.toMatch(/\{\{[A-Z_]+\}\}/);
        }
      }
    }
  });
});
