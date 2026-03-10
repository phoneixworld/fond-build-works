import { useState, useCallback, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Cloud, Clock, Brain, Activity, Users, Palette, FlaskConical, Puzzle, Tag, GitBranch, Globe, ListChecks, Shield, Search, Layers } from "lucide-react";
import { forwardRef, lazy, Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
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
import ABTesting from "@/components/ABTesting";
import PluginMarketplace from "@/components/PluginMarketplace";
import WhiteLabelPanel from "@/components/WhiteLabelPanel";
import GitHubPanel from "@/components/GitHubPanel";
import CustomDomainPanel from "@/components/CustomDomainPanel";
import PlanningPanel from "@/components/PlanningPanel";
import CodeQualityPanel from "@/components/CodeQualityPanel";
import SemanticSearchPanel from "@/components/SemanticSearchPanel";
import IREditor from "@/components/IREditor";
import LandingPage from "@/components/LandingPage";
import CommandPalette from "@/components/CommandPalette";
import VersionHistory, { Version } from "@/components/VersionHistory";
import TeamChat from "@/components/TeamChat";
import IDEHeader, { PanelId } from "@/components/IDEHeader";
import UserMenuDialogs, { DialogType } from "@/components/UserMenuDialogs";
import RenameDialog from "@/components/RenameDialog";
import { TechStackId } from "@/lib/techStacks";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";

// GitHub SVG icon component
const GitHubTabIcon = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg ref={ref} className={className} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
);
GitHubTabIcon.displayName = "GitHubTabIcon";

const PRIMARY_TABS = [
  { id: "preview" as PanelId, label: "Preview", icon: Eye },
  { id: "code" as PanelId, label: "Code", icon: Code },
  { id: "cloud" as PanelId, label: "Cloud", icon: Cloud },
  { id: "github" as PanelId, label: "GitHub", icon: GitHubTabIcon as any },
];

const SECONDARY_TABS = [
  { id: "ir" as PanelId, label: "Intent", icon: Layers },
  { id: "planning" as PanelId, label: "Planner", icon: ListChecks },
  { id: "quality" as PanelId, label: "Quality", icon: Shield },
  { id: "search" as PanelId, label: "Search", icon: Search },
  { id: "brain" as PanelId, label: "Brain", icon: Brain },
  { id: "pulse" as PanelId, label: "Pulse", icon: Activity },
  { id: "crew" as PanelId, label: "Crew", icon: Users },
  { id: "brandkit" as PanelId, label: "Brand Kit", icon: Palette },
  { id: "abtesting" as PanelId, label: "A/B Tests", icon: FlaskConical },
  { id: "plugins" as PanelId, label: "Plugins", icon: Puzzle },
  { id: "whitelabel" as PanelId, label: "White-label", icon: Tag },
  { id: "domains" as PanelId, label: "Domains", icon: Globe },
  { id: "history" as PanelId, label: "History", icon: Clock },
];

const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  code: CodeEditor,
  cloud: CloudPanel,
  ir: IREditor,
  quality: CodeQualityPanel,
  search: SemanticSearchPanel,
  brain: ProjectBrain,
  pulse: PulseAnalytics,
  crew: CrewSpaces,
  brandkit: BrandKitGenerator,
  abtesting: ABTesting,
  plugins: PluginMarketplace,
  whitelabel: WhiteLabelPanel,
  github: GitHubPanel,
  domains: CustomDomainPanel,
};

