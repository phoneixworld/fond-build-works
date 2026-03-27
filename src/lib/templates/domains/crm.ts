/**
 * CRM (Customer Relationship Management) Template
 * 
 * Full-featured CRM with sidebar navigation, deal pipeline (Kanban),
 * contacts table, analytics charts, activity feed, and deal creation modal.
 * Uses framer-motion animations and recharts for data visualization.
 */

import { registerTemplate } from "../templateRegistry";

// We import the CRM instant template files directly since they're production-grade
import { CRM as CRM_INSTANT } from "../../instantTemplates/crm";

// Extract all the component files from the instant template
const CRM_FILES = { ...CRM_INSTANT.files };

// The CRM instant template uses its own CSS variables scheme in /styles/globals.css
// which is already included in the files

registerTemplate({
  id: "crm",
  name: "CRM Dashboard",
  category: "business",
  keywords: [
    "crm", "customer", "relationship", "management",
    "sales", "deals", "pipeline", "contacts",
    "leads", "prospects", "revenue", "funnel",
    "sales-crm", "customer-management", "deal-tracker",
    "sales-pipeline", "lead-management", "client",
  ],
  description: "Full-featured CRM with deal pipeline, contacts management, analytics, and activity tracking",
  variables: ["APP_NAME"],
  deps: {
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
    "recharts": "^2.15.0",
  },
  files: CRM_FILES,
});
