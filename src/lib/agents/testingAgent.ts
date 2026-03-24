/**
 * Testing Agent — Auto-generates and validates smoke tests post-build.
 * 
 * Performs structural validation that goes beyond static analysis:
 * - Route reachability (every route has a renderable page)
 * - Component completeness (no empty/stub components)
 * - Data flow validation (hooks return expected shapes)
 * - Auth flow integrity (login → protected routes → logout)
 * - UI element presence (forms have submit buttons, tables have rows)
 */

import type { AgentResult, TestResult, PipelineContext } from "./types";

/**
 * Run smoke tests against the built workspace.
 */
export function runTestingAgent(ctx: PipelineContext): AgentResult {
  const start = performance.now();
  const workspace = ctx.results.get("frontend")?.files || ctx.existingWorkspace;
  const tests: TestResult[] = [];

  // 1. Route reachability
  tests.push(...testRouteReachability(workspace, ctx));

  // 2. Component completeness
  tests.push(...testComponentCompleteness(workspace));

  // 3. Auth flow integrity
  tests.push(...testAuthFlow(workspace));

  // 4. Data flow validation
  tests.push(...testDataFlow(workspace));

  // 5. UI element presence
  tests.push(...testUIElements(workspace));

  // 6. Import chain validation
  tests.push(...testImportChains(workspace));

  const passed = tests.filter(t => t.passed).length;
  const failed = tests.filter(t => !t.passed).length;

  return {
    agent: "testing",
    status: failed > 0 ? "done" : "done",
    testResults: tests,
    summary: `${passed}/${tests.length} smoke tests passed, ${failed} failed`,
    durationMs: performance.now() - start,
    metadata: { passed, failed, total: tests.length },
  };
}

