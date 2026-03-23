// src/lib/ir.ts

export type FieldType = "string" | "number" | "boolean" | "date" | "relation";

export interface IREntityField {
  type: FieldType;
  required?: boolean;
  relation?: { entity: string; type: "one" | "many" };
}

export interface IREntity {
  fields: Record<string, IREntityField>;
  flows: Array<"list" | "view" | "create" | "edit" | "delete" | string>;
  /** Optional module grouping (e.g., "Academic", "Clinical", "Admin") */
  module?: string;
}

export interface IRPage {
  name: string;
  type: "list" | "view" | "edit" | "create" | "dashboard" | "custom";
  entity?: string;
  path: string;
  /** Optional module grouping for sidebar sections */
  module?: string;
  /** Which roles can access this page (empty = all roles) */
  allowedRoles?: string[];
}

export interface IRNavItem {
  label: string;
  path: string;
  icon?: string;
  /** Optional module grouping for sidebar sections */
  module?: string;
  /** Nested children for grouped navigation */
  children?: IRNavItem[];
}

export interface IRContext {
  name: string;
  provides: string[];
}

/**
 * Role definition for role-based access control.
 * Complex FRDs (medical, ERP, education) require multiple roles.
 */
export interface IRRole {
  name: string;
  label: string;
  /** Which pages/entities this role can access */
  permissions: string[];
  /** Dashboard page name for this role (if role-specific) */
  dashboardPage?: string;
}

/**
 * Workflow definition for multi-step processes.
 * E.g., "Log Entry → Faculty Review → Competency Assessment"
 */
export interface IRWorkflow {
  name: string;
  /** Ordered steps in the workflow */
  steps: Array<{
    name: string;
    entity?: string;
    action: "create" | "review" | "approve" | "reject" | "notify" | "custom";
    assignedRole?: string;
  }>;
}

/**
 * Module grouping for organizing large applications.
 * E.g., "Academic Management", "Clinical Training", "Reports"
 */
export interface IRModule {
  name: string;
  label: string;
  icon?: string;
  /** Entity names belonging to this module */
  entities: string[];
  /** Page names belonging to this module */
  pages: string[];
}

export interface IR {
  entities: Record<string, IREntity>;
  pages: IRPage[];
  navigation: IRNavItem[];
  components: string[];
  contexts: IRContext[];
  mockApi: Record<string, {
    list: string;
    create: string;
    update: string;
    delete: string;
  }>;
  backend?: {
    provider: "supabase" | "none";
    config?: any;
  };
  /** Role definitions for RBAC (optional — only for complex apps) */
  roles?: IRRole[];
  /** Workflow definitions (optional — only for process-driven apps) */
  workflows?: IRWorkflow[];
  /** Module groupings (optional — only for large multi-module apps) */
  modules?: IRModule[];
}
