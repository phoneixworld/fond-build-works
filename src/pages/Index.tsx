import { useState, useCallback, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Cloud, Clock, Brain, Activity, Users, Palette, FlaskConical, Puzzle, Tag, GitBranch, Globe } from "lucide-react";
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
import LandingPage from "@/components/LandingPage";
import CommandPalette from "@/components/CommandPalette";
import VersionHistory, { Version } from "@/components/VersionHistory";
import TeamChat from "@/components/TeamChat";
import IDEHeader, { PanelId } from "@/components/IDEHeader";
import RenameDialog from "@/components/RenameDialog";
import { TechStackId } from "@/lib/techStacks";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";

const PRIMARY_TABS = [
  { id: "preview" as PanelId, label: "Preview", icon: Eye },
  { id: "code" as PanelId, label: "Code", icon: Code },
  { id: "cloud" as PanelId, label: "Cloud", icon: Cloud },
];

const SECONDARY_TABS = [
  { id: "brain" as PanelId, label: "Brain", icon: Brain },
  { id: "pulse" as PanelId, label: "Pulse", icon: Activity },
  { id: "crew" as PanelId, label: "Crew", icon: Users },
  { id: "brandkit" as PanelId, label: "Brand Kit", icon: Palette },
  { id: "abtesting" as PanelId, label: "A/B Tests", icon: FlaskConical },
  { id: "plugins" as PanelId, label: "Plugins", icon: Puzzle },
  { id: "whitelabel" as PanelId, label: "White-label", icon: Tag },
  { id: "github" as PanelId, label: "GitHub", icon: GitBranch },
  { id: "domains" as PanelId, label: "Domains", icon: Globe },
  { id: "history" as PanelId, label: "History", icon: Clock },
];

const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  code: CodeEditor,
  cloud: CloudPanel,
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
  const publishRef = useRef<{ openPublish: () => void; handleExport: () => void } | null>(null);
  const chatRef = useRef<{ clearChat: () => void } | null>(null);
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
    if (rightPanel === "preview") return <PreviewPanel />;
    if (rightPanel === "history") {
      return <VersionHistory versions={versions} onRevert={handleRevert} onClose={() => setRightPanel("preview")} />;
    }
    const Component = PANEL_COMPONENTS[rightPanel];
    return Component ? <Component /> : <PreviewPanel />;
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

        <IDEHeader
          currentProject={currentProject}
          rightPanel={rightPanel}
          setRightPanel={setRightPanel}
          onBack={() => setInIDE(false)}
          onRenameClick={() => setRenameOpen(true)}
          onTechStackChange={handleTechStackChange}
          onCmdOpen={() => setCmdOpen(true)}
          onTeamChatToggle={() => setTeamChatOpen(!teamChatOpen)}
          onSignOut={signOut}
          publishRef={publishRef}
          primaryTabs={PRIMARY_TABS}
          secondaryTabs={SECONDARY_TABS}
          versionsCount={versions.length}
          onlineUsers={onlineUsers}
          userEmail={user?.email || ""}
          myColor={myColor}
        />

        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <ChatPanel ref={chatRef} initialPrompt={initialPrompt} onVersionCreated={handleVersionCreated} />
            </ResizablePanel>
            <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />
            <ResizablePanel defaultSize={65}>
              {renderPanel()}
            </ResizablePanel>
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
