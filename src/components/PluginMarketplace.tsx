import { useState } from "react";
import { Puzzle, Search, Download, Check, Star, Filter, Zap, Palette, Database, Globe, ShieldCheck, BarChart3, Code, MessageCircle, Image, Layout, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  category: string;
  icon: typeof Zap;
  tags: string[];
  installed?: boolean;
}

const CATEGORIES = [
  { id: "all", label: "All", icon: Puzzle },
  { id: "ui", label: "UI Kits", icon: Layout },
  { id: "api", label: "APIs", icon: Globe },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "auth", label: "Auth", icon: ShieldCheck },
  { id: "media", label: "Media", icon: Image },
  { id: "themes", label: "Themes", icon: Palette },
];

const SAMPLE_PLUGINS: Plugin[] = [
  { id: "1", name: "Stripe Payments", description: "Accept payments with Stripe checkout, subscriptions, and invoicing.", author: "Lovable Labs", downloads: 12400, rating: 4.9, category: "api", icon: Zap, tags: ["payments", "stripe", "billing"] },
  { id: "2", name: "Shadcn Pro Kit", description: "50+ premium components: data tables, kanban boards, calendars, and dashboards.", author: "UI Masters", downloads: 8900, rating: 4.8, category: "ui", icon: Layout, tags: ["components", "premium", "dashboard"] },
  { id: "3", name: "PostHog Analytics", description: "Product analytics with session recordings, feature flags, and A/B tests.", author: "PostHog", downloads: 6200, rating: 4.7, category: "analytics", icon: BarChart3, tags: ["analytics", "tracking", "heatmaps"] },
  { id: "4", name: "Clerk Auth", description: "Drop-in authentication with social login, MFA, and user management.", author: "Clerk", downloads: 9800, rating: 4.9, category: "auth", icon: ShieldCheck, tags: ["auth", "social", "sso"] },
  { id: "5", name: "Cloudinary Media", description: "Image and video optimization, transformations, and AI-powered tagging.", author: "Cloudinary", downloads: 5600, rating: 4.6, category: "media", icon: Image, tags: ["images", "video", "cdn"] },
  { id: "6", name: "Neon Dark Theme", description: "Cyberpunk-inspired dark theme with neon accents and glassmorphism.", author: "Theme Studio", downloads: 3200, rating: 4.5, category: "themes", icon: Palette, tags: ["dark", "neon", "cyberpunk"] },
  { id: "7", name: "Resend Email", description: "Transactional emails with React Email templates and delivery tracking.", author: "Resend", downloads: 7100, rating: 4.8, category: "api", icon: MessageCircle, tags: ["email", "transactional", "templates"] },
  { id: "8", name: "Supabase Realtime", description: "Real-time subscriptions, presence, and broadcast for live apps.", author: "Supabase", downloads: 11200, rating: 4.9, category: "api", icon: Database, tags: ["realtime", "websocket", "live"] },
  { id: "9", name: "Motion Animations", description: "Pre-built Framer Motion animation presets: page transitions, scroll reveals, hover effects.", author: "Motion Lab", downloads: 4500, rating: 4.7, category: "ui", icon: Zap, tags: ["animations", "motion", "transitions"] },
  { id: "10", name: "Cron Jobs", description: "Schedule recurring tasks with cron expressions and monitoring dashboard.", author: "Lovable Labs", downloads: 3800, rating: 4.4, category: "api", icon: Clock, tags: ["cron", "schedule", "background"] },
  { id: "11", name: "Code Blocks", description: "Syntax-highlighted code blocks with 50+ themes, line numbers, and copy button.", author: "Dev Tools", downloads: 2900, rating: 4.6, category: "ui", icon: Code, tags: ["code", "syntax", "highlight"] },
  { id: "12", name: "Minimal Light Theme", description: "Clean, airy theme with soft shadows, warm tones, and elegant typography.", author: "Theme Studio", downloads: 4100, rating: 4.8, category: "themes", icon: Palette, tags: ["light", "minimal", "clean"] },
];

const PluginMarketplace = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [plugins, setPlugins] = useState<Plugin[]>(SAMPLE_PLUGINS);

  const filtered = plugins.filter(p => {
    const matchesCategory = category === "all" || p.category === category;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const toggleInstall = (id: string) => {
    setPlugins(prev => prev.map(p => {
      if (p.id !== id) return p;
      const installed = !p.installed;
      toast({
        title: installed ? "Installed" : "Uninstalled",
        description: `${p.name} ${installed ? "installed" : "removed"} successfully.`,
      });
      return { ...p, installed, downloads: installed ? p.downloads + 1 : p.downloads - 1 };
    }));
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">Plugin Marketplace</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            {plugins.filter(p => p.installed).length} installed
          </span>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="p-3 space-y-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full bg-secondary text-sm rounded-lg pl-9 pr-3 py-2 outline-none border border-border focus:border-primary transition-colors"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border transition-all shrink-0 ${
                  category === cat.id
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-3 h-3" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((plugin, i) => {
            const Icon = plugin.icon;
            return (
              <motion.div
                key={plugin.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`group relative border rounded-xl p-3 transition-all hover:shadow-md ${
                  plugin.installed
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-secondary/30 hover:border-primary/20"
                }`}
              >
                <div className="flex gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    plugin.installed ? "bg-primary/10" : "bg-secondary"
                  }`}>
                    <Icon className={`w-5 h-5 ${plugin.installed ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-semibold truncate">{plugin.name}</h3>
                      {plugin.installed && <Check className="w-3 h-3 text-primary shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{plugin.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Download className="w-3 h-3" />{(plugin.downloads / 1000).toFixed(1)}k
                      </span>
                      <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-current" />{plugin.rating}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{plugin.author}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleInstall(plugin.id)}
                  className={`absolute top-3 right-3 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                    plugin.installed
                      ? "bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {plugin.installed ? "Remove" : "Install"}
                </button>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No plugins found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try a different search or category</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginMarketplace;
