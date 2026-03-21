// src/lib/supabaseAuth.ts

import { getSupabase } from "./supabaseAdapter";

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
  return true;
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return getSupabase().auth.onAuthStateChange(callback);
}
