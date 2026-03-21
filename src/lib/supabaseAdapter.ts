// src/lib/supabaseAdapter.ts

import { createClient } from "@supabase/supabase-js";

let supabase: ReturnType<typeof createClient> | null = null;

/**
 * Initialize Supabase client once.
 */
export function initSupabase(config: { url: string; anonKey: string }) {
  if (!supabase) {
    supabase = createClient(config.url, config.anonKey);
  }
  return supabase;
}

/**
 * Get the active Supabase client.
 */
export function getSupabase() {
  if (!supabase) {
    throw new Error("Supabase not initialized. Call initSupabase() first.");
  }
  return supabase;
}
