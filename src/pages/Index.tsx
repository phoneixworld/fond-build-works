import { useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Zap, LogOut, ArrowLeft, Cloud, ChevronDown } from "lucide-react";
import { PreviewProvider } from "@/contexts/PreviewContext";
import { ProjectProvider, useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import ChatPanel from "@/components/ChatPanel";
import CodeEditor from "@/components/CodeEditor";
import CloudPanel from "@/components/CloudPanel";
import PreviewPanel from "@/components/PreviewPanel";
import PreviewPanel from "@/components/PreviewPanel";
import PublishExportButtons from "@/components/PublishExportButtons";
import LandingPage from "@/components/LandingPage";
import { TechStackId, TECH_STACKS } from "@/lib/techStacks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const currentStackInfo = TECH_STACKS.find(s => s.id === currentStack);
  const StackIcon = currentStackInfo?.icon;

  const panelTabs: { id: "preview" | "code" | "schema"; label: string; icon: typeof Eye }[] = [
    { id: "preview", label: "Preview", icon: Eye },
    { id: "code", label: "Code", icon: Code },
    { id: "schema", label: "Data", icon: Database },
  ];

  return (
    <PreviewProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-11 flex items-center px-3 border-b border-border bg-ide-panel-header shrink-0 z-10 relative gap-1">
          {/* Left: Back + Logo + Project */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setInIDE(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary shrink-0"
              title="Back to projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            {currentProject && (
              <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
                {currentProject.name}
              </span>
            )}
            {/* Tech stack dropdown — subtle, tucked next to project name */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
                  {StackIcon && <StackIcon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{currentStackInfo?.label}</span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {TECH_STACKS.map((stack) => {
                  const Icon = stack.icon;
                  return (
                    <DropdownMenuItem
                      key={stack.id}
                      onClick={() => handleTechStackChange(stack.id)}
                      className={`flex items-center gap-2 text-xs ${
                        currentStack === stack.id ? "text-primary font-medium" : ""
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <div>
                        <span>{stack.label}</span>
                        <span className="text-muted-foreground ml-1.5">{stack.description}</span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Center: Panel tabs */}
          <div className="flex items-center gap-0.5 mx-auto bg-secondary/50 rounded-lg p-0.5">
            {panelTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = rightPanel === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightPanel(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right: Publish + User */}
          <div className="flex items-center gap-1.5 shrink-0">
            <PublishExportButtons />
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-secondary"
              title={`Sign out (${user?.email})`}
            >
              <LogOut className="w-3.5 h-3.5" />
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
