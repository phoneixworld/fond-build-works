import { useState, useEffect, useCallback } from "react";
import { KeyRound, Plus, Eye, EyeOff, Trash2, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

interface Secret {
  id?: string;
  key: string;
  value: string;
  visible: boolean;
  saved: boolean;
}

const CloudSecrets = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSecrets = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_data")
      .select("*")
      .eq("project_id", currentProject.id)
      .eq("collection", "_secrets");
    const loaded = (data || []).map((row: any) => ({
      id: row.id,
      key: (row.data as any)?.key || "",
      value: (row.data as any)?.value || "",
      visible: false,
      saved: true,
    }));
    setSecrets(loaded);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchSecrets(); }, [fetchSecrets]);

  const addSecret = () => {
    setSecrets(prev => [...prev, { key: "", value: "", visible: false, saved: false }]);
  };

  const updateSecret = (index: number, updates: Partial<Secret>) => {
    setSecrets(prev => prev.map((s, i) => i === index ? { ...s, ...updates, saved: false } : s));
  };

  const saveSecret = async (index: number) => {
    const secret = secrets[index];
    if (!secret.key.trim() || !currentProject) return;

    if (secret.id) {
      const { error } = await supabase
        .from("project_data")
        .update({ data: { key: secret.key, value: secret.value } as any, updated_at: new Date().toISOString() })
        .eq("id", secret.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data, error } = await supabase
        .from("project_data")
        .insert({ project_id: currentProject.id, collection: "_secrets", data: { key: secret.key, value: secret.value } as any })
        .select()
        .single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      setSecrets(prev => prev.map((s, i) => i === index ? { ...s, id: data.id, saved: true } : s));
      return;
    }
    setSecrets(prev => prev.map((s, i) => i === index ? { ...s, saved: true } : s));
    toast({ title: "Saved", description: `Secret "${secret.key}" saved` });
  };

  const removeSecret = async (index: number) => {
    const secret = secrets[index];
    if (secret.id) {
      await supabase.from("project_data").delete().eq("id", secret.id);
    }
    setSecrets(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Secrets</span>
          <span className="text-xs text-muted-foreground">({secrets.length})</span>
        </div>
        <button onClick={addSecret} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Secret
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : secrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <KeyRound className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No secrets configured</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Store API keys and environment variables securely</p>
          </div>
        ) : (
          <div className="space-y-2">
            {secrets.map((secret, i) => (
              <div key={secret.id || i} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                <input
                  value={secret.key}
                  onChange={(e) => updateSecret(i, { key: e.target.value })}
                  placeholder="SECRET_KEY"
                  className="flex-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                />
                <div className="relative flex-1">
                  <input
                    type={secret.visible ? "text" : "password"}
                    value={secret.value}
                    onChange={(e) => updateSecret(i, { value: e.target.value })}
                    placeholder="value"
                    className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30 pr-8"
                  />
                  <button onClick={() => updateSecret(i, { visible: !secret.visible })} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {secret.visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <button
                  onClick={() => saveSecret(i)}
                  disabled={secret.saved}
                  className={`p-1.5 rounded transition-colors ${secret.saved ? "text-muted-foreground/30" : "text-primary hover:bg-primary/10"}`}
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => removeSecret(i)} className="text-muted-foreground hover:text-destructive transition-colors p-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudSecrets;
