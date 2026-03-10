import { useState, useEffect, useCallback } from "react";
import { Mail, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Invite {
  id: string;
  project_id: string;
  role: string;
  status: string;
  created_at: string;
  project_name?: string;
  invited_by_email?: string;
}

interface PendingInvitesProps {
  onAccepted?: () => void;
}

const PendingInvites = ({ onAccepted }: PendingInvitesProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);

    const { data } = await supabase
      .from("workspace_members")
      .select("id, project_id, role, status, created_at")
      .eq("email", user.email)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      // Fetch project names for the invites
      const projectIds = data.map(d => d.project_id);
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);

      const enriched = data.map(inv => ({
        ...inv,
        project_name: projects?.find(p => p.id === inv.project_id)?.name || "Unknown Project",
      }));
      setInvites(enriched);
    } else {
      setInvites([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const respondToInvite = async (inviteId: string, accept: boolean) => {
    if (!user) return;
    setProcessing(inviteId);

    const updateData: any = { status: accept ? "accepted" : "declined" };
    if (accept) {
      updateData.user_id = user.id;
    }

    const { error } = await supabase
      .from("workspace_members")
      .update(updateData)
      .eq("id", inviteId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: accept ? "Invite accepted!" : "Invite declined" });
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      if (accept) onAccepted?.();
    }
    setProcessing(null);
  };

  if (loading || invites.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {invites.map(invite => (
          <motion.div
            key={invite.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-primary/20 bg-primary/5"
          >
            <Mail className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {invite.project_name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Invited as {invite.role}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => respondToInvite(invite.id, true)}
                disabled={processing === invite.id}
                className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {processing === invite.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={() => respondToInvite(invite.id, false)}
                disabled={processing === invite.id}
                className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PendingInvites;
