// src/lib/supabaseEntityGenerator.ts

import type { IR } from "./ir";

/**
 * Generates Supabase CRUD service files for each entity.
 * These match the mock API interface exactly.
 */
export function generateSupabaseEntityFiles(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const entityName of Object.keys(ir.entities)) {
    const filePath = `/lib/supabase/${entityName.toLowerCase()}.js`;
    files[filePath] = generateSupabaseEntity(entityName);
  }

  return files;
}

function generateSupabaseEntity(entityName: string): string {
  const table = entityName.toLowerCase();

  return `
import { getSupabase } from "@/lib/supabaseAdapter";

export async function list${entityName}s() {
  const { data, error } = await getSupabase()
    .from("${table}")
    .select("*");
  if (error) throw error;
  return data;
}

export async function get${entityName}(id) {
  const { data, error } = await getSupabase()
    .from("${table}")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function create${entityName}(input) {
  const { data, error } = await getSupabase()
    .from("${table}")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function update${entityName}(id, input) {
  const { data, error } = await getSupabase()
    .from("${table}")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function delete${entityName}(id) {
  const { error } = await getSupabase()
    .from("${table}")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return true;
}
`.trim();
}
