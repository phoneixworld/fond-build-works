/**
 * Post-Build Structural Invariant Checks
 * 
 * Validates critical invariants after every build:
 * 1. Every sidebar nav path has a matching route in App.jsx
 * 2. Every route in App.jsx points to an existing page file
 * 3. No database table names are in the diagnostic denylist
 * 4. ir.routes.length >= 1 for non-trivial apps
 */

import type { Workspace } from "./workspace";
import { cloudLog } from "@/lib/cloudLogBus";

export interface InvariantResult {
  passed: boolean;
  violations: InvariantViolation[];
}

export interface InvariantViolation {
  invariant: string;
  severity: "error" | "warning";
  message: string;
}

/**
 * Run all structural invariant checks.
 * Returns violations — the build should be marked as degraded if errors exist.
 */
export function checkBuildInvariants(
  workspace: Workspace,
  routeCount: number,
  tableMappings?: Record<string, string>
): InvariantResult {
  const violations: InvariantViolation[] = [];

  // Invariant 1: Sidebar nav paths ⊆ App.jsx routes
  violations.push(...checkSidebarRouteAlignment(workspace));

  // Invariant 2: App.jsx route targets → existing page files
  violations.push(...checkRouteFileExistence(workspace));

  // Invariant 3: No diagnostic-word database tables
  if (tableMappings) {
    violations.push(...checkTableNames(tableMappings));
  }

  // Invariant 4: Non-empty routes
  if (routeCount < 1) {
    violations.push({
      invariant: "non-empty-routes",
      severity: "warning",
      message: "ir.routes is empty — the app may have no navigable pages",
    });
  }

  const errors = violations.filter(v => v.severity === "error");
  if (errors.length > 0) {
    cloudLog.warn(`[BuildInvariants] ${errors.length} invariant violation(s) detected`, "compiler");
  }

  return {
    passed: errors.length === 0,
    violations,
  };
}

function checkSidebarRouteAlignment(workspace: Workspace): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const sidebarCandidates = ["/layout/Sidebar.tsx", "/layout/Sidebar.jsx", "/components/Sidebar.tsx", "/components/Sidebar.jsx"];
  const sidebarPath = sidebarCandidates.find(p => workspace.hasFile(p));
  if (!sidebarPath) return [];

  const sidebarContent = workspace.getFile(sidebarPath) || "";
  const sidebarPaths = new Set<string>();

  for (const m of sidebarContent.matchAll(/(?:NavLink|Link)\s+to=["']([^"']+)["']/g)) {
    if (m[1].startsWith("/")) sidebarPaths.add(m[1]);
  }
  for (const m of sidebarContent.matchAll(/(?:path|to|href)\s*:\s*["']([^"']+)["']/g)) {
    if (m[1].startsWith("/")) sidebarPaths.add(m[1]);
  }

  const appCandidates = ["/App.jsx", "/App.tsx", "/App.js"];
  const appPath = appCandidates.find(p => workspace.hasFile(p));
  if (!appPath) return [];

  const appContent = workspace.getFile(appPath) || "";
  const routerPaths = new Set<string>();
  for (const m of appContent.matchAll(/<Route\s+[^>]*path=["']([^"']+)["']/g)) {
    routerPaths.add(m[1]);
  }

  for (const navPath of sidebarPaths) {
    if (navPath === "/" || routerPaths.has(navPath)) continue;
    violations.push({
      invariant: "sidebar-route-alignment",
      severity: "warning",
      message: `Sidebar link "${navPath}" has no matching route in ${appPath}`,
    });
  }

  return violations;
}

function checkRouteFileExistence(workspace: Workspace): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const appCandidates = ["/App.jsx", "/App.tsx", "/App.js"];
  const appPath = appCandidates.find(p => workspace.hasFile(p));
  if (!appPath) return [];

  const appContent = workspace.getFile(appPath) || "";

  // Extract component imports used in routes
  const routeElements = [...appContent.matchAll(/<Route\s+[^>]*element=\{<(\w+)/g)];
  const importMap = new Map<string, string>();

  for (const m of appContent.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+)["']/g)) {
    importMap.set(m[1], m[2]);
  }
  for (const m of appContent.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+["']([^"']+)["']/g)) {
    importMap.set(m[1], m[2]);
  }

  for (const routeMatch of routeElements) {
    const componentName = routeMatch[1];
    // Skip built-in wrappers
    if (["ProtectedRoute", "Navigate", "AppLayout"].includes(componentName)) continue;

    const importPath = importMap.get(componentName);
    if (!importPath) continue;

    // Check if the file exists in workspace
    const resolved = workspace.resolveImport(appPath, importPath);
    if (!resolved || !workspace.hasFile(resolved)) {
      violations.push({
        invariant: "route-file-existence",
        severity: "warning",
        message: `Route component "${componentName}" (from "${importPath}") does not resolve to a workspace file`,
      });
    }
  }

  return violations;
}

const TABLE_DENYLIST = new Set([
  "blank", "missing", "these", "error", "stack", "route", "warning",
  "broken", "crash", "issue", "fix", "bug", "fail", "undefined",
  "null", "invalid", "unknown", "empty", "stub", "placeholder", "todo",
  "complete", "comprehensive", "build", "check", "done", "step", "next",
  "more", "implement", "state", "dynamic", "basic", "dedicated", "go",
]);

function checkTableNames(tableMappings: Record<string, string>): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const logicalName of Object.keys(tableMappings)) {
    if (TABLE_DENYLIST.has(logicalName.toLowerCase())) {
      violations.push({
        invariant: "table-name-denylist",
        severity: "error",
        message: `Database table "${logicalName}" appears to be extracted from diagnostic text, not a real entity`,
      });
    }
  }

  return violations;
}
