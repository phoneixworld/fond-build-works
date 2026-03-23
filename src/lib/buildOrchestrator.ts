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
import { validateSchemaArtifacts, extractSchemaArtifacts, requiresSchemaValidation } from "./schemaValidator";

/**
 * Orchestrates the entire build pipeline:
 *
 * 0. SCHEMA-FIRST GATE — validate schema artifacts before proceeding
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
  /** Pre-generated schema files from backend-agent (schema-first) */
  schemaFiles?: Record<string, string>;
}): Promise<Record<string, string>> {
  const { rawRequirements, callLLM, schemaFiles } = options;

  // 0. SCHEMA-FIRST GATE — if schema files provided, validate before proceeding
  if (schemaFiles && requiresSchemaValidation(schemaFiles)) {
    const artifacts = extractSchemaArtifacts(schemaFiles);
    const validation = validateSchemaArtifacts(artifacts);

    if (!validation.valid) {
      console.error("[BuildOrchestrator] Schema validation FAILED — blocking build:", validation.errors);
      throw new Error(
        `Schema validation failed (build blocked): ${validation.errors.join("; ")}`
      );
    }

    console.log(`[BuildOrchestrator] Schema validated: ${validation.tables.length} tables ✅`);
  }

  // 1. PLAN IR (with guardrails — will throw if requirements are trivial)
  let ir: IR;
  try {
    ir = await planIRFromRequirements(callLLM, rawRequirements);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("IRPlanner:")) {
      console.error(`[BuildOrchestrator] IR planning blocked: ${msg}`);
      throw new Error(`Build aborted — ${msg}`);
    }
    throw err;
  }

  // 2. GENERATE FILES FROM IR
  const files: Record<string, string> = {};

  // Merge validated schema files first (migrations, RLS, hooks)
  if (schemaFiles) {
    Object.assign(files, schemaFiles);
  }

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

  // 9. POST-BUILD DOMAIN COHERENCE CHECK
  // Verify that the generated IR actually reflects the requested domain.
  // Catches cases where cache poisoning, context loss, or hallucination
  // produced an unrelated app (e.g., IDE portal instead of HR ERP).
  const coherenceResult = checkDomainCoherence(rawRequirements, ir, files);
  if (!coherenceResult.passed) {
    console.error(
      `[BuildOrchestrator] ❌ DOMAIN COHERENCE FAILED\n` +
      `  Requested tokens: ${coherenceResult.requestedTokens.join(", ")}\n` +
      `  Generated tokens: ${coherenceResult.generatedTokens.join(", ")}\n` +
      `  Overlap: ${coherenceResult.overlapCount}/${coherenceResult.requestedTokens.length}\n` +
      `  Reason: ${coherenceResult.reason}`
    );
    throw new Error(
      `Build aborted — domain mismatch. The generated app does not match the requested domain. ` +
      `Expected tokens like [${coherenceResult.requestedTokens.slice(0, 5).join(", ")}] ` +
      `but generated [${coherenceResult.generatedTokens.slice(0, 5).join(", ")}]. ` +
      `This may indicate stale cache or context loss.`
    );
  }

  console.log(
    `[BuildOrchestrator] ✅ Domain coherence passed: ${coherenceResult.overlapCount}/${coherenceResult.requestedTokens.length} tokens matched`
  );

  return files;
}

// ─── Domain Coherence Checker ──────────────────────────────────────────────

interface CoherenceResult {
  passed: boolean;
  requestedTokens: string[];
  generatedTokens: string[];
  overlapCount: number;
  reason: string;
}

/**
 * Extracts domain-relevant tokens from text.
 * Looks for nouns/concepts that indicate what the app is about.
 */
