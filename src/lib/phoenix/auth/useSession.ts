/**
 * useSession — Canonical session hook template for generated projects.
 * 
 * RULES:
 * - ALWAYS use supabase.auth.onAuthStateChange for reactive session
 * - ALWAYS set up onAuthStateChange BEFORE getSession
 * - NEVER store auth state in localStorage manually
 * - NEVER use custom JWT parsing
 */

export const USE_SESSION_TEMPLATE = `import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "./auth.client";

export function useSession() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();

    // 1. Set up auth state listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      }
    );

    // 2. Then get current session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, []);

  return { session, user, loading, signOut, isAuthenticated: !!session };
}

// Server-side helpers (for edge functions)
export async function getSession(supabaseClient) {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return session;
}

export async function requireAuth(supabaseClient) {
  const session = await getSession(supabaseClient);
  if (!session) throw new Error("Authentication required");
  return session;
}

export function onAuthStateChange(supabaseClient, callback) {
  return supabaseClient.auth.onAuthStateChange(callback);
}
`;

/**
 * Generate useSession hook with project-specific config.
 */
export function generateUseSession(): string {
  return USE_SESSION_TEMPLATE;
}
