import { useState, useRef } from "react";
import { Zap, Send, FolderOpen, Trash2, Loader2, ArrowRight, Copy, Rocket, Database, Shield, Cloud, BarChart3, Globe, Lock, Users, Cpu, Eye, Wand2, MessageSquare, Layers, RefreshCw, Lightbulb, CheckCircle2, Sparkles, Server, FileCode, ShoppingCart, LayoutDashboard, PenTool, Briefcase, ChevronRight, Smartphone, Palette, MessagesSquare, GitBranch, ImageIcon, Puzzle, Brain, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProjects, Project } from "@/contexts/ProjectContext";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { TECH_STACKS } from "@/lib/techStacks";
import { TEMPLATES, Template } from "@/lib/templates";

interface LandingPageProps {
  onStartProject: (prompt: string, techStack: string) => void;
  onOpenProject: (id: string) => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const LandingPage = ({ onStartProject, onOpenProject }: LandingPageProps) => {
  const { user, signOut } = useAuth();
  const { projects, loading, deleteProject, cloneProject } = useProjects();
  const [input, setInput] = useState("");
  const techStack = "react-cdn";
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onStartProject(input.trim(), techStack);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const [showTemplates, setShowTemplates] = useState(false);

  const suggestions = [
    "A todo app with user accounts",
    "A SaaS landing page with pricing",
    "A CRM dashboard with contacts",
    "A blog with data persistence",
  ];

  const handleUseTemplate = (template: Template) => {
    onStartProject(template.prompt, techStack);
  };

  const HOW_IT_WORKS = [
    { step: "01", title: "Describe your app", description: "Tell Phoneix what you want in plain English. Be as detailed or brief as you like.", icon: MessageSquare, gradient: "from-[hsl(210,100%,56%)] to-[hsl(210,100%,40%)]" },
    { step: "02", title: "Instant preview loads", description: "Your app renders in under 1 second. A live, interactive preview — not a mockup.", icon: Eye, gradient: "from-[hsl(265,89%,62%)] to-[hsl(265,89%,48%)]" },
    { step: "03", title: "AI customizes in real time", description: "Iterate with chat. The AI refines code, adds features, and fixes bugs automatically.", icon: Wand2, gradient: "from-[hsl(142,71%,45%)] to-[hsl(142,71%,32%)]" },
  ];

  const FULL_STACK_FEATURES = [
    { icon: Database, label: "Database", description: "Auto-generated schemas with full CRUD" },
    { icon: Lock, label: "Authentication", description: "Email, social login, and session management" },
    { icon: Cloud, label: "Serverless Functions", description: "Edge functions that scale automatically" },
    { icon: Server, label: "File Storage", description: "Secure buckets for uploads and assets" },
    { icon: BarChart3, label: "Analytics", description: "Built-in tracking for every published app" },
    { icon: Globe, label: "Deployments", description: "One-click publish with custom domains" },
  ];

  const SHOWCASE_APPS = [
    { icon: Rocket, label: "SaaS Landing", description: "Pricing, features, and CTA sections", color: "text-[hsl(var(--primary))]" },
    { icon: PenTool, label: "Portfolio", description: "Showcase projects with rich media", color: "text-[hsl(var(--accent))]" },
    { icon: LayoutDashboard, label: "Dashboard", description: "Charts, tables, and real-time data", color: "text-[hsl(var(--ide-success))]" },
    { icon: FileCode, label: "Blog / CMS", description: "Markdown, categories, and auth", color: "text-[hsl(var(--ide-warning))]" },
    { icon: ShoppingCart, label: "Marketplace", description: "Products, cart, and checkout flow", color: "text-[hsl(var(--primary))]" },
    { icon: Briefcase, label: "Admin Panel", description: "User management and data tables", color: "text-[hsl(var(--accent))]" },
  ];

  const WHY_DIFFERENT = [
    { icon: Layers, title: "Instant Templates", description: "Production-ready launchpads for every use case" },
    { icon: Sparkles, title: "Background AI Polish", description: "Code quality improvements happen automatically" },
    { icon: Cpu, title: "Multi-Model Orchestration", description: "Planning, coding, and review agents work in concert" },
    { icon: RefreshCw, title: "Auto-Fix Engine", description: "Detects and resolves errors before you notice" },
    { icon: Eye, title: "Live Preview", description: "Every change renders instantly — no waiting" },
    { icon: Lightbulb, title: "Smart Suggestions", description: "Context-aware prompts to guide your next step" },
  ];

  const ONLY_HERE = [
    { icon: MessagesSquare, title: "Real-Time Team Collaboration", description: "Live cursors, team chat, shared workspaces — not just \"invite a viewer\"", gradient: "from-[hsl(210,100%,56%)] to-[hsl(265,89%,62%)]" },
    { icon: GitBranch, title: "Dev → Staging → Production", description: "Proper environment pipeline with change detection & promote workflow", gradient: "from-[hsl(265,89%,62%)] to-[hsl(300,80%,55%)]" },
    { icon: Smartphone, title: "Android Export", description: "Any web app → downloadable APK via automated cloud build pipeline", gradient: "from-[hsl(142,71%,45%)] to-[hsl(170,80%,40%)]" },
    { icon: ImageIcon, title: "Marketing Materials", description: "AI-generated social posts, emails, and landing copy — built into the IDE", gradient: "from-[hsl(var(--ide-warning))] to-[hsl(25,90%,50%)]" },
    { icon: Palette, title: "Brand Kit Generator", description: "Auto-generate logos, color palettes, and typography from a description", gradient: "from-[hsl(330,80%,55%)] to-[hsl(265,89%,62%)]" },
    { icon: Puzzle, title: "Plugin Marketplace", description: "Extend apps with community plugins — install with one click", gradient: "from-[hsl(210,100%,56%)] to-[hsl(190,90%,45%)]" },
    { icon: Brain, title: "Project Brain / Memory", description: "AI remembers every decision, pattern, and preference across sessions", gradient: "from-[hsl(265,89%,62%)] to-[hsl(210,100%,56%)]" },
    { icon: Users, title: "Multi-Agent Architecture", description: "Specialized agents for planning, coding, review, and deployment", gradient: "from-[hsl(142,71%,45%)] to-[hsl(210,100%,56%)]" },
  ];

  const hasProjects = !loading && projects.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Phoenix World" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-base font-bold text-foreground">Phoenix.World</span>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>}
          {user && (
            <button onClick={() => signOut()} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-secondary">
              Sign out
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT SIDEBAR: Recent Projects ─── */}
        {hasProjects && (
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className={`hidden md:flex flex-col border-r border-border bg-card/50 shrink-0 transition-all duration-300 ${
              sidebarCollapsed ? "w-14" : "w-64"
            }`}
          >
            {/* Sidebar header */}
            <div className="px-3 py-3 border-b border-border flex items-center justify-between">
              {!sidebarCollapsed && (
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</h2>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`} />
              </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
              {projects.map((project) => {
                const stackInfo = TECH_STACKS.find(s => s.id === project.tech_stack);
                const StackIcon = stackInfo?.icon || FolderOpen;
                return (
                  <div
                    key={project.id}
                    onClick={() => onOpenProject(project.id)}
                    className="group flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/70 cursor-pointer transition-all"
                    title={project.name}
                  >
                    <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <StackIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    {!sidebarCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{project.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                        </p>
                      </div>
                    )}
                    {!sidebarCollapsed && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); cloneProject(project.id); }} className="p-1 text-muted-foreground hover:text-[hsl(var(--primary))] transition-colors" title="Clone">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* New project button */}
            {!sidebarCollapsed && (
              <div className="px-2 py-3 border-t border-border">
                <button
                  onClick={() => { inputRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[hsl(var(--primary)/0.3)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.05)] transition-all text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Project
                </button>
              </div>
            )}
          </motion.aside>
        )}

        {/* ─── MAIN CONTENT ─── */}
        <main className="flex-1 overflow-y-auto">
          {/* ─── HERO ─── */}
          <section className="relative flex flex-col items-center justify-center px-4 pt-20 pb-16">
            {/* Gradient orbs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none">
              <div className="absolute top-10 left-1/4 w-72 h-72 bg-[hsl(210,100%,56%/0.12)] rounded-full blur-[120px]" />
              <div className="absolute top-20 right-1/4 w-64 h-64 bg-[hsl(265,89%,62%/0.1)] rounded-full blur-[100px]" />
            </div>

            <motion.div initial="hidden" animate="visible" variants={stagger} className="relative z-10 w-full max-w-2xl space-y-6">
              <motion.div variants={fadeUp} custom={0} className="text-center space-y-3">
                {user ? (
                  <>
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight">
                      Welcome back, <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] bg-clip-text text-transparent">{user.user_metadata?.display_name || user.email?.split("@")[0] || "Builder"}</span> 👋
                    </h1>
                    <p className="text-muted-foreground text-base md:text-lg max-w-md mx-auto">
                      Ready to bring your next idea to life?
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight">
                      Phoenix World helps you build your next{" "}
                      <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] bg-clip-text text-transparent">Unicorn</span> idea
                    </h1>
                    <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto">
                      Describe it, and watch it come to life — powered by AI.
                    </p>
                  </>
                )}
              </motion.div>

              {/* Prompt input */}
              <motion.div variants={fadeUp} custom={1} className="relative bg-card border border-border rounded-2xl p-1.5 focus-within:border-[hsl(var(--primary)/0.5)] focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/0.15)] transition-all shadow-lg shadow-black/20">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your app idea..."
                  className="w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground outline-none resize-none p-3 pb-12 min-h-[100px]"
                  rows={3}
                />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">React + Full-stack backend</span>
                  <button
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                    className="flex items-center gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Build it
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>

              {/* Suggestions */}
              <motion.div variants={fadeUp} custom={2} className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} className="text-xs px-3.5 py-2 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(var(--primary)/0.4)] hover:bg-secondary transition-all">
                    {s}
                  </button>
                ))}
              </motion.div>

              {/* Launchpads */}
              <motion.div variants={fadeUp} custom={3} className="flex justify-center">
                <button onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[hsl(var(--primary))] transition-colors px-3 py-1.5 rounded-full border border-border hover:border-[hsl(var(--primary)/0.3)]">
                  <Rocket className="w-3.5 h-3.5" />
                  {showTemplates ? "Hide" : "Use a"} Launchpad
                </button>
              </motion.div>

              {showTemplates && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TEMPLATES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button key={t.id} onClick={() => handleUseTemplate(t)} className="text-left p-3 rounded-xl border border-border hover:border-[hsl(var(--primary)/0.3)] hover:bg-secondary/50 transition-all group">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0 group-hover:bg-[hsl(var(--primary)/0.2)] transition-colors">
                              <Icon className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                            </div>
                            <span className="text-sm font-medium text-foreground">{t.name}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground ml-9">{t.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>

            {/* Mobile-only recent projects (below hero) */}
            {hasProjects && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="w-full max-w-2xl mt-14 md:hidden"
              >
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Recent Projects</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {projects.slice(0, 4).map((project) => {
                    const stackInfo = TECH_STACKS.find(s => s.id === project.tech_stack);
                    const StackIcon = stackInfo?.icon || FolderOpen;
                    return (
                      <div key={project.id} onClick={() => onOpenProject(project.id)} className="group flex items-center gap-3 p-3 rounded-xl border border-border hover:border-[hsl(var(--primary)/0.3)] hover:bg-secondary/50 cursor-pointer transition-all">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <StackIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </section>

          {/* ─── WHAT NO ONE ELSE OFFERS ─── */}
          <section className="px-6 py-20 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] pointer-events-none">
              <div className="absolute top-0 left-0 w-80 h-80 bg-[hsl(210,100%,56%/0.08)] rounded-full blur-[130px]" />
              <div className="absolute bottom-0 right-0 w-72 h-72 bg-[hsl(265,89%,62%/0.06)] rounded-full blur-[120px]" />
            </div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="max-w-5xl mx-auto relative z-10">
              <motion.div variants={fadeUp} className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ide-warning))] mb-2">What No One Else Offers</p>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Features that set Phoenix apart</h2>
                <p className="text-muted-foreground text-base mt-3 max-w-lg mx-auto">
                  Real collaboration, real environments, real mobile export. Not marketing fluff.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ONLY_HERE.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.title}
                      variants={fadeUp}
                      custom={i}
                      className="p-5 rounded-2xl border border-border bg-card/80 backdrop-blur-sm hover:border-[hsl(var(--primary)/0.3)] transition-all group"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-3 shadow-md group-hover:shadow-lg transition-shadow`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground mb-1">{item.title}</h3>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* ─── SOCIAL PROOF STRIP ─── */}
          <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={fadeUp} className="border-y border-border bg-card/50">
            <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-8 md:gap-16">
              {[
                { value: "1,000+", label: "Apps Built" },
                { value: "50+", label: "Templates" },
                { value: "<1s", label: "Preview Load" },
                { value: "Full-Stack", label: "AI-Powered" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] bg-clip-text text-transparent">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ─── HOW IT WORKS ─── */}
          <section className="px-6 py-20 max-w-5xl mx-auto w-full">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
              <motion.div variants={fadeUp} className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))] mb-2">How It Works</p>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">From idea to app in seconds</h2>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {HOW_IT_WORKS.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.step} variants={fadeUp} custom={i} className="relative group">
                      <div className="p-6 rounded-2xl border border-border bg-card hover:border-[hsl(var(--primary)/0.3)] transition-all h-full">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest">Step {item.step}</span>
                        <h3 className="text-lg font-bold text-foreground mt-1 mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </div>
                      {i < 2 && (
                        <div className="hidden md:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10">
                          <ChevronRight className="w-6 h-6 text-border" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* ─── FULL-STACK INCLUDED ─── */}
          <section className="px-6 py-20 bg-card/30">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="max-w-5xl mx-auto">
              <motion.div variants={fadeUp} className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--accent))] mb-2">Full-Stack Included</p>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Everything you need. Built in.</h2>
                <p className="text-muted-foreground text-base mt-3 max-w-lg mx-auto">Not just a frontend builder. Every app gets a real backend — database, auth, functions, storage, and more.</p>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {FULL_STACK_FEATURES.map((feat, i) => {
                  const Icon = feat.icon;
                  return (
                    <motion.div key={feat.label} variants={fadeUp} custom={i} className="p-5 rounded-2xl border border-border bg-background/60 backdrop-blur-sm hover:border-[hsl(var(--accent)/0.3)] hover:bg-background/80 transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-[hsl(var(--accent)/0.1)] flex items-center justify-center mb-3 group-hover:bg-[hsl(var(--accent)/0.2)] transition-colors">
                        <Icon className="w-5 h-5 text-[hsl(var(--accent))]" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground mb-1">{feat.label}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{feat.description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* ─── WHAT YOU CAN BUILD ─── */}
          <section className="px-6 py-20 max-w-5xl mx-auto w-full">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger}>
              <motion.div variants={fadeUp} className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ide-success))] mb-2">What You Can Build</p>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">From landing pages to full apps</h2>
                <p className="text-muted-foreground text-base mt-3 max-w-lg mx-auto">Phoenix World generates production-ready apps — not templates, not mockups.</p>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SHOWCASE_APPS.map((app, i) => {
                  const Icon = app.icon;
                  return (
                    <motion.div key={app.label} variants={fadeUp} custom={i} className="p-5 rounded-2xl border border-border bg-card hover:border-[hsl(var(--primary)/0.2)] transition-all group cursor-pointer" onClick={() => { setInput(`Build me a ${app.label.toLowerCase()} app`); inputRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${app.color}`} />
                        <h3 className="text-sm font-bold text-foreground">{app.label}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{app.description}</p>
                      <p className="text-[10px] text-[hsl(var(--primary))] mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">Try this <ArrowRight className="w-3 h-3" /></p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* ─── WHY PHOENIX IS DIFFERENT ─── */}
          <section className="px-6 py-20 bg-card/30 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none">
              <div className="absolute inset-0 bg-[hsl(210,100%,56%/0.06)] rounded-full blur-[150px]" />
            </div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="max-w-5xl mx-auto relative z-10">
              <motion.div variants={fadeUp} className="text-center mb-14">
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))] mb-2">Why Phoenix World</p>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Not just another AI builder</h2>
                <p className="text-muted-foreground text-base mt-3 max-w-lg mx-auto">Multi-agent orchestration, auto-fix, and instant previews. This is a different kind of tool.</p>
              </motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {WHY_DIFFERENT.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.title} variants={fadeUp} custom={i} className="flex gap-4 p-5 rounded-2xl border border-border bg-background/60 backdrop-blur-sm hover:border-[hsl(var(--primary)/0.2)] transition-all">
                      <div className="w-10 h-10 rounded-xl bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-[hsl(var(--primary))]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground mb-1">{item.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* ─── SECURITY & RELIABILITY ─── */}
          <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="border-y border-border">
            <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--ide-success)/0.1)] flex items-center justify-center shrink-0">
                <Shield className="w-7 h-7 text-[hsl(var(--ide-success))]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Secure & Reliable by Default</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">Your apps run on secure, isolated edge functions with per-project databases. Row-level security policies protect every table. Auth, storage, and secrets management are built in — not bolted on.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {["SOC 2", "RLS", "Edge"].map((badge) => (
                  <span key={badge} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-[hsl(var(--ide-success)/0.3)] text-[hsl(var(--ide-success))] bg-[hsl(var(--ide-success)/0.05)]">{badge}</span>
                ))}
              </div>
            </div>
          </motion.section>

          {/* ─── FOOTER ─── */}
          <footer className="px-6 py-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <img src="/logo.png" alt="Phoenix World" className="w-6 h-6 rounded-md object-cover" />
              <span className="text-sm font-semibold text-foreground">Phoenix.World</span>
            </div>
            <p className="text-xs text-muted-foreground">Built with Phoenix World • © {new Date().getFullYear()} All rights reserved.</p>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
