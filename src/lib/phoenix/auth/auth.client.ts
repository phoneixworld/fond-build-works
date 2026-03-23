/**
 * Auth Client — Supabase client factory for generated projects.
 * 
 * RULES:
 * - ALWAYS use createClient from @supabase/supabase-js
 * - NEVER store tokens in localStorage manually
 * - NEVER use custom JWT implementations
 * - Supabase handles token persistence automatically
 */

// Template: this file is injected into generated projects
// The placeholders are replaced by the build engine with real values

export function generateAuthClient(supabaseUrl: string, supabaseAnonKey: string): string {
  return `import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "${supabaseUrl}";
const SUPABASE_ANON_KEY = "${supabaseAnonKey}";

// Singleton Supabase client — handles auth token persistence automatically
let _client = null;

export function createSupabaseClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

export function getSupabaseClient() {
  return createSupabaseClient();
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
`;
}

/**
 * Static template string for direct injection into workspaces.
 */
export const AUTH_CLIENT_TEMPLATE = `import { createClient } from "@supabase/supabase-js";

// These values are injected at build time by Phoenix
const SUPABASE_URL = window.__SUPABASE_URL__ || "";
const SUPABASE_ANON_KEY = window.__SUPABASE_KEY__ || "";

let _client = null;

export function createSupabaseClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

export function getSupabaseClient() {
  return createSupabaseClient();
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
`;
