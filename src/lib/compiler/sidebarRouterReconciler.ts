/**
 * Sidebar–Router Reconciler — Phase 3.97
 * 
 * Ensures every nav link in Sidebar has a matching route in App
 * and a corresponding page file. Generates stubs for missing pages.
 */

import type { Workspace } from "./workspace";

interface ReconciliationResult {
  routesAdded: number;
  stubsGenerated: string[];
  warnings: string[];
}

/**
 * Parse Sidebar for nav paths (NavLink to="...", Link to="...", href="...")
 */
function extractSidebarPaths(workspace: Workspace): string[] {
  const sidebarCandidates = ["/layout/Sidebar.tsx", "/layout/Sidebar.jsx", "/components/Sidebar.tsx", "/components/Sidebar.jsx"];
  const sidebarPath = sidebarCandidates.find(p => workspace.hasFile(p));
  if (!sidebarPath) return [];

  const content = workspace.getFile(sidebarPath) || "";
  const paths = new Set<string>();

  // Match NavLink/Link to="..." patterns
  const toRegex = /(?:NavLink|Link)\s+to=["']([^"']+)["']/g;
  for (const m of content.matchAll(toRegex)) {
    const path = m[1];
    if (path.startsWith("/")) paths.add(path);
  }

  // Match href="..." on anchor-like elements
  const hrefRegex = /href=["']([^"'#][^"']*)["']/g;
  for (const m of content.matchAll(hrefRegex)) {
    const path = m[1];
    if (path.startsWith("/")) paths.add(path);
  }

  // Match path strings in navigation config arrays
  const configRegex = /(?:path|to|href)\s*:\s*["']([^"']+)["']/g;
  for (const m of content.matchAll(configRegex)) {
    const path = m[1];
    if (path.startsWith("/")) paths.add(path);
  }

  return [...paths];
}

/**
 * Parse App.jsx for defined route paths (<Route path="..." />)
 */
function extractRouterPaths(workspace: Workspace): string[] {
  const appCandidates = ["/App.jsx", "/App.tsx", "/App.js"];
  const appPath = appCandidates.find(p => workspace.hasFile(p));
  if (!appPath) return [];

  const content = workspace.getFile(appPath) || "";
  const paths = new Set<string>();

  const routeRegex = /<Route\s+[^>]*path=["']([^"']+)["']/g;
  for (const m of content.matchAll(routeRegex)) {
    paths.add(m[1]);
  }

  return [...paths];
}

/**
 * Find existing page files that could serve a given path
 */
function findPageFileForPath(workspace: Workspace, routePath: string): string | null {
  const segment = routePath.replace(/^\//, "").replace(/-/g, "");
  const pageName = segment.charAt(0).toUpperCase() + segment.slice(1);

  const candidates = [
    `/pages/${pageName}/${pageName}Page.jsx`,
    `/pages/${pageName}Page.jsx`,
    `/pages/${pageName}/${pageName}.jsx`,
    `/pages/${pageName}.jsx`,
  ];

  return candidates.find(c => workspace.hasFile(c)) || null;
}

/**
 * Generate a stub page component for a missing route
 */
function generateStubPage(pageName: string, routePath: string): string {
  const title = pageName.replace(/Page$/, "").replace(/([A-Z])/g, " $1").trim();
  return `import React from "react";

export default function ${pageName}() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>${title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Manage ${title.toLowerCase()} from this page.
        </p>
      </div>
      <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        <p style={{ color: "var(--color-text-secondary)" }}>
          ${title} content will appear here.
        </p>
      </div>
    </div>
  );
}
`;
}

/**
 * Add a route to App.jsx for a page that exists but isn't routed
 */
function addRouteToApp(workspace: Workspace, routePath: string, pageName: string, pageFilePath: string): boolean {
  const appCandidates = ["/App.jsx", "/App.tsx", "/App.js"];
  const appPath = appCandidates.find(p => workspace.hasFile(p));
  if (!appPath) return false;

  let content = workspace.getFile(appPath) || "";

  // Check if route already exists
  if (content.includes(`path="${routePath}"`)) return false;

  // Add import if not present
  const importName = pageName;
  if (!new RegExp(`import\\s+.*\\b${importName}\\b`).test(content)) {
    const importPath = `.${pageFilePath.replace(/\.\w+$/, "")}`;
    const importLine = `import ${importName} from "${importPath}";\n`;
    const lastImportIdx = content.lastIndexOf("\nimport ");
    if (lastImportIdx >= 0) {
      const endOfLine = content.indexOf("\n", lastImportIdx + 1);
      content = content.slice(0, endOfLine + 1) + importLine + content.slice(endOfLine + 1);
    } else {
      content = importLine + content;
    }
  }

  // Add route before closing </Routes>
  const routesCloseIdx = content.lastIndexOf("</Routes>");
  if (routesCloseIdx >= 0) {
    // Check if ProtectedRoute is used in the file
    const usesProtectedRoute = content.includes("ProtectedRoute");
    const routeElement = usesProtectedRoute
      ? `        <Route path="${routePath}" element={<ProtectedRoute><${importName} /></ProtectedRoute>} />\n`
      : `        <Route path="${routePath}" element={<${importName} />} />\n`;
    content = content.slice(0, routesCloseIdx) + routeElement + content.slice(routesCloseIdx);
  }

  workspace.updateFile(appPath, content);
  return true;
}

/**
 * Main reconciliation pass.
 * Call after all tasks complete and before final verification.
 */
export function reconcileSidebarAndRouter(workspace: Workspace): ReconciliationResult {
  const result: ReconciliationResult = { routesAdded: 0, stubsGenerated: [], warnings: [] };

  const sidebarPaths = extractSidebarPaths(workspace);
  const routerPaths = extractRouterPaths(workspace);

  if (sidebarPaths.length === 0) {
    return result; // No sidebar or no nav links found
  }

  const routerSet = new Set(routerPaths);
  const missing = sidebarPaths.filter(p => !routerSet.has(p) && p !== "/");

  if (missing.length === 0) return result;

  console.log(`[SidebarReconciler] Found ${missing.length} sidebar paths with no matching route: ${missing.join(", ")}`);

  for (const path of missing) {
    const segment = path.replace(/^\//, "").replace(/-(\w)/g, (_, c) => c.toUpperCase());
    const pageName = segment.charAt(0).toUpperCase() + segment.slice(1) + "Page";

    // Check if a page file already exists
    let pageFile = findPageFileForPath(workspace, path);

    if (!pageFile) {
      // Generate stub page
      const stubPath = `/pages/${pageName.replace(/Page$/, "")}/${pageName}.jsx`;
      workspace.addFile(stubPath, generateStubPage(pageName, path));
      result.stubsGenerated.push(stubPath);
      pageFile = stubPath;
      console.log(`[SidebarReconciler] Generated stub page: ${stubPath} for ${path}`);
    }

    // Add route to App.jsx
    if (addRouteToApp(workspace, path, pageName, pageFile)) {
      result.routesAdded++;
      console.log(`[SidebarReconciler] Added route: ${path} → ${pageName}`);
    }
  }

  return result;
}
