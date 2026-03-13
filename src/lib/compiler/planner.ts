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

  if (ir.routes.length > 0) {
    // Structured routes from IR extraction
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
  } else if (ctx.buildIntent === "new_app") {
    // ── SEMANTIC FALLBACK: No routes extracted from regex ──────────
    // Split into layout + components + individual page tasks.

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

Analyze the app name to determine the correct navigation items. Examples:
- "School ERP" → Dashboard, Students, Staff, Attendance, Gradebook, Fees, Timetable, Announcements
- "CRM" → Dashboard, Contacts, Deals, Pipeline, Activities, Reports
- "Project Manager" → Dashboard, Projects, Tasks, Kanban, Team, Timeline

Use NavLink from react-router-dom for active state detection. Make the sidebar collapsible on mobile.`,
      produces: [
        "/layout/AppLayout.jsx",
        "/layout/Sidebar.jsx",
      ],
      dependsOn: [infraTask.id, authTaskId],
      priority: 3,
    });
    tasks.push(layoutTask);

    // Task B: Reusable domain components (widgets, panels, charts)
    const componentsTask = createTask({
      label: "domain:components",
      type: "frontend",
      description: `Generate reusable domain components for: "${ctx.rawRequirements.slice(0, 1000)}"

IMPORTANT: Create 6-10 reusable components that pages will import. Each component should be self-contained with sample data.

REQUIRED components to generate:
1. /components/StatCard.jsx — Reusable stat card with icon, value, label, trend (up/down), and background color props. Uses CSS animations for entrance.
2. /components/DataTable.jsx — Reusable sortable table with props: columns (array of {key, label, render?}), data, onRowClick, searchable, pagination. Includes empty state.
3. /components/StatusBadge.jsx — Reusable badge with status prop mapping to colors (active→green, pending→yellow, inactive→gray, overdue→red, etc.)
4. /components/PageHeader.jsx — Reusable page header with title, subtitle, action buttons slot, breadcrumbs
5. /components/SearchFilterBar.jsx — Reusable search + filter bar with search input, filter dropdown, optional date range, add button
6. /components/ActivityFeed.jsx — Recent activity list with avatar, action text, timestamp. Uses sample data (5+ items).
7. /components/QuickActions.jsx — Grid of shortcut action cards with icons and labels
8. /components/NotificationBell.jsx — Notification icon with badge count and dropdown list

OPTIONAL (generate if relevant to the domain):
- /components/ChartCard.jsx — Simple bar/line chart using CSS (no external lib needed)
- /components/KPIGrid.jsx — Grid of KPI metrics with sparklines
- /components/FormModal.jsx — Reusable modal form wrapper with title, fields, submit/cancel

Each component must:
- Accept props for customization
- Include realistic default/sample data
- Use CSS variables for theming: var(--color-primary), var(--color-text), etc.
- Use lucide-react icons
- Have smooth hover transitions and entrance animations
- Export as default`,
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

    // Task C: Dashboard page (separate task for richness)
    const dashboardTask = createTask({
      label: "page:Dashboard",
      type: "frontend",
      description: `Generate a RICH, production-grade Dashboard page for: "${ctx.rawRequirements.slice(0, 1000)}"

The Dashboard page (/pages/Dashboard/Dashboard.jsx) MUST include ALL of these:
1. Welcome header with user greeting and current date
2. 4 StatCard components imported from /components/StatCard — with domain-relevant metrics
3. ActivityFeed component imported from /components/ActivityFeed — showing recent actions
4. QuickActions component imported from /components/QuickActions — showing 4-6 shortcut cards
5. A DataTable component imported from /components/DataTable — showing recent records (5+ rows)
6. Optional: ChartCard with a simple CSS bar chart showing weekly/monthly trends

CRITICAL:
- Import reusable components from ../components/ — do NOT inline them
- Use domain-specific data (not generic "Sarah Johnson"). E.g., for School ERP: student names, class data, attendance rates
- Use useState for interactive search/filter
- Entrance animations using "animate-fade-in" class
- Responsive grid: stat cards in 4-col grid, activity + actions side by side on desktop`,
      produces: ["/pages/Dashboard/Dashboard.jsx"],
      dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id],
      priority: 4,
    });
    tasks.push(dashboardTask);
    pageTaskIds.push(dashboardTask.id);

    // Task D: Individual domain pages (split into max 3 pages per task to avoid truncation)
    const domainPagesTask1 = createTask({
      label: "domain:pages-1",
      type: "frontend",
      description: `Generate the FIRST batch of domain pages for: "${ctx.rawRequirements.slice(0, 1200)}"

Generate 3 pages. Analyze the app name to determine which modules are most important.

RULES:
- Each page goes in /pages/ModuleName/ModuleName.jsx
- Each page MUST import from /components/ (StatCard, DataTable, StatusBadge, PageHeader, SearchFilterBar)
- Each page must have useState with realistic hardcoded data (5-10 rows, real names, dates, numbers)
- Include search, filter, add button, data table, status badges, row actions (edit/delete)
- Use domain-specific column names and data types
- Each page must have an "Add New" modal using a simple form
- Pages must export default

Examples by domain:
- School ERP → Students list, Staff list, Attendance tracker
- CRM → Contacts list, Deals pipeline, Activities log
- Hospital → Patients list, Appointments, Doctors directory
- Inventory → Products list, Orders, Suppliers`,
      produces: [],
      dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id],
      priority: 4,
    });
    tasks.push(domainPagesTask1);
    pageTaskIds.push(domainPagesTask1.id);

    const domainPagesTask2 = createTask({
      label: "domain:pages-2",
      type: "frontend",
      description: `Generate the SECOND batch of domain pages for: "${ctx.rawRequirements.slice(0, 1200)}"

Generate 2-3 MORE pages that were NOT created in the previous task. Check the workspace for already-created pages and create DIFFERENT ones.

RULES:
- Each page goes in /pages/ModuleName/ModuleName.jsx
- Import from /components/ (reuse StatCard, DataTable, StatusBadge, PageHeader, SearchFilterBar)
- Include realistic sample data, search, filters, CRUD actions
- These should be secondary/supporting modules. Examples:
  - School ERP → Fees & Billing, Timetable, Announcements, Reports
  - CRM → Reports/Analytics, Email campaigns, Settings
  - Hospital → Billing, Lab Reports, Pharmacy
  - Inventory → Reports, Categories, Warehouses
- Each page must be complete and functional — no placeholders`,
      produces: [],
      dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id, domainPagesTask1.id],
      priority: 4,
    });
    tasks.push(domainPagesTask2);
    pageTaskIds.push(domainPagesTask2.id);

    // Task E: Settings page
    const settingsTask = createTask({
      label: "page:Settings",
      type: "frontend",
      description: `Generate a Settings page at /pages/Settings/Settings.jsx for: "${ctx.rawRequirements.slice(0, 500)}"

The Settings page MUST include:
1. Tabs component with sections: General, Profile, Notifications, Security
2. General tab: App name, timezone, language dropdown
3. Profile tab: Avatar upload area, name, email, phone inputs
4. Notifications tab: Toggle switches for email, SMS, push notifications
5. Security tab: Change password form, two-factor toggle, active sessions list

Use Tabs pattern (tab-list + tab buttons + content panels). Include form validation states.
Import PageHeader from /components/PageHeader.`,
      produces: ["/pages/Settings/Settings.jsx"],
      dependsOn: [infraTask.id, componentsTask.id],
      priority: 4,
    });
    tasks.push(settingsTask);
    pageTaskIds.push(settingsTask.id);

    pageTaskIds.push(layoutTask.id);
  }

  // ── Pass 5: App entry + routing ───────────────────────────────────

  const routesList = ir.routes.length > 0
    ? ir.routes.map(r => r.path).join(", ")
    : "(infer from generated pages)";

  const appTask = createTask({
    label: "app:routing",
    type: "frontend",
    description: `App.jsx with routing for: ${routesList}. Import ALL page components generated in previous tasks. If routes are not listed above, scan the workspace for /pages/**/*.jsx files and create routes for each.`,
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
