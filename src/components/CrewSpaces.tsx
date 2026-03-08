import { useState, useEffect, useCallback } from "react";
import { Users, Plus, Trash2, Mail, Check, X, Crown, Pencil, Eye, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Member {
  id: string;
  email: string;
  role: "viewer" | "editor" | "admin";
  status: "pending" | "accepted" | "declined";
  created_at: string;
}

const ROLE_ICONS: Record<string, typeof Eye> = { viewer: Eye, editor: Pencil, admin: Shield };
const ROLE_LABELS: Record<string, string> = { viewer: "Viewer", editor: "Editor", admin: "Admin" };
const ROLE_COLORS: Record<string, string> = {
  viewer: "bg-secondary text-muted-foreground",
  editor: "bg-primary/10 text-primary",
  admin: "bg-[hsl(var(--ide-warning))]/10 text-[hsl(var(--ide-warning))]",
};

const CrewSpaces = () => {
  const { currentProject } = useProjects();
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor" | "admin">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await supabase
      .from("workspace_members" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setMembers((data as any as Member[]) || []);
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const inviteMember = async () => {
    if (!currentProject || !user || !inviteEmail.trim()) return;
    if (inviteEmail.trim() === user.email) {
      toast({ title: "Can't invite yourself", variant: "destructive" });
      return;
    }
    setIsInviting(true);
    const { error } = await supabase.from("workspace_members" as any).insert({
      project_id: currentProject.id,
      user_id: "00000000-0000-0000-0000-000000000000", // placeholder until they accept
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invited_by: user.id,
    } as any);

    if (error) {
      const msg = error.message.includes("duplicate") ? "Already invited" : error.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    } else {
      toast({ title: "Invited!", description: `${inviteEmail.trim()} invited as ${ROLE_LABELS[inviteRole]}` });
      setInviteEmail("");
      setShowInvite(false);
      fetchMembers();
    }
    setIsInviting(false);
  };

  const removeMember = async (id: string) => {
    await supabase.from("workspace_members" as any).delete().eq("id", id);
    setMembers(prev => prev.filter(m => m.id !== id));
    toast({ title: "Removed" });
  };

  const updateRole = async (id: string, role: string) => {
    await supabase.from("workspace_members" as any).update({ role } as any).eq("id", id);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role: role as any } : m));
  };

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Crew Spaces</span>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
        >
          <Plus className="w-3.5 h-3.5" />
          Invite
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Invite form */}
        <AnimatePresence>
          {showInvite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Invite a team member</span>
                </div>
                <input
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Email address"
                  type="email"
                  className="w-full bg-background text-foreground text-sm rounded-lg px-3 py-2 border border-border focus:border-primary outline-none"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && inviteMember()}
                />
                <div className="flex gap-1">
                  {(["viewer", "editor", "admin"] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setInviteRole(r)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        inviteRole === r ? ROLE_COLORS[r] + " ring-1 ring-current" : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={() => setShowInvite(false)} className="text-xs text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                  <button
                    onClick={inviteMember}
                    disabled={!inviteEmail.trim() || isInviting}
                    className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    <Mail className="w-3 h-3" /> Send Invite
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Owner */}
        <div className="border border-border rounded-xl p-3 bg-background flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Crown className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
            <p className="text-[11px] text-muted-foreground">Owner</p>
          </div>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">You</span>
        </div>

        {/* Members */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-10 h-10 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">No team members yet</p>
              <p className="text-[11px] text-muted-foreground">Invite people to collaborate on this project</p>
            </div>
          </div>
        ) : (
          members.map(member => {
            const RoleIcon = ROLE_ICONS[member.role];
            return (
              <motion.div
                key={member.id}
                layout
                className="border border-border rounded-xl p-3 bg-background flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    {member.email[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{member.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role]}`}>
                      <RoleIcon className="w-2.5 h-2.5" />
                      {ROLE_LABELS[member.role]}
                    </span>
                    <span className={`text-[10px] ${member.status === "accepted" ? "text-[hsl(var(--ide-success))]" : member.status === "declined" ? "text-destructive" : "text-muted-foreground"}`}>
                      {member.status === "pending" ? "⏳ Pending" : member.status === "accepted" ? "✓ Accepted" : "✗ Declined"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Role switcher */}
                  <select
                    value={member.role}
                    onChange={e => updateRole(member.id, e.target.value)}
                    className="text-[10px] bg-secondary border border-border rounded px-1 py-0.5 text-foreground outline-none cursor-pointer"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CrewSpaces;
