import { useState, useEffect, useCallback } from "react";
import { Layers, Save, Loader2, RotateCcw, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import type { IRState } from "@/lib/irTypes";
import { DEFAULT_IR_STATE } from "@/lib/irTypes";
import { hasIRContent } from "@/lib/irSerializer";
import RoutesEditor from "@/components/ir/RoutesEditor";
import DataModelsEditor from "@/components/ir/DataModelsEditor";
import AuthRulesEditor from "@/components/ir/AuthRulesEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const IREditor = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [ir, setIR] = useState<IRState>(DEFAULT_IR_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load IR from project
  useEffect(() => {
    if (!currentProject) return;
    setLoading(true);
    supabase
      .from("projects")
      .select("ir_state")
      .eq("id", currentProject.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load IR:", error);
        } else {
          const stored = (data as any)?.ir_state;
          if (stored && typeof stored === "object" && stored.version) {
            setIR(stored as IRState);
          } else {
            setIR(DEFAULT_IR_STATE);
          }
        }
        setLoading(false);
        setDirty(false);
      });
  }, [currentProject?.id]);

  const updateIR = useCallback((updates: Partial<IRState>) => {
    setIR(prev => ({ ...prev, ...updates }));
    setDirty(true);
  }, []);

  const saveIR = useCallback(async () => {
    if (!currentProject) return;
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ ir_state: ir as any, updated_at: new Date().toISOString() } as any)
      .eq("id", currentProject.id);
    
    if (error) {
      toast({ title: "Error", description: "Failed to save IR state", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "IR state saved successfully" });
      setDirty(false);
    }
    setSaving(false);
  }, [currentProject, ir, toast]);

  const resetIR = useCallback(() => {
    setIR(DEFAULT_IR_STATE);
    setDirty(true);
  }, []);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a project to edit its IR
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading IR...
      </div>
    );
  }

  const collectionNames = ir.dataModels.map(m => m.collectionName);
  const routePaths = ir.routes.map(r => r.path);
  const hasContent = hasIRContent(ir);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Intent Editor</span>
          {dirty && <span className="text-[10px] text-amber-500 font-medium">• unsaved</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={resetIR}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={saveIR}
            disabled={!dirty || saving}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      {/* Info banner */}
      {!hasContent && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-foreground">
            <strong>IR-Native Development</strong> — Define your app's intent here (routes, data models, auth rules).
            When you build, the AI will generate code that matches this specification exactly.
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="px-4 pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">App Name</label>
            <input
              value={ir.metadata?.appName || ""}
              onChange={e => updateIR({ metadata: { ...ir.metadata, appName: e.target.value } })}
              placeholder="My Application"
              className="w-full mt-0.5 px-2 py-1 text-xs bg-card border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
            <input
              value={ir.metadata?.description || ""}
              onChange={e => updateIR({ metadata: { ...ir.metadata, description: e.target.value } })}
              placeholder="A brief description of the app"
              className="w-full mt-0.5 px-2 py-1 text-xs bg-card border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden px-4 pt-3 pb-4">
        <Tabs defaultValue="routes" className="h-full flex flex-col">
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="routes" className="text-xs">Routes ({ir.routes.length})</TabsTrigger>
            <TabsTrigger value="models" className="text-xs">Models ({ir.dataModels.length})</TabsTrigger>
            <TabsTrigger value="auth" className="text-xs">Auth {ir.auth.enabled ? "✓" : ""}</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-auto mt-3">
            <TabsContent value="routes" className="mt-0">
              <RoutesEditor
                routes={ir.routes}
                onChange={routes => updateIR({ routes })}
              />
            </TabsContent>
            <TabsContent value="models" className="mt-0">
              <DataModelsEditor
                models={ir.dataModels}
                onChange={dataModels => updateIR({ dataModels })}
              />
            </TabsContent>
            <TabsContent value="auth" className="mt-0">
              <AuthRulesEditor
                auth={ir.auth}
                onChange={auth => updateIR({ auth })}
                collections={collectionNames}
                routes={routePaths}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default IREditor;
