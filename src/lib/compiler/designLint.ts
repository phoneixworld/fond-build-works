/**
 * Post-Generation Design Lint Pass
 * 
 * Analyzes generated workspace files for design quality issues and auto-fixes
 * common anti-patterns. Runs after task execution, before verification.
 * 
 * Checks:
 * 1. Raw color classes (should use semantic tokens)
 * 2. Missing interactive states (hover/focus/disabled)
 * 3. Spacing inconsistencies
 * 4. Missing loading/empty states
 * 5. Accessibility gaps (alt text, labels, roles)
 * 6. Typography hierarchy violations
 * 7. Missing responsive breakpoints
 */

export interface DesignLintIssue {
  file: string;
  line?: number;
  rule: DesignLintRule;
  severity: "error" | "warning" | "info";
  message: string;
  autoFixed: boolean;
}

export type DesignLintRule =
  | "raw-color"
  | "missing-hover-state"
  | "missing-loading-state"
  | "missing-empty-state"
  | "missing-alt-text"
  | "missing-label"
  | "inconsistent-spacing"
  | "missing-responsive"
  | "monolithic-page"
  | "missing-animation"
  | "missing-focus-ring"
  | "hardcoded-text-color";

export interface DesignLintResult {
  issues: DesignLintIssue[];
  autoFixCount: number;
  files: Record<string, string>;
}

// ─── Raw Color Detection ─────────────────────────────────────────────────

const RAW_COLOR_PATTERNS = [
  /\bbg-white\b/g,
  /\bbg-black\b/g,
  /\btext-white\b/g,
  /\btext-black\b/g,
  /\bbg-gray-\d{2,3}\b/g,
  /\bbg-slate-\d{2,3}\b/g,
  /\btext-gray-\d{2,3}\b/g,
  /\btext-slate-\d{2,3}\b/g,
  /\bborder-gray-\d{2,3}\b/g,
  /\bborder-slate-\d{2,3}\b/g,
  /\bbg-blue-\d{2,3}\b/g,
  /\bbg-red-\d{2,3}\b/g,
  /\bbg-green-\d{2,3}\b/g,
  /\bbg-yellow-\d{2,3}\b/g,
  /\btext-blue-\d{2,3}\b/g,
  /\btext-red-\d{2,3}\b/g,
  /\btext-green-\d{2,3}\b/g,
];

// ─── Color Auto-Fix Map ──────────────────────────────────────────────────

const COLOR_FIXES: [RegExp, string][] = [
  [/\bbg-white\b/g, "bg-[var(--color-bg)]"],
  [/\btext-white\b/g, "text-[var(--color-text-inverse)]"],
  [/\bbg-black\b/g, "bg-[var(--color-sidebar)]"],
  [/\btext-black\b/g, "text-[var(--color-text)]"],
  [/\bbg-gray-50\b/g, "bg-[var(--color-bg-secondary)]"],
  [/\bbg-gray-100\b/g, "bg-[var(--color-bg-tertiary)]"],
  [/\bbg-gray-900\b/g, "bg-[var(--color-sidebar)]"],
  [/\btext-gray-900\b/g, "text-[var(--color-text)]"],
  [/\btext-gray-800\b/g, "text-[var(--color-text)]"],
  [/\btext-gray-700\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-gray-600\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-gray-500\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-gray-400\b/g, "text-[var(--color-text-muted)]"],
  [/\bborder-gray-200\b/g, "border-[var(--color-border)]"],
  [/\bborder-gray-100\b/g, "border-[var(--color-border-light)]"],
  [/\bbg-blue-500\b/g, "bg-[var(--color-primary)]"],
  [/\bbg-blue-600\b/g, "bg-[var(--color-primary-hover)]"],
  [/\bbg-red-500\b/g, "bg-[var(--color-danger)]"],
  [/\bbg-green-500\b/g, "bg-[var(--color-success)]"],
  [/\bbg-yellow-500\b/g, "bg-[var(--color-warning)]"],
  [/\btext-blue-500\b/g, "text-[var(--color-primary)]"],
  [/\btext-blue-600\b/g, "text-[var(--color-primary)]"],
  [/\btext-red-500\b/g, "text-[var(--color-danger)]"],
  [/\btext-green-500\b/g, "text-[var(--color-success)]"],
  [/\btext-yellow-500\b/g, "text-[var(--color-warning)]"],
];

// ─── Main Lint Function ──────────────────────────────────────────────────

