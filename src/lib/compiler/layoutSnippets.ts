/**
 * Premium Layout Snippets v1.0
 * 
 * Pre-built layout patterns the builder can reference in task prompts.
 * These provide structural patterns (not just components) for common page types.
 */

export interface LayoutSnippet {
  id: string;
  name: string;
  /** When to use this layout */
  applicableTo: string[];
  /** JSX pattern (template) */
  pattern: string;
}

export const LAYOUT_SNIPPETS: LayoutSnippet[] = [
  {
    id: "dashboard-grid",
    name: "Dashboard KPI Grid",
    applicableTo: ["dashboard", "overview", "home", "analytics"],
    pattern: `
{/* Dashboard KPI Grid Pattern */}
<div className="space-y-8 animate-fade-in">
  {/* Page Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
      <p className="text-sm text-[var(--color-text-muted)] mt-1">Overview of key metrics</p>
    </div>
    <Button>Primary Action</Button>
  </div>

  {/* KPI Stat Cards Row */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {stats.map((stat, i) => (
      <Card key={i} className="hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
        <CardContent className="p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{stat.label}</p>
          <p className="text-2xl font-bold mt-2">{stat.value}</p>
          <p className="text-xs text-[var(--color-success)] mt-1">{stat.trend}</p>
        </CardContent>
      </Card>
    ))}
  </div>

  {/* Charts + Recent Activity */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card className="lg:col-span-2"><CardContent className="p-6">{/* Chart */}</CardContent></Card>
    <Card><CardContent className="p-6">{/* Activity Feed */}</CardContent></Card>
  </div>

  {/* Data Table */}
  <Card>
    <CardHeader><CardTitle>Recent Records</CardTitle></CardHeader>
    <CardContent>
      <Table>
        <TableHeader><TableRow>...</TableRow></TableHeader>
        <TableBody>{/* rows */}</TableBody>
      </Table>
    </CardContent>
  </Card>
</div>`,
  },

  {
    id: "sidebar-content",
    name: "Sidebar + Content Layout",
    applicableTo: ["layout", "app", "admin", "settings"],
    pattern: `
{/* Sidebar + Content Layout Pattern */}
<div className="flex h-screen bg-[var(--color-bg)]">
  {/* Sidebar */}
  <aside className="w-64 bg-[var(--color-sidebar)] border-r border-[var(--color-border)] flex flex-col">
    <div className="p-4 border-b border-[var(--color-border)]">
      <h2 className="text-lg font-bold text-[var(--color-sidebar-text)]">App Name</h2>
    </div>
    <nav className="flex-1 p-3 space-y-1">
      {navItems.map(item => (
        <a key={item.path} href={item.path}
           className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)]
                      transition-colors duration-150">
          <item.icon className="w-4 h-4" />
          {item.label}
        </a>
      ))}
    </nav>
  </aside>

  {/* Main Content */}
  <main className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-7xl mx-auto">
      {children}
    </div>
  </main>
</div>`,
  },

  {
    id: "crud-list",
    name: "CRUD List Page",
    applicableTo: ["list", "index", "management", "records"],
    pattern: `
{/* CRUD List Page Pattern */}
<div className="space-y-6 animate-fade-in">
  {/* Header with action */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Records</h1>
      <p className="text-sm text-[var(--color-text-muted)]">{total} total records</p>
    </div>
    <Button onClick={() => setShowCreate(true)}>
      <Plus className="w-4 h-4 mr-2" /> Add New
    </Button>
  </div>

  {/* Search + Filters Bar */}
  <div className="flex items-center gap-3">
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
      <Input placeholder="Search..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    <Select value={filter} onValueChange={setFilter}>
      <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent>{/* filter options */}</SelectContent>
    </Select>
  </div>

  {/* Data Table */}
  <Card>
    <CardContent className="p-0">
      {loading ? (
        <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : data.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox className="w-12 h-12 mx-auto text-[var(--color-text-muted)] mb-4" />
          <h3 className="text-lg font-semibold">No records yet</h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Get started by adding your first record.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>Add Record</Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(row => (
              <TableRow key={row.id} className="hover:bg-[var(--color-bg-hover)] transition-colors">
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
                <TableCell>{/* action buttons */}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</div>`,
  },

  {
    id: "form-page",
    name: "Form Page",
    applicableTo: ["create", "edit", "settings", "profile", "form"],
    pattern: `
{/* Form Page Pattern */}
<div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
  {/* Header */}
  <div>
    <h1 className="text-2xl font-bold text-[var(--color-text)]">Create Record</h1>
    <p className="text-sm text-[var(--color-text-muted)] mt-1">Fill in the details below.</p>
  </div>

  {/* Form Card */}
  <Card>
    <CardContent className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name <span className="text-[var(--color-danger)]">*</span></Label>
            <Input id="name" placeholder="Enter name..." required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="email@example.com" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" placeholder="Optional details..." rows={4} />
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-[var(--color-border)]">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Record"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </CardContent>
  </Card>
</div>`,
  },

  {
    id: "detail-split",
    name: "Detail Split View",
    applicableTo: ["detail", "view", "profile", "record"],
    pattern: `
{/* Detail Split View Pattern */}
<div className="space-y-6 animate-fade-in">
  {/* Breadcrumb + Back */}
  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
    <a href="/records" className="hover:text-[var(--color-primary)] transition-colors">Records</a>
    <ChevronRight className="w-3 h-3" />
    <span className="text-[var(--color-text)]">{record.name}</span>
  </div>

  {/* Split: Info + Sidebar */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* Main Content */}
    <div className="lg:col-span-2 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{record.name}</CardTitle>
          <Badge>{record.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* field groups */}
        </CardContent>
      </Card>

      {/* Tabs for sub-sections */}
      <Tabs defaultValue="activity">
        <TabsList><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger></TabsList>
        <TabsContent value="activity">{/* activity feed */}</TabsContent>
        <TabsContent value="notes">{/* notes */}</TabsContent>
      </Tabs>
    </div>

    {/* Sidebar */}
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Quick Info</h3>
          {/* metadata fields */}
        </CardContent>
      </Card>
    </div>
  </div>
</div>`,
  },

  {
    id: "tabbed-settings",
    name: "Tabbed Settings",
    applicableTo: ["settings", "configuration", "preferences"],
    pattern: `
{/* Tabbed Settings Pattern */}
<div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
  <div>
    <h1 className="text-2xl font-bold text-[var(--color-text)]">Settings</h1>
    <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage your preferences</p>
  </div>

  <Tabs defaultValue="general" className="space-y-6">
    <TabsList>
      <TabsTrigger value="general">General</TabsTrigger>
      <TabsTrigger value="notifications">Notifications</TabsTrigger>
      <TabsTrigger value="security">Security</TabsTrigger>
    </TabsList>

    <TabsContent value="general">
      <Card>
        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* settings fields with labels and controls */}
        </CardContent>
      </Card>
    </TabsContent>
    {/* other tabs */}
  </Tabs>
</div>`,
  },
];

/**
 * Select applicable layout snippets for a task based on its label/description
 */
export function selectLayoutSnippets(taskLabel: string, taskDescription: string): LayoutSnippet[] {
  const text = `${taskLabel} ${taskDescription}`.toLowerCase();
  
  return LAYOUT_SNIPPETS.filter(snippet =>
    snippet.applicableTo.some(keyword => text.includes(keyword))
  ).slice(0, 2); // Max 2 snippets per task to keep prompts reasonable
}

/**
 * Format snippets for injection into task prompt
 */
export function formatLayoutSnippetsForPrompt(snippets: LayoutSnippet[]): string {
  if (snippets.length === 0) return "";
  
  const sections = snippets.map(s => 
    `#### Reference Layout: ${s.name}\nUse this structural pattern as a starting point:\n\`\`\`jsx${s.pattern}\n\`\`\``
  );

  return `### LAYOUT PATTERNS (follow these structural patterns):\n${sections.join("\n\n")}`;
}
