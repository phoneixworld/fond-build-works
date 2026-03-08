import { Plus, FolderOpen, Trash2, Loader2 } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { formatDistanceToNow } from "date-fns";

const ProjectList = () => {
  const { projects, currentProject, loading, selectProject, createProject, deleteProject } = useProjects();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-ide-panel-header">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</span>
        <button
          onClick={() => createProject()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary"
          title="New project"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
            <FolderOpen className="w-8 h-8 opacity-40" />
            <p className="text-xs text-center">No projects yet</p>
            <button
              onClick={() => createProject()}
              className="text-xs text-primary hover:underline"
            >
              Create your first project
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              onClick={() => selectProject(project.id)}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                currentProject?.id === project.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{project.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5"
                title="Delete project"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectList;
