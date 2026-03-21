// src/lib/buildOrchestrator.ts

import type { IR } from "./ir";
import { planIRFromRequirements } from "./irPlanner";
import { scaffoldPagesFromIR } from "./pageScaffolder";
import { generateMockApiFiles } from "./mockApiGenerator";
import { generateContextFiles } from "./contextGenerator";
import { generateLayoutFiles } from "./layoutGenerator";
import { generateSupabaseEntityFiles } from "./supabaseEntityGenerator";
import { synthesizeAppFromIR } from "./compiler/appSynthesizer";

/**
 * Orchestrates the entire build pipeline:
 *
 * 1. IR Planner → IR
 * 2. Generate deterministic scaffolds (pages, layout, contexts, mock API)
 * 3. Generate Supabase adapters (if backend = supabase)
 * 4. Generate App.jsx from IR
 * 5. Return a complete file map for the executor
 *
 * This is the Lovable-level deterministic build pipeline.
 */
export async function orchestrateBuild(options: {
  rawRequirements: string;
  callLLM: (opts: { system: string; user: string }) => Promise<string>;
}): Promise<Record<string, string>> {
  const { rawRequirements, callLLM } = options;

  // ────────────────────────────────────────────────────────────────
  // 1. PLAN IR
  // ────────────────────────────────────────────────────────────────
  const ir: IR = await planIRFromRequirements(callLLM, rawRequirements);

  // ────────────────────────────────────────────────────────────────
  // 2. GENERATE FILES FROM IR
  // ────────────────────────────────────────────────────────────────
  const files: Record<string, string> = {};

  // Pages
  Object.assign(files, scaffoldPagesFromIR(ir));

  // Layout
  Object.assign(files, generateLayoutFiles(ir));

  // Contexts
  Object.assign(files, generateContextFiles(ir));

  // Mock API
  Object.assign(files, generateMockApiFiles(ir));

  // Supabase (optional)
  if (ir.backend?.provider === "supabase") {
    Object.assign(files, generateSupabaseEntityFiles(ir));
  }

  // ────────────────────────────────────────────────────────────────
  // 3. APP.JSX
  // ────────────────────────────────────────────────────────────────
  files["/App.jsx"] = synthesizeAppFromIR(ir);

  // ────────────────────────────────────────────────────────────────
  // 4. RETURN FILE MAP
  // ────────────────────────────────────────────────────────────────
  return files;
}
