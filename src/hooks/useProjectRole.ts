import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/contexts/ProjectContext";

export type ProjectRole = "owner" | "admin" | "editor" | "viewer" | null;

interface UseProjectRoleReturn {
  role: ProjectRole;
  loading: boolean;
  canEdit: boolean;
  canManage: boolean;
  canView: boolean;
  isOwner: boolean;
}

export function useProjectRole(): UseProjectRoleReturn {
  const { user } = useAuth();
  const { currentProject } = useProjects();
  const [role, setRole] = useState<ProjectRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !currentProject) {
      setRole(null);
      setLoading(false);
      return;
    }

    // Check if user is owner
    if ((currentProject as any).user_id === user.id) {
      setRole("owner");
      setLoading(false);
      return;
    }

    // Check workspace_members for role
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("project_id", currentProject.id)
        .eq("user_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();

      setRole((data?.role as ProjectRole) || null);
      setLoading(false);
    })();
  }, [user, currentProject]);

  return {
    role,
    loading,
    isOwner: role === "owner",
    canManage: role === "owner" || role === "admin",
    canEdit: role === "owner" || role === "admin" || role === "editor",
    canView: role !== null,
  };
}
