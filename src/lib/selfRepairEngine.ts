/**
 * Self-Repair Engine (SRE) + Post-Repair Validation (PRV)
 * 
 * Based on error classification, generates targeted repair prompts
 * and triggers validation after repair completes.
 */

import type { ClassifiedError, ErrorCategory } from "./errorClassifier";
import type { StructuredError } from "@/components/GlobalErrorBoundary";

// ─── Repair Strategy Map ──────────────────────────────────────────────────

interface RepairStrategy {
  promptTemplate: (err: ClassifiedError, fileContent?: string) => string;
  requiresFileContent: boolean;
}

const REPAIR_STRATEGIES: Record<ErrorCategory, RepairStrategy> = {
  missing_export: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Missing export in ${err.file || "unknown file"}\n\n` +
      `Error: ${err.message}\n` +
      `Identifier: ${err.identifier || "unknown"}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Add the missing named export. Ensure the symbol is defined and exported correctly.`,
  },
  missing_component: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: Missing component "${err.component || err.identifier}"\n\n` +
      `Error: ${err.message}\n` +
      `File: ${err.file || "unknown"}\n\n` +
      `Fix: Generate the missing component with a default export. Include all expected props.`,
  },
  wrong_import_style: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Import/export style mismatch\n\n` +
      `Error: ${err.message}\n` +
      `Component: ${err.component || "unknown"}\n` +
      `File: ${err.file || "unknown"}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: If the target has a default export, use \`import X from "..."\`. If named, use \`import { X } from "..."\`.`,
  },
  undefined_symbol: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Undefined symbol "${err.identifier}"\n\n` +
      `Error: ${err.message}\n` +
      `File: ${err.file || "unknown"}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Import or define the missing symbol. Check if it needs to be imported from another module.`,
  },
  route_mismatch: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: Route mismatch at "${err.route}"\n\n` +
      `Error: ${err.message}\n\n` +
      `Fix: Add the missing route to App.jsx and create the corresponding page component.`,
  },
  hydration_mismatch: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Hydration mismatch\n\n` +
      `Error: ${err.message}\n` +
      `Component: ${err.component || "unknown"}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Ensure consistent rendering between stub and hydrated states.`,
  },
  lazy_import_failure: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: Lazy import failure\n\n` +
      `Error: ${err.message}\n` +
      `File: ${err.file || "unknown"}\n\n` +
      `Fix: Fix the lazy import path or convert to a static import. Ensure the target file exists.`,
  },
  missing_skeleton: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: Missing skeleton component\n\n` +
      `Error: ${err.message}\n` +
      `Component: ${err.component || "unknown"}\n\n` +
      `Fix: Generate a skeleton component with shimmer placeholders matching the page layout.`,
  },
  missing_stub: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: Missing stub data\n\n` +
      `Error: ${err.message}\n\n` +
      `Fix: Generate stub/placeholder data for the two-phase rendering pattern.`,
  },
  missing_default_export: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Missing default export in ${err.file}\n\n` +
      `Error: ${err.message}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Add \`export default ComponentName;\` at the bottom of the file.`,
  },
  duplicate_export: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Duplicate export "${err.identifier}" in ${err.file}\n\n` +
      `Error: ${err.message}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Remove the duplicate export/declaration. Keep exactly one definition and one export for each symbol.`,
  },
  component_not_found: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: Component not found\n\n` +
      `Error: ${err.message}\n` +
      `File: ${err.file || "unknown"}\n\n` +
      `Fix: Create the missing component file or fix the import path.`,
  },
  api_mismatch: {
    requiresFileContent: false,
    promptTemplate: (err) =>
      `🔧 SELF-REPAIR: API mismatch\n\n` +
      `Error: ${err.message}\n\n` +
      `Fix: Fix the API endpoint URL or update mock data to match expected shape.`,
  },
  syntax_error: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Syntax error in ${err.file}\n\n` +
      `Error: ${err.message}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Correct the syntax error. Output the complete corrected file.`,
  },
  unknown: {
    requiresFileContent: true,
    promptTemplate: (err, content) =>
      `🔧 SELF-REPAIR: Unknown error\n\n` +
      `Error: ${err.message}\n` +
      `File: ${err.file || "unknown"}\n` +
      `Component: ${err.component || "unknown"}\n\n` +
      (content ? `Current file:\n\`\`\`\n${content}\n\`\`\`\n\n` : "") +
      `Fix: Analyze and fix the error. Output complete corrected files.`,
  },
};

// ─── Public API ───────────────────────────────────────────────────────────

export function buildRepairPrompt(
  structuredError: StructuredError,
  fileContents?: Record<string, string>
): string {
  const { classification } = structuredError;
  const strategy = REPAIR_STRATEGIES[classification.category];

  let fileContent: string | undefined;
  if (strategy.requiresFileContent && classification.file && fileContents) {
    fileContent = fileContents[classification.file];
  }

  const prompt = strategy.promptTemplate(classification, fileContent);

  return [
    prompt,
    "",
    "RULES:",
    "- Fix ONLY the identified issue",
    "- Output COMPLETE corrected files",
    "- Follow the export convention: one default export per component, named exports for subcomponents",
    "- Do NOT introduce new dependencies",
    "- Preserve all existing functionality",
  ].join("\n");
}

export function buildValidationChecklist(classification: ClassifiedError): string[] {
  const checks: string[] = [
    "Rebuild project graph",
    "Re-run static analysis",
    "Re-run export governance",
  ];

  switch (classification.category) {
    case "route_mismatch":
      checks.push("Re-run routing validation");
      break;
    case "hydration_mismatch":
      checks.push("Re-run hydration validation");
      break;
    case "missing_export":
    case "wrong_import_style":
    case "duplicate_export":
    case "missing_default_export":
      checks.push("Re-run export convention checks");
      break;
    default:
      break;
  }

  return checks;
}
