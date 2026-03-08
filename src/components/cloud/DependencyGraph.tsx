import { useState, useEffect } from "react";
import { GitBranch, Plus, Trash2, Search, AlertTriangle, ArrowRight, FileCode, Box, Database, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { toast } from "sonner";

const NODE_TYPES = [
  { id: "file", label: "File", icon: FileCode },
  { id: "component", label: "Component", icon: Box },
  { id: "schema", label: "Schema", icon: Database },
  { id: "function", label: "Function", icon: Zap },
];

const RELATIONSHIPS = [
  { id: "imports", label: "Imports" },
  { id: "extends", label: "Extends" },
  { id: "uses", label: "Uses" },
  { id: "depends_on", label: "Depends On" },
  { id: "renders", label: "Renders" },
  { id: "triggers", label: "Triggers" },
];

interface Dependency {
  id: string;
  source_type: string;
  source_name: string;
  target_type: string;
  target_name: string;
  relationship: string;
  metadata: any;
}

const DependencyGraph = () => {
  const { currentProject } = useProjects();
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    source_type: "file", source_name: "",
    target_type: "component", target_name: "",
    relationship: "imports",
  });

  useEffect(() => {
    if (currentProject?.id) fetchDeps();
  }, [currentProject?.id]);

  const fetchDeps = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_dependencies" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    if (!error) setDeps((data as any) || []);
    setLoading(false);
  };

  const addDep = async () => {
    if (!currentProject?.id || !form.source_name.trim() || !form.target_name.trim()) return;
    const { error } = await supabase.from("project_dependencies" as any).insert({
      project_id: currentProject.id,
      ...form,
      source_name: form.source_name.trim(),
      target_name: form.target_name.trim(),
    } as any);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Dependency tracked");
    setForm({ source_type: "file", source_name: "", target_type: "component", target_name: "", relationship: "imports" });
    setShowForm(false);
    fetchDeps();
  };

  const deleteDep = async (id: string) => {
    await supabase.from("project_dependencies" as any).delete().eq("id", id);
    setDeps(prev => prev.filter(d => d.id !== id));
  };

  // Impact analysis
  const getImpact = (entityName: string) => {
    const affected = deps.filter(d =>
      d.target_name.toLowerCase() === entityName.toLowerCase() ||
      d.source_name.toLowerCase() === entityName.toLowerCase()
    );
    return affected;
  };

  const filtered = search.trim()
    ? deps.filter(d =>
        d.source_name.toLowerCase().includes(search.toLowerCase()) ||
        d.target_name.toLowerCase().includes(search.toLowerCase())
      )
    : deps;

  const typeIcon = (type: string) => {
    const t = NODE_TYPES.find(n => n.id === type);
    return t ? t.icon : FileCode;
  };

  // Unique nodes for impact summary
  const uniqueNodes = new Set<string>();
  deps.forEach(d => { uniqueNodes.add(d.source_name); uniqueNodes.add(d.target_name); });

  const impactResults = search.trim() ? getImpact(search.trim()) : [];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Dependency Graph</h2>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {uniqueNodes.size} nodes · {deps.length} edges
          </span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" /> Track Dependency
        </button>
      </div>

      {/* Info */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground">
          Track how files, components, schemas, and functions relate to each other.
          Search any entity to see its impact — "Renaming X affects N files."
        </p>
      </div>

      {/* Impact Analysis Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Search entity for impact analysis (e.g. 'UserProfile')"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Impact results */}
      {search.trim() && impactResults.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs font-semibold text-destructive">
              Impact Analysis: "{search}" affects {impactResults.length} connection{impactResults.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-1">
            {impactResults.map(d => (
              <div key={d.id} className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="text-foreground font-medium">{d.source_name}</span>
                <ArrowRight className="w-3 h-3" />
                <span className="text-primary">{d.relationship}</span>
                <ArrowRight className="w-3 h-3" />
                <span className="text-foreground font-medium">{d.target_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Source</label>
              <div className="flex gap-1">
                {NODE_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setForm(f => ({ ...f, source_type: t.id }))}
                    className={`p-1.5 rounded text-[9px] border transition-colors ${
                      form.source_type === t.id ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground"
                    }`}
                    title={t.label}
                  >
                    <t.icon className="w-3 h-3" />
                  </button>
                ))}
              </div>
              <input
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Source name"
                value={form.source_name}
                onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Target</label>
              <div className="flex gap-1">
                {NODE_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setForm(f => ({ ...f, target_type: t.id }))}
                    className={`p-1.5 rounded text-[9px] border transition-colors ${
                      form.target_type === t.id ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground"
                    }`}
                    title={t.label}
                  >
                    <t.icon className="w-3 h-3" />
                  </button>
                ))}
              </div>
              <input
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Target name"
                value={form.target_name}
                onChange={e => setForm(f => ({ ...f, target_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Relationship</label>
            <div className="flex gap-1 flex-wrap">
              {RELATIONSHIPS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setForm(f => ({ ...f, relationship: r.id }))}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    form.relationship === r.id ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={addDep} className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">Save</button>
          </div>
        </div>
      )}

      {/* Dependencies list */}
      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-8">Loading graph...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <GitBranch className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-xs text-muted-foreground">No dependencies tracked yet</p>
          <p className="text-[10px] text-muted-foreground/70">Track relationships to enable impact analysis</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(d => {
            const SrcIcon = typeIcon(d.source_type);
            const TgtIcon = typeIcon(d.target_type);
            return (
              <div key={d.id} className="group flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card hover:border-primary/30 transition-colors">
                <SrcIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-xs font-medium text-foreground truncate">{d.source_name}</span>
                <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">{d.relationship}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <TgtIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-medium text-foreground truncate">{d.target_name}</span>
                <button
                  onClick={() => deleteDep(d.id)}
                  className="ml-auto p-1 rounded hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DependencyGraph;
