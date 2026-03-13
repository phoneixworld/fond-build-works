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

  // ── Detect app type from requirements ──────────────────────────────
  const appType = detectAppType(ctx.rawRequirements, ir);

  // ── Pass 1: Infrastructure (contexts, shared UI, styles) ──────────

  const infraTask = createTask({
    label: "infra",
    type: "infra",
    description: `Shared UI component library with design tokens and global styles.
    
Pre-built components are already scaffolded in the workspace — do NOT regenerate them.
The following 22 shadcn-compatible components are available for import from /components/ui/:
- utils.js: cn() class-merge helper — import { cn } from "./ui/utils"
- Button.jsx: Variants: default, secondary, destructive, ghost, outline, link. Sizes: default, sm, lg, icon
- Card.jsx: Compound: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- Input.jsx: Styled text input with focus ring
- Label.jsx: Form label component
- Badge.jsx: Status badges (default, secondary, success, warning, destructive, outline)
- Separator.jsx: Horizontal/vertical separator
- Skeleton.jsx: Loading placeholder with pulse animation
- Checkbox.jsx: Accessible checkbox with checked/onCheckedChange
- Dialog.jsx: Compound: Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter (open/onOpenChange)
- Table.jsx: Compound: Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption
- Textarea.jsx: Multi-line text input
- Select.jsx: Compound: Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel
- Tabs.jsx: Compound: Tabs, TabsList, TabsTrigger, TabsContent
- Alert.jsx: Compound: Alert, AlertTitle, AlertDescription (default, destructive, success, warning)
- Avatar.jsx: Compound: Avatar, AvatarImage, AvatarFallback
- Progress.jsx: Progress bar with value/max props
- Switch.jsx: Toggle switch with checked/onCheckedChange
- Tooltip.jsx: Compound: TooltipProvider, Tooltip, TooltipTrigger, TooltipContent
- ScrollArea.jsx: Scrollable container
- Dropdown.jsx: Compound: DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
- Sheet.jsx: Compound: Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose
- Popover.jsx: Compound: Popover, PopoverTrigger, PopoverContent
- Accordion.jsx: Compound: Accordion, AccordionItem, AccordionTrigger, AccordionContent
- Modal.jsx: Simple modal with isOpen/onClose/title
- DataTable.jsx: Sortable/paginated table with columns/data props
- Toast.jsx: ToastContainer + showToast(message, type)
- Spinner.jsx: Loading spinner

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

    if (appType === "landing") {
      // ── LANDING PAGE flow: generate section components ──────────────

      // Task A: Navbar + Footer layout
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

      // Task B: Hero + Stats sections
      const heroTask = createTask({
        label: "section:hero",
        type: "frontend",
        description: `Generate Hero and Stats sections for: "${ctx.rawRequirements.slice(0, 1200)}"

Create THESE files:
1. /components/HeroSection.jsx — Full-width hero with:
   - Badge/chip at top ("Now in Beta", "New Feature", etc.)
   - Large bold headline (text-5xl to text-7xl)
   - Subtitle paragraph
   - Two CTA buttons (primary + secondary)
   - Decorative gradient background or pattern
   - Animated entrance using CSS transitions or framer-motion
   
2. /components/StatsSection.jsx — Social proof numbers:
   - 4 key metrics in a grid (e.g., "10,000+ Users", "99.9% Uptime", etc.)
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

      // Task C: Features + How It Works sections
      const featuresTask = createTask({
        label: "section:features",
        type: "frontend",
        description: `Generate Features and How It Works sections for: "${ctx.rawRequirements.slice(0, 1200)}"

Create THESE files:
1. /components/FeaturesSection.jsx — 6 feature cards in a 3-column grid:
   - Each card has an icon, title, description
   - Hover effects (shadow, translate)
   - Content must be domain-specific based on the requirements
   
2. /components/HowItWorks.jsx — 3-step process section:
   - Step numbers (01, 02, 03)
   - Icon, title, description for each step
   - Connected by visual flow (dotted lines or numbered badges)
   - Light background for contrast

3. /components/QuickLinks.jsx — Grid of action/resource cards:
   - 4-6 cards with icon, title, link
   - Can serve as secondary navigation or resource hub
   - Relevant to the domain (e.g., docs, API, tutorials)

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

      // Task D: Testimonials + Pricing + CTA sections
      const socialProofTask = createTask({
        label: "section:social-proof",
        type: "frontend",
        description: `Generate Testimonials, Pricing, and CTA sections for: "${ctx.rawRequirements.slice(0, 1200)}"

Create THESE files:
1. /components/TestimonialsSection.jsx — 3 testimonial cards:
   - Star ratings, quote text, person name + role/company
   - Profile avatar with initials
   - Clean card layout

2. /components/PricingSection.jsx — 3-tier pricing table:
   - Free / Pro / Enterprise tiers
   - Price, features list, CTA button per tier
   - Highlighted "popular" tier with ring/shadow
   - Checkmark icons for features

3. /components/CTASection.jsx — Final call-to-action:
   - Bold headline + description
   - Dark/contrasting background
   - Large CTA button
   - "No credit card required" or similar reassurance

4. /components/NewsSection.jsx — Latest updates/blog cards:
   - 3 article cards with title, excerpt, date
   - Image placeholder or gradient
   - "Read More" links

5. /components/EventsSection.jsx — Upcoming events/announcements:
   - 3-4 event cards with date, title, location
   - Calendar-style date display
   - Register/RSVP button

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

      // Task E: Main landing page that assembles all sections
      const landingPageTask = createTask({
        label: "page:Landing",
        type: "frontend",
        description: `Generate the main landing page that assembles all section components: "${ctx.rawRequirements.slice(0, 800)}"

Create /pages/Index.jsx that imports and renders ALL sections in order:
1. Navbar (from ../components/Navbar)
2. HeroSection (from ../components/HeroSection)
3. StatsSection (from ../components/StatsSection)
4. FeaturesSection (from ../components/FeaturesSection)
5. HowItWorks (from ../components/HowItWorks)
6. QuickLinks (from ../components/QuickLinks)
7. EventsSection (from ../components/EventsSection)
8. NewsSection (from ../components/NewsSection)
9. TestimonialsSection (from ../components/TestimonialsSection)
10. PricingSection (from ../components/PricingSection)
11. CTASection (from ../components/CTASection)
12. Footer (from ../components/Footer)

The page must use a min-h-screen wrapper with smooth scroll enabled.
Do NOT put any section content inline — import everything.`,
        produces: ["/pages/Index.jsx"],
        dependsOn: [infraTask.id, layoutTask.id, heroTask.id, featuresTask.id, socialProofTask.id],
        priority: 4,
      });
      tasks.push(landingPageTask);
      pageTaskIds.push(landingPageTask.id, layoutTask.id, heroTask.id, featuresTask.id, socialProofTask.id);

    } else {
      // ── DASHBOARD/CRUD flow (existing logic) ──────────────────────

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
    }
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
