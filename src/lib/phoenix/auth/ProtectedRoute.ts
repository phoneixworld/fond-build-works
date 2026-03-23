/**
 * ProtectedRoute — Canonical route guard template.
 * 
 * RULES:
 * - ALWAYS use useSession hook for auth state
 * - ALWAYS redirect to /login (not /auth)
 * - NEVER check localStorage for auth
 * - NEVER use hardcoded credentials
 */

export const PROTECTED_ROUTE_TEMPLATE = `import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../hooks/useSession";

export function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user?.app_metadata?.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
`;

export const PROTECTED_ROUTE_WITH_ROLES_TEMPLATE = `import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useUserRole } from "../hooks/useUserRole";

export function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, loading: authLoading } = useSession();
  const { role, loading: roleLoading } = useUserRole();
  const location = useLocation();

  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && role !== requiredRole && role !== "admin") {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
`;

export function generateProtectedRoute(options?: { withRoles?: boolean }): string {
  return options?.withRoles
    ? PROTECTED_ROUTE_WITH_ROLES_TEMPLATE
    : PROTECTED_ROUTE_TEMPLATE;
}
