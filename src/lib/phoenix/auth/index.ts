/**
 * Phoenix Auth Templates — Canonical Index
 * 
 * All generated auth code MUST import from this module.
 * Provides: client factory, session helpers, role helpers, auth guards.
 */

export { createSupabaseClient, getSupabaseClient } from "./auth.client";
export { getSession, requireAuth, onAuthStateChange } from "./useSession";
export { ProtectedRoute } from "./ProtectedRoute";
export { hasRole, requireRole, type AppRole } from "./roles";
export type { AuthUser, AuthSession } from "./types";
