import { useState, useCallback } from "react";
import { Plus, Trash2, GripVertical, Shield, ChevronDown, ChevronRight, Route, ArrowRight } from "lucide-react";
import type { IRRoute } from "@/lib/irTypes";
import { createRouteId } from "@/lib/irTypes";

interface Props {
  routes: IRRoute[];
  onChange: (routes: IRRoute[]) => void;
}

const ICON_OPTIONS = [
  "LayoutDashboard", "Users", "ShoppingCart", "Settings", "BarChart3",
  "FileText", "MessageSquare", "Calendar", "Mail", "Heart",
  "Star", "Folder", "Image", "Bell", "Search", "Tag",
  "CreditCard", "Package", "Truck", "Map", "Globe",
];

export default function RoutesEditor({ routes, onChange }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(routes.map(r => r.id)));

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addRoute = () => {
    onChange([
      ...routes,
      {
        id: createRouteId(),
        path: `/new-page-${routes.length + 1}`,
        label: `New Page ${routes.length + 1}`,
        icon: "FileText",
        isProtected: false,
        description: "",
      },
    ]);
  };

  const updateRoute = (id: string, updates: Partial<IRRoute>) => {
    onChange(routes.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRoute = (id: string) => {
    onChange(routes.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Route className="w-4 h-4 text-primary" />
          Routes ({routes.length})
        </h3>
        <button
          onClick={addRoute}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Route
        </button>
      </div>

      <div className="space-y-2">
        {routes.map((route) => {
          const expanded = expandedIds.has(route.id);
          return (
            <div key={route.id} className="border border-border rounded-lg bg-card overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggle(route.id)}
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <code className="text-xs text-primary font-mono">{route.path}</code>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-foreground">{route.label}</span>
                {route.isProtected && <Shield className="w-3 h-3 text-amber-500" />}
                <div className="ml-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRoute(route.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Path</label>
                      <input
                        value={route.path}
                        onChange={e => updateRoute(route.id, { path: e.target.value })}
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</label>
                      <input
                        value={route.label}
                        onChange={e => updateRoute(route.id, { label: e.target.value })}
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Icon</label>
                      <select
                        value={route.icon || ""}
                        onChange={e => updateRoute(route.id, { icon: e.target.value })}
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">None</option>
                        {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end pb-0.5">
                      <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={route.isProtected}
                          onChange={e => updateRoute(route.id, { isProtected: e.target.checked })}
                          className="rounded border-border"
                        />
                        <Shield className="w-3 h-3" /> Protected
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description (intent for AI)</label>
                    <input
                      value={route.description || ""}
                      onChange={e => updateRoute(route.id, { description: e.target.value })}
                      placeholder="e.g., User management page with table, search, and invite modal"
                      className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {routes.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-xs">
            No routes defined. Add your first route to get started.
          </div>
        )}
      </div>
    </div>
  );
}
