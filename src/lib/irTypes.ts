/**
 * IR-Native Development — Intermediate Representation Types
 * 
 * The IR is the structured intent layer between the user and code generation.
 * Users edit the IR; the system regenerates code deterministically from it.
 */

// ─── Route IR ─────────────────────────────────────────────────────────────

export interface IRRoute {
  id: string;
  path: string;
  label: string;
  icon?: string;           // lucide icon name
  component?: string;      // component file path
  layout?: string;         // layout wrapper
  isProtected: boolean;    // requires auth
  children?: IRRoute[];    // nested routes
  description?: string;    // intent description for LLM
}

// ─── Auth Rule IR ─────────────────────────────────────────────────────────

export interface IRRole {
  id: string;
  name: string;
  description: string;
}

export interface IRPermission {
  id: string;
  roleId: string;
  resource: string;        // collection name or route path
  actions: ("create" | "read" | "update" | "delete")[];
}

export interface IRAuthConfig {
  enabled: boolean;
  provider: "email" | "email+social";
  requireEmailVerification: boolean;
  roles: IRRole[];
  permissions: IRPermission[];
  publicRoutes: string[];  // route paths accessible without auth
}

// ─── Data Model IR (mirrors project_schemas but richer) ───────────────────

export interface IRFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface IRField {
  name: string;
  type: "text" | "number" | "boolean" | "date" | "json" | "email" | "url" | "select" | "relation";
  required: boolean;
  defaultValue?: string;
  validation?: IRFieldValidation;
  options?: string[];       // for select type
  relationTo?: string;      // for relation type — collection name
  displayInList?: boolean;  // show in list/table view
  searchable?: boolean;
}

export interface IRDataModel {
  id: string;
  collectionName: string;
  description: string;
  fields: IRField[];
  timestamps: boolean;      // auto created_at/updated_at
  softDelete: boolean;       // add deleted_at field
  defaultSort?: { field: string; direction: "asc" | "desc" };
}

// ─── Top-level IR State ──────────────────────────────────────────────────

export interface IRState {
  version: number;          // IR schema version for migrations
  routes: IRRoute[];
  dataModels: IRDataModel[];
  auth: IRAuthConfig;
  metadata?: {
    appName?: string;
    description?: string;
    theme?: string;
    lastRebuilt?: string;
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_IR_STATE: IRState = {
  version: 1,
  routes: [
    {
      id: "route-dashboard",
      path: "/",
      label: "Dashboard",
      icon: "LayoutDashboard",
      isProtected: false,
      description: "Main dashboard with KPI cards and overview charts",
    },
  ],
  dataModels: [],
  auth: {
    enabled: false,
    provider: "email",
    requireEmailVerification: false,
    roles: [],
    permissions: [],
    publicRoutes: ["/"],
  },
};

export function createRouteId(): string {
  return `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createModelId(): string {
  return `model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createPermissionId(): string {
  return `perm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
