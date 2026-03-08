import { useState, useCallback, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Zap, LogOut, ArrowLeft, Cloud, ChevronDown, Clock, Command as CommandIcon, Brain, Activity, Users, Palette, MessageCircle } from "lucide-react";
import { PreviewProvider } from "@/contexts/PreviewContext";
import { VirtualFSProvider } from "@/contexts/VirtualFSContext";
import { ProjectProvider, useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimePresence } from "@/hooks/useRealtimePresence";
import ChatPanel from "@/components/ChatPanel";
import CodeEditor from "@/components/CodeEditor";
import CloudPanel from "@/components/CloudPanel";
import PreviewPanel from "@/components/PreviewPanel";
import ProjectBrain from "@/components/ProjectBrain";
import PulseAnalytics from "@/components/PulseAnalytics";
import CrewSpaces from "@/components/CrewSpaces";
import BrandKitGenerator from "@/components/BrandKitGenerator";
import PublishExportButtons from "@/components/PublishExportButtons";
import LandingPage from "@/components/LandingPage";
import CommandPalette from "@/components/CommandPalette";
import VersionHistory, { Version } from "@/components/VersionHistory";
import PresenceAvatars from "@/components/PresenceAvatars";
import TeamChat from "@/components/TeamChat";
import { TechStackId, TECH_STACKS } from "@/lib/techStacks";
import { usePreview } from "@/contexts/PreviewContext";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence } from "framer-motion";
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
  const { projects, currentProject, selectProject, createProject, saveProject } = useProjects();
  const [rightPanel, setRightPanel] = useState<"code" | "preview" | "cloud" | "history" | "brain" | "pulse" | "crew" | "brandkit">("preview");
  const [inIDE, setInIDE] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [renameEmoji, setRenameEmoji] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const publishRef = useRef<{ openPublish: () => void; handleExport: () => void } | null>(null);
  const chatRef = useRef<{ clearChat: () => void } | null>(null);
  const { toast } = useToast();
  const { onlineUsers, setTyping, myColor } = useRealtimePresence(rightPanel);

  const handleStartProject = useCallback(async (prompt: string, techStack: TechStackId) => {
    setInitialPrompt(prompt);
    setVersions([]);
    const project = await createProject("Untitled Project", techStack);
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

  const PROJECT_NAME_MAX = 50;
  const PROJECT_NAME_REGEX = /^[\p{Emoji}\w\s\-().!&]+$/u;

  const validateName = (name: string): string => {
    if (!name.trim()) return "Name cannot be empty";
    if (name.length > PROJECT_NAME_MAX) return `Max ${PROJECT_NAME_MAX} characters`;
    // Check uniqueness
    const isDuplicate = projects.some(
      p => p.id !== currentProject?.id && p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (isDuplicate) return "A project with this name already exists";
    return "";
  };

  const handleRename = async () => {
    const fullName = renameEmoji ? `${renameEmoji} ${renameValue.trim()}` : renameValue.trim();
    const error = validateName(fullName);
    if (error) {
      setRenameError(error);
      return;
    }
    await saveProject({ name: fullName });
    setRenameOpen(false);
    setRenameError("");
    toast({ title: "Renamed", description: `Project renamed to "${fullName}"` });
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

  // Primary tabs (always show label) + secondary tabs (icon-only with tooltips)
  const primaryTabs: { id: typeof rightPanel; label: string; icon: typeof Eye }[] = [
    { id: "preview", label: "Preview", icon: Eye },
    { id: "code", label: "Code", icon: Code },
    { id: "cloud", label: "Cloud", icon: Cloud },
  ];
  const secondaryTabs: { id: typeof rightPanel; label: string; icon: typeof Eye }[] = [
    { id: "brain", label: "Brain", icon: Brain },
    { id: "pulse", label: "Pulse", icon: Activity },
    { id: "crew", label: "Crew", icon: Users },
    { id: "brandkit", label: "Brand Kit", icon: Palette },
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
            // Parse existing emoji prefix
            const name = currentProject?.name || "";
            const emojiMatch = name.match(/^(\p{Emoji})\s*/u);
            setRenameEmoji(emojiMatch ? emojiMatch[1] : "");
            setRenameValue(emojiMatch ? name.slice(emojiMatch[0].length) : name);
            setRenameError("");
            setRenameOpen(true);
          }}
          onGoBack={() => setInIDE(false)}
          onSignOut={signOut}
          onExport={() => publishRef.current?.handleExport()}
          onPublish={() => publishRef.current?.openPublish()}
          projectName={currentProject?.name}
        />

        {/* Rename Dialog */}
        <Dialog open={renameOpen} onOpenChange={(o) => { setRenameOpen(o); if (!o) setRenameError(""); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="flex gap-2">
                {/* Emoji picker button */}
                <div className="relative">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-10 h-10 rounded-lg bg-secondary border border-border hover:border-primary/30 flex items-center justify-center text-lg transition-colors shrink-0"
                    title="Pick emoji"
                  >
                    {renameEmoji || "🚀"}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-12 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 w-[200px]">
                      {["🚀", "📱", "🎨", "💡", "🔧", "📊", "🛒", "💬", "🎮", "📝", "🏠", "💰", "🎵", "📸", "🍳", "✅", "🌐", "⚡", "🔒", "📈", "🎯", "❤️", "🤖", "🗂️"].map(e => (
                        <button
                          key={e}
                          onClick={() => { setRenameEmoji(e); setShowEmojiPicker(false); }}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary transition-colors text-base"
                        >
                          {e}
                        </button>
                      ))}
                      <button
                        onClick={() => { setRenameEmoji(""); setShowEmojiPicker(false); }}
                        className="col-span-6 text-[10px] text-muted-foreground hover:text-foreground py-1 mt-1 border-t border-border"
                      >
                        Remove emoji
                      </button>
                    </div>
                  )}
                </div>
                <input
                  value={renameValue}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameError(validateName(e.target.value));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleRename()}
                  placeholder="Project name"
                  maxLength={PROJECT_NAME_MAX}
                  className={`flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border transition-colors ${
                    renameError ? "border-destructive" : "border-border focus:border-primary"
                  }`}
                  autoFocus
                />
              </div>
              {renameError && (
                <p className="text-xs text-destructive">{renameError}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {renameValue.length}/{PROJECT_NAME_MAX}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRenameOpen(false)}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRename}
                    disabled={!renameValue.trim() || !!renameError}
                    className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    Rename
                  </button>
                </div>
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
              <DropdownMenuContent align="start" className="min-w-[200px]">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Frontend</div>
                {TECH_STACKS.filter(s => s.category === "frontend").map((stack) => {
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
                <div className="my-1 border-t border-border" />
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Full-Stack</div>
                {TECH_STACKS.filter(s => s.category === "fullstack").map((stack) => {
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

          {/* Center: Panel tabs — primary with labels, secondary icon-only */}
          <div className="flex items-center gap-1 mx-auto">
            <div className="flex items-center gap-0.5 bg-secondary/50 rounded-lg p-0.5">
              {primaryTabs.map((tab) => {
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
            <div className="w-px h-4 bg-border mx-0.5" />
            <div className="flex items-center gap-0.5 bg-secondary/50 rounded-lg p-0.5">
              {secondaryTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = rightPanel === tab.id;
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setRightPanel(tab.id)}
                        className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
                          isActive
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.id === "history" && versions.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 text-[8px] bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">{versions.length}</span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{tab.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* Right: Presence + Cmd+K + Publish + User */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Real-time presence */}
            <PresenceAvatars
              onlineUsers={onlineUsers}
              currentUserEmail={user?.email || ""}
              myColor={myColor}
              onToggleChat={() => setTeamChatOpen(!teamChatOpen)}
            />
            <div className="w-px h-4 bg-border mx-0.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTeamChatOpen(!teamChatOpen)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Team Chat</TooltipContent>
            </Tooltip>
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
                <CodeEditor />
              ) : rightPanel === "cloud" ? (
                <CloudPanel />
              ) : rightPanel === "brain" ? (
                <ProjectBrain />
              ) : rightPanel === "pulse" ? (
                <PulseAnalytics />
              ) : rightPanel === "crew" ? (
                <CrewSpaces />
              ) : rightPanel === "brandkit" ? (
                <BrandKitGenerator />
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

          {/* Team Chat floating panel */}
          <AnimatePresence>
            {teamChatOpen && (
              <TeamChat
                onlineUsers={onlineUsers}
                isOpen={teamChatOpen}
                onClose={() => setTeamChatOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  );
};

const Index = () => (
  <ProjectProvider>
    <PreviewProvider>
      <VirtualFSProvider>
        <IDELayout />
      </VirtualFSProvider>
    </PreviewProvider>
  </ProjectProvider>
);

export default Index;