function extractDomainTokens(text: string): string[] {
  const normalized = text.toLowerCase();
  // Extract multi-word and single-word domain concepts
  const tokens = new Set<string>();

  // Common domain concepts (multi-word first)
  const DOMAIN_PATTERNS = [
    /\b(employee management|time tracking|performance review|onboarding workflow|org(?:anization)? structure)\b/gi,
    /\b(log ?book|e-?log|clinical posting|competency framework|exam eligibility|competency.based|medical education)\b/gi,
    /\b(project management|task board|kanban board|sales pipeline|invoice management)\b/gi,
    /\b(user management|role management|access control|file storage|data analytics)\b/gi,
    /\b(academic structure|student management|faculty evaluation|assessment template|posting rotation)\b/gi,
    /\b(university admin|institution admin|platform admin|head of department|primary guide)\b/gi,
    /\b(kpi monitoring|exam eligibility|accreditation|certification|residency program)\b/gi,
  ];

  for (const pattern of DOMAIN_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const m of matches) tokens.add(m.toLowerCase().trim());
  }

  // Single-word domain nouns
  const NOUN_PATTERN = /\b(employee|department|attendance|pto|review|onboarding|hr|erp|payroll|salary|leave|roster|shift|timesheet|appraisal|hire|recruit|candidate|benefit|compliance|grievance|training|university|student|faculty|logbook|competency|posting|rotation|assessment|curriculum|exam|grade|course|enrollment|hospital|patient|doctor|nurse|ward|diagnosis|prescription|pharmacy|lab|appointment|crm|contact|lead|deal|pipeline|invoice|quote|proposal|client|customer|account|opportunity|ecommerce|product|cart|order|checkout|shipping|catalog|inventory|warehouse|supplier|purchase|stock|blog|post|comment|author|category|tag|article|chat|message|conversation|channel|thread|notification|task|project|milestone|sprint|backlog|ticket|issue|bug|feature|dashboard|report|analytics|chart|metric|kpi|widget|calendar|schedule|booking|event|meeting|agenda|school|teacher|parent|timetable|fee|admission|announcement|classroom|syllabus)\b/gi;

  const nounMatches = normalized.match(NOUN_PATTERN) || [];
  for (const m of nounMatches) tokens.add(m);

  return [...tokens];
}

function checkDomainCoherence(
  rawRequirements: string,
  ir: IR,
  files: Record<string, string>
): CoherenceResult {
  // Extract tokens from requirements
  const requestedTokens = extractDomainTokens(rawRequirements);

  // If requirements are too generic to extract tokens, skip the check
  // (the IR planner guardrails should have caught this, but be safe)
  if (requestedTokens.length < 2) {
    return {
      passed: true,
      requestedTokens,
      generatedTokens: [],
      overlapCount: 0,
      reason: "Skipped — too few domain tokens in requirements to validate",
    };
  }

  // Extract tokens from IR entities, pages, navigation
  const irText = [
    ...Object.keys(ir.entities),
    ...ir.pages.map(p => p.name),
    ...ir.navigation.map(n => n.label),
    ...ir.components,
    ...ir.contexts.map(c => c.name),
  ].join(" ");

  // Also scan generated file paths and first 200 chars of each file
  const fileText = Object.entries(files)
    .map(([path, content]) => `${path} ${content.slice(0, 200)}`)
    .join(" ");

  const generatedTokens = extractDomainTokens(`${irText} ${fileText}`);

  // Calculate overlap
  const requestedSet = new Set(requestedTokens);
  const overlapCount = generatedTokens.filter(t => requestedSet.has(t)).length;

  // Require at least 20% overlap OR at least 2 matching tokens
  const overlapRatio = requestedTokens.length > 0 ? overlapCount / requestedTokens.length : 0;
  const passed = overlapCount >= 2 || overlapRatio >= 0.2;

  return {
    passed,
    requestedTokens: requestedTokens.slice(0, 20),
    generatedTokens: generatedTokens.slice(0, 20),
    overlapCount,
    reason: passed
      ? `${overlapCount} domain tokens matched (${(overlapRatio * 100).toFixed(0)}%)`
      : `Only ${overlapCount} domain tokens matched (${(overlapRatio * 100).toFixed(0)}%) — generated app does not match requested domain`,
  };
}
