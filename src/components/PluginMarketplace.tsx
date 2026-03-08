import { useState, useEffect } from "react";
import { Puzzle, Search, Download, Check, Star, Plus, Zap, Palette, Database, Globe, ShieldCheck, BarChart3, Code, MessageCircle, Image, Layout, Clock, Upload, Bell, Moon, FileText, CreditCard, Columns, Table, Bot, Loader2, ExternalLink, Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { LucideIcon } from "lucide-react";

// Map icon names from DB to actual Lucide icons
const ICON_MAP: Record<string, LucideIcon> = {
  puzzle: Puzzle, bell: Bell, moon: Moon, "file-text": FileText, table: Table,
  bot: Bot, image: Image, shield: ShieldCheck, "bar-chart-3": BarChart3,
  columns: Columns, "credit-card": CreditCard, upload: Upload, palette: Palette,
  zap: Zap, code: Code, globe: Globe, database: Database, layout: Layout,
  clock: Clock, "message-circle": MessageCircle, package: Package,
};

interface PluginFile {
  path: string;
  content: string;
}

interface PluginRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  long_description: string;
  author: string;
  category: string;
  icon: string;
  tags: string[];
  downloads: number;
  rating: number;
  version: string;
  files: PluginFile[];
  dependencies: string[];
  edge_functions: { name: string; description: string }[];
  required_secrets: string[];
  is_official: boolean;
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

const PluginMarketplace = () => {
  const { toast } = useToast();
  const { currentProject } = useProjects();
  const { addFile, removeFile, setActiveFile } = useVirtualFS();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch plugins from DB
  useEffect(() => {
    const fetchPlugins = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("plugins")
        .select("*")
        .order("downloads", { ascending: false });

      if (data) setPlugins(data as unknown as PluginRow[]);
      if (error) console.error("Failed to fetch plugins:", error);
      setLoading(false);
    };

    const fetchInstalled = async () => {
      if (!currentProject) return;
      const { data } = await supabase
        .from("installed_plugins")
        .select("plugin_id")
        .eq("project_id", currentProject.id);
      if (data) setInstalledIds(new Set(data.map(d => d.plugin_id)));
    };

    fetchPlugins();
    fetchInstalled();
  }, [currentProject]);

  const filtered = plugins.filter(p => {
    const matchesCategory = category === "all" || p.category === category;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const installPlugin = async (plugin: PluginRow) => {
    if (!currentProject) return;
    setInstalling(plugin.id);

    try {
      // 1. Check required secrets
      if (plugin.required_secrets.length > 0) {
        toast({
          title: "Secrets Required",
          description: `This plugin requires: ${plugin.required_secrets.join(", ")}. Configure them in Cloud → Secrets.`,
          variant: "default",
        });
      }

      // 2. Inject files into virtual FS
      const files = plugin.files as PluginFile[];
      for (const file of files) {
        addFile(file.path, file.content);
      }

      // 3. Record installation in DB
      await supabase.from("installed_plugins").insert({
        project_id: currentProject.id,
        plugin_id: plugin.id,
      });

      // 4. Increment download count
      await supabase
        .from("plugins")
        .update({ downloads: plugin.downloads + 1 })
        .eq("id", plugin.id);

      setInstalledIds(prev => new Set([...prev, plugin.id]));
      setPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, downloads: p.downloads + 1 } : p));

      // 5. Open the first injected file
      if (files.length > 0) {
        setActiveFile(files[0].path);
      }

      toast({
        title: `✅ ${plugin.name} installed!`,
        description: `${files.length} file${files.length !== 1 ? "s" : ""} added to your project.`,
      });
    } catch (err) {
      console.error("Install error:", err);
      toast({ title: "Install failed", description: String(err), variant: "destructive" });
    } finally {
      setInstalling(null);
    }
  };

  const uninstallPlugin = async (plugin: PluginRow) => {
    if (!currentProject) return;
    setInstalling(plugin.id);

    try {
      // Remove files from virtual FS
      const files = plugin.files as PluginFile[];
      for (const file of files) {
        removeFile(file.path);
      }

      // Remove from DB
      await supabase
        .from("installed_plugins")
        .delete()
        .eq("project_id", currentProject.id)
        .eq("plugin_id", plugin.id);

      setInstalledIds(prev => {
        const next = new Set(prev);
        next.delete(plugin.id);
        return next;
      });

      toast({
        title: `Removed ${plugin.name}`,
        description: `${files.length} file${files.length !== 1 ? "s" : ""} removed.`,
      });
    } catch (err) {
      console.error("Uninstall error:", err);
      toast({ title: "Uninstall failed", description: String(err), variant: "destructive" });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">Plugin Marketplace</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            {installedIds.size} installed
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{plugins.length} plugins</span>
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

      {/* Plugin List */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No plugins found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((plugin, i) => {
              const Icon = ICON_MAP[plugin.icon] || Puzzle;
              const isInstalled = installedIds.has(plugin.id);
              const isExpanded = expandedId === plugin.id;
              const isProcessing = installing === plugin.id;
              const files = plugin.files as PluginFile[];

              return (
                <motion.div
                  key={plugin.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isInstalled
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-secondary/20 hover:border-primary/20"
                  }`}
                >
                  {/* Main row */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : plugin.id)}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isInstalled ? "bg-primary/10" : "bg-secondary"}`}>
                      <Icon className={`w-5 h-5 ${isInstalled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-semibold truncate">{plugin.name}</h3>
                        {isInstalled && <Check className="w-3 h-3 text-primary shrink-0" />}
                        {plugin.is_official && (
                          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">Official</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">v{plugin.version}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{plugin.description}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Download className="w-3 h-3" />{(plugin.downloads / 1000).toFixed(1)}k
                        </span>
                        <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-current" />{plugin.rating}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{plugin.author}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        isInstalled ? uninstallPlugin(plugin) : installPlugin(plugin);
                      }}
                      disabled={isProcessing}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0 ${
                        isProcessing ? "opacity-50" :
                        isInstalled
                          ? "bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isInstalled ? "Remove" : "Install"}
                    </button>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-3">
                          <p className="text-[11px] text-muted-foreground">{plugin.long_description}</p>

                          {/* Files that will be injected */}
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                              Files ({files.length})
                            </span>
                            <div className="mt-1 space-y-1">
                              {files.map(f => (
                                <div key={f.path} className="flex items-center gap-2 text-[11px]">
                                  <Code className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-mono text-foreground">{f.path}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1">
                            {plugin.tags.map(tag => (
                              <span key={tag} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>

                          {/* Required secrets */}
                          {plugin.required_secrets.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[11px] text-amber-500 bg-amber-500/10 px-2.5 py-1.5 rounded-lg">
                              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                              Requires: {plugin.required_secrets.join(", ")}
                            </div>
                          )}

                          {/* Edge functions */}
                          {plugin.edge_functions.length > 0 && (
                            <div>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                Edge Functions
                              </span>
                              <div className="mt-1 space-y-1">
                                {plugin.edge_functions.map(ef => (
                                  <div key={ef.name} className="flex items-center gap-2 text-[11px]">
                                    <Zap className="w-3 h-3 text-primary" />
                                    <span className="font-mono">{ef.name}</span>
                                    <span className="text-muted-foreground">— {ef.description}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginMarketplace;
