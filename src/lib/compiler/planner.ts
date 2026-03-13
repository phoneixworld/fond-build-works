/**
 * Build Compiler v1.0 — Planner
 * 
 * Turns a BuildContext into a TaskGraph (DAG of build tasks).
 * Deterministic: same inputs → same graph.
 * 
 * v1.1: Richer structure — generates reusable domain components,
 * individual page tasks, and dashboard widget tasks for professional output.
 */

import type { BuildContext, CompilerTask, TaskGraph, TaskType } from "./types";

let taskCounter = 0;
function nextId(): string {
  return `task-${++taskCounter}`;
}

// ─── Task Graph Generation ────────────────────────────────────────────────

export function planTaskGraph(ctx: BuildContext): TaskGraph {
  taskCounter = 0;
  const tasks: CompilerTask[] = [];
  const { ir, buildIntent } = ctx;

  // ── Pass 1: Infrastructure (contexts, shared UI, styles) ──────────

  const infraTask = createTask({
    label: "infra",
    type: "infra",
    description: `Shared UI component library with design tokens and global styles.
    
Pre-built components are already scaffolded in the workspace — do NOT regenerate them.
The following components are available for import in all subsequent tasks:
- Card.jsx: Stat card mode (<Card title icon value trend trendUp />) and generic card mode
- Button.jsx: Variants: primary, secondary, danger, ghost, outline. Sizes: sm, md, lg, icon
- Modal.jsx: Accessible modal with backdrop, ESC close, size variants
- DataTable.jsx: Sortable columns, pagination, empty state, row click handler
- Toast.jsx: Multi-toast stack with showToast(message, type) API
- Spinner.jsx: Loading spinner with size prop
- Dialog.jsx: Compound component (Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter)
- Sheet.jsx: Slide-in panel from any edge (Sheet with side="right|left|top|bottom")
- Badge.jsx: Status badges (default, success, warning, danger, info, outline variants)
- Tabs.jsx: Compound tabs (Tabs, TabsList, TabsTrigger, TabsContent)
- Select.jsx: Custom dropdown select with search
- Avatar.jsx: User avatar with image or initials fallback
- Input.jsx: Styled input with label, error state, and icon support
- Dropdown.jsx: Action menu (DropdownMenu, DropdownItem, DropdownSeparator)
- Alert.jsx: Notification banners (info, success, warning, error variants)

Only generate globals.css with design tokens. All UI components are pre-scaffolded.`,
    produces: [
      "/styles/globals.css",
    ],
    priority: 0,
  });
  tasks.push(infraTask);

  // ── Pass 2: Auth (always generated — build prompt mandates AuthContext) ──

  const authTask = createTask({
    label: "auth",
    type: "frontend",
    description: `Auth system with roles: ${ir.roles.map(r => r.name).join(", ") || "user"}. Must create AuthContext, LoginPage, and ProtectedRoute.`,
    produces: [
      "/contexts/AuthContext.jsx",
      "/pages/Auth/LoginPage.jsx",
      "/components/ProtectedRoute.jsx",
    ],
    dependsOn: [infraTask.id],
    priority: 1,
  });
  tasks.push(authTask);
  const authTaskId = authTask.id;

  // ── Pass 3: Data models / backend services ────────────────────────

  const modelTaskIds: string[] = [];
  for (const entity of ir.entities) {
    const modelTask = createTask({
      label: `model:${entity.name.toLowerCase()}`,
      type: "backend",
      description: `Data model, hooks, and API service for ${entity.name} (fields: ${entity.fields.map(f => f.name).join(", ")})`,
      produces: [
        `/hooks/use${entity.name}.jsx`,
        `/services/${entity.name.toLowerCase()}Service.js`,
      ],
      dependsOn: [infraTask.id, authTaskId],
      priority: 2,
    });
    tasks.push(modelTask);
    modelTaskIds.push(modelTask.id);
  }

  // ── Pass 4: Pages / UI ────────────────────────────────────────────

  const pageTaskIds: string[] = [];

  if (ctx.buildIntent === "new_app") {
    // ── Always generate layout + domain components for new apps ──────

    // Task A: Layout shell (sidebar + app wrapper)
    const layoutTask = createTask({
      label: "domain:layout",
      type: "frontend",
      description: `Generate the layout shell for this application: "${ctx.rawRequirements.slice(0, 1500)}"

Create TWO files:
1. /layout/AppLayout.jsx — Main layout wrapper with a sidebar on the left and {children} content area on the right. Must use <Outlet /> from react-router-dom for nested routing.
2. /layout/Sidebar.jsx — Professional sidebar with:
   - App logo/name at the top
   - Navigation links with icons (from lucide-react) for each module
   - Active state highlighting using useLocation() from react-router-dom
   - User info section at the bottom with logout button
   - Smooth hover transitions and proper spacing
   - Collapsible on mobile with hamburger toggle

Use NavLink from react-router-dom for active state detection.`,
      produces: [
        "/layout/AppLayout.jsx",
        "/layout/Sidebar.jsx",
      ],
      dependsOn: [infraTask.id, authTaskId],
      priority: 3,
    });
    tasks.push(layoutTask);

    // Task B: Reusable domain components
    const componentsTask = createTask({
      label: "domain:components",
      type: "frontend",
      description: `Generate reusable domain components for: "${ctx.rawRequirements.slice(0, 1000)}"

REQUIRED components to generate (each in its own file):
1. /components/StatCard.jsx — Reusable stat card with icon, value, label, trend props
2. /components/DataTable.jsx — Sortable table with columns, data, onRowClick, searchable, pagination props
3. /components/StatusBadge.jsx — Badge with status prop mapping to colors
4. /components/PageHeader.jsx — Page header with title, subtitle, action buttons slot
5. /components/SearchFilterBar.jsx — Search + filter bar with search input, filter dropdown, add button
6. /components/ActivityFeed.jsx — Recent activity list with avatar, action text, timestamp
7. /components/QuickActions.jsx — Grid of shortcut action cards with icons and labels
8. /components/NotificationBell.jsx — Notification icon with badge count and dropdown

Each component must accept props, include realistic defaults, use lucide-react icons, and export default.`,
      produces: [
        "/components/StatCard.jsx",
        "/components/DataTable.jsx",
        "/components/StatusBadge.jsx",
        "/components/PageHeader.jsx",
        "/components/SearchFilterBar.jsx",
        "/components/ActivityFeed.jsx",
        "/components/QuickActions.jsx",
        "/components/NotificationBell.jsx",
      ],
      dependsOn: [infraTask.id],
      priority: 3,
    });
    tasks.push(componentsTask);

    // ── Generate page tasks from routes (or infer them) ──────────────

    const routes = ir.routes.length > 0 ? ir.routes : [];
    const dashboardRoute = routes.find(r => r.page === "DashboardPage" || r.path === "/");
    const otherRoutes = routes.filter(r => r.page !== "LoginPage" && r !== dashboardRoute);

    // Task C: Dashboard page (always created for new apps)
    const dashPageName = dashboardRoute?.page || "DashboardPage";
    const dashboardTask = createTask({
      label: "page:Dashboard",
      type: "frontend",
      description: `Generate a RICH Dashboard page for: "${ctx.rawRequirements.slice(0, 1000)}"

Create /pages/Dashboard/${dashPageName}.jsx that MUST include:
1. Welcome header with user greeting and current date
2. 4 StatCard components imported from ../../components/StatCard
3. ActivityFeed imported from ../../components/ActivityFeed
4. QuickActions imported from ../../components/QuickActions
5. DataTable imported from ../../components/DataTable showing recent records (5+ rows)

CRITICAL: Import reusable components — do NOT inline them. Use domain-specific data.`,
      produces: [`/pages/Dashboard/${dashPageName}.jsx`],
      dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id],
      priority: 4,
    });
    tasks.push(dashboardTask);
    pageTaskIds.push(dashboardTask.id);

    // Task D: First batch of domain pages (up to 3)
    const batch1Routes = otherRoutes.slice(0, 3);
    const batch1Produces = batch1Routes.map(r => `/pages/${r.page.replace(/Page$/, '')}/${r.page}.jsx`);
    if (batch1Routes.length > 0) {
      const domainPagesTask1 = createTask({
        label: "domain:pages-1",
        type: "frontend",
        description: `Generate ${batch1Routes.length} domain pages for: "${ctx.rawRequirements.slice(0, 1200)}"

Generate these pages:
${batch1Routes.map(r => `- /pages/${r.page.replace(/Page$/, '')}/${r.page}.jsx (route: ${r.path})`).join("\n")}

RULES:
- Each page MUST import from /components/ (StatCard, DataTable, StatusBadge, PageHeader, SearchFilterBar)
- Each page must have useState with realistic hardcoded data (5-10 rows)
- Include search, filter, add button, data table, status badges, row actions
- Each page must have an "Add New" modal using a simple form
- Pages must export default`,
        produces: batch1Produces,
        dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id],
        priority: 4,
      });
      tasks.push(domainPagesTask1);
      pageTaskIds.push(domainPagesTask1.id);
    }

    // Task E: Second batch of domain pages (remaining)
    const batch2Routes = otherRoutes.slice(3, 6);
    const batch2Produces = batch2Routes.map(r => `/pages/${r.page.replace(/Page$/, '')}/${r.page}.jsx`);
    if (batch2Routes.length > 0) {
      const domainPagesTask2 = createTask({
        label: "domain:pages-2",
        type: "frontend",
        description: `Generate ${batch2Routes.length} MORE domain pages for: "${ctx.rawRequirements.slice(0, 1200)}"

Generate these pages:
${batch2Routes.map(r => `- /pages/${r.page.replace(/Page$/, '')}/${r.page}.jsx (route: ${r.path})`).join("\n")}

RULES:
- Import from /components/ (reuse StatCard, DataTable, StatusBadge, PageHeader, SearchFilterBar)
- Include realistic sample data, search, filters, CRUD actions
- Each page must be complete and functional — no placeholders`,
        produces: batch2Produces,
        dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id],
        priority: 4,
      });
      tasks.push(domainPagesTask2);
      pageTaskIds.push(domainPagesTask2.id);
    }

    // Task F: Settings page
    const hasSettings = routes.some(r => r.page === "SettingsPage");
    if (!hasSettings) {
      const settingsTask = createTask({
        label: "page:Settings",
        type: "frontend",
        description: `Generate a Settings page at /pages/Settings/SettingsPage.jsx with:
1. Tabs: General, Profile, Notifications, Security
2. General tab: App name, timezone, language dropdown
3. Profile tab: Avatar upload area, name, email, phone inputs
4. Notifications tab: Toggle switches for email, SMS, push notifications
5. Security tab: Change password form, two-factor toggle
Import PageHeader from ../../components/PageHeader.`,
        produces: ["/pages/Settings/SettingsPage.jsx"],
        dependsOn: [infraTask.id, componentsTask.id],
        priority: 4,
      });
      tasks.push(settingsTask);
      pageTaskIds.push(settingsTask.id);
    }

    pageTaskIds.push(layoutTask.id);
  } else {
    // Non-new_app builds (extend/fix/refactor) with structured routes
    for (const route of ir.routes) {
      if (route.page === "LoginPage" && authTaskId) continue;

      const deps = [...modelTaskIds];
      if (authTaskId && route.auth) deps.push(authTaskId);
      if (deps.length === 0) deps.push(infraTask.id, authTaskId);

      const pageTask = createTask({
        label: `page:${route.page}`,
        type: "frontend",
        description: `Page component for ${route.path}: ${route.page}`,
        produces: [`/pages/${route.page}.jsx`],
        dependsOn: deps,
        priority: 3,
      });
      tasks.push(pageTask);
      pageTaskIds.push(pageTask.id);
    }
  }

  // ── Pass 5: App entry + routing ───────────────────────────────────

  const routesList = ir.routes.length > 0
    ? ir.routes.map(r => `${r.path} → ${r.page}`).join(", ")
    : "(infer from generated pages)";

  const appTask = createTask({
    label: "app:routing",
    type: "frontend",
    description: `App.jsx with routing for: ${routesList}.

CRITICAL: Import page components from their DIRECTORY structure: /pages/ModuleName/ModuleName.jsx.
Scan the workspace for /pages/**/*.jsx and /layout/AppLayout.jsx files.
Use AppLayout as a parent route with <Outlet /> for nested page routes.
Include AuthContext provider, ToastProvider, and ProtectedRoute wrappers.`,
    produces: ["/App.jsx"],
    dependsOn: [...pageTaskIds, authTaskId],
    touches: ["/App.jsx"],
    priority: 5,
  });
  tasks.push(appTask);

  // ── Build passes ──────────────────────────────────────────────────

  const passes = buildPasses(tasks);

  return { tasks, passes };
}

