import { useState, useEffect, useCallback } from "react";
import { Users, Loader2, Search, Mail, Calendar, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

const CloudUsers = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("project_users")
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAddUser = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !currentProject) return;
    const { error } = await supabase
      .from("project_users")
      .insert({
        project_id: currentProject.id,
        email: newEmail.trim(),
        display_name: newName.trim() || null,
        password_hash: btoa(newPassword), // Simple encoding for demo
        metadata: {} as any,
      });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "User added", description: `${newEmail} has been added` });
    setNewEmail(""); setNewName(""); setNewPassword(""); setShowAdd(false);
    fetchUsers();
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    const { error } = await supabase.from("project_users").delete().eq("id", userId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== userId));
    toast({ title: "Deleted", description: `${email} removed` });
  };

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
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="pl-7 pr-3 py-1.5 text-xs bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/30 w-40" />
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <UserPlus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Email</label>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Display name" className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none px-2.5 py-1.5 rounded border border-border focus:border-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30" />
          </div>
          <button onClick={handleAddUser} disabled={!newEmail.trim() || !newPassword.trim()} className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap">
            Save
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{search ? "No users match your search" : "No users registered yet"}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Users will appear here when they sign up to your app</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Email</th>
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Name</th>
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Joined</th>
                <th className="px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
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
                  <td className="px-5 py-2.5">
                    <button onClick={() => handleDeleteUser(user.id, user.email)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
