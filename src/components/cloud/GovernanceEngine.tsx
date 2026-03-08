import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle2, FileCode, Tag, Palette, FolderTree, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { toast } from "sonner";

const RULE_CATEGORIES = [
  { id: "naming", label: "Naming Convention", icon: Tag, description: "Enforce camelCase, PascalCase, kebab-case patterns" },
  { id: "structure", label: "Folder Structure", icon: FolderTree, description: "Enforce where files should be placed" },
  { id: "design", label: "Design Tokens", icon: Palette, description: "Enforce color, typography, spacing standards" },
  { id: "api", label: "API Patterns", icon: Globe, description: "Enforce endpoint naming, response shapes" },
  { id: "code", label: "Code Standards", icon: FileCode, description: "Enforce import order, max file length, etc." },
];

const SEVERITIES = [
  { id: "error", label: "Error", color: "text-destructive bg-destructive/20" },
  { id: "warning", label: "Warning", color: "text-amber-400 bg-amber-400/20" },
  { id: "info", label: "Info", color: "text-blue-400 bg-blue-400/20" },
];

const PRESET_RULES = [
  { category: "naming", name: "Components use PascalCase", description: "All React components must use PascalCase naming", severity: "error", rule_config: { pattern: "PascalCase", applies_to: "components" } },
  { category: "naming", name: "API routes use kebab-case", description: "All API endpoint paths must use kebab-case", severity: "warning", rule_config: { pattern: "kebab-case", applies_to: "api_routes" } },
  { category: "design", name: "Use semantic color tokens", description: "Never use raw color values; always use design system tokens", severity: "error", rule_config: { enforce: "semantic_tokens" } },
  { category: "structure", name: "Components in /components", description: "All shared components must be in the /components directory", severity: "warning", rule_config: { path: "/components" } },
  { category: "api", name: "REST responses include status", description: "All API responses must include a status field", severity: "info", rule_config: { required_fields: ["status"] } },
  { category: "code", name: "Max 300 lines per file", description: "No single file should exceed 300 lines", severity: "warning", rule_config: { max_lines: 300 } },
];

interface Rule {
  id: string;
  category: string;
  name: string;
  description: string;
  rule_config: any;
  severity: string;
  is_active: boolean;
  created_at: string;
}

const GovernanceEngine = () => {
  const { currentProject } = useProjects();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "naming", name: "", description: "", severity: "warning" });
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (currentProject?.id) fetchRules();
  }, [currentProject?.id]);

  const fetchRules = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_governance_rules" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    if (!error) setRules((data as any) || []);
    setLoading(false);
  };

  const addRule = async (ruleData?: typeof PRESET_RULES[0]) => {
    if (!currentProject?.id) return;
    const data = ruleData || { ...form, name: form.name.trim(), description: form.description.trim(), rule_config: {} };
    if (!data.name) return;
    const { error } = await supabase.from("project_governance_rules" as any).insert({
      project_id: currentProject.id,
      ...data,
    } as any);
    if (error) { toast.error("Failed to save rule"); return; }
    toast.success("Governance rule added");
    if (!ruleData) {
      setForm({ category: "naming", name: "", description: "", severity: "warning" });
      setShowForm(false);
    }
    fetchRules();
  };

  const toggleRule = async (id: string, current: boolean) => {
    await supabase.from("project_governance_rules" as any).update({ is_active: !current } as any).eq("id", id);
    setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !current } : r));
  };

  const deleteRule = async (id: string) => {
    await supabase.from("project_governance_rules" as any).delete().eq("id", id);
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success("Rule removed");
  };

  const filtered = filter === "all" ? rules : rules.filter(r => r.category === filter);
  const catInfo = (cat: string) => RULE_CATEGORIES.find(c => c.id === cat) || RULE_CATEGORIES[0];
  const sevInfo = (sev: string) => SEVERITIES.find(s => s.id === sev) || SEVERITIES[1];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Governance Engine</h2>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {rules.filter(r => r.is_active).length} enforced
          </span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Rule
        </button>
      </div>

      {/* Info */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground">
          Active rules are enforced during code generation. The AI will follow these conventions and flag violations.
          Use presets to get started quickly.
        </p>
      </div>

      {/* Presets */}
      {rules.length === 0 && !loading && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quick Start Presets</h3>
          <div className="grid grid-cols-1 gap-1.5">
            {PRESET_RULES.map((preset, i) => {
              const cat = catInfo(preset.category);
              const CatIcon = cat.icon;
              return (
                <button
                  key={i}
                  onClick={() => addRule(preset)}
                  className="flex items-center gap-2 text-left border border-border rounded-lg p-2.5 hover:border-primary/50 hover:bg-card transition-colors"
                >
                  <CatIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-foreground">{preset.name}</span>
                    <p className="text-[10px] text-muted-foreground truncate">{preset.description}</p>
                  </div>
                  <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-3">
          <div className="flex gap-1 flex-wrap">
            {RULE_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  form.category === cat.id ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <cat.icon className="w-3 h-3" />
                {cat.label}
              </button>
            ))}
          </div>
          <input
            className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Rule name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <textarea
            className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={2}
            placeholder="What this rule enforces..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-1">
            {SEVERITIES.map(s => (
              <button
                key={s.id}
                onClick={() => setForm(f => ({ ...f, severity: s.id }))}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  form.severity === s.id ? s.color : "text-muted-foreground bg-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={() => addRule()} className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">Save</button>
          </div>
        </div>
      )}

      {/* Filter */}
      {rules.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              filter === "all" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({rules.length})
          </button>
          {RULE_CATEGORIES.map(cat => {
            const count = rules.filter(r => r.category === cat.id).length;
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
      )}

      {/* Rules list */}
      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-8">Loading rules...</div>
      ) : filtered.length > 0 && (
        <div className="space-y-1.5">
          {filtered.map(r => {
            const cat = catInfo(r.category);
            const CatIcon = cat.icon;
            const sev = sevInfo(r.severity);
            return (
              <div
                key={r.id}
                className={`group border rounded-lg p-3 transition-colors ${
                  r.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <CatIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{r.name}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${sev.color}`}>
                          {r.severity}
                        </span>
                        {!r.is_active && (
                          <span className="text-[9px] bg-muted text-muted-foreground px-1 rounded">off</span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleRule(r.id, r.is_active)} className="p-1 rounded hover:bg-muted">
                      {r.is_active ? <ToggleRight className="w-3.5 h-3.5 text-primary" /> : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => deleteRule(r.id)} className="p-1 rounded hover:bg-destructive/20">
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

export default GovernanceEngine;
