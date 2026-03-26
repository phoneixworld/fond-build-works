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
  const collection = entityName.toLowerCase() + "s";

  return `
const API_BASE = window.__SUPABASE_URL__ || "";
const API_KEY = window.__SUPABASE_KEY__ || "";
const PROJECT_ID = window.__PROJECT_ID__ || "";

async function apiCall(action, data) {
  const res = await fetch(API_BASE + "/functions/v1/project-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_KEY },
    body: JSON.stringify({ project_id: PROJECT_ID, collection: "${collection}", action, ...data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "API error");
  return json;
}

export async function list${entityName}s() {
  const json = await apiCall("list");
  return json.data || [];
}

export async function get${entityName}(id) {
  const json = await apiCall("get", { id });
  return json.data;
}

export async function create${entityName}(input) {
  const json = await apiCall("create", { data: input });
  return json.data;
}

export async function update${entityName}(id, input) {
  const json = await apiCall("update", { id, data: input });
  return json.data;
}

export async function delete${entityName}(id) {
  await apiCall("delete", { id });
  return true;
}
`.trim();
}
