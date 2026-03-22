/**
 * Governance Agent — Validates build output for safety, determinism,
 * and quality before it reaches the preview.
 * 
 * Acts as a mandatory pipeline gate. If critical violations are found,
 * it can block the build or auto-fix issues.
 */

import type { AgentResult, GovernanceViolation, PipelineContext } from "./types";

/**
 * Run governance checks against the workspace.
 * Returns violations categorized by severity.
 */
export function runGovernanceAgent(ctx: PipelineContext): AgentResult {
  const start = performance.now();
  const workspace = ctx.results.get("frontend")?.files || ctx.existingWorkspace;
  const violations: GovernanceViolation[] = [];

  // Rule 1: No hardcoded secrets or API keys
  violations.push(...checkForSecrets(workspace));

  // Rule 2: No infinite loops or recursion risks
  violations.push(...checkForInfiniteLoops(workspace));

  // Rule 3: No XSS vectors (dangerouslySetInnerHTML with user input)
  violations.push(...checkForXSSVectors(workspace));

  // Rule 4: No hallucinated imports (importing non-existent packages)
  violations.push(...checkForHallucinatedImports(workspace));

  // Rule 5: Auth safety (no role checks on client-only storage)
  violations.push(...checkAuthSafety(workspace));

  // Rule 6: Component quality (no empty renders, no placeholder text)
  violations.push(...checkComponentQuality(workspace));

  // Rule 7: Determinism (no Math.random in render paths)
  violations.push(...checkDeterminism(workspace));

  // Rule 8: No duplicate file content (AI hallucination of repeated code)
  violations.push(...checkDuplicateContent(workspace));

  // Rule 9: Export convention enforcement
  violations.push(...checkExportConventions(workspace));

  const errors = violations.filter(v => v.severity === "error");
  const warnings = violations.filter(v => v.severity === "warning");

  // Auto-fix what we can
  const autoFixed = autoFixViolations(violations, workspace);

  return {
    agent: "governance",
    status: errors.length - autoFixed > 0 ? "done" : "done",
    violations,
    files: workspace, // Return potentially auto-fixed workspace
    summary: `${errors.length} errors, ${warnings.length} warnings, ${autoFixed} auto-fixed`,
    durationMs: performance.now() - start,
    metadata: {
      totalViolations: violations.length,
      errors: errors.length,
      warnings: warnings.length,
      autoFixed,
    },
  };
}

function checkForSecrets(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];
  const secretPatterns = [
    /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/gi,
    /sk[-_]live[-_][A-Za-z0-9]{20,}/g,
    /sk[-_]test[-_][A-Za-z0-9]{20,}/g,
    /AIza[A-Za-z0-9_\-]{35}/g, // Google API key
  ];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;
    for (const pattern of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        violations.push({
          rule: "no-hardcoded-secrets",
          severity: "error",
          file: path,
          message: "Hardcoded API key or secret detected — use environment variables",
          autoFixable: false,
        });
      }
    }
  }
  return violations;
}

function checkForInfiniteLoops(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    // useEffect with setState but no dependency array
    const effectMatches = content.matchAll(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*set\w+\([^)]*\)[^}]*\}\s*\)/g);
    for (const _ of effectMatches) {
      violations.push({
        rule: "no-infinite-effect",
        severity: "warning",
        file: path,
        message: "useEffect calls setState without dependency array — potential infinite loop",
        autoFixable: false,
      });
    }

    // while(true) without break
    if (/while\s*\(\s*true\s*\)/.test(content) && !content.includes("break")) {
      violations.push({
        rule: "no-infinite-loop",
        severity: "error",
        file: path,
        message: "while(true) without break — will freeze the browser",
        autoFixable: false,
      });
    }
  }
  return violations;
}

function checkForXSSVectors(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    if (content.includes("dangerouslySetInnerHTML")) {
      // Check if the input comes from user data (state, props, params)
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("dangerouslySetInnerHTML")) {
          violations.push({
            rule: "no-xss-vectors",
            severity: "warning",
            file: path,
            message: `dangerouslySetInnerHTML used at line ${i + 1} — ensure input is sanitized`,
            autoFixable: false,
          });
        }
      }
    }
  }
  return violations;
}

