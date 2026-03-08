import { useState, useRef } from "react";
import { Zap, Send, FolderOpen, Trash2, Loader2, ArrowRight, Copy, Rocket } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProjects, Project } from "@/contexts/ProjectContext";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import TechStackSelector from "@/components/TechStackSelector";
import { TechStackId, TECH_STACKS } from "@/lib/techStacks";
import { TEMPLATES, Template } from "@/lib/templates";

interface LandingPageProps {
  onStartProject: (prompt: string, techStack: TechStackId) => void;
  onOpenProject: (id: string) => void;
}

const LandingPage = ({ onStartProject, onOpenProject }: LandingPageProps) => {
  const { user, signOut } = useAuth();
  const { projects, loading, deleteProject, cloneProject } = useProjects();
  const [input, setInput] = useState("");
  const [techStack, setTechStack] = useState<TechStackId>("html-tailwind");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onStartProject(input.trim(), techStack);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const [showTemplates, setShowTemplates] = useState(false);

  const suggestions = [
    "A todo app with user accounts",
    "A SaaS landing page with pricing",
    "A CRM dashboard with contacts",
    "A blog with data persistence",
  ];

  const handleUseTemplate = (template: Template) => {
    setTechStack(template.techStack);
    onStartProject(template.prompt, template.techStack);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-base font-bold text-foreground">Lovable</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-secondary"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl space-y-6"
        >
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold text-foreground tracking-tight">
              What do you want to <span className="text-primary">build</span>?
            </h1>
            <p className="text-muted-foreground text-base">
              Describe your idea, pick a tech stack, and watch it come to life.
            </p>
          </div>

          {/* Tech stack selector */}
          <div className="flex justify-center">
            <TechStackSelector value={techStack} onChange={setTechStack} />
          </div>

          {/* Prompt input */}
          <div className="relative bg-secondary border border-border rounded-xl p-1 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your app idea..."
              className="w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground outline-none resize-none p-3 pb-12 min-h-[100px]"
              rows={3}
            />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {TECH_STACKS.find(s => s.id === techStack)?.label} • Full-stack enabled
              </span>
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Build it
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="text-xs px-3.5 py-2 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-secondary transition-all"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Launchpads (Templates) */}
          <div className="flex justify-center">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-full border border-border hover:border-primary/30"
            >
              <Rocket className="w-3.5 h-3.5" />
              {showTemplates ? "Hide" : "Use a"} Launchpad
            </button>
          </div>

          {showTemplates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleUseTemplate(t)}
                      className="text-left p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t.name}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground ml-9">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Recent projects */}
        {!loading && projects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="w-full max-w-2xl mt-12"
          >
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Recent Projects</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {projects.slice(0, 6).map((project) => {
                const stackInfo = TECH_STACKS.find(s => s.id === project.tech_stack);
                const StackIcon = stackInfo?.icon || FolderOpen;
                return (
                  <div
                    key={project.id}
                    onClick={() => onOpenProject(project.id)}
                    className="group flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-secondary/50 cursor-pointer transition-all"
                  >
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <StackIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {stackInfo?.label || "HTML"} • {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); cloneProject(project.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all p-1"
                      title="Clone project"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default LandingPage;
