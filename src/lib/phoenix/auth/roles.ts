/**
 * Role helpers — Canonical role management template.
 * 
 * RULES:
 * - ALWAYS store roles in a separate user_roles table
 * - NEVER store roles on the profile or users table
 * - ALWAYS use a security definer function to check roles (prevents RLS recursion)
 * - NEVER check admin status via localStorage or hardcoded credentials
 */

export type AppRole = "admin" | "moderator" | "user";

export const ROLE_MIGRATION_TEMPLATE = `-- Role system migration
CREATE TYPE IF NOT EXISTS public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to prevent RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS: users can read their own roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- RLS: only admins can manage roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Default: assign 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
`;

export const USE_USER_ROLE_TEMPLATE = `import { useState, useEffect } from "react";
import { getSupabaseClient } from "./auth.client";
import { useSession } from "./useSession";

export function useUserRole() {
  const { user } = useSession();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setRole(data.role);
        } else {
          setRole("user"); // Default
        }
        setLoading(false);
      });
  }, [user]);

  const isAdmin = role === "admin";
  const isModerator = role === "moderator" || role === "admin";

  return { role, loading, isAdmin, isModerator };
}
`;

/**
 * Check if a user has a given role (for use in templates).
 */
export function hasRole(role: string, requiredRole: AppRole): boolean {
  if (requiredRole === "user") return true;
  if (requiredRole === "moderator") return role === "moderator" || role === "admin";
  if (requiredRole === "admin") return role === "admin";
  return false;
}

/**
 * Assert role or throw (for use in templates).
 */
export function requireRole(role: string | null, requiredRole: AppRole): void {
  if (!role) throw new Error("Authentication required");
  if (!hasRole(role, requiredRole)) {
    throw new Error(`Role '${requiredRole}' required, got '${role}'`);
  }
}
