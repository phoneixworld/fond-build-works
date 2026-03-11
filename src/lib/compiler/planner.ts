/**
 * Build Compiler v1.0 — Planner
 * 
 * Turns a BuildContext into a TaskGraph (DAG of build tasks).
 * Deterministic: same inputs → same graph.
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
  // (only if IR extraction found explicit entities)

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
    // Split into layout + individual page tasks to avoid truncation.

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

    // Task B: Domain pages (split by concern to avoid truncation)
    const domainPagesTask = createTask({
      label: "domain:pages",
      type: "frontend",
      description: `Generate ALL the main page components for this application.
The user asked for: "${ctx.rawRequirements.slice(0, 1500)}"

IMPORTANT QUALITY RULES:
- Create 5-8 domain-appropriate pages based on the app name/requirements
- The DASHBOARD page MUST include: 4 stat cards with icons and trends, a data table with 5+ sample rows, and section headers
- LIST pages MUST include: search bar, filter button, add button, data table with sample data, status badges, action buttons
- FORM pages MUST include: proper labeled inputs, validation, submit/cancel buttons
- Every page must use useState with realistic hardcoded sample data (real names, dates, numbers)
- Use lucide-react for icons everywhere
- Use color tokens: var(--color-primary), var(--color-bg), var(--color-text), var(--color-border), var(--color-success), var(--color-warning), var(--color-danger)
- NO placeholder text like "Loading..." or "Coming soon" — every page must render complete UI

Put each page in its own directory: /pages/ModuleName/ModuleName.jsx`,
      produces: [],  // Dynamic — compiler will capture whatever files are generated
      dependsOn: [infraTask.id, authTaskId, layoutTask.id],
      priority: 3,
    });
    tasks.push(domainPagesTask);
    pageTaskIds.push(layoutTask.id, domainPagesTask.id);
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
    priority: 4,
  });
  tasks.push(appTask);

  // ── Build passes ──────────────────────────────────────────────────

  const passes = buildPasses(tasks);

  return { tasks, passes };
}

// ─── Pass Grouping ────────────────────────────────────────────────────────

/**
 * Group tasks into passes based on dependency resolution.
 * Tasks in the same pass have no inter-dependencies and can run in parallel.
 */
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
      // Circular dependency — force remaining into a single pass
      console.warn("[Planner] Circular dependency detected, forcing remaining tasks");
      passes.push([...remaining]);
      break;
    }

    // Sort by priority within pass
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
    buildPrompt: "", // Filled by executor with full context
    dependsOn: params.dependsOn || [],
    produces: params.produces,
    touches: params.touches || [],
    priority: params.priority,
    status: "pending",
    retries: 0,
  };
}
