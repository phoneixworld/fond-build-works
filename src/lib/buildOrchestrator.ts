// src/lib/buildOrchestrator.ts

import type { IR } from "./ir";
import { planIRFromRequirements } from "./irPlanner";
import { scaffoldPagesFromIR } from "./pageScaffolder";
import { generateMockApiFiles } from "./mockApiGenerator";
import { generateContextFiles } from "./contextGenerator";
import { generateLayoutFiles } from "./layoutGenerator";
import { generateSupabaseEntityFiles } from "./supabaseEntityGenerator";
import { synthesizeAppFromIR } from "./compiler/appSynthesizer";
import { generateAuthContext } from "./templates/scaffoldTemplates";

/**
 * Orchestrates the entire build pipeline:
 *
 * 1. IR Planner → IR
 * 2. Generate deterministic scaffolds (pages, layout, contexts, mock API)
 * 3. Pre-seed hardened AuthContext (router-agnostic, no useNavigate)
 * 4. Generate Supabase adapters (if backend = supabase)
 * 5. Generate App.jsx from IR
 * 6. Return a complete file map for the executor
 */
export async function orchestrateBuild(options: {
  rawRequirements: string;
  callLLM: (opts: { system: string; user: string }) => Promise<string>;
}): Promise<Record<string, string>> {
  const { rawRequirements, callLLM } = options;

  // 1. PLAN IR
  const ir: IR = await planIRFromRequirements(callLLM, rawRequirements);

  // 2. GENERATE FILES FROM IR
  const files: Record<string, string> = {};

  // Pages
  Object.assign(files, scaffoldPagesFromIR(ir));

  // Layout
  Object.assign(files, generateLayoutFiles(ir));

  // Contexts (entity-level)
  Object.assign(files, generateContextFiles(ir));

  // Mock API
  Object.assign(files, generateMockApiFiles(ir));

  // 3. CONDITIONALLY SEED HARDENED AUTH CONTEXT
  // Only inject AuthContext if the IR explicitly includes it.
  const hasAuth = ir.contexts.some((c) => c.name === "AuthContext");
  if (hasAuth) {
    files["/contexts/AuthContext.jsx"] = generateAuthContext();
  }

  // 4. Supabase (optional)
  if (ir.backend?.provider === "supabase") {
    Object.assign(files, generateSupabaseEntityFiles(ir));
  }

  // 5. APP.JSX
  files["/App.jsx"] = synthesizeAppFromIR(ir);

  return files;
}
