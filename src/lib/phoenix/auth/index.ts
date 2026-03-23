/**
 * Phoenix Auth Templates — Canonical Index
 * 
 * All auth template generation MUST use these exports.
 * These are TEMPLATE generators, not runtime auth code.
 */

// Template generators
export { generateAuthClient, AUTH_CLIENT_TEMPLATE } from "./auth.client";
export { generateUseSession, USE_SESSION_TEMPLATE } from "./useSession";
export { generateProtectedRoute, PROTECTED_ROUTE_TEMPLATE, PROTECTED_ROUTE_WITH_ROLES_TEMPLATE } from "./ProtectedRoute";
export { hasRole, requireRole, ROLE_MIGRATION_TEMPLATE, USE_USER_ROLE_TEMPLATE } from "./roles";
export type { AppRole } from "./roles";
export type { AuthUser, AuthSession } from "./types";

// Page templates
export { LOGIN_PAGE_TEMPLATE, SIGNUP_PAGE_TEMPLATE, LOGOUT_TEMPLATE, AUTH_CONTEXT_TEMPLATE } from "./pages";

// Variant system
export { detectAuthVariant, generateAuthTemplateSet } from "./variants";
export type { AuthVariant, AuthTemplateSet } from "./variants";
