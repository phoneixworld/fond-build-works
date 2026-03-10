import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { TechStackId } from "@/lib/techStacks";

export interface Project {
  id: string;
  name: string;
  html_content: string;
  chat_history: { role: "user" | "assistant"; content: string }[];
  tech_stack: TechStackId;
  is_published: boolean;
  published_slug: string | null;
  ir_state: Record<string, any>;
  updated_at: string;
  created_at: string;
}

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  selectProject: (id: string) => void;
  createProject: (name?: string, techStack?: TechStackId) => Promise<Project | null>;
  cloneProject: (id: string) => Promise<Project | null>;
  saveProject: (updates: Partial<Pick<Project, "name" | "html_content" | "chat_history" | "tech_stack">>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  clearCurrentProject: () => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch projects:", error);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((p: any) => ({
      ...p,
      chat_history: Array.isArray(p.chat_history) ? p.chat_history : [],
      tech_stack: p.tech_stack || "html-tailwind",
      is_published: p.is_published || false,
      published_slug: p.published_slug || null,
    })) as Project[];
    setProjects(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchProjects();
    else {
      setProjects([]);
      setCurrentProject(null);
      setLoading(false);
    }
  }, [user, fetchProjects]);

  const selectProject = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("Failed to load project:", error);
      return;
    }

    const project = {
      ...data,
      chat_history: Array.isArray(data.chat_history) ? data.chat_history : [],
      tech_stack: (data as any).tech_stack || "html-tailwind",
      is_published: (data as any).is_published || false,
      published_slug: (data as any).published_slug || null,
    } as unknown as Project;
    setCurrentProject(project);
  }, []);

  const createProject = useCallback(async (name?: string, techStack?: TechStackId): Promise<Project | null> => {
    if (!user) return null;
    const insertData: any = { user_id: user.id, name: name || "Untitled Project" };
    if (techStack) insertData.tech_stack = techStack;
    
    const { data, error } = await supabase
      .from("projects")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
      return null;
    }

    const project = {
      ...data,
      chat_history: [],
      tech_stack: (data as any).tech_stack || techStack || "html-tailwind",
      is_published: false,
      published_slug: null,
    } as Project;
    setProjects((prev) => [project, ...prev]);
    setCurrentProject(project);
    return project;
  }, [user, toast]);

  const saveProject = useCallback(async (updates: Partial<Pick<Project, "name" | "html_content" | "chat_history" | "tech_stack">>) => {
    if (!currentProject) return;
    const { error } = await supabase
      .from("projects")
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", currentProject.id);

    if (error) {
      console.error("Failed to save project:", error);
      return;
    }

    const updated = { ...currentProject, ...updates, updated_at: new Date().toISOString() };
    setCurrentProject(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, [currentProject]);

  const cloneProject = useCallback(async (id: string): Promise<Project | null> => {
    if (!user) return null;
    // Fetch source project
    const { data: source, error: fetchErr } = await supabase.from("projects").select("*").eq("id", id).single();
    if (fetchErr || !source) {
      toast({ title: "Error", description: "Failed to find project to clone", variant: "destructive" });
      return null;
    }
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: `${(source as any).name} (Clone)`,
        html_content: (source as any).html_content || "",
        chat_history: [],
        tech_stack: (source as any).tech_stack || "html-tailwind",
      } as any)
      .select()
      .single();
    if (error || !data) {
      toast({ title: "Error", description: "Failed to clone project", variant: "destructive" });
      return null;
    }
    const project = { ...data, chat_history: [], tech_stack: (data as any).tech_stack || "html-tailwind", is_published: false, published_slug: null } as Project;
    setProjects(prev => [project, ...prev]);
    toast({ title: "Cloned!", description: `"${(source as any).name}" cloned successfully` });
    return project;
  }, [user, toast]);

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

  const clearCurrentProject = useCallback(() => {
    setCurrentProject(null);
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, currentProject, loading, selectProject, createProject, cloneProject, saveProject, deleteProject, refreshProjects: fetchProjects, clearCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
};