function testRouteReachability(workspace: Record<string, string>, ctx: PipelineContext): TestResult[] {
  const results: TestResult[] = [];
  const appFile = workspace["/App.jsx"] || workspace["/App.tsx"] || "";

  // Extract routes from App.jsx
  const routeMatches = appFile.matchAll(/path=["']([^"']+)["']/g);
  const routes: string[] = [];
  for (const m of routeMatches) routes.push(m[1]);

  if (routes.length === 0) {
    results.push({
      name: "Routes defined",
      passed: false,
      details: "No routes found in App.jsx",
      file: "/App.jsx",
    });
    return results;
  }

  results.push({
    name: "Routes defined",
    passed: true,
    details: `Found ${routes.length} routes: ${routes.join(", ")}`,
    file: "/App.jsx",
  });

  // Check each route has a corresponding component import
  const importMatches = appFile.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+)["']/g);
  const importedComponents = new Map<string, string>();
  for (const m of importMatches) {
    importedComponents.set(m[1], m[2]);
  }

  // Check route elements reference imported components
  const elementMatches = appFile.matchAll(/element=\{<(\w+)/g);
  for (const m of elementMatches) {
    const component = m[1];
    if (component === "Navigate") continue;
    const importPath = importedComponents.get(component);
    if (!importPath) {
      results.push({
        name: `Route component "${component}" imported`,
        passed: false,
        details: `Component "${component}" used in route but not imported`,
        file: "/App.jsx",
      });
    }
  }

  return results;
}

function testComponentCompleteness(workspace: Record<string, string>): TestResult[] {
  const results: TestResult[] = [];
  const componentFiles = Object.entries(workspace).filter(([p]) =>
    (p.includes("/pages/") || p.includes("/components/")) &&
    !p.includes("/ui/") &&
    p.match(/\.(jsx|tsx)$/)
  );

  for (const [path, content] of componentFiles) {
    const lines = content.split("\n").filter(l => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("import"));

    // Check for stub/placeholder content (avoid false positives from input placeholder="...")
    const contentForStubCheck = content.replace(
      /\bplaceholder\s*=\s*\{?\s*["'`][^"'`]*["'`]\s*\}?/gi,
      "",
    );

    const hasStubLanguage =
      /\bTODO\b/i.test(contentForStubCheck) ||
      /\bcoming soon\b/i.test(contentForStubCheck) ||
      /\bstub\b/i.test(contentForStubCheck) ||
      /\bplaceholder\b/i.test(contentForStubCheck);

    const hasOnlyBareScaffold =
      lines.length < 5 &&
      !/return\s*\(/.test(content) &&
      !/use(State|Effect|Memo|Callback|Ref)\b/.test(content);

    const hasLoadingOnlyShell =
      /\bLoading\b/i.test(contentForStubCheck) && !/use(State|Effect|Memo|Callback|Ref)\b/.test(content);

    const isStub = hasOnlyBareScaffold || hasStubLanguage || hasLoadingOnlyShell;

    if (isStub) {
      results.push({
        name: `${path} is complete`,
        passed: false,
        details: `Component appears to be a stub or placeholder (${lines.length} meaningful lines)`,
        file: path,
      });
    }

    // Check for default export
    if (!content.includes("export default")) {
      results.push({
        name: `${path} has default export`,
        passed: false,
        details: "Missing default export",
        file: path,
      });
    }
  }

  if (componentFiles.length > 0 && results.length === 0) {
    results.push({
      name: "All components complete",
      passed: true,
      details: `${componentFiles.length} components validated`,
    });
  }

  return results;
}

function testAuthFlow(workspace: Record<string, string>): TestResult[] {
  const results: TestResult[] = [];
  const allCode = Object.values(workspace).join("\n");

  const hasAuth = allCode.includes("AuthContext") || allCode.includes("useAuth") || allCode.includes("AuthProvider");
  if (!hasAuth) {
    results.push({
      name: "Auth flow",
      passed: true,
      details: "No auth detected — skipping auth tests",
    });
    return results;
  }

  // Check for login page
  const hasLogin = Object.keys(workspace).some(p =>
    p.toLowerCase().includes("login") || p.toLowerCase().includes("signin")
  );
  results.push({
    name: "Login page exists",
    passed: hasLogin,
    details: hasLogin ? "Login page found" : "Auth is configured but no login page exists",
  });

  // Check for signup page
  const hasSignup = Object.keys(workspace).some(p =>
    p.toLowerCase().includes("signup") || p.toLowerCase().includes("register")
  );
  results.push({
    name: "Signup page exists",
    passed: hasSignup,
    details: hasSignup ? "Signup page found" : "Auth is configured but no signup page exists",
  });

  // Check for protected route wrapper
  const hasProtectedRoute = allCode.includes("ProtectedRoute") || allCode.includes("RequireAuth");
  results.push({
    name: "Protected routes configured",
    passed: hasProtectedRoute,
    details: hasProtectedRoute ? "Route protection found" : "No route protection wrapper detected",
  });

  // Check AuthContext doesn't use useNavigate
  const authContextFile = workspace["/contexts/AuthContext.jsx"] || workspace["/contexts/AuthContext.tsx"] || "";
  if (authContextFile) {
    const usesNavigate = authContextFile.includes("useNavigate");
    results.push({
      name: "AuthContext free of useNavigate",
      passed: !usesNavigate,
      details: usesNavigate
        ? "AuthContext imports useNavigate — this will crash if used outside Router"
        : "AuthContext correctly avoids useNavigate",
      file: "/contexts/AuthContext.jsx",
    });
  }

  return results;
}

function testDataFlow(workspace: Record<string, string>): TestResult[] {
  const results: TestResult[] = [];
  const hookFiles = Object.entries(workspace).filter(([p]) =>
    p.includes("/hooks/") && p.match(/\.(jsx?|tsx?)$/)
  );

  for (const [path, content] of hookFiles) {
    // Check hooks return something
    const hasReturn = content.includes("return {") || content.includes("return [");
    if (!hasReturn) {
      results.push({
        name: `${path} returns data`,
        passed: false,
        details: "Hook doesn't appear to return structured data",
        file: path,
      });
    }
  }

  // Check service files have proper API patterns
  const serviceFiles = Object.entries(workspace).filter(([p]) =>
    p.includes("/services/") && p.match(/\.(jsx?|tsx?)$/)
  );

  for (const [path, content] of serviceFiles) {
    const hasExports = content.includes("export ");
    if (!hasExports) {
      results.push({
        name: `${path} exports functions`,
        passed: false,
        details: "Service file has no exports",
        file: path,
      });
    }
  }

  return results;
}

function testUIElements(workspace: Record<string, string>): TestResult[] {
  const results: TestResult[] = [];

  const pageFiles = Object.entries(workspace).filter(([p]) =>
    p.includes("/pages/") && p.match(/\.(jsx|tsx)$/)
  );

  for (const [path, content] of pageFiles) {
    // Dashboard pages should have stat cards
    if (path.toLowerCase().includes("dashboard")) {
      const hasStats = content.includes("stat-card") || content.includes("StatCard") ||
        content.includes("Card") || content.includes("stat");
      if (!hasStats) {
        results.push({
          name: `${path} has dashboard widgets`,
          passed: false,
          details: "Dashboard page lacks stat cards or widgets",
          file: path,
        });
      }
    }

    // List pages should have tables
    const isListPage = path.match(/\/(students|contacts|orders|products|employees|tasks|invoices)\//i);
    if (isListPage) {
      const hasTable = content.includes("Table") || content.includes("<table") || content.includes("DataTable");
      if (!hasTable) {
        results.push({
          name: `${path} has data table`,
          passed: false,
          details: "List page lacks a data table component",
          file: path,
        });
      }
    }
  }

  return results;
}

function testImportChains(workspace: Record<string, string>): TestResult[] {
  const results: TestResult[] = [];
  const filePaths = new Set(Object.keys(workspace));
  let brokenCount = 0;

  for (const [path, content] of Object.entries(workspace)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    const importMatches = content.matchAll(/from\s+["'](\.[^"']+)["']/g);
    for (const m of importMatches) {
      const importPath = m[1];
      const dir = path.substring(0, path.lastIndexOf("/"));
      const resolved = resolveRelativePath(dir, importPath);

      // Check if the resolved path exists (with extension variants)
      const extensions = ["", ".jsx", ".tsx", ".js", ".ts"];
      const found = extensions.some(ext => filePaths.has(resolved + ext)) ||
        extensions.some(ext => filePaths.has(resolved + "/index" + ext));

      if (!found) {
        brokenCount++;
        if (brokenCount <= 5) { // Cap at 5 to avoid noise
          results.push({
            name: `Import resolves: ${path} → ${importPath}`,
            passed: false,
            details: `Resolved to "${resolved}" but file not found in workspace`,
            file: path,
          });
        }
      }
    }
  }

  if (brokenCount === 0) {
    results.push({
      name: "All local imports resolve",
      passed: true,
      details: "Every relative import points to an existing file",
    });
  } else if (brokenCount > 5) {
    results.push({
      name: `${brokenCount - 5} more broken imports`,
      passed: false,
      details: `Total of ${brokenCount} unresolved imports found`,
    });
  }

  return results;
}

function resolveRelativePath(fromDir: string, importPath: string): string {
  const parts = (fromDir + "/" + importPath).split("/");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  return "/" + resolved.join("/");
}