const IDELayout = () => {
  const { user, signOut } = useAuth();
  const { projects, currentProject, selectProject, createProject, saveProject, clearCurrentProject } = useProjects();
  const [rightPanel, setRightPanel] = useState<PanelId>("preview");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const [layoutSwapped, setLayoutSwapped] = useState(false);
  const [userDialog, setUserDialog] = useState<DialogType>(null);
  const publishRef = useRef<{ openPublish: () => void; handleExport: () => void } | null>(null);
  const chatRef = useRef<{ clearChat: () => void; sendMessage: (text: string) => void } | null>(null);
  const { toast } = useToast();
  const { onlineUsers, setTyping, myColor } = useRealtimePresence(rightPanel);

  // Derive IDE mode from whether a project is selected
  const inIDE = !!currentProject;

  const handleStartProject = useCallback(async (prompt: string, techStack: TechStackId) => {
    setInitialPrompt(prompt);
    setVersions([]);
    
    let projectName = "Untitled Project";
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-name`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ prompt }),
      });
      if (resp.ok) {
        const { name, emoji } = await resp.json();
        projectName = emoji ? `${emoji} ${name}` : (name || projectName);
      }
    } catch {}
    
    await createProject(projectName, techStack);
  }, [createProject]);

  const handleOpenProject = useCallback((id: string) => {
    selectProject(id);
    setInitialPrompt("");
    setVersions([]);
  }, [selectProject]);

  const handleBack = useCallback(() => {
    clearCurrentProject();
  }, [clearCurrentProject]);

  const handleTechStackChange = async (id: TechStackId) => {
    if (currentProject) await saveProject({ tech_stack: id });
  };

  const validateName = (name: string): string => {
    if (!name.trim()) return "Name cannot be empty";
    if (name.length > 50) return "Max 50 characters";
    const isDuplicate = projects.some(
      p => p.id !== currentProject?.id && p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (isDuplicate) return "A project with this name already exists";
    return "";
  };

  const handleRename = async (fullName: string) => {
    await saveProject({ name: fullName });
    toast({ title: "Renamed", description: `Project renamed to "${fullName}"` });
  };

  const handleVersionCreated = useCallback((version: Version) => {
    setVersions(prev => [version, ...prev]);
  }, []);

  const handleRevert = useCallback((version: Version) => {
    if (!currentProject) return;
    saveProject({ html_content: version.html });
    setRightPanel("preview");
    toast({ title: "Reverted", description: `Restored to: ${version.label}` });
  }, [currentProject, saveProject, toast]);

  const getNameParts = () => {
    const name = currentProject?.name || "";
    const match = name.match(/^(\p{Emoji})\s*/u);
    return { emoji: match ? match[1] : "", text: match ? name.slice(match[0].length) : name };
  };

  if (!inIDE) {
    return <LandingPage onStartProject={handleStartProject} onOpenProject={handleOpenProject} />;
  }

  const renderPanel = () => {
    const panel = (() => {
      if (rightPanel === "preview") return <PreviewPanel />;
      if (rightPanel === "history") {
        return <VersionHistory versions={versions} onRevert={handleRevert} onClose={() => setRightPanel("preview")} />;
      }
      if (rightPanel === "planning") {
        return (
          <PlanningPanel
            onExecuteTask={(prompt) => {
              chatRef.current?.sendMessage(prompt);
              setRightPanel("preview");
            }}
          />
        );
      }
      const Component = PANEL_COMPONENTS[rightPanel];
      return Component ? <Component /> : <PreviewPanel />;
    })();

    return (
      <ErrorBoundary fallbackTitle={rightPanel.charAt(0).toUpperCase() + rightPanel.slice(1)}>
        {panel}
      </ErrorBoundary>
    );
  };

  const nameParts = getNameParts();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <CommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          onSwitchPanel={(p) => setRightPanel(p)}
          onClearChat={() => chatRef.current?.clearChat()}
          onRenameProject={() => setRenameOpen(true)}
          onGoBack={handleBack}
          onSignOut={signOut}
          onExport={() => publishRef.current?.handleExport()}
          onPublish={() => publishRef.current?.openPublish()}
          projectName={currentProject?.name}
        />

        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          initialName={nameParts.text}
          initialEmoji={nameParts.emoji}
          onRename={handleRename}
          validateName={validateName}
        />

        <UserMenuDialogs open={userDialog} onOpenChange={setUserDialog} />

        <IDEHeader
          currentProject={currentProject}
          rightPanel={rightPanel}
          setRightPanel={setRightPanel}
          onBack={handleBack}
          onRenameClick={() => setRenameOpen(true)}
          onTechStackChange={handleTechStackChange}
          onCmdOpen={() => setCmdOpen(true)}
          onTeamChatToggle={() => setTeamChatOpen(!teamChatOpen)}
          onSignOut={signOut}
          onProfileClick={() => setUserDialog("profile")}
          onSettingsClick={() => setUserDialog("settings")}
          onBillingClick={() => setUserDialog("billing")}
          onHelpClick={() => setUserDialog("help")}
          publishRef={publishRef}
          primaryTabs={PRIMARY_TABS}
          secondaryTabs={SECONDARY_TABS}
          versionsCount={versions.length}
          onlineUsers={onlineUsers}
          userEmail={user?.email || ""}
          myColor={myColor}
          layoutSwapped={layoutSwapped}
          onSwapLayout={() => setLayoutSwapped(prev => !prev)}
        />

        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {layoutSwapped ? (
              <>
                <ResizablePanel defaultSize={50} className="!overflow-hidden">
                  <div className="h-full w-full overflow-hidden">
                    {renderPanel()}
                  </div>
                </ResizablePanel>
                <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />
                <ResizablePanel defaultSize={50} minSize={30} maxSize={65}>
                  <ErrorBoundary fallbackTitle="Chat">
                    <ChatPanel ref={chatRef} initialPrompt={initialPrompt} onVersionCreated={handleVersionCreated} />
                  </ErrorBoundary>
                </ResizablePanel>
              </>
            ) : (
              <>
                <ResizablePanel defaultSize={50} minSize={30} maxSize={65}>
                  <ChatPanel ref={chatRef} initialPrompt={initialPrompt} onVersionCreated={handleVersionCreated} />
                </ResizablePanel>
                <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />
                <ResizablePanel defaultSize={50} className="!overflow-hidden">
                  <div className="h-full w-full overflow-hidden">
                    {renderPanel()}
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>

          <AnimatePresence>
            {teamChatOpen && (
              <TeamChat onlineUsers={onlineUsers} isOpen={teamChatOpen} onClose={() => setTeamChatOpen(false)} />
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
