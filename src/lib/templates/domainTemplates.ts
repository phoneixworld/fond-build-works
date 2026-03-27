/**
 * Domain Template Loader
 * 
 * Imports and registers all domain templates into the registry.
 */

// Business templates
import "./domains/invoice";
import "./domains/inventory";
import "./domains/hr";
import "./domains/pos";

// Dashboard templates
import "./domains/analytics";

// Productivity templates
import "./domains/kanban";

// CRM templates
import "./domains/crm";

// Re-export registry API
export {
  getTemplate,
  getAllTemplates,
  getTemplatesByCategory,
  matchTemplate,
  hydrateTemplateFiles,
  getRegistryStats,
  registerTemplate,
  TEMPLATE_CSS,
  generateSidebar,
  generateHeader,
  generateStatsCards,
  generateDataTable,
} from "./templateRegistry";

export type {
  DomainTemplate,
  TemplateCategory,
  TemplateMatch,
} from "./templateRegistry";
