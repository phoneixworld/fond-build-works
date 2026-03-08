import { useState, useEffect, useCallback } from "react";
import { Users, Loader2, Search, Mail, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";

const CloudUsers = () => {
  const { currentProject } = useProjects();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_users" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Users</span>
          <span className="text-xs text-muted-foreground">({users.length})</span>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-7 pr-3 py-1.5 text-xs bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/30 w-48"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "No users match your search" : "No users registered yet"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Users will appear here when they sign up to your app
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Email</th>
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Name</th>
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-foreground font-mono">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">{user.display_name || "—"}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CloudUsers;
