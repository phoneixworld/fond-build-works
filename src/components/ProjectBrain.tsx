import { useState, useEffect, useCallback } from "react";
import { Brain, Plus, Trash2, ToggleLeft, ToggleRight, Save, X, Pencil, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { motion, AnimatePresence } from "framer-motion";

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

const EXAMPLES = [
  { title: "Brand Guidelines", content: "Use blue (#3B82F6) as primary color. Font: Inter for body, Plus Jakarta Sans for headings. Tone: professional but friendly." },
  { title: "API Instructions", content: "Always use the /api/v2 endpoint. Include X-API-Key header. Rate limit: 100 req/min." },
  { title: "Code Style", content: "Use TypeScript strict mode. Prefer functional components. Use Tailwind utility classes. No inline styles." },
];

const ProjectBrain = () => {
  const { currentProject } = useProjects();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const fetchKnowledge = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_knowledge" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setItems((data as any as KnowledgeItem[]) || []);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchKnowledge(); }, [fetchKnowledge]);

  const addItem = async () => {
    if (!currentProject || !newContent.trim()) return;
    await supabase.from("project_knowledge" as any).insert({
      project_id: currentProject.id,
      title: newTitle.trim() || "Untitled",
      content: newContent.trim(),
    } as any);
    setNewTitle("");
    setNewContent("");
    setIsAdding(false);
    fetchKnowledge();
  };

  const deleteItem = async (id: string) => {
    await supabase.from("project_knowledge" as any).delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleItem = async (id: string, current: boolean) => {
    await supabase.from("project_knowledge" as any).update({ is_active: !current } as any).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !current } : i));
  };

  const startEdit = (item: KnowledgeItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from("project_knowledge" as any).update({
      title: editTitle.trim() || "Untitled",
      content: editContent.trim(),
      updated_at: new Date().toISOString(),
    } as any).eq("id", editingId);
    setEditingId(null);
    fetchKnowledge();
  };

  const useExample = (ex: typeof EXAMPLES[0]) => {
    setNewTitle(ex.title);
    setNewContent(ex.content);
    setIsAdding(true);
  };

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Project Brain</span>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
            {items.filter(i => i.is_active).length} active
          </span>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Add form */}
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Title (e.g. Brand Guidelines)"
                  className="w-full bg-background text-foreground text-sm rounded-lg px-3 py-2 border border-border focus:border-primary outline-none"
                  autoFocus
                />
                <textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="Instructions the AI should always follow for this project..."
                  className="w-full bg-background text-foreground text-sm rounded-lg px-3 py-2 border border-border focus:border-primary outline-none resize-none min-h-[80px]"
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <button onClick={() => setIsAdding(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={addItem}
                    disabled={!newContent.trim()}
                    className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    <Save className="w-3 h-3" /> Save
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 && !isAdding ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">No knowledge yet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Add instructions the AI should always follow for this project.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Examples</p>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => useExample(ex)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium text-foreground">{ex.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{ex.content}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map(item => (
            <motion.div
              key={item.id}
              layout
              className={`border rounded-xl p-4 transition-all ${
                item.is_active
                  ? "border-border bg-background"
                  : "border-border/50 bg-secondary/30 opacity-60"
              }`}
            >
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full bg-secondary text-foreground text-sm rounded-lg px-3 py-1.5 border border-border focus:border-primary outline-none"
                  />
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full bg-secondary text-foreground text-sm rounded-lg px-3 py-1.5 border border-border focus:border-primary outline-none resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    <button onClick={saveEdit} className="text-xs font-medium text-primary hover:text-primary/80">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground truncate">{item.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleItem(item.id, item.is_active)} className="p-1 hover:bg-secondary rounded transition-colors" title={item.is_active ? "Disable" : "Enable"}>
                        {item.is_active ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <button onClick={() => startEdit(item)} className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteItem(item.id)} className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectBrain;
