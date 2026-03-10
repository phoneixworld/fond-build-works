import { useState, useMemo, useRef, useEffect } from "react";
import { FolderOpen, Trash2, Copy, Star, Clock, Grid3X3, ChevronLeft, ChevronRight } from "lucide-react";
import { Project, useProjects } from "@/contexts/ProjectContext";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface ProjectGalleryProps {
  onOpenProject: (id: string) => void;
}

type FilterTab = "all" | "recent" | "starred";

const ITEMS_PER_PAGE = 9;

const FALLBACK_GRADIENTS = [
  "from-[hsl(var(--primary))] to-[hsl(var(--accent))]",
  "from-[hsl(265,89%,62%)] to-[hsl(300,80%,55%)]",
  "from-[hsl(142,71%,45%)] to-[hsl(170,80%,40%)]",
  "from-[hsl(var(--ide-warning))] to-[hsl(25,90%,50%)]",
  "from-[hsl(210,100%,56%)] to-[hsl(190,90%,45%)]",
  "from-[hsl(330,80%,55%)] to-[hsl(265,89%,62%)]",
];

const ProjectGallery = ({ onOpenProject }: ProjectGalleryProps) => {
  const { projects, deleteProject, cloneProject } = useProjects();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(0);
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("starred_projects");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("starred_projects", JSON.stringify([...next]));
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (activeTab === "starred") return projects.filter((p) => starredIds.has(p.id));
    if (activeTab === "recent") return [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 12);
    return projects;
  }, [projects, activeTab, starredIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  const tabs: { id: FilterTab; label: string; icon: any }[] = [
    { id: "all", label: "All projects", icon: Grid3X3 },
    { id: "recent", label: "Recent", icon: Clock },
    { id: "starred", label: "Starred", icon: Star },
  ];

  if (projects.length === 0) return null;

  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-12">
      {/* Tabs + Count */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(0); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-secondary text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} project{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Gallery Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeTab}-${currentPage}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {paged.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={i}
              isStarred={starredIds.has(project.id)}
              onOpen={() => onOpenProject(project.id)}
              onStar={(e) => toggleStar(project.id, e)}
              onClone={(e) => { e.stopPropagation(); cloneProject(project.id); }}
              onDelete={(e) => { e.stopPropagation(); deleteProject(project.id); }}
              fallbackGradient={FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Empty state for starred */}
      {filtered.length === 0 && activeTab === "starred" && (
        <div className="text-center py-16">
          <Star className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No starred projects yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Click the star icon on any project to save it here</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-10">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                  i === currentPage
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
};

interface ProjectCardProps {
  project: Project;
  index: number;
  isStarred: boolean;
  gradient: string;
  onOpen: () => void;
  onStar: (e: React.MouseEvent) => void;
  onClone: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

const ProjectCard = ({ project, index, isStarred, gradient, onOpen, onStar, onClone, onDelete }: ProjectCardProps) => {
  // Extract emoji from name
  const nameMatch = project.name.match(/^(\p{Emoji})\s*/u);
  const emoji = nameMatch ? nameMatch[1] : null;
  const displayName = nameMatch ? project.name.slice(nameMatch[0].length) : project.name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      onClick={onOpen}
      className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden cursor-pointer hover:border-[hsl(var(--primary)/0.4)] hover:shadow-lg hover:shadow-[hsl(var(--primary)/0.06)] transition-all duration-300"
    >
      {/* Thumbnail placeholder */}
      <div className={`relative h-40 bg-gradient-to-br ${gradient} overflow-hidden`}>
        <div className="absolute inset-0 bg-black/10" />
        {/* Pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }} />
        {/* Center emoji/icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {emoji ? (
            <span className="text-5xl drop-shadow-lg">{emoji}</span>
          ) : (
            <FolderOpen className="w-10 h-10 text-white/50" />
          )}
        </div>
        {/* Published badge */}
        {project.is_published && (
          <span className="absolute bottom-2 left-3 text-[10px] font-semibold bg-black/40 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
            Published
          </span>
        )}
        {/* Star button */}
        <button
          onClick={onStar}
          className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
            isStarred
              ? "bg-[hsl(var(--ide-warning)/0.9)] text-white"
              : "bg-black/20 backdrop-blur-sm text-white/60 opacity-0 group-hover:opacity-100 hover:text-white"
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${isStarred ? "fill-current" : ""}`} />
        </button>
      </div>

      {/* Info */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
          <FolderOpen className="w-4 h-4 text-[hsl(var(--primary))]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{displayName || project.name}</p>
          <p className="text-xs text-muted-foreground">
            Edited {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onClone} className="p-1.5 rounded-full bg-black/20 backdrop-blur-sm text-white/60 hover:text-white transition-colors" title="Clone">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-full bg-black/20 backdrop-blur-sm text-white/60 hover:text-red-300 transition-colors" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};

export default ProjectGallery;
