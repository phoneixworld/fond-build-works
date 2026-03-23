/**
 * Build Compiler v1.1 — Planner
 *
 * Turns a BuildContext into a TaskGraph (DAG of build tasks).
 * Deterministic: same inputs → same graph.
 *
 * v1.1: Richer structure — generates reusable domain components,
 * individual page tasks, and dashboard widget tasks for professional output.
 * v1.2: Extend/fix builds reuse rich page instructions and avoid hollow tasks.
 */

import type { BuildContext, CompilerTask, IRManifest, TaskGraph, TaskType } from "./types";
import type { IR } from "@/lib/ir";

/**
 * Converts new structured IR into the legacy IRManifest format used by the planner.
 * When structuredIR is available, it becomes the source of truth for entities, routes, etc.
 */
function mergeStructuredIR(legacyIR: IRManifest, sir: IR): IRManifest {
  const entities = Object.entries(sir.entities).map(([name, entity]) => ({
    name,
    fields: Object.entries(entity.fields).map(([fieldName, field]) => ({
      name: fieldName,
      type: field.type,
      required: field.required,
    })),
    relationships: Object.entries(entity.fields)
      .filter(([, f]) => f.relation)
      .map(([, f]) => ({
        target: f.relation!.entity,
        type: f.relation!.type === "many" ? "one-to-many" as const : "many-to-one" as const,
      })),
  }));

  const routes = sir.pages.map(page => ({
    path: page.path,
    page: page.name,
    auth: page.type !== "custom" && page.path !== "/login" && page.path !== "/signup",
    roles: [] as string[],
  }));

  // Preserve legacy roles/workflows/modules/constraints, override entities & routes
  return {
    entities: entities.length > 0 ? entities : legacyIR.entities,
    roles: legacyIR.roles,
    workflows: legacyIR.workflows,
    routes: routes.length > 0 ? routes : legacyIR.routes,
    modules: legacyIR.modules,
    constraints: legacyIR.constraints,
  };
}


type AppType = "landing" | "dashboard" | "crud";

/**
 * Detect the app type from requirements to generate appropriate components.
 * Landing pages get section components; dashboard/CRUD apps get data components.
 */
function detectAppType(rawRequirements: string, ir: BuildContext["ir"]): AppType {
  const text = rawRequirements.toLowerCase();

  const landingSignals = [
    "landing page", "website", "homepage", "home page", "marketing",
    "portfolio", "hero section", "testimonials", "pricing page",
    "saas", "startup", "company website", "business website",
    "brochure", "informational", "promotional", "showcase",
    "college website", "school website", "university", "institution",
    "restaurant website", "agency website", "personal website",
    "features section", "about us", "contact page",
  ];

  const dashboardSignals = [
    "dashboard", "admin panel", "management system", "crm", "erp",
    "inventory", "tracking", "analytics", "reporting", "monitor",
    "crud", "data table", "records", "manage users", "manage orders",
    "employee", "task manager", "project management",
  ];

  const landingScore = landingSignals.filter(s => text.includes(s)).length;
  const dashboardScore = dashboardSignals.filter(s => text.includes(s)).length;

  // If IR has entities (data models), lean toward dashboard/CRUD
  if (ir.entities.length >= 2 && dashboardScore >= landingScore) return "dashboard";

  // Strong landing signals
  if (landingScore > dashboardScore) return "landing";
  if (landingScore > 0 && ir.entities.length === 0) return "landing";

  // Default to dashboard for apps with data models
  if (ir.entities.length > 0) return "dashboard";

  // Default based on overall tone
  return dashboardScore > 0 ? "dashboard" : "landing";
}

let taskCounter = 0;
function nextId(): string {
  return `task-${++taskCounter}`;
}

