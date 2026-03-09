import { useState } from "react";
import { Plus, Trash2, Shield, Users, Lock, Unlock, ChevronDown, ChevronRight } from "lucide-react";
import type { IRAuthConfig, IRRole, IRPermission } from "@/lib/irTypes";
import { createRoleId, createPermissionId } from "@/lib/irTypes";

interface Props {
  auth: IRAuthConfig;
  onChange: (auth: IRAuthConfig) => void;
  collections: string[]; // available collection names for permission targets
  routes: string[];      // available route paths for public routes
}

const ACTIONS = ["create", "read", "update", "delete"] as const;

export default function AuthRulesEditor({ auth, onChange, collections, routes }: Props) {
  const [showPerms, setShowPerms] = useState(false);

  const update = (updates: Partial<IRAuthConfig>) => onChange({ ...auth, ...updates });

  const addRole = () => {
    update({
      roles: [...auth.roles, { id: createRoleId(), name: "", description: "" }],
    });
  };

  const updateRole = (id: string, updates: Partial<IRRole>) => {
    update({ roles: auth.roles.map(r => r.id === id ? { ...r, ...updates } : r) });
  };

  const removeRole = (id: string) => {
    update({
      roles: auth.roles.filter(r => r.id !== id),
      permissions: auth.permissions.filter(p => p.roleId !== id),
    });
  };

  const addPermission = () => {
    if (!auth.roles.length) return;
    update({
      permissions: [...auth.permissions, {
        id: createPermissionId(),
        roleId: auth.roles[0].id,
        resource: collections[0] || "",
        actions: ["read"],
      }],
    });
  };

  const updatePermission = (id: string, updates: Partial<IRPermission>) => {
    update({ permissions: auth.permissions.map(p => p.id === id ? { ...p, ...updates } : p) });
  };

  const removePermission = (id: string) => {
    update({ permissions: auth.permissions.filter(p => p.id !== id) });
  };

  const togglePublicRoute = (path: string) => {
    const current = auth.publicRoutes || [];
    update({
      publicRoutes: current.includes(path)
        ? current.filter(r => r !== path)
        : [...current, path],
    });
  };

  const toggleAction = (permId: string, action: typeof ACTIONS[number]) => {
    const perm = auth.permissions.find(p => p.id === permId);
    if (!perm) return;
    const actions = perm.actions.includes(action)
      ? perm.actions.filter(a => a !== action)
      : [...perm.actions, action];
    updatePermission(permId, { actions: actions as IRPermission["actions"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Authentication & Authorization
        </h3>
      </div>

      {/* Toggle auth */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={auth.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            className="rounded border-border"
          />
          {auth.enabled ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
          Authentication {auth.enabled ? "Enabled" : "Disabled"}
        </label>
        {auth.enabled && (
          <select
            value={auth.provider}
            onChange={e => update({ provider: e.target.value as IRAuthConfig["provider"] })}
            className="px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="email">Email only</option>
            <option value="email+social">Email + Social</option>
          </select>
        )}
      </div>

      {auth.enabled && (
        <>
          {/* Public Routes */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Public Routes (no auth required)</label>
            <div className="flex flex-wrap gap-1.5">
              {routes.map(path => (
                <button
                  key={path}
                  onClick={() => togglePublicRoute(path)}
                  className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                    auth.publicRoutes?.includes(path)
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> Roles
              </label>
              <button
                onClick={addRole}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add Role
              </button>
            </div>
            {auth.roles.map(role => (
              <div key={role.id} className="flex items-center gap-1.5 group">
                <input
                  value={role.name}
                  onChange={e => updateRole(role.id, { name: e.target.value })}
                  placeholder="Role name"
                  className="w-28 px-2 py-1 text-xs bg-background border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  value={role.description}
                  onChange={e => updateRole(role.id, { description: e.target.value })}
                  placeholder="Description"
                  className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => removeRole(role.id)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Permissions */}
          {auth.roles.length > 0 && (
            <div className="space-y-2">
              <div
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => setShowPerms(!showPerms)}
              >
                {showPerms ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">
                  Permissions ({auth.permissions.length})
                </label>
                <button
                  onClick={(e) => { e.stopPropagation(); addPermission(); }}
                  className="ml-auto text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {showPerms && auth.permissions.map(perm => (
                <div key={perm.id} className="flex items-center gap-1.5 flex-wrap group p-2 rounded border border-border bg-background">
                  <select
                    value={perm.roleId}
                    onChange={e => updatePermission(perm.id, { roleId: e.target.value })}
                    className="w-24 px-1 py-0.5 text-[10px] bg-muted border border-border rounded"
                  >
                    {auth.roles.map(r => <option key={r.id} value={r.id}>{r.name || "(unnamed)"}</option>)}
                  </select>
                  <span className="text-[10px] text-muted-foreground">can</span>
                  {ACTIONS.map(action => (
                    <button
                      key={action}
                      onClick={() => toggleAction(perm.id, action)}
                      className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                        perm.actions.includes(action)
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-muted border-border text-muted-foreground"
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                  <span className="text-[10px] text-muted-foreground">on</span>
                  <select
                    value={perm.resource}
                    onChange={e => updatePermission(perm.id, { resource: e.target.value })}
                    className="w-28 px-1 py-0.5 text-[10px] bg-muted border border-border rounded"
                  >
                    {collections.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    onClick={() => removePermission(perm.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
