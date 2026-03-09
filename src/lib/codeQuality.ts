/**
 * Code Quality Gates — analyzes code for issues across multiple dimensions
 */

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

export type IssueSeverity = "error" | "warning" | "info";
export type IssueCategory = "architecture" | "performance" | "accessibility" | "security" | "maintainability" | "bestPractices";

export interface CodeIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  file: string;
  line?: number;
  message: string;
  suggestion: string;
  autoFixable?: boolean;
}

export interface CodeMetrics {
  totalFiles: number;
  totalLines: number;
  componentCount: number;
  avgComplexity: "low" | "medium" | "high";
  hasErrorBoundary?: boolean;
  hasAccessibility?: boolean;
  hasLoadingStates?: boolean;
  hasErrorHandling?: boolean;
}

export interface QualityReport {
  score: number;
  summary: string;
  issues: CodeIssue[];
  metrics: CodeMetrics;
}

/**
 * Run AI-powered code quality analysis
 */
export async function analyzeCodeQuality(
  files: Record<string, string>,
  techStack?: string,
  governanceRules?: any[]
): Promise<QualityReport> {
  const resp = await fetch(`${BASE_URL}/functions/v1/analyze-code-quality`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({ files, techStack, governanceRules }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (resp.status === 402) throw new Error("Usage limit reached.");
    throw new Error("Code analysis failed");
  }

  return resp.json();
}

/**
 * Fast client-side static analysis (no AI needed)
 */
export function quickStaticAnalysis(files: Record<string, string>): CodeIssue[] {
  const issues: CodeIssue[] = [];
  let issueId = 0;

  for (const [path, code] of Object.entries(files)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;
    const lines = code.split("\n");

    // Check for console.log left in code
    lines.forEach((line, i) => {
      if (/\bconsole\.(log|warn|error|debug)\b/.test(line) && !/\/\//.test(line.slice(0, line.indexOf("console")))) {
        issues.push({
          id: `sq-${issueId++}`,
          category: "maintainability",
          severity: "info",
          file: path,
          line: i + 1,
          message: "Console statement left in code",
          suggestion: "Remove console statements before production",
        });
      }
    });

    // Check for inline styles
    if (/style=\{\{/.test(code)) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "bestPractices",
        severity: "warning",
        file: path,
        message: "Inline styles detected — use Tailwind classes instead",
        suggestion: "Replace style={{}} with Tailwind utility classes",
      });
    }

    // Check for missing error boundaries (App component)
    if ((path === "/App.jsx" || path === "/App.tsx") && !code.includes("ErrorBoundary")) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "architecture",
        severity: "warning",
        file: path,
        message: "No error boundary in App component",
        suggestion: "Wrap app content in an ErrorBoundary to catch rendering errors",
      });
    }

    // Check for any in TypeScript
    if (path.match(/\.tsx?$/) && /:\s*any\b/.test(code)) {
      const anyCount = (code.match(/:\s*any\b/g) || []).length;
      if (anyCount > 3) {
        issues.push({
          id: `sq-${issueId++}`,
          category: "maintainability",
          severity: "warning",
          file: path,
          message: `${anyCount} 'any' type annotations — reduces type safety`,
          suggestion: "Replace 'any' with proper TypeScript types",
        });
      }
    }

    // Check for large components (>200 lines)
    if (lines.length > 200) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "maintainability",
        severity: "warning",
        file: path,
        message: `Large file (${lines.length} lines) — consider splitting`,
        suggestion: "Extract sub-components or utilities into separate files",
      });
    }

    // Check for missing alt on img tags
    const imgWithoutAlt = code.match(/<img[^>]*(?!alt=)[^>]*\/?>/g);
    if (imgWithoutAlt?.length) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "accessibility",
        severity: "error",
        file: path,
        message: `${imgWithoutAlt.length} <img> tag(s) missing alt attribute`,
        suggestion: 'Add alt="descriptive text" to all <img> elements',
      });
    }

    // Check for onClick on non-interactive elements
    if (/onClick=.*<(?:div|span|p)\b/.test(code) || /<(?:div|span|p)[^>]*onClick/.test(code)) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "accessibility",
        severity: "warning",
        file: path,
        message: "onClick on non-interactive element (div/span/p)",
        suggestion: "Use <button> instead, or add role='button' and tabIndex={0}",
      });
    }

    // Check for useEffect with missing deps
    const effectMatches = code.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{/g);
    const depsMatches = code.match(/\}\s*,\s*\[\s*\]\s*\)/g);
    if (effectMatches && depsMatches && effectMatches.length > depsMatches.length + 1) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "bestPractices",
        severity: "info",
        file: path,
        message: "useEffect may have missing dependency arrays",
        suggestion: "Ensure all useEffect hooks have proper dependency arrays",
      });
    }

    // Check for dangerouslySetInnerHTML
    if (code.includes("dangerouslySetInnerHTML")) {
      issues.push({
        id: `sq-${issueId++}`,
        category: "security",
        severity: "error",
        file: path,
        message: "dangerouslySetInnerHTML used — XSS risk",
        suggestion: "Sanitize HTML content or use a safe rendering library",
      });
    }
  }

  return issues;
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-[hsl(var(--ide-success))]";
  if (score >= 70) return "text-primary";
  if (score >= 50) return "text-[hsl(var(--ide-warning))]";
  return "text-destructive";
}

export function getSeverityColor(severity: IssueSeverity): string {
  switch (severity) {
    case "error": return "text-destructive";
    case "warning": return "text-[hsl(var(--ide-warning))]";
    case "info": return "text-muted-foreground";
  }
}

export function getCategoryLabel(category: IssueCategory): string {
  const labels: Record<IssueCategory, string> = {
    architecture: "Architecture",
    performance: "Performance",
    accessibility: "Accessibility",
    security: "Security",
    maintainability: "Maintainability",
    bestPractices: "Best Practices",
  };
  return labels[category] || category;
}