function toPascalCase(raw: string, fallback = "Item"): string {
  const cleaned = (raw || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return cleaned || fallback;
}

function normalizeRoutePath(raw: string): string {
  if (!raw || raw === "/") return "/";
  const normalized = raw
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/-/g, "/")
    .replace(/-\//g, "/")
    .replace(/^[-/]+|[-/]+$/g, "");
  return `/${normalized || "home"}`;
}

function normalizeManifestForTasks(ir: IRManifest): IRManifest {
  return {
    ...ir,
    entities: ir.entities.map((entity) => {
      const safeName = toPascalCase(entity.name, "Entity");
      return {
        ...entity,
        name: safeName,
        relationships: entity.relationships?.map((rel) => ({
          ...rel,
          target: toPascalCase(rel.target, "Entity"),
        })),
      };
    }),
    routes: ir.routes.map((route) => {
      const basePage = toPascalCase((route.page || "").replace(/Page$/i, ""), "Page");
      return {
        ...route,
        page: `${basePage}Page`,
        path: normalizeRoutePath(route.path || `/${basePage}`),
      };
    }),
  };
}

// ─── Task Graph Generation ────────────────────────────────────────────────

export function planTaskGraph(ctx: BuildContext, structuredIR?: IR): TaskGraph {
  taskCounter = 0;
  const tasks: CompilerTask[] = [];
  const { buildIntent } = ctx;

  // ── Merge structured IR into legacy IR format if available ─────────
  const mergedIR = structuredIR
    ? mergeStructuredIR(ctx.ir, structuredIR)
    : ctx.ir;
  const ir = normalizeManifestForTasks(mergedIR);

  // ── Detect app type from requirements ──────────────────────────────
  const appType = detectAppType(ctx.rawRequirements, ir);

  // ── Pass 1: Infrastructure (contexts, shared UI, styles) ──────────

  const infraTask = createTask({
    label: "infra",
    type: "infra",
    description: `Shared UI component library with design tokens and global styles.

Pre-built components are already scaffolded in the workspace — do NOT regenerate them.
The following shadcn-compatible components are available for import from /components/ui/:
- utils.js: cn() class-merge helper — import { cn } from "./ui/utils"
- Button.jsx, Card.jsx (+ CardHeader/Title/Description/Content/Footer), Input.jsx, Label.jsx, Badge.jsx,
  Separator.jsx, Skeleton.jsx, Checkbox.jsx, Dialog.jsx (+ DialogContent/Header/Title/Description/Footer),
  Table.jsx (+ TableHeader/Body/Footer/Head/Row/Cell/Caption), Textarea.jsx, Select.jsx (+ Trigger/Value/Content/Item/Group/Label),
  Tabs.jsx (+ TabsList/Trigger/Content), Alert.jsx (+ AlertTitle/AlertDescription), Avatar.jsx (+ AvatarImage/AvatarFallback),
  Progress.jsx, Switch.jsx, Tooltip.jsx, ScrollArea.jsx, DropdownMenu.jsx, Sheet.jsx, Popover.jsx, Accordion.jsx,
  Modal.jsx, DataTable.jsx, Toast.jsx, Spinner.jsx.

Only generate globals.css with design tokens. All UI components are pre-scaffolded.`,
    produces: ["/styles/globals.css"],
    priority: 0,
  });
  tasks.push(infraTask);

  // ── Pass 2: Auth (skip for landing pages unless explicitly needed) ──

  let authTaskId: string = "";
  if (appType !== "landing" || ir.roles.length > 0) {
    const authTask = createTask({
      label: "auth",
      type: "frontend",
      description: `Auth system with roles: ${ir.roles.map(r => r.name).join(", ") || "user"}.
Must create AuthContext, LoginPage, SignupPage, and ProtectedRoute.
Login/Signup routes must stay public (never wrapped in ProtectedRoute).`,
      produces: [
        "/contexts/AuthContext.jsx",
        "/pages/Auth/LoginPage.jsx",
        "/pages/Auth/SignupPage.jsx",
        "/components/ProtectedRoute.jsx",
      ],
      dependsOn: [infraTask.id],
      priority: 1,
    });
    tasks.push(authTask);
    authTaskId = authTask.id;
  }

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
      dependsOn: [infraTask.id, ...(authTaskId ? [authTaskId] : [])],
      priority: 2,
    });
    tasks.push(modelTask);
    modelTaskIds.push(modelTask.id);
  }

  // ── Pass 4: Pages / UI ────────────────────────────────────────────

  const pageTaskIds: string[] = [];

  const isNewApp = ctx.buildIntent === "new_app";

  if (isNewApp) {
    // ── NEW APP FLOW ────────────────────────────────────────────────
    if (appType === "landing") {
      // ── LANDING PAGE flow: generate section components ──────────────

      const layoutTask = createTask({
        label: "domain:layout",
        type: "frontend",
        description: `Generate layout components for a landing page/website: "${ctx.rawRequirements.slice(0, 1500)}"

Create THESE files:
1. /components/Navbar.jsx — Sticky top navbar with:
   - Logo/brand name on the left
   - Navigation links (Features, How It Works, Pricing, Testimonials, Contact)
   - Mobile hamburger menu with slide-down
   - Sign In + Get Started CTA buttons
   - Transparent → solid bg on scroll
   - Import { Menu, X } from lucide-react

2. /components/Footer.jsx — Professional footer with:
   - Brand logo + tagline
   - 4 link columns (Product, Resources, Company, Legal)
   - Social media icons
   - Copyright line
   - Responsive grid layout`,
        produces: [
          "/components/Navbar.jsx",
          "/components/Footer.jsx",
        ],
        dependsOn: [infraTask.id],
        priority: 3,
      });
      tasks.push(layoutTask);

      const heroTask = createTask({
        label: "section:hero",
        type: "frontend",
        description: `Generate Hero and Stats sections for: "${ctx.rawRequirements.slice(0, 1200)}"

Create THESE files:
1. /components/HeroSection.jsx — Full-width hero with:
   - Badge/chip at top
   - Large bold headline
   - Subtitle paragraph
   - Two CTA buttons
   - Decorative gradient background or pattern

2. /components/StatsSection.jsx — Social proof numbers:
   - 4 key metrics in a grid
   - Dark background for contrast
   - Domain-relevant numbers based on the user's requirements

Each component must export default and use lucide-react for icons.`,
        produces: [
          "/components/HeroSection.jsx",
          "/components/StatsSection.jsx",
        ],
        dependsOn: [infraTask.id],
        priority: 3,
      });
      tasks.push(heroTask);

      const featuresTask = createTask({
        label: "section:features",
        type: "frontend",
        description: `Generate Features and How It Works sections for: "${ctx.rawRequirements.slice(0, 1200)}"

Create THESE files:
1. /components/FeaturesSection.jsx — 6 feature cards in a 3-column grid
2. /components/HowItWorks.jsx — 3-step process section
3. /components/QuickLinks.jsx — Grid of action/resource cards

Each component must export default and use lucide-react for icons.`,
        produces: [
          "/components/FeaturesSection.jsx",
          "/components/HowItWorks.jsx",
          "/components/QuickLinks.jsx",
        ],
        dependsOn: [infraTask.id],
        priority: 3,
      });
      tasks.push(featuresTask);

      const socialProofTask = createTask({
        label: "section:social-proof",
        type: "frontend",
        description: `Generate Testimonials, Pricing, CTA, News, and Events sections for: "${ctx.rawRequirements.slice(0, 1200)}"

Create THESE files:
- /components/TestimonialsSection.jsx
- /components/PricingSection.jsx
- /components/CTASection.jsx
- /components/NewsSection.jsx
- /components/EventsSection.jsx

Each component must export default and use lucide-react for icons.`,
        produces: [
          "/components/TestimonialsSection.jsx",
          "/components/PricingSection.jsx",
          "/components/CTASection.jsx",
          "/components/NewsSection.jsx",
          "/components/EventsSection.jsx",
        ],
        dependsOn: [infraTask.id],
        priority: 3,
      });
      tasks.push(socialProofTask);

      const landingPageTask = createTask({
        label: "page:Landing",
        type: "frontend",
        description: `Generate the main landing page that assembles all section components: "${ctx.rawRequirements.slice(0, 800)}"

Create /pages/Index.jsx that imports and renders ALL sections in order:
Navbar, HeroSection, StatsSection, FeaturesSection, HowItWorks, QuickLinks,
EventsSection, NewsSection, TestimonialsSection, PricingSection, CTASection, Footer.

Use a min-h-screen wrapper with smooth scroll enabled.
Do NOT put any section content inline — import everything.`,
        produces: ["/pages/Index.jsx"],
        dependsOn: [infraTask.id, layoutTask.id, heroTask.id, featuresTask.id, socialProofTask.id],
        priority: 4,
      });
      tasks.push(landingPageTask);
      pageTaskIds.push(landingPageTask.id, layoutTask.id, heroTask.id, featuresTask.id, socialProofTask.id);
    } else {
      // ── DASHBOARD/CRUD flow ────────────────────────────────────────

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

      const routes = ir.routes.length > 0 ? ir.routes : [];
      const dashboardRoute = routes.find(r => r.page === "DashboardPage" || r.path === "/");
      const otherRoutes = routes.filter(r => r.page !== "LoginPage" && r !== dashboardRoute);

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

      // Generate one task per domain page to avoid oversized model outputs and truncation.
      for (const route of otherRoutes) {
        const pageDir = route.page.replace(/Page$/, "");
        const pagePath = `/pages/${pageDir}/${route.page}.jsx`;

        const domainPageTask = createTask({
          label: `page:${pageDir}`,
          type: "frontend",
          description: `Generate a complete domain page for route ${route.path}: ${route.page}.

Create this file:
- ${pagePath}

RULES:
- Import reusable components from /components/ (StatCard, DataTable, StatusBadge, PageHeader, SearchFilterBar) where applicable.
- ALL data MUST come from API calls via project-api. NEVER use inline data arrays or SAMPLE_DATA.
- Include loading skeletons and empty state UI for when data is loading or absent.
- Add search/filter UI and primary page actions when relevant.
- Keep the page fully functional with sensible defaults; do NOT leave placeholders.
- Export default.` ,
          produces: [pagePath],
          dependsOn: [infraTask.id, authTaskId, layoutTask.id, componentsTask.id],
          priority: 4,
        });

        tasks.push(domainPageTask);
        pageTaskIds.push(domainPageTask.id);
      }

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
    }
  } else {
    // ── EXTEND / FIX / REFACTOR FLOW ─────────────────────────────────
    // Reuse rich page semantics instead of hollow "Page component for X" tasks.

    const routes = ir.routes.length > 0 ? ir.routes : [];

    for (const route of routes) {
      if (route.page === "LoginPage" && authTaskId) continue;

      const deps = [...modelTaskIds];
      if (authTaskId && route.auth) deps.push(authTaskId);
      if (deps.length === 0) {
        deps.push(infraTask.id);
        if (authTaskId) deps.push(authTaskId);
      }

      const pageDir = route.page.replace(/Page$/, "");
      const pagePath = `/pages/${pageDir}/${route.page}.jsx`;

      const pageTask = createTask({
        label: `page:${route.page}`,
        type: "frontend",
        description: `Update or create the page component for route ${route.path}: ${route.page}.

RULES:
- If the file already exists, MODIFY it in-place: preserve existing layout, imports, and behavior.
- Use domain components from /components/ (StatCard, DataTable, StatusBadge, PageHeader, SearchFilterBar, ActivityFeed, QuickActions) where appropriate.
- Use /components/ui/ primitives (Button, Card, Table, Dialog, Tabs, etc.) for structure.
- Do NOT recreate AuthContext, layout, or shared components.
- Keep styling and structure consistent with the rest of the app.`,
        produces: [pagePath],
        dependsOn: deps,
        priority: 3,
      });
      tasks.push(pageTask);
      pageTaskIds.push(pageTask.id);
    }
  }

  // ── Pass 5: Sidebar ↔ Router verification ─────────────────────────

  const sidebarVerifyTask = createTask({
    label: "sidebar:verify-and-stub",
    type: "frontend",
    description: `Verify that /layout/Sidebar.jsx navigation links match the routes in /App.jsx and existing pages.

Responsibilities:
- Parse /layout/Sidebar.jsx and extract all NavLink/Link paths.
- Parse /App.jsx and ensure there is a <Route> for each sidebar path.
- For any sidebar path without a matching route:
  - Add a <Route> entry in /App.jsx pointing to a stub page.
  - Generate a simple, fully working stub page under /pages/Module/ModulePage.jsx that:
    - Imports PageHeader and DataTable from /components/
    - Renders a basic table with 5-10 rows of realistic sample data
    - Uses proper layout and styling consistent with the rest of the app.
- Do NOT remove existing routes or pages.`,
    produces: ["/App.jsx"],
    dependsOn: [...pageTaskIds],
    priority: 5,
    touches: ["/App.jsx", "/layout/Sidebar.jsx"],
  });
  tasks.push(sidebarVerifyTask);

  // ── Pass 6: App entry + routing ───────────────────────────────────

  const routesList = ir.routes.length > 0
    ? ir.routes.map(r => `${r.path} → ${r.page}`).join(", ")
    : "(infer from generated pages)";

  const appRoutingDescription = appType === "landing"
    ? `App.jsx for a landing page/website.

CRITICAL: This is a LANDING PAGE, not a dashboard app.
- Import the main page from /pages/Index.jsx
- Use HashRouter with a single route: "/" → Index
- Include ToastProvider wrapper if it exists
- Do NOT use AppLayout with sidebar — landing pages don't have sidebars
- Do NOT include AuthContext unless auth files exist in the workspace
- Scan workspace for actual generated files and import them correctly.`
    : `App.jsx with routing for: ${routesList}.

CRITICAL:
- Import page components from their DIRECTORY structure: /pages/ModuleName/ModuleNamePage.jsx.
- Scan the workspace for /pages/**/*.jsx and /layout/AppLayout.jsx files.
- Use AppLayout as a parent route with <Outlet /> for nested page routes.
- Include AuthContext provider, ToastProvider, and ProtectedRoute wrappers if they exist.
- Do NOT regenerate pages or layout here — only wire up routing.`;

  const appDeps = [...pageTaskIds, sidebarVerifyTask.id];
  if (authTaskId) appDeps.push(authTaskId);

  const appTask = createTask({
    label: "app:routing",
    type: "frontend",
    description: appRoutingDescription,
    produces: ["/App.jsx"],
    dependsOn: appDeps,
    touches: ["/App.jsx"],
    priority: 6,
  });
  tasks.push(appTask);

  console.log(`[Planner] App type: ${appType}, tasks: ${tasks.length}, passes: ${buildPasses(tasks).length}${structuredIR ? `, structuredIR: ${Object.keys(structuredIR.entities).length} entities, ${structuredIR.pages.length} pages` : ''}`);

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
