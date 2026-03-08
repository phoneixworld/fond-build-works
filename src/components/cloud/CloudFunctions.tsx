import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Loader2, Play, Code, Trash2, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

const CloudFunctions = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [functions, setFunctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("http");
  const [newCode, setNewCode] = useState('// Access params via ctx.params\n// Use ctx.db(action, collection, data) for data\nreturn { hello: "world" };');
  const [invokeResult, setInvokeResult] = useState<{ name: string; result: string } | null>(null);
  const [invoking, setInvoking] = useState<string | null>(null);

  const fetchFunctions = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_functions")
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setFunctions(data || []);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchFunctions(); }, [fetchFunctions]);

  const handleCreate = async () => {
    if (!newName.trim() || !currentProject) return;
    const { error } = await supabase
      .from("project_functions")
      .insert({ project_id: currentProject.id, name: newName.trim(), trigger_type: newTrigger, code: newCode });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Created", description: `Function "${newName}" created` });
    setNewName(""); setNewCode('return { hello: "world" };'); setShowCreate(false);
    fetchFunctions();
  };

  const handleInvoke = async (fn: any) => {
    setInvoking(fn.id);
    setInvokeResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("project-exec", {
        body: { project_id: currentProject?.id, function_name: fn.name, params: {} },
      });
      if (error) throw error;
      setInvokeResult({ name: fn.name, result: JSON.stringify(data, null, 2) });
    } catch (e: any) {
      setInvokeResult({ name: fn.name, result: `ERROR: ${e.message}` });
    }
    setInvoking(null);
  };

  const handleDelete = async (fn: any) => {
    const { error } = await supabase.from("project_functions").delete().eq("id", fn.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setFunctions(prev => prev.filter(f => f.id !== fn.id));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Edge Functions</span>
          <span className="text-xs text-muted-foreground">({functions.length})</span>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showCreate ? "Cancel" : "New Function"}
        </button>
      </div>

      {showCreate && (
        <div className="px-5 py-4 border-b border-border bg-secondary/30 space-y-3">
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="function-name" className="flex-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30" />
            <select value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} className="bg-secondary text-xs text-foreground outline-none px-2.5 py-1.5 rounded border border-border">
              <option value="http">HTTP</option>
              <option value="cron">Cron</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
          <textarea value={newCode} onChange={(e) => setNewCode(e.target.value)} rows={6} spellCheck={false} className="w-full bg-secondary text-xs text-foreground font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30 outline-none resize-none" />
          <button onClick={handleCreate} disabled={!newName.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Save className="w-3.5 h-3.5" /> Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : functions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No edge functions yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create serverless functions for custom backend logic</p>
          </div>
        ) : (
          <div className="space-y-2">
            {functions.map((fn) => (
              <div key={fn.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors group">
                <div className="flex items-center gap-3">
                  <Code className="w-4 h-4 text-primary/70" />
                  <div>
                    <p className="text-xs font-medium text-foreground font-mono">{fn.name}</p>
                    <p className="text-[10px] text-muted-foreground">Trigger: {fn.trigger_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleInvoke(fn)} disabled={invoking === fn.id} className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors">
                    {invoking === fn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Invoke
                  </button>
                  <button onClick={() => handleDelete(fn)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {invokeResult && (
          <div className="mt-4 p-3 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Result: {invokeResult.name}</p>
              <button onClick={() => setInvokeResult(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
            </div>
            <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{invokeResult.result}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudFunctions;
