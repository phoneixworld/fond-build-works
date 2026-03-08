import { useState, useCallback, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Zap, LogOut, ArrowLeft, Cloud, ChevronDown, Clock, Command as CommandIcon } from "lucide-react";
import { PreviewProvider } from "@/contexts/PreviewContext";
import { ProjectProvider, useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import ChatPanel from "@/components/ChatPanel";
import CodeEditor from "@/components/CodeEditor";
import CloudPanel from "@/components/CloudPanel";
import PreviewPanel from "@/components/PreviewPanel";
import PublishExportButtons from "@/components/PublishExportButtons";
import LandingPage from "@/components/LandingPage";
import CommandPalette from "@/components/CommandPalette";
import VersionHistory, { Version } from "@/components/VersionHistory";
import { TechStackId, TECH_STACKS } from "@/lib/techStacks";
import { usePreview } from "@/contexts/PreviewContext";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

const IDELayout = () => {
  const { user, signOut } = useAuth();
  const { currentProject, selectProject, createProject, saveProject } = useProjects();
  const [selectedFile, setSelectedFile] = useState("App.tsx");
  const [rightPanel, setRightPanel] = useState<"code" | "preview" | "cloud" | "history">("preview");
  const [inIDE, setInIDE] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const publishRef = useRef<{ openPublish: () => void; handleExport: () => void } | null>(null);
  const chatRef = useRef<{ clearChat: () => void } | null>(null);
  const { toast } = useToast();

  const handleStartProject = useCallback(async (prompt: string, techStack: TechStackId) => {
    setInitialPrompt(prompt);
    setVersions([]);
    const project = await createProject(prompt.slice(0, 40), techStack);
    if (project) setInIDE(true);
  }, [createProject]);

  const handleOpenProject = useCallback((id: string) => {
    selectProject(id);
    setInitialPrompt("");
    setVersions([]);
    setInIDE(true);
  }, [selectProject]);

  const handleTechStackChange = async (id: TechStackId) => {
    if (currentProject) {
      await saveProject({ tech_stack: id });
    }
  };

  const handleRename = async () => {
    if (!renameValue.trim() || !currentProject) return;
    await saveProject({ name: renameValue.trim() });
    setRenameOpen(false);
    toast({ title: "Renamed", description: `Project renamed to "${renameValue.trim()}"` });
  };

  // Called by ChatPanel when a new version is created
  const handleVersionCreated = useCallback((version: Version) => {
    setVersions(prev => [version, ...prev]);
  }, []);

  const handleRevert = useCallback((version: Version) => {
    if (!currentProject) return;
    saveProject({
      html_content: version.html,
    });
    setRightPanel("preview");
    toast({ title: "Reverted", description: `Restored to: ${version.label}` });
  }, [currentProject, saveProject, toast]);

  if (!inIDE) {
    return <LandingPage onStartProject={handleStartProject} onOpenProject={handleOpenProject} />;
  }

  const currentStack = (currentProject as any)?.tech_stack || "html-tailwind";
  const currentStackInfo = TECH_STACKS.find(s => s.id === currentStack);
  const StackIcon = currentStackInfo?.icon;

  const panelTabs: { id: "preview" | "code" | "cloud" | "history"; label: string; icon: typeof Eye }[] = [
    { id: "preview", label: "Preview", icon: Eye },
    { id: "code", label: "Code", icon: Code },
    { id: "cloud", label: "Cloud", icon: Cloud },
    { id: "history", label: "History", icon: Clock },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        {/* Command Palette */}
        <CommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          onSwitchPanel={(p) => setRightPanel(p)}
          onClearChat={() => chatRef.current?.clearChat()}
          onRenameProject={() => {
            setRenameValue(currentProject?.name || "");
            setRenameOpen(true);
          }}
          onGoBack={() => setInIDE(false)}
          onSignOut={signOut}
          onExport={() => publishRef.current?.handleExport()}
          onPublish={() => publishRef.current?.openPublish()}
          projectName={currentProject?.name}
        />

        {/* Rename Dialog */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                placeholder="Project name"
                className="w-full bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRenameOpen(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRename}
                  disabled={!renameValue.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Rename
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Top bar */}
        <header className="h-11 flex items-center px-3 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0 z-10 relative gap-1">
          {/* Left: Back + Logo + Project */}
          <div className="flex items-center gap-2 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setInIDE(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Back to projects</TooltipContent>
            </Tooltip>
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            {currentProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setRenameValue(currentProject.name);
                      setRenameOpen(true);
                    }}
                    className="text-xs font-medium text-foreground truncate max-w-[140px] hover:text-primary transition-colors"
                  >
                    {currentProject.name}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Click to rename</TooltipContent>
              </Tooltip>
            )}
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
                  {tab.id === "history" && versions.length > 0 && (
                    <span className="text-[9px] bg-primary/20 text-primary rounded-full px-1.5">{versions.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: Cmd+K hint + Publish + User */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCmdOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <CommandIcon className="w-3 h-3" />
                  <kbd className="font-mono">K</kbd>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Command palette (⌘K)</TooltipContent>
            </Tooltip>
            <PublishExportButtons ref={publishRef} />
            <div className="w-px h-4 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-secondary"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Sign out ({user?.email})</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main area */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <ChatPanel
                ref={chatRef}
                initialPrompt={initialPrompt}
                onVersionCreated={handleVersionCreated}
              />
            </ResizablePanel>

            <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />

            <ResizablePanel defaultSize={65}>
              {rightPanel === "code" ? (
                <CodeEditor selectedFile={selectedFile} />
              ) : rightPanel === "cloud" ? (
                <CloudPanel />
              ) : rightPanel === "history" ? (
                <VersionHistory
                  versions={versions}
                  onRevert={handleRevert}
                  onClose={() => setRightPanel("preview")}
                />
              ) : (
                <PreviewPanel />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </TooltipProvider>
  );
};

const Index = () => (
  <ProjectProvider>
    <PreviewProvider>
      <IDELayout />
    </PreviewProvider>
  </ProjectProvider>
);

export default Index;
