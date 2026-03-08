import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Database, ChevronDown, ChevronRight, Save, Loader2, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Field {
  name: string;
  type: "text" | "number" | "boolean" | "date" | "json" | "email" | "url";
  required: boolean;
}

interface Collection {
  id?: string;
  collection_name: string;
  schema: { fields: Field[] };
  isExpanded?: boolean;
  isNew?: boolean;
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "json", label: "JSON" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
] as const;

const SchemaBuilder = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSchemas = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_schemas" as any)
      .select("*")
      .eq("project_id", currentProject.id);

    if (error) {
      console.error("Failed to fetch schemas:", error);
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((s: any) => ({
      id: s.id,
      collection_name: s.collection_name,
      schema: typeof s.schema === "object" && s.schema?.fields ? s.schema : { fields: [] },
      isExpanded: false,
    }));
    setCollections(mapped);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  const addCollection = () => {
    setCollections((prev) => [
      ...prev,
      {
        collection_name: "",
        schema: { fields: [{ name: "", type: "text", required: false }] },
        isExpanded: true,
        isNew: true,
      },
    ]);
  };

  const removeCollection = (index: number) => {
    setCollections((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCollection = (index: number, updates: Partial<Collection>) => {
    setCollections((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
  };

  const toggleExpanded = (index: number) => {
    updateCollection(index, { isExpanded: !collections[index].isExpanded });
  };

  const addField = (collectionIndex: number) => {
    const col = collections[collectionIndex];
    updateCollection(collectionIndex, {
      schema: {
        fields: [...col.schema.fields, { name: "", type: "text", required: false }],
      },
    });
  };

  const removeField = (collectionIndex: number, fieldIndex: number) => {
    const col = collections[collectionIndex];
    updateCollection(collectionIndex, {
      schema: {
        fields: col.schema.fields.filter((_, i) => i !== fieldIndex),
      },
    });
  };

  const updateField = (collectionIndex: number, fieldIndex: number, updates: Partial<Field>) => {
    const col = collections[collectionIndex];
    updateCollection(collectionIndex, {
      schema: {
        fields: col.schema.fields.map((f, i) =>
          i === fieldIndex ? { ...f, ...updates } : f
        ),
      },
    });
  };

  const saveAll = async () => {
    if (!currentProject) return;
    setSaving(true);

    try {
      // Validate
      for (const col of collections) {
        if (!col.collection_name.trim()) {
          toast({ title: "Validation error", description: "All collections need a name", variant: "destructive" });
          setSaving(false);
          return;
        }
        for (const field of col.schema.fields) {
          if (!field.name.trim()) {
            toast({ title: "Validation error", description: `All fields in "${col.collection_name}" need a name`, variant: "destructive" });
            setSaving(false);
            return;
          }
        }
      }

      // Delete existing schemas for this project
      await supabase
        .from("project_schemas" as any)
        .delete()
        .eq("project_id", currentProject.id);

      // Insert all
      if (collections.length > 0) {
        const rows = collections.map((c) => ({
          project_id: currentProject.id,
          collection_name: c.collection_name.trim().toLowerCase().replace(/\s+/g, "_"),
          schema: { fields: c.schema.fields },
        }));

        const { error } = await supabase
          .from("project_schemas" as any)
          .insert(rows);

        if (error) throw error;
      }

      toast({ title: "Saved!", description: `${collections.length} collection(s) saved.` });
      fetchSchemas();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!currentProject) return null;

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-ide-panel-header">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Data Models</span>
          <span className="text-xs text-muted-foreground">({collections.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addCollection}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Collection
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No data models yet</p>
            <p className="text-xs text-muted-foreground/70 mb-4">
              Define your app's data structure visually
            </p>
            <button
              onClick={addCollection}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add First Collection
            </button>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {collections.map((col, ci) => (
              <motion.div
                key={ci}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="border border-border rounded-lg overflow-hidden bg-card"
              >
                {/* Collection header */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => toggleExpanded(ci)}
                >
                  {col.isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <Database className="w-3.5 h-3.5 text-primary/70" />
                  <input
                    value={col.collection_name}
                    onChange={(e) => updateCollection(ci, { collection_name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="collection_name"
                    className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
                  />
                  <span className="text-xs text-muted-foreground">{col.schema.fields.length} fields</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCollection(ci); }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Fields */}
                <AnimatePresence>
                  {col.isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border px-3 py-2 space-y-1.5">
                        {/* Field header */}
                        <div className="grid grid-cols-[1fr_100px_60px_28px] gap-2 px-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Field</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Type</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Req</span>
                          <span></span>
                        </div>

                        {col.schema.fields.map((field, fi) => (
                          <div
                            key={fi}
                            className="grid grid-cols-[1fr_100px_60px_28px] gap-2 items-center bg-secondary/30 rounded-md px-1 py-1"
                          >
                            <input
                              value={field.name}
                              onChange={(e) => updateField(ci, fi, { name: e.target.value })}
                              placeholder="field_name"
                              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-1.5 py-1 rounded border border-transparent focus:border-primary/30"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => updateField(ci, fi, { type: e.target.value as Field["type"] })}
                              className="bg-secondary text-xs text-foreground rounded px-1.5 py-1 outline-none border border-transparent focus:border-primary/30 cursor-pointer"
                            >
                              {FIELD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            <label className="flex items-center justify-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateField(ci, fi, { required: e.target.checked })}
                                className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer"
                              />
                            </label>
                            <button
                              onClick={() => removeField(ci, fi)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-0.5 flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}

                        <button
                          onClick={() => addField(ci)}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors py-1 px-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add field
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default SchemaBuilder;
