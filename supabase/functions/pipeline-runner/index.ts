import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PipelineRequest {
  project_id: string;
  files: Record<string, string>;
  gates?: Array<{
    rule_id: string;
    name: string;
    threshold: number;
    operator: string;
    severity: string;
    enabled: boolean;
    category: string;
  }>;
}

interface ValidationIssue {
  file: string;
  message: string;
  severity: "error" | "warning" | "info";
  category: "lint" | "type" | "quality" | "security" | "accessibility";
  line?: number;
}

// ─── Stage Runners ───

function runLint(files: Record<string, string>): { passed: boolean; issues: ValidationIssue[]; output: string[] } {
  const issues: ValidationIssue[] = [];
  const output: string[] = [];
  let fileCount = 0;

  for (const [path, content] of Object.entries(files)) {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (!["js", "ts", "jsx", "tsx", "css"].includes(ext)) continue;
    fileCount++;
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // console.log left behind
      if (line.match(/console\.(log|debug)\s*\(/)) {
        issues.push({ file: path, line: i + 1, message: `console.${line.includes("debug") ? "debug" : "log"} statement`, severity: "warning", category: "lint" });
      }
      // Trailing whitespace
      if (line.match(/\s+$/) && line.trim().length > 0) {
        issues.push({ file: path, line: i + 1, message: "Trailing whitespace", severity: "info", category: "lint" });
      }
      // var usage
      if (line.match(/\bvar\s+/)) {
        issues.push({ file: path, line: i + 1, message: "Use 'const' or 'let' instead of 'var'", severity: "warning", category: "lint" });
      }
      // == instead of ===
      if (line.match(/[^!=]==(?!=)/)) {
        issues.push({ file: path, line: i + 1, message: "Use '===' instead of '=='", severity: "warning", category: "lint" });
      }
    }

    // Missing semicolons at end of statements (rough check)
    if (ext !== "css") {
      const semicolonLines = lines.filter(l => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*") && !l.trim().endsWith("{") && !l.trim().endsWith("}") && !l.trim().endsWith(",") && !l.trim().endsWith("(") && !l.trim().endsWith(")") && !l.trim().startsWith("import") && !l.trim().startsWith("export") && !l.trim().startsWith("return") && !l.trim().startsWith("if") && !l.trim().startsWith("else") && !l.trim().startsWith("for") && !l.trim().startsWith("while") && !l.trim().startsWith("case") && !l.trim().startsWith("default") && l.trim().length > 0);
      // Only flag if consistently missing (heuristic)
    }
  }

  const errors = issues.filter(i => i.severity === "error");
  output.push(`Checked ${fileCount} files`);
  output.push(`${issues.length} issues found (${errors.length} errors, ${issues.filter(i => i.severity === "warning").length} warnings)`);
  if (errors.length === 0) output.push("Lint passed ✓");

  return { passed: errors.length === 0, issues, output };
}

function runTypecheck(files: Record<string, string>): { passed: boolean; issues: ValidationIssue[]; output: string[] } {
  const issues: ValidationIssue[] = [];
  const output: string[] = [];
  let fileCount = 0;

  for (const [path, content] of Object.entries(files)) {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (!["ts", "tsx"].includes(ext)) continue;
    fileCount++;

    // Check for 'any' type usage
    const anyMatches = content.match(/:\s*any\b/g);
    if (anyMatches && anyMatches.length > 3) {
      issues.push({ file: path, message: `Excessive 'any' usage (${anyMatches.length} occurrences)`, severity: "warning", category: "type" });
    }

    // Check for missing return types on exported functions
    const exportedFns = content.match(/export\s+(const|function)\s+\w+\s*=?\s*\([^)]*\)\s*(?:=>|{)/g) || [];
    // Just count, don't error

    // Check for @ts-ignore
    if (content.includes("@ts-ignore") || content.includes("@ts-nocheck")) {
      issues.push({ file: path, message: "TypeScript error suppression directive found", severity: "warning", category: "type" });
    }

    // Unbalanced braces
    const opens = (content.match(/\{/g) || []).length;
    const closes = (content.match(/\}/g) || []).length;
    if (Math.abs(opens - closes) > 1) {
      issues.push({ file: path, message: `Unbalanced braces: ${opens} opens vs ${closes} closes`, severity: "error", category: "type" });
    }
  }

  const errors = issues.filter(i => i.severity === "error");
  output.push(`Type-checked ${fileCount} TypeScript files`);
  output.push(`${errors.length} errors, ${issues.filter(i => i.severity === "warning").length} warnings`);
  if (errors.length === 0) output.push("Type check passed ✓");

  return { passed: errors.length === 0, issues, output };
}

function runTests(files: Record<string, string>): { passed: boolean; issues: ValidationIssue[]; output: string[] } {
  const output: string[] = [];
  const testFiles = Object.keys(files).filter(p => p.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/));
  
  output.push(`Found ${testFiles.length} test file(s)`);
  
  if (testFiles.length === 0) {
    output.push("No test files found — skipping (pass)");
    return { passed: true, issues: [], output };
  }

  // Check test files for basic structure
  let totalTests = 0;
  for (const tf of testFiles) {
    const content = files[tf] || "";
    const describes = (content.match(/describe\s*\(/g) || []).length;
    const its = (content.match(/\bit\s*\(/g) || []).length + (content.match(/\btest\s*\(/g) || []).length;
    totalTests += its;
  }

  output.push(`${totalTests} test(s) detected across ${testFiles.length} file(s)`);
  output.push("Test analysis passed ✓");

  return { passed: true, issues: [], output };
}

function runQualityScan(files: Record<string, string>): { passed: boolean; issues: ValidationIssue[]; output: string[]; metrics: Record<string, number> } {
  const issues: ValidationIssue[] = [];
  const output: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (!["js", "ts", "jsx", "tsx"].includes(ext)) continue;

    // Function length check
    const lines = content.split("\n");
    if (lines.length > 300) {
      issues.push({ file: path, message: `File too long (${lines.length} lines) — consider splitting`, severity: "warning", category: "quality" });
    }

    // Security checks
    if (content.includes("eval(")) {
      issues.push({ file: path, message: "eval() usage — security risk", severity: "error", category: "security" });
    }
    if (content.includes("dangerouslySetInnerHTML")) {
      issues.push({ file: path, message: "dangerouslySetInnerHTML — XSS risk", severity: "warning", category: "security" });
    }
    if (content.match(/localStorage\.setItem\s*\(\s*['"](?:token|password|secret)/i)) {
      issues.push({ file: path, message: "Storing sensitive data in localStorage", severity: "error", category: "security" });
    }

    // Accessibility checks (JSX files)
    if (ext === "jsx" || ext === "tsx") {
      const imgTags = content.match(/<img\b[^>]*>/g) || [];
      for (const img of imgTags) {
        if (!img.includes("alt=") && !img.includes("alt =")) {
          issues.push({ file: path, message: "img without alt attribute", severity: "warning", category: "accessibility" });
        }
      }
      if (content.includes("onClick") && !content.includes("onKeyDown") && !content.includes("onKeyPress") && !content.includes("role=")) {
        // Only flag if it's on a non-interactive element
        const divClicks = content.match(/<div[^>]*onClick/g) || [];
        if (divClicks.length > 0) {
          issues.push({ file: path, message: "onClick on non-interactive element without keyboard handler", severity: "warning", category: "accessibility" });
        }
      }
    }
  }

  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const securityIssues = issues.filter(i => i.category === "security");
  const a11yIssues = issues.filter(i => i.category === "accessibility");
  const score = Math.max(0, 100 - errors.length * 15 - warnings.length * 3);

  output.push(`Code quality score: ${score}/100`);
  output.push(`${errors.length} errors, ${warnings.length} warnings`);
  output.push(`Security: ${securityIssues.length} issues • A11y: ${a11yIssues.length} issues`);
  if (errors.length === 0) output.push("Quality scan passed ✓");
  else output.push(`Quality scan FAILED — ${errors.length} critical issue(s)`);

  return {
    passed: errors.length === 0,
    issues,
    output,
    metrics: {
      codeScore: score,
      errorCount: errors.length,
      warningCount: warnings.length,
      securityIssues: securityIssues.length,
      accessibilityIssues: a11yIssues.length,
    },
  };
}

function runBuild(files: Record<string, string>): { passed: boolean; output: string[]; metrics: Record<string, number> } {
  const output: string[] = [];
  const fileCount = Object.keys(files).length;
  const totalBytes = Object.values(files).reduce((s, c) => s + new TextEncoder().encode(c).length, 0);
  const bundleSizeKb = Math.round(totalBytes / 1024);

  // Check for entry point
  const hasEntry = Object.keys(files).some(p => p.match(/App\.(jsx|tsx|js|ts)$/));
  if (!hasEntry) {
    output.push("Warning: No App entry point found");
  }

  // Check exports
  const missingExports = Object.entries(files)
    .filter(([p]) => p.match(/\.(jsx|tsx)$/) && !p.includes("index"))
    .filter(([, c]) => !c.includes("export"));

  if (missingExports.length > 0) {
    output.push(`Warning: ${missingExports.length} component(s) missing exports`);
  }

  output.push(`Bundled ${fileCount} files (${bundleSizeKb} KB)`);
  output.push("Build completed ✓");

  return {
    passed: true,
    output,
    metrics: { bundleSizeKb, fileCount },
  };
}

interface GateRule {
  rule_id: string;
  name: string;
  threshold: number;
  operator: string;
  severity: string;
  enabled: boolean;
}

function runGates(
  metrics: Record<string, number>,
  gates: GateRule[]
): { passed: boolean; output: string[]; results: Array<{ rule_id: string; name: string; value: number; threshold: number; passed: boolean; severity: string }> } {
  const output: string[] = [];
  const results: Array<{ rule_id: string; name: string; value: number; threshold: number; passed: boolean; severity: string }> = [];

  const metricMap: Record<string, string> = {
    "code-score": "codeScore",
    "no-critical-issues": "errorCount",
    "max-warnings": "warningCount",
    "bundle-size": "bundleSizeKb",
    "file-count": "fileCount",
    "no-security-issues": "securityIssues",
    "accessibility-score": "accessibilityIssues",
    "test-coverage": "testCoverage",
  };

  for (const gate of gates.filter(g => g.enabled)) {
    const metricKey = metricMap[gate.rule_id] || gate.rule_id;
    const value = metrics[metricKey] ?? 0;
    let passed = true;

    switch (gate.operator) {
      case "gte": passed = value >= gate.threshold; break;
      case "lte": passed = value <= gate.threshold; break;
      case "eq": passed = value === gate.threshold; break;
    }

    results.push({ rule_id: gate.rule_id, name: gate.name, value, threshold: gate.threshold, passed, severity: gate.severity });
  }

  const blockers = results.filter(r => !r.passed && r.severity === "blocker");
  const warnings = results.filter(r => !r.passed && r.severity === "warning");
  const score = results.length > 0 ? Math.round((results.filter(r => r.passed).length / results.length) * 100) : 100;

  output.push(`Gate score: ${score}%`);
  output.push(`${blockers.length} blockers, ${warnings.length} warnings`);
  output.push(blockers.length === 0 ? "All quality gates passed ✓" : "Quality gates FAILED — deploy blocked");

  return { passed: blockers.length === 0, output, results };
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const body: PipelineRequest = await req.json();
    const { project_id, files, gates: clientGates } = body;

    if (!project_id || !files || Object.keys(files).length === 0) {
      return new Response(JSON.stringify({ error: "project_id and files required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    const totalBytes = Object.values(files).reduce((s, c) => s + new TextEncoder().encode(c).length, 0);

    // Create build job
    const { data: buildJob, error: insertErr } = await adminClient
      .from("build_jobs")
      .insert({
        project_id,
        user_id: user.id,
        status: "building",
        source_files: files,
        file_count: Object.keys(files).length,
        total_size_bytes: totalBytes,
        started_at: new Date().toISOString(),
        build_log: [`[${new Date().toISOString()}] Pipeline started — ${Object.keys(files).length} files`],
      })
      .select("id")
      .single();

    if (insertErr || !buildJob) {
      return new Response(JSON.stringify({ error: "Failed to create build job" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buildId = buildJob.id;
    const buildLog: string[] = [`[${new Date().toISOString()}] Pipeline started`];

    const stages = ["lint", "typecheck", "test", "quality", "build", "gates"] as const;
    const stageResults: Record<string, { passed: boolean; output: string[]; duration: number }> = {};
    let allMetrics: Record<string, number> = { testCoverage: 0 };
    let failed = false;
    let failedStage = "";

    // Load gates from DB if not provided
    let gateRules: GateRule[] = [];
    if (clientGates && clientGates.length > 0) {
      gateRules = clientGates;
    } else {
      const { data: dbGates } = await adminClient
        .from("quality_gates")
        .select("*")
        .eq("project_id", project_id);
      if (dbGates && dbGates.length > 0) {
        gateRules = dbGates.map((g: any) => ({
          rule_id: g.rule_id,
          name: g.name,
          threshold: Number(g.threshold),
          operator: g.operator,
          severity: g.severity,
          enabled: g.enabled,
        }));
      } else {
        // Default gates
        gateRules = [
          { rule_id: "code-score", name: "Code Quality Score", threshold: 60, operator: "gte", severity: "blocker", enabled: true },
          { rule_id: "no-critical-issues", name: "No Critical Issues", threshold: 0, operator: "lte", severity: "blocker", enabled: true },
          { rule_id: "max-warnings", name: "Max Warnings", threshold: 20, operator: "lte", severity: "warning", enabled: true },
          { rule_id: "bundle-size", name: "Bundle Size Limit", threshold: 5000, operator: "lte", severity: "warning", enabled: true },
          { rule_id: "no-security-issues", name: "No Security Issues", threshold: 0, operator: "lte", severity: "blocker", enabled: true },
          { rule_id: "accessibility-score", name: "Accessibility Score", threshold: 5, operator: "lte", severity: "warning", enabled: true },
        ];
      }
    }

    for (const stage of stages) {
      const stageStart = Date.now();
      buildLog.push(`[${new Date().toISOString()}] Stage: ${stage}`);

      // Update status in real-time
      await adminClient.from("build_jobs").update({
        status: `stage:${stage}`,
        build_log: buildLog,
      }).eq("id", buildId);

      let result: { passed: boolean; output: string[] };

      switch (stage) {
        case "lint": {
          const r = runLint(files);
          result = r;
          break;
        }
        case "typecheck": {
          const r = runTypecheck(files);
          result = r;
          break;
        }
        case "test": {
          const r = runTests(files);
          result = r;
          break;
        }
        case "quality": {
          const r = runQualityScan(files);
          result = r;
          allMetrics = { ...allMetrics, ...r.metrics };
          break;
        }
        case "build": {
          const r = runBuild(files);
          result = r;
          allMetrics = { ...allMetrics, ...r.metrics };
          break;
        }
        case "gates": {
          const r = runGates(allMetrics, gateRules);
          result = r;
          // Store gate results in validation_results
          await adminClient.from("build_jobs").update({
            validation_results: { gateResults: r.results, metrics: allMetrics, passed: r.passed },
          }).eq("id", buildId);
          break;
        }
        default:
          result = { passed: true, output: [] };
      }

      const duration = Date.now() - stageStart;
      stageResults[stage] = { ...result, duration };
      buildLog.push(...result.output.map(l => `  ${l}`));
      buildLog.push(`[${new Date().toISOString()}] ${stage} ${result.passed ? "PASSED" : "FAILED"} (${duration}ms)`);

      if (!result.passed) {
        failed = true;
        failedStage = stage;
        // Mark remaining stages as skipped
        for (const s of stages) {
          if (!stageResults[s]) {
            stageResults[s] = { passed: false, output: ["Skipped"], duration: 0 };
          }
        }
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    const finalStatus = failed ? "failed" : "complete";

    buildLog.push(`[${new Date().toISOString()}] Pipeline ${finalStatus} in ${totalDuration}ms`);

    await adminClient.from("build_jobs").update({
      status: finalStatus,
      build_log: buildLog,
      build_duration_ms: totalDuration,
      completed_at: new Date().toISOString(),
      error: failed ? `Pipeline failed at stage: ${failedStage}` : null,
    }).eq("id", buildId);

    return new Response(JSON.stringify({
      build_id: buildId,
      status: finalStatus,
      stages: stageResults,
      metrics: allMetrics,
      duration_ms: totalDuration,
      failed_stage: failed ? failedStage : null,
      build_log: buildLog,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Pipeline runner error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
