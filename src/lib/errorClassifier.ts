/**
 * Error Classifier (EC) — Deterministic classification of runtime/build errors
 * into known repair categories for the Self-Repair Engine.
 */

export type ErrorCategory =
  | "missing_export"
  | "missing_component"
  | "wrong_import_style"
  | "undefined_symbol"
  | "route_mismatch"
  | "hydration_mismatch"
  | "lazy_import_failure"
  | "missing_skeleton"
  | "missing_stub"
  | "missing_default_export"
  | "duplicate_export"
  | "component_not_found"
  | "api_mismatch"
  | "syntax_error"
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  file?: string;
  component?: string;
  identifier?: string;
  route?: string;
  severity: "critical" | "high" | "medium" | "low";
  repairHint: string;
}

interface RawErrorInput {
  message: string;
  componentStack?: string;
  route?: string;
}

const CLASSIFICATION_RULES: Array<{
  test: (msg: string) => boolean;
  category: ErrorCategory;
  severity: ClassifiedError["severity"];
  hint: string;
}> = [
  {
    test: (m) => /has already been exported/i.test(m) || /already been declared/i.test(m),
    category: "duplicate_export",
    severity: "critical",
    hint: "Remove duplicate export/declaration — keep only one",
  },
  {
    test: (m) => /export.*not found/i.test(m) || /does not provide an export named/i.test(m),
    category: "missing_export",
    severity: "critical",
    hint: "Add the missing named export to the source file",
  },
  {
    test: (m) => /element type is invalid.*expected.*got.*undefined/i.test(m),
    category: "wrong_import_style",
    severity: "critical",
    hint: "Fix import style — default vs named mismatch",
  },
  {
    test: (m) => /element type is invalid/i.test(m),
    category: "missing_component",
    severity: "critical",
    hint: "Component is undefined at render — check exports and imports",
  },
  {
    test: (m) => /cannot find module/i.test(m) || /module not found/i.test(m),
    category: "component_not_found",
    severity: "critical",
    hint: "Create the missing module or fix the import path",
  },
  {
    test: (m) => /loading chunk.*failed/i.test(m) || /failed to fetch dynamically imported/i.test(m),
    category: "lazy_import_failure",
    severity: "high",
    hint: "Fix the lazy import path or convert to static import",
  },
  {
    test: (m) => /no route matches/i.test(m) || /no routes matched/i.test(m),
    category: "route_mismatch",
    severity: "high",
    hint: "Add the missing route to App.jsx or fix the navigation path",
  },
  {
    test: (m) => /hydration/i.test(m) || /server.*client.*mismatch/i.test(m),
    category: "hydration_mismatch",
    severity: "medium",
    hint: "Ensure server and client render identical markup",
  },
  {
    test: (m) => /skeleton/i.test(m) && /not found|undefined|missing/i.test(m),
    category: "missing_skeleton",
    severity: "medium",
    hint: "Generate the missing skeleton component",
  },
  {
    test: (m) => /stub/i.test(m) && /not found|undefined|missing/i.test(m),
    category: "missing_stub",
    severity: "medium",
    hint: "Generate the missing stub data",
  },
  {
    test: (m) => /export default/i.test(m) && /missing|not found/i.test(m),
    category: "missing_default_export",
    severity: "critical",
    hint: "Add export default to the component file",
  },
  {
    test: (m) => /is not defined/i.test(m) || /is not a function/i.test(m),
    category: "undefined_symbol",
    severity: "high",
    hint: "Import or define the missing symbol",
  },
  {
    test: (m) => /api|fetch|endpoint|network/i.test(m) && /error|failed|404|500/i.test(m),
    category: "api_mismatch",
    severity: "medium",
    hint: "Fix the API endpoint path or mock data",
  },
  {
    test: (m) => /syntaxerror|unexpected token|parsing error/i.test(m),
    category: "syntax_error",
    severity: "critical",
    hint: "Fix the syntax error in the file",
  },
];

function extractFileFromMessage(msg: string): string | undefined {
  const match = msg.match(/\/([\w/.-]+\.(?:jsx?|tsx?))/);
  return match ? `/${match[1]}` : undefined;
}

function extractComponentFromMessage(msg: string): string | undefined {
  const renderMatch = msg.match(/Check the render method of [`']?(\w+)[`']?/i);
  if (renderMatch) return renderMatch[1];
  const atMatch = msg.match(/at\s+(\w+)\s+\(/);
  if (atMatch) return atMatch[1];
  return undefined;
}

function extractIdentifierFromMessage(msg: string): string | undefined {
  const idMatch = msg.match(/['"`](\w+)['"`]\s+(?:is not defined|has already been|not found)/i);
  if (idMatch) return idMatch[1];
  const symMatch = msg.match(/(\w+)\s+is\s+not\s+(?:defined|a function)/i);
  if (symMatch) return symMatch[1];
  return undefined;
}

export function classifyError(input: RawErrorInput): ClassifiedError {
  const { message, componentStack, route } = input;

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.test(message)) {
      return {
        category: rule.category,
        message,
        file: extractFileFromMessage(message),
        component: extractComponentFromMessage(componentStack || message),
        identifier: extractIdentifierFromMessage(message),
        route,
        severity: rule.severity,
        repairHint: rule.hint,
      };
    }
  }

  return {
    category: "unknown",
    message,
    file: extractFileFromMessage(message),
    component: extractComponentFromMessage(componentStack || message),
    identifier: extractIdentifierFromMessage(message),
    route,
    severity: "low",
    repairHint: "Inspect the error manually",
  };
}

export function classifyErrors(inputs: RawErrorInput[]): ClassifiedError[] {
  return inputs.map(classifyError);
}

/** Group classified errors by category for summary display */
export function groupByCategory(errors: ClassifiedError[]): Record<ErrorCategory, ClassifiedError[]> {
  const groups = {} as Record<ErrorCategory, ClassifiedError[]>;
  for (const err of errors) {
    if (!groups[err.category]) groups[err.category] = [];
    groups[err.category].push(err);
  }
  return groups;
}
