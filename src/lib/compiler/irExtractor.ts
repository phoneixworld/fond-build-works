/**
 * IR Extractor — Calls the AI model to produce structured IR from raw requirements.
 * 
 * Instead of keyword-based heuristics, this sends the requirements to the planning model
 * with a system prompt that demands JSON output matching the IR type.
 * The result is the single source of truth for all downstream build phases.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import type { IR } from "@/lib/ir";
import { cloudLog } from "@/lib/cloudLogBus";

const IR_SYSTEM_PROMPT = `Given the user's request, output only a JSON object matching this TypeScript type:

type FieldType = "string" | "number" | "boolean" | "date" | "relation";

interface IREntityField {
  type: FieldType;
  required?: boolean;
  relation?: { entity: string; type: "one" | "many" };
}

interface IREntity {
  fields: Record<string, IREntityField>;
  flows: Array<"list" | "view" | "create" | "edit" | "delete" | string>;
}

interface IRPage {
  name: string;
  type: "list" | "view" | "edit" | "create" | "dashboard" | "custom";
  entity?: string;
  path: string;
}

interface IRNavItem {
  label: string;
  path: string;
  icon?: string;
}

interface IRContext {
  name: string;
  provides: string[];
}

interface IR {
  entities: Record<string, IREntity>;
  pages: IRPage[];
  navigation: IRNavItem[];
  components: string[];
  contexts: IRContext[];
  mockApi: Record<string, {
    list: string;
    create: string;
    update: string;
    delete: string;
  }>;
  backend?: {
    provider: "supabase" | "none";
    config?: any;
  };
}

Do not include explanations or markdown. Infer entities, fields, flows, pages, navigation, contexts, and mockApi so that the app is fully usable on first run. Output raw JSON only.`;

/**
 * Calls the AI model to extract a structured IR from raw requirements.
 * Returns a fully typed IR object that drives the entire build pipeline.
 */
export async function extractIRWithModel(
  rawRequirements: string,
  options?: {
    projectId?: string;
    techStack?: string;
    model?: string;
  }
): Promise<IR> {
  return new Promise<IR>((resolve, reject) => {
    let fullText = "";

    streamBuildAgent({
      messages: [
        { role: "system" as const, content: IR_SYSTEM_PROMPT },
        { role: "user" as const, content: rawRequirements },
      ],
      projectId: options?.projectId,
      techStack: options?.techStack,
      model: options?.model,
      taskType: "schema",
      onDelta: (chunk) => {
        fullText += chunk;
      },
      onDone: (text) => {
        fullText = text || fullText;
        try {
          const ir = parseIRResponse(fullText);
          cloudLog.info(`[IRExtractor] Extracted IR: ${Object.keys(ir.entities).length} entities, ${ir.pages.length} pages, ${ir.navigation.length} nav items`, "planner");
          resolve(ir);
        } catch (err: any) {
          cloudLog.error(`[IRExtractor] Failed to parse IR JSON: ${err.message}`, "planner");
          console.error("[IRExtractor] Raw response:", fullText.slice(0, 500));
          // Fall back to empty IR rather than crashing the build
          resolve(createEmptyIR());
        }
      },
      onError: (error) => {
        cloudLog.error(`[IRExtractor] Model call failed: ${error}`, "planner");
        console.warn("[IRExtractor] Falling back to empty IR");
        resolve(createEmptyIR());
      },
    });
  });
}

/**
 * Parse the AI response into a typed IR object.
 * Handles markdown code fences and trailing text gracefully.
 */
function parseIRResponse(raw: string): IR {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  // Find the JSON object boundaries
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in response");
  }
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(cleaned);

  // Validate required top-level keys and fill defaults
  return {
    entities: parsed.entities || {},
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    navigation: Array.isArray(parsed.navigation) ? parsed.navigation : [],
    components: Array.isArray(parsed.components) ? parsed.components : [],
    contexts: Array.isArray(parsed.contexts) ? parsed.contexts : [],
    mockApi: parsed.mockApi || {},
    backend: parsed.backend || undefined,
  };
}

/**
 * Creates an empty IR as a safe fallback.
 */
export function createEmptyIR(): IR {
  return {
    entities: {},
    pages: [],
    navigation: [],
    components: [],
    contexts: [],
    mockApi: {},
  };
}
