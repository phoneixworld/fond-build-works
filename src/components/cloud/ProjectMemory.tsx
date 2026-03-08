import { useState, useEffect } from "react";
import { Brain, Plus, Trash2, Tag, ToggleLeft, ToggleRight, Lightbulb, Code2, Palette, Database, Shield, Folder } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "architecture", label: "Architecture", icon: Folder, color: "text-blue-400" },
  { id: "naming", label: "Naming Convention", icon: Tag, color: "text-emerald-400" },
  { id: "design", label: "Design Choice", icon: Palette, color: "text-pink-400" },
  { id: "tech", label: "Tech Decision", icon: Code2, color: "text-amber-400" },
  { id: "data", label: "Data Model", icon: Database, color: "text-purple-400" },
  { id: "security", label: "Security", icon: Shield, color: "text-red-400" },
  { id: "general", label: "General", icon: Lightbulb, color: "text-muted-foreground" },
];

interface Decision {
  id: string;
  category: string;
  title: string;
  description: string;
  context: any;
  is_active: boolean;
  created_at: string;
}

const ProjectMemory = () => {
  const { currentProject } = useProjects();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "general", title: "", description: "" });
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (currentProject?.id) fetchDecisions();
  }, [currentProject?.id]);

  const fetchDecisions = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_decisions" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    if (!error) setDecisions((data as any) || []);
    setLoading(false);
  };

  const addDecision = async () => {
    if (!currentProject?.id || !form.title.trim()) return;
    const { error } = await supabase.from("project_decisions" as any).insert({
      project_id: currentProject.id,
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      context: {},
    } as any);
    if (error) { toast.error("Failed to save decision"); return; }
    toast.success("Decision recorded");
    setForm({ category: "general", title: "", description: "" });
    setShowForm(false);
    fetchDecisions();
  };

  const toggleDecision = async (id: string, current: boolean) => {
    await supabase.from("project_decisions" as any).update({ is_active: !current } as any).eq("id", id);
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, is_active: !current } : d));
  };

  const deleteDecision = async (id: string) => {
    await supabase.from("project_decisions" as any).delete().eq("id", id);
    setDecisions(prev => prev.filter(d => d.id !== id));
    toast.success("Decision removed");
  };

  const filtered = filter === "all" ? decisions : decisions.filter(d => d.category === filter);
  const catInfo = (cat: string) => CATEGORIES.find(c => c.id === cat) || CATEGORIES[6];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Project Memory</h2>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {decisions.filter(d => d.is_active).length} active
          </span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" /> Record Decision
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground">
          Decisions logged here are automatically fed into AI context. The copilot will reference these when generating code — 
          ensuring consistency with your architectural choices, naming conventions, and design patterns.
        </p>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  form.category === cat.id
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <cat.icon className="w-3 h-3" />
                {cat.label}
              </button>
            ))}
          </div>
          <input
            className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Decision title (e.g. 'Use camelCase for API routes')"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={3}
            placeholder="Why this decision was made and any relevant context..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={addDecision} className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">Save</button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            filter === "all" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({decisions.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = decisions.filter(d => d.category === cat.id).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filter === cat.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Decisions list */}
      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-8">Loading decisions...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-xs text-muted-foreground">No decisions recorded yet</p>
          <p className="text-[10px] text-muted-foreground/70">Record architectural decisions so the AI maintains consistency</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => {
            const cat = catInfo(d.category);
            const CatIcon = cat.icon;
            return (
              <div
                key={d.id}
                className={`group border rounded-lg p-3 transition-colors ${
                  d.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <CatIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cat.color}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{d.title}</span>
                        {!d.is_active && (
                          <span className="text-[9px] bg-muted text-muted-foreground px-1 rounded">inactive</span>
                        )}
                      </div>
                      {d.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{d.description}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground/60 mt-1">
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => toggleDecision(d.id, d.is_active)}
                      className="p-1 rounded hover:bg-muted"
                      title={d.is_active ? "Deactivate" : "Activate"}
                    >
                      {d.is_active ? (
                        <ToggleRight className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteDecision(d.id)}
                      className="p-1 rounded hover:bg-destructive/20"
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectMemory;
