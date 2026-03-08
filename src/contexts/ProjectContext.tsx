import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface Project {
  id: string;
  name: string;
  html_content: string;
  chat_history: { role: "user" | "assistant"; content: string }[];
  updated_at: string;
  created_at: string;
}

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  selectProject: (id: string) => void;
  createProject: (name?: string) => Promise<Project | null>;
  saveProject: (updates: Partial<Pick<Project, "name" | "html_content" | "chat_history">>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch projects:", error);
      return;
    }

    const mapped = (data ?? []).map((p: any) => ({
      ...p,
      chat_history: Array.isArray(p.chat_history) ? p.chat_history : [],
    })) as Project[];
    setProjects(mapped);

    // Auto-select first or keep current
    if (mapped.length > 0 && !currentProject) {
      setCurrentProject(mapped[0]);
    }
    setLoading(false);
  }, [user, currentProject]);

  useEffect(() => {
    if (user) fetchProjects();
    else {
      setProjects([]);
      setCurrentProject(null);
      setLoading(false);
    }
  }, [user, fetchProjects]);

  const selectProject = useCallback((id: string) => {
    const p = projects.find((p) => p.id === id);
    if (p) setCurrentProject(p);
  }, [projects]);

  const createProject = useCallback(async (name?: string): Promise<Project | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: name || "Untitled Project" })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
      return null;
    }

    const project = { ...data, chat_history: [] } as Project;
    setProjects((prev) => [project, ...prev]);
    setCurrentProject(project);
    return project;
  }, [user, toast]);

  const saveProject = useCallback(async (updates: Partial<Pick<Project, "name" | "html_content" | "chat_history">>) => {
    if (!currentProject) return;
    const { error } = await supabase
      .from("projects")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", currentProject.id);

    if (error) {
      console.error("Failed to save project:", error);
      return;
    }

    const updated = { ...currentProject, ...updates, updated_at: new Date().toISOString() };
    setCurrentProject(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, [currentProject]);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
      return;
    }
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (currentProject?.id === id) {
        setCurrentProject(remaining[0] || null);
      }
      return remaining;
    });
  }, [currentProject, toast]);

  return (
    <ProjectContext.Provider value={{ projects, currentProject, loading, selectProject, createProject, saveProject, deleteProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
};