// ─── Pass Grouping ────────────────────────────────────────────────────────

function buildPasses(tasks: CompilerTask[]): string[][] {
  const passes: string[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(tasks.map(t => t.id));

  while (remaining.size > 0) {
    const pass: string[] = [];

    for (const taskId of remaining) {
      const task = tasks.find(t => t.id === taskId)!;
      const depsReady = task.dependsOn.every(d => completed.has(d));
      if (depsReady) {
        pass.push(taskId);
      }
    }

    if (pass.length === 0) {
      console.warn("[Planner] Circular dependency detected, forcing remaining tasks");
      passes.push([...remaining]);
      break;
    }

    pass.sort((a, b) => {
      const ta = tasks.find(t => t.id === a)!;
      const tb = tasks.find(t => t.id === b)!;
      return ta.priority - tb.priority;
    });

    passes.push(pass);
    for (const id of pass) {
      completed.add(id);
      remaining.delete(id);
    }
  }

  return passes;
}

// ─── Topological Sort ─────────────────────────────────────────────────────

export function topologicalSort(tasks: CompilerTask[]): CompilerTask[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const sorted: CompilerTask[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const task = taskMap.get(id);
    if (!task) return;
    for (const dep of task.dependsOn) visit(dep);
    sorted.push(task);
  }

  for (const task of tasks) visit(task.id);
  return sorted;
}

// ─── Task Factory ─────────────────────────────────────────────────────────

function createTask(params: {
  label: string;
  type: TaskType;
  description: string;
  produces: string[];
  dependsOn?: string[];
  touches?: string[];
  priority: number;
}): CompilerTask {
  return {
    id: nextId(),
    label: params.label,
    type: params.type,
    description: params.description,
    buildPrompt: "",
    dependsOn: params.dependsOn || [],
    produces: params.produces,
    touches: params.touches || [],
    priority: params.priority,
    status: "pending",
    retries: 0,
  };
}