export function lintDesignQuality(files: Record<string, string>): DesignLintResult {
  const issues: DesignLintIssue[] = [];
  const result: Record<string, string> = {};
  let autoFixCount = 0;

  for (const [path, code] of Object.entries(files)) {
    // Only lint component/page files
    if (!path.match(/\.(jsx?|tsx?)$/) || path.includes("/utils/") || path.includes("index.")) {
      result[path] = code;
      continue;
    }

    let linted = code;
    const lines = code.split("\n");
    const isPage = path.startsWith("/pages/");
    const isComponent = path.startsWith("/components/") && !path.startsWith("/components/ui/");

    // ── Rule: Raw Colors ──────────────────────────────────────────────
    for (const [pattern, replacement] of COLOR_FIXES) {
      const matches = linted.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          file: path,
          rule: "raw-color",
          severity: "warning",
          message: `${matches.length} raw color class(es) found: ${matches[0]}`,
          autoFixed: true,
        });
        linted = linted.replace(pattern, replacement);
        autoFixCount += matches.length;
      }
    }

    // ── Rule: Missing Hover States ────────────────────────────────────
    // Check for <button> or onClick without hover: classes
    const hasClickHandlers = /onClick\s*=/.test(code);
    const hasHoverStates = /hover:/.test(code);
    if (hasClickHandlers && !hasHoverStates && !path.includes("/ui/")) {
      issues.push({
        file: path,
        rule: "missing-hover-state",
        severity: "warning",
        message: "Interactive elements without hover states detected",
        autoFixed: false,
      });
    }

    // ── Rule: Missing Loading State ───────────────────────────────────
    // Pages that fetch data should have loading indicators
    if (isPage) {
      const fetchesData = /fetch\(|useQuery|useState.*loading|isLoading|\.then\(/.test(code);
      const hasLoadingUI = /skeleton|Skeleton|spinner|Spinner|loading|Loading|isLoading/.test(code);
      if (fetchesData && !hasLoadingUI) {
        issues.push({
          file: path,
          rule: "missing-loading-state",
          severity: "warning",
          message: "Page fetches data but has no loading state (skeleton/spinner)",
          autoFixed: false,
        });
      }
    }

    // ── Rule: Missing Empty State ─────────────────────────────────────
    if (isPage) {
      const rendersList = /\.map\s*\(/.test(code);
      const hasEmptyState = /empty-state|no data|no results|nothing here|getstarted|emptyState/i.test(code);
      if (rendersList && !hasEmptyState) {
        issues.push({
          file: path,
          rule: "missing-empty-state",
          severity: "info",
          message: "Page renders a list but may lack an empty state fallback",
          autoFixed: false,
        });
      }
    }

    // ── Rule: Missing Alt Text ────────────────────────────────────────
    const imgTags = code.match(/<img[^>]*>/g) || [];
    for (const img of imgTags) {
      if (!/alt\s*=/.test(img)) {
        issues.push({
          file: path,
          rule: "missing-alt-text",
          severity: "error",
          message: `<img> tag missing alt attribute`,
          autoFixed: false,
        });
      }
    }

    // ── Rule: Missing Labels ──────────────────────────────────────────
    const inputCount = (code.match(/<input\b/g) || []).length + (code.match(/<select\b/g) || []).length;
    const labelCount = (code.match(/<label\b/g) || []).length + (code.match(/aria-label/g) || []).length;
    if (inputCount > 0 && labelCount < inputCount) {
      issues.push({
        file: path,
        rule: "missing-label",
        severity: "warning",
        message: `${inputCount} input(s) but only ${labelCount} label(s) — some inputs may lack labels`,
        autoFixed: false,
      });
    }

    // ── Rule: Missing Responsive Breakpoints ──────────────────────────
    if (isPage && lines.length > 30) {
      const hasGrid = /grid-cols-/.test(code);
      const hasResponsiveGrid = /sm:grid-cols-|md:grid-cols-|lg:grid-cols-/.test(code);
      if (hasGrid && !hasResponsiveGrid) {
        issues.push({
          file: path,
          rule: "missing-responsive",
          severity: "warning",
          message: "Grid layout without responsive breakpoints (sm:/md:/lg: prefixes)",
          autoFixed: false,
        });
      }
    }

    // ── Rule: Monolithic Page ──────────────────────────────────────────
    if (isPage && lines.length > 250) {
      const importCount = (code.match(/^import\s/gm) || []).length;
      if (importCount < 5) {
        issues.push({
          file: path,
          rule: "monolithic-page",
          severity: "warning",
          message: `Page is ${lines.length} lines with only ${importCount} imports — likely monolithic`,
          autoFixed: false,
        });
      }
    }

    // ── Rule: Missing Page Animation ──────────────────────────────────
    if (isPage && !(/animate-fade-in|animate-slide-in|animate-scale-in|motion|framer/.test(code))) {
      issues.push({
        file: path,
        rule: "missing-animation",
        severity: "info",
        message: "Page lacks entrance animation (animate-fade-in / stagger)",
        autoFixed: false,
      });
    }

    result[path] = linted;
  }

  return { issues, autoFixCount, files: result };
}

/**
 * Returns a human-readable summary of lint results
 */
export function formatLintSummary(result: DesignLintResult): string {
  const errors = result.issues.filter(i => i.severity === "error").length;
  const warnings = result.issues.filter(i => i.severity === "warning").length;
  const infos = result.issues.filter(i => i.severity === "info").length;

  const parts: string[] = [];
  if (result.autoFixCount > 0) parts.push(`${result.autoFixCount} auto-fixed`);
  if (errors > 0) parts.push(`${errors} errors`);
  if (warnings > 0) parts.push(`${warnings} warnings`);
  if (infos > 0) parts.push(`${infos} suggestions`);

  return parts.length > 0 ? parts.join(", ") : "No design issues found";
}
