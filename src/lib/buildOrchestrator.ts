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
import { generateSkeletonFiles } from "./skeletonGenerator";
import { generateRouteWrappers } from "./twoPhaseRenderer";
import { generatePreloadFiles } from "./preloadGenerator";

/**
 * Orchestrates the entire build pipeline:
 *
 * 1. IR Planner → IR
 * 2. Generate deterministic scaffolds (pages, layout, contexts, mock API)
 * 3. Generate skeleton components for instant UI
 * 4. Generate route wrappers for two-phase rendering
 * 5. Generate preloading + warmers for predictive navigation
 * 6. Pre-seed hardened AuthContext (router-agnostic, no useNavigate)
 * 7. Generate Supabase adapters (if backend = supabase)
 * 8. Generate App.jsx from IR (using route wrappers)
 * 9. Return a complete file map for the executor
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

  // 3. SKELETON COMPONENTS (instant 0-50ms UI)
  Object.assign(files, generateSkeletonFiles(ir));

  // 4. ROUTE WRAPPERS (two-phase rendering + loading timeout)
  Object.assign(files, generateRouteWrappers(ir));

  // 5. PRELOADING + WARMERS (predictive navigation + background warmers)
  Object.assign(files, generatePreloadFiles(ir));

  // 6. CONDITIONALLY SEED HARDENED AUTH CONTEXT
  const hasAuth = ir.contexts.some((c) => c.name === "AuthContext");
  if (hasAuth) {
    files["/contexts/AuthContext.jsx"] = generateAuthContext();
  }

  // 7. Supabase (optional)
  if (ir.backend?.provider === "supabase") {
    Object.assign(files, generateSupabaseEntityFiles(ir));
  }

  // 8. APP.JSX (uses route wrappers for optimistic rendering)
  files["/App.jsx"] = synthesizeAppFromIR(ir);

  return files;
}
