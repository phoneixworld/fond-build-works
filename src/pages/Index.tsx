import { useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Zap, LogOut, ArrowLeft, Database } from "lucide-react";
import { PreviewProvider } from "@/contexts/PreviewContext";
import { ProjectProvider, useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import ChatPanel from "@/components/ChatPanel";
import CodeEditor from "@/components/CodeEditor";
import SchemaBuilder from "@/components/SchemaBuilder";
import PreviewPanel from "@/components/PreviewPanel";
import PublishExportButtons from "@/components/PublishExportButtons";
import TechStackSelector from "@/components/TechStackSelector";
import LandingPage from "@/components/LandingPage";
import { TechStackId, TECH_STACKS } from "@/lib/techStacks";

const IDELayout = () => {
  const { user, signOut } = useAuth();
  const { currentProject, selectProject, createProject, saveProject } = useProjects();
  const [selectedFile, setSelectedFile] = useState("App.tsx");
  const [rightPanel, setRightPanel] = useState<"code" | "preview" | "schema">("preview");
  const [inIDE, setInIDE] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");

  const handleStartProject = useCallback(async (prompt: string, techStack: TechStackId) => {
    setInitialPrompt(prompt);
    const project = await createProject(prompt.slice(0, 40), techStack);
    if (project) setInIDE(true);
  }, [createProject]);

  const handleOpenProject = useCallback((id: string) => {
    selectProject(id);
    setInitialPrompt("");
    setInIDE(true);
  }, [selectProject]);

  const handleTechStackChange = async (id: TechStackId) => {
    if (currentProject) {
      await saveProject({ tech_stack: id });
    }
  };

  if (!inIDE) {
    return <LandingPage onStartProject={handleStartProject} onOpenProject={handleOpenProject} />;
  }

  const currentStack = (currentProject as any)?.tech_stack || "html-tailwind";

  return (
    <PreviewProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-11 flex items-center px-4 border-b border-border bg-ide-panel-header shrink-0 z-10 relative">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInIDE(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary"
              title="Back to projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Lovable</span>
            {currentProject && (
              <>
                <div className="w-px h-4 bg-border mx-1" />
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">{currentProject.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {/* Tech stack switcher */}
            <TechStackSelector value={currentStack} onChange={handleTechStackChange} compact />
            <div className="w-px h-5 bg-border mx-1" />
            <button
              onClick={() => setRightPanel("code")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightPanel === "code" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              Code
            </button>
            <button
              onClick={() => setRightPanel("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightPanel === "preview" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              onClick={() => setRightPanel("schema")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightPanel === "schema" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Data
            </button>
            <div className="w-px h-5 bg-border mx-2" />
            <PublishExportButtons />
            <div className="w-px h-5 bg-border mx-2" />
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{user?.email}</span>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors p-1.5" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main area */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <ChatPanel initialPrompt={initialPrompt} />
            </ResizablePanel>

            <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />

            <ResizablePanel defaultSize={65}>
              {rightPanel === "code" ? (
                <CodeEditor selectedFile={selectedFile} />
              ) : rightPanel === "schema" ? (
                <SchemaBuilder />
              ) : (
                <PreviewPanel />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </PreviewProvider>
  );
};

const Index = () => (
  <ProjectProvider>
    <IDELayout />
  </ProjectProvider>
);

export default Index;
