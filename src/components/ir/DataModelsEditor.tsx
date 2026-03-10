import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Database, GripVertical, ToggleLeft } from "lucide-react";
import type { IRDataModel, IRField } from "@/lib/irTypes";
import { createModelId } from "@/lib/irTypes";

interface Props {
  models: IRDataModel[];
  onChange: (models: IRDataModel[]) => void;
}

const FIELD_TYPES = [
  "text", "number", "boolean", "date", "json", "email", "url", "select", "relation",
] as const;

export default function DataModelsEditor({ models, onChange }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addModel = () => {
    const newModel: IRDataModel = {
      id: createModelId(),
      collectionName: `collection_${models.length + 1}`,
      description: "",
      fields: [{ name: "title", type: "text", required: true, displayInList: true, searchable: true }],
      timestamps: true,
      softDelete: false,
    };
    onChange([...models, newModel]);
    setExpandedIds(prev => new Set(prev).add(newModel.id));
  };

  const updateModel = (id: string, updates: Partial<IRDataModel>) => {
    onChange(models.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const removeModel = (id: string) => {
    onChange(models.filter(m => m.id !== id));
  };

  const addField = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    if (!model) return;
    updateModel(modelId, {
      fields: [...model.fields, { name: "", type: "text", required: false, displayInList: true }],
    });
  };

  const updateField = (modelId: string, idx: number, updates: Partial<IRField>) => {
    const model = models.find(m => m.id === modelId);
    if (!model) return;
    const fields = [...model.fields];
    fields[idx] = { ...fields[idx], ...updates };
    updateModel(modelId, { fields });
  };

  const removeField = (modelId: string, idx: number) => {
    const model = models.find(m => m.id === modelId);
    if (!model) return;
    updateModel(modelId, { fields: model.fields.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          Data Models ({models.length})
        </h3>
        <button
          onClick={addModel}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Model
        </button>
      </div>

      <div className="space-y-2">
        {models.map((model) => {
          const expanded = expandedIds.has(model.id);
          return (
            <div key={model.id} className="border border-border rounded-lg bg-card overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggle(model.id)}
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Database className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-mono text-foreground">{model.collectionName}</span>
                <span className="text-[10px] text-muted-foreground">({model.fields.length} fields)</span>
                <div className="ml-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeModel(model.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Collection Name</label>
                      <input
                        value={model.collectionName}
                        onChange={e => updateModel(model.id, { collectionName: e.target.value })}
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
                      <input
                        value={model.description}
                        onChange={e => updateModel(model.id, { description: e.target.value })}
                        placeholder="What this collection stores..."
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={model.timestamps}
                        onChange={e => updateModel(model.id, { timestamps: e.target.checked })}
                        className="rounded border-border"
                      />
                      <ToggleLeft className="w-3 h-3" /> Timestamps
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={model.softDelete}
                        onChange={e => updateModel(model.id, { softDelete: e.target.checked })}
                        className="rounded border-border"
                      />
                      Soft Delete
                    </label>
                  </div>

                  {/* Fields */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fields</label>
                      <button
                        onClick={() => addField(model.id)}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> Add Field
                      </button>
                    </div>
                    {model.fields.map((field, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 group">
                        <input
                          value={field.name}
                          onChange={e => updateField(model.id, idx, { name: e.target.value })}
                          placeholder="field_name"
                          className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <select
                          value={field.type}
                          onChange={e => updateField(model.id, idx, { type: e.target.value as IRField["type"] })}
                          className="w-20 px-1 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <label className="flex items-center gap-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={e => updateField(model.id, idx, { required: e.target.checked })}
                            className="rounded border-border w-3 h-3"
                          />
                          req
                        </label>
                        <button
                          onClick={() => removeField(model.id, idx)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {models.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-xs">
            No data models defined. Add your first collection.
          </div>
        )}
      </div>
    </div>
  );
}
