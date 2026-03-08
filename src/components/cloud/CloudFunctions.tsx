import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Loader2, Play, Code } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";

const CloudFunctions = () => {
  const { currentProject } = useProjects();
  const [functions, setFunctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFunctions = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_functions" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setFunctions(data || []);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchFunctions(); }, [fetchFunctions]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Edge Functions</span>
          <span className="text-xs text-muted-foreground">({functions.length})</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New Function
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : functions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No edge functions yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create serverless functions for custom backend logic
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {functions.map((fn) => (
              <div key={fn.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Code className="w-4 h-4 text-primary/70" />
                  <div>
                    <p className="text-xs font-medium text-foreground font-mono">{fn.name}</p>
                    <p className="text-[10px] text-muted-foreground">Trigger: {fn.trigger_type}</p>
                  </div>
                </div>
                <button className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors">
                  <Play className="w-3 h-3" />
                  Invoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudFunctions;