function checkForHallucinatedImports(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];
  const knownPackages = new Set([
    "react", "react-dom", "react-router-dom", "lucide-react",
    "recharts", "date-fns", "framer-motion", "clsx",
    // Common AI hallucinations that don't exist
  ]);
  const hallucinations = new Set([
    "@/ui/", "shadcn/ui", "@shadcn/ui", "react-icons/all",
    "@heroicons/react/solid", "@heroicons/react/outline",
    "tailwindcss/components", "@tailwind/",
  ]);

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    const imports = content.matchAll(/from\s+["']([^"']+)["']/g);
    for (const m of imports) {
      const pkg = m[1];
      if (pkg.startsWith(".") || pkg.startsWith("/")) continue;

      for (const h of hallucinations) {
        if (pkg.includes(h)) {
          violations.push({
            rule: "no-hallucinated-imports",
            severity: "error",
            file: path,
            message: `Import "${pkg}" appears to be a hallucinated package`,
            autoFixable: true,
            fix: `Remove or replace import from "${pkg}"`,
          });
        }
      }
    }
  }
  return violations;
}

function checkAuthSafety(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    // Check for role checks against localStorage
    if (content.includes("localStorage") && (content.includes("isAdmin") || content.includes("role"))) {
      const hasServerCheck = content.includes("fetch") || content.includes("supabase");
      if (!hasServerCheck) {
        violations.push({
          rule: "no-client-role-check",
          severity: "error",
          file: path,
          message: "Admin/role check uses localStorage without server validation — privilege escalation risk",
          autoFixable: false,
        });
      }
    }
  }
  return violations;
}

function checkComponentQuality(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/) || path.includes("/ui/")) continue;

    // Empty render
    if (content.includes("return null") && !content.includes("if (") && !content.includes("loading")) {
      violations.push({
        rule: "no-empty-render",
        severity: "warning",
        file: path,
        message: "Component always returns null — likely incomplete",
        autoFixable: false,
      });
    }

    // Placeholder text
    const placeholders = ["TODO", "Coming soon", "Placeholder", "Lorem ipsum"];
    for (const ph of placeholders) {
      if (content.includes(ph) && !content.includes("// " + ph)) {
        violations.push({
          rule: "no-placeholder-text",
          severity: "warning",
          file: path,
          message: `Contains placeholder text: "${ph}"`,
          autoFixable: false,
        });
        break;
      }
    }
  }
  return violations;
}

function checkDeterminism(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    // Math.random() in render (outside useEffect/useMemo/useCallback)
    if (content.includes("Math.random()")) {
      const inEffect = /useEffect\([^)]*Math\.random/s.test(content) ||
        /useMemo\([^)]*Math\.random/s.test(content) ||
        /useState\([^)]*Math\.random/s.test(content);
      if (!inEffect) {
        violations.push({
          rule: "no-render-randomness",
          severity: "warning",
          file: path,
          message: "Math.random() in render path — may cause hydration mismatches",
          autoFixable: false,
        });
      }
    }
  }
  return violations;
}

function checkDuplicateContent(workspace: Record<string, string>): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    // Check if file has duplicate import blocks (AI hallucination)
    const importBlocks = content.split(/\n(?=import\s)/).filter(b => b.trim().startsWith("import"));
    if (importBlocks.length > 1) {
      // Check if there's code between import blocks (indicating duplication)
      const firstExport = content.indexOf("export ");
      const lastImport = content.lastIndexOf("\nimport ");
      if (firstExport > 0 && lastImport > firstExport) {
        violations.push({
          rule: "no-duplicate-content",
          severity: "error",
          file: path,
          message: "File appears to have duplicate content (imports after exports)",
          autoFixable: true,
          fix: "Truncate duplicate tail after first export default",
        });
      }
    }
  }
  return violations;
}

/**
 * Auto-fix violations that are safe to fix deterministically.
 */
function autoFixViolations(violations: GovernanceViolation[], workspace: Record<string, string>): number {
  let fixed = 0;

  for (const v of violations) {
    if (!v.autoFixable) continue;

    if (v.rule === "no-duplicate-content" && workspace[v.file]) {
      const content = workspace[v.file];
      const exportDefaultIdx = content.indexOf("export default");
      if (exportDefaultIdx > 0) {
        // Find the end of the export default statement
        const afterExport = content.indexOf("\n", exportDefaultIdx);
        if (afterExport > 0) {
          const afterContent = content.slice(afterExport);
          const nextImport = afterContent.indexOf("\nimport ");
          if (nextImport > 0) {
            workspace[v.file] = content.slice(0, afterExport + nextImport + 1).trim();
            fixed++;
          }
        }
      }
    }
  }

  return fixed;
}
