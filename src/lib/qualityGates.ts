/**
 * Quality Gates Engine — defines thresholds, evaluates builds, and blocks deploys
 */

export interface QualityGateRule {
  id: string;
  name: string;
  description: string;
  category: "code" | "bundle" | "test" | "security" | "accessibility";
  threshold: number;
  operator: "gte" | "lte" | "eq";
  severity: "blocker" | "warning";
  enabled: boolean;
}

export interface GateResult {
  rule: QualityGateRule;
  value: number;
  passed: boolean;
  message: string;
}

export interface QualityGateReport {
  passed: boolean;
  score: number;
  results: GateResult[];
  blockers: GateResult[];
  warnings: GateResult[];
  timestamp: string;
}

export const DEFAULT_QUALITY_GATES: QualityGateRule[] = [
  {
    id: "code-score",
    name: "Code Quality Score",
    description: "Minimum overall code quality score",
    category: "code",
    threshold: 60,
    operator: "gte",
    severity: "blocker",
    enabled: true,
  },
  {
    id: "no-critical-issues",
    name: "No Critical Issues",
    description: "Maximum number of critical/error-level issues allowed",
    category: "code",
    threshold: 0,
    operator: "lte",
    severity: "blocker",
    enabled: true,
  },
  {
    id: "max-warnings",
    name: "Max Warnings",
    description: "Maximum number of warnings allowed",
    category: "code",
    threshold: 20,
    operator: "lte",
    severity: "warning",
    enabled: true,
  },
  {
    id: "bundle-size",
    name: "Bundle Size Limit",
    description: "Maximum total bundle size in KB",
    category: "bundle",
    threshold: 5000,
    operator: "lte",
    severity: "warning",
    enabled: true,
  },
  {
    id: "file-count",
    name: "Max File Count",
    description: "Maximum number of source files",
    category: "bundle",
    threshold: 200,
    operator: "lte",
    severity: "warning",
    enabled: false,
  },
  {
    id: "test-coverage",
    name: "Test Coverage",
    description: "Minimum test file coverage percentage",
    category: "test",
    threshold: 0,
    operator: "gte",
    severity: "warning",
    enabled: false,
  },
  {
    id: "no-security-issues",
    name: "No Security Issues",
    description: "Zero security-category issues",
    category: "security",
    threshold: 0,
    operator: "lte",
    severity: "blocker",
    enabled: true,
  },
  {
    id: "accessibility-score",
    name: "Accessibility Score",
    description: "Maximum accessibility issues allowed",
    category: "accessibility",
    threshold: 5,
    operator: "lte",
    severity: "warning",
    enabled: true,
  },
];

function evaluateRule(rule: QualityGateRule, value: number): boolean {
  switch (rule.operator) {
    case "gte": return value >= rule.threshold;
    case "lte": return value <= rule.threshold;
    case "eq": return value === rule.threshold;
    default: return true;
  }
}

function formatRuleMessage(rule: QualityGateRule, value: number, passed: boolean): string {
  const opLabel = rule.operator === "gte" ? "≥" : rule.operator === "lte" ? "≤" : "=";
  const status = passed ? "✓" : "✗";
  return `${status} ${rule.name}: ${value} (threshold: ${opLabel} ${rule.threshold})`;
}

export interface GateInput {
  codeScore: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  bundleSizeKb: number;
  fileCount: number;
  testCoverage: number;
  securityIssues: number;
  accessibilityIssues: number;
}

export function evaluateQualityGates(
  input: GateInput,
  rules: QualityGateRule[] = DEFAULT_QUALITY_GATES
): QualityGateReport {
  const enabledRules = rules.filter(r => r.enabled);
  const results: GateResult[] = [];

  for (const rule of enabledRules) {
    let value: number;
    switch (rule.id) {
      case "code-score": value = input.codeScore; break;
      case "no-critical-issues": value = input.errorCount; break;
      case "max-warnings": value = input.warningCount; break;
      case "bundle-size": value = input.bundleSizeKb; break;
      case "file-count": value = input.fileCount; break;
      case "test-coverage": value = input.testCoverage; break;
      case "no-security-issues": value = input.securityIssues; break;
      case "accessibility-score": value = input.accessibilityIssues; break;
      default: continue;
    }

    const passed = evaluateRule(rule, value);
    results.push({
      rule,
      value,
      passed,
      message: formatRuleMessage(rule, value, passed),
    });
  }

  const blockers = results.filter(r => !r.passed && r.rule.severity === "blocker");
  const warnings = results.filter(r => !r.passed && r.rule.severity === "warning");
  const passedCount = results.filter(r => r.passed).length;
  const score = results.length > 0 ? Math.round((passedCount / results.length) * 100) : 100;

  return {
    passed: blockers.length === 0,
    score,
    results,
    blockers,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export type PipelineStage = "lint" | "typecheck" | "test" | "quality" | "build" | "gates";

export interface PipelineStep {
  stage: PipelineStage;
  label: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  duration?: number;
  output?: string[];
  error?: string;
}

export function createPipelineSteps(): PipelineStep[] {
  return [
    { stage: "lint", label: "Lint & Format", status: "pending" },
    { stage: "typecheck", label: "Type Check", status: "pending" },
    { stage: "test", label: "Run Tests", status: "pending" },
    { stage: "quality", label: "Code Quality Scan", status: "pending" },
    { stage: "build", label: "Build", status: "pending" },
    { stage: "gates", label: "Quality Gates", status: "pending" },
  ];
}
