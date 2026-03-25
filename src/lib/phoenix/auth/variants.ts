/**
 * Auth Template Variants — Selectable by planner based on user intent.
 * 
 * Variants:
 * - email-password: Standard email/password auth (default)
 * - role-based: Email/password + user_roles table + role guards
 * - social: OAuth providers (future)
 */

import { AUTH_CLIENT_TEMPLATE } from "./auth.client";
import { USE_SESSION_TEMPLATE } from "./useSession";
import { PROTECTED_ROUTE_TEMPLATE, PROTECTED_ROUTE_WITH_ROLES_TEMPLATE } from "./ProtectedRoute";
import { LOGIN_PAGE_TEMPLATE, SIGNUP_PAGE_TEMPLATE, LOGOUT_TEMPLATE, AUTH_CONTEXT_TEMPLATE } from "./pages";
import { ROLE_MIGRATION_TEMPLATE, USE_USER_ROLE_TEMPLATE } from "./roles";

export type AuthVariant = "email-password" | "role-based" | "social";

export interface AuthTemplateSet {
  variant: AuthVariant;
  files: Record<string, string>;
  migrations: string[];
  description: string;
}

/**
 * Detect which auth variant the user needs based on their prompt.
 */
export function detectAuthVariant(prompt: string): AuthVariant {
  const lower = prompt.toLowerCase();

  if (
    lower.includes("role") ||
    lower.includes("admin") ||
    lower.includes("moderator") ||
    lower.includes("permission") ||
    lower.includes("access control") ||
    lower.includes("rbac")
  ) {
    return "role-based";
  }

  if (
    lower.includes("google") ||
    lower.includes("github") ||
    lower.includes("oauth") ||
    lower.includes("social")
  ) {
    return "social";
  }

  return "email-password";
}

/**
 * Generate the full auth template set for a given variant.
 */
export function generateAuthTemplateSet(variant: AuthVariant): AuthTemplateSet {
  switch (variant) {
    case "role-based":
      return generateRoleBasedAuth();
    case "social":
      return generateSocialAuth();
    case "email-password":
    default:
      return generateEmailPasswordAuth();
  }
}

function generateEmailPasswordAuth(): AuthTemplateSet {
  return {
    variant: "email-password",
    description: "Standard email/password authentication with Supabase Auth",
    migrations: [],
    files: {
      "/auth/auth.client.ts": AUTH_CLIENT_TEMPLATE,
      "/hooks/useSession.ts": USE_SESSION_TEMPLATE,
      "/components/ProtectedRoute.tsx": PROTECTED_ROUTE_TEMPLATE,
      "/pages/LoginPage.tsx": LOGIN_PAGE_TEMPLATE,
      "/pages/SignupPage.tsx": SIGNUP_PAGE_TEMPLATE,
      "/utils/logout.ts": LOGOUT_TEMPLATE,
      "/contexts/AuthContext.tsx": AUTH_CONTEXT_TEMPLATE,
    },
  };
}

function generateRoleBasedAuth(): AuthTemplateSet {
  return {
    variant: "role-based",
    description: "Email/password auth + role-based access control (admin, moderator, user)",
    migrations: [ROLE_MIGRATION_TEMPLATE],
    files: {
      "/auth/auth.client.ts": AUTH_CLIENT_TEMPLATE,
      "/hooks/useSession.ts": USE_SESSION_TEMPLATE,
      "/hooks/useUserRole.ts": USE_USER_ROLE_TEMPLATE,
      "/components/ProtectedRoute.tsx": PROTECTED_ROUTE_WITH_ROLES_TEMPLATE,
      "/pages/LoginPage.tsx": LOGIN_PAGE_TEMPLATE,
      "/pages/SignupPage.tsx": SIGNUP_PAGE_TEMPLATE,
      "/utils/logout.ts": LOGOUT_TEMPLATE,
      "/contexts/AuthContext.tsx": AUTH_CONTEXT_TEMPLATE,
      "/migrations/003_roles.sql": ROLE_MIGRATION_TEMPLATE,
    },
  };
}

function generateSocialAuth(): AuthTemplateSet {
  // Social auth placeholder — uses email-password base + note about OAuth
  const base = generateEmailPasswordAuth();
  return {
    ...base,
    variant: "social",
    description: "Social auth (OAuth) — requires provider configuration. Falling back to email-password as base.",
  };
}
