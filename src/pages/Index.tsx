import { useState, useCallback, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Cloud, Palette } from "lucide-react";
import { forwardRef } from "react";
import { usePanelLocking } from "@/hooks/usePanelLocking";
import PanelLockOverlay from "@/components/PanelLockOverlay";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PreviewProvider } from "@/contexts/PreviewContext";
import { VirtualFSProvider } from "@/contexts/VirtualFSContext";
import { ProjectProvider, useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimePresence } from "@/hooks/useRealtimePresence";
import ChatPanel from "@/components/ChatPanel";
import CodeEditor from "@/components/CodeEditor";
import CloudPanel from "@/components/CloudPanel";
import BrandKitGenerator from "@/components/BrandKitGenerator";
import PreviewPanel from "@/components/PreviewPanel";
import LandingPage from "@/components/LandingPage";
import CommandPalette from "@/components/CommandPalette";
import VersionHistory, { Version } from "@/components/VersionHistory";
import TeamChat from "@/components/TeamChat";
import IDEHeader, { PanelId } from "@/components/IDEHeader";
import UserMenuDialogs, { DialogType } from "@/components/UserMenuDialogs";
import RenameDialog from "@/components/RenameDialog";
import ProjectSettingsPage from "@/components/ProjectSettingsPage";
import { TechStackId } from "@/lib/techStacks";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";

const PRIMARY_TABS: { id: PanelId; label: string; icon: any; iconOnly?: boolean }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Code", icon: Code, iconOnly: true },
  { id: "cloud", label: "Cloud", icon: Cloud, iconOnly: true },
  { id: "marketing", label: "Brand", icon: Palette, iconOnly: true },
];

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
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const publishRef = useRef<{ openPublish: () => void; handleExport: () => void } | null>(null);
  const chatRef = useRef<{ clearChat: () => void; sendMessage: (text: string) => void } | null>(null);
  const { toast } = useToast();
  const { onlineUsers, setTyping, myColor } = useRealtimePresence(rightPanel);
  const { isLocked, getLockOwner } = usePanelLocking(onlineUsers);

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
    setShowProjectSettings(false);
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

  // Full-screen Project Settings page
  if (showProjectSettings) {
    return (
      <TooltipProvider delayDuration={300}>
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          initialName={getNameParts().text}
          initialEmoji={getNameParts().emoji}
          onRename={handleRename}
          validateName={validateName}
        />
        <ProjectSettingsPage
          onBack={() => setShowProjectSettings(false)}
          onRenameClick={() => setRenameOpen(true)}
          onExport={() => publishRef.current?.handleExport()}
          versions={versions}
          onRevert={handleRevert}
          onSendMessage={(prompt) => {
            setShowProjectSettings(false);
            chatRef.current?.sendMessage(prompt);
          }}
        />
      </TooltipProvider>
    );
  }

  const renderPanel = () => {
    const panel = (() => {
      if (rightPanel === "preview") return <PreviewPanel />;
      if (rightPanel === "code") return <CodeEditor />;
      if (rightPanel === "cloud") return <CloudPanel />;
      if (rightPanel === "marketing") return <BrandKitGenerator />;
      return <PreviewPanel />;
    })();

    const lockOwner = getLockOwner(rightPanel);

    return (
      <ErrorBoundary fallbackTitle={rightPanel.charAt(0).toUpperCase() + rightPanel.slice(1)}>
        <div className="relative h-full w-full">
          {panel}
          {lockOwner && <PanelLockOverlay lock={lockOwner} />}
        </div>
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
          onSwitchPanel={(p) => setRightPanel(p as PanelId)}
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
          onProjectSettingsClick={() => setShowProjectSettings(true)}
          publishRef={publishRef}
          primaryTabs={PRIMARY_TABS}
          onlineUsers={onlineUsers}
          userEmail={user?.email || ""}
          myColor={myColor}
          layoutSwapped={layoutSwapped}
          onSwapLayout={() => setLayoutSwapped(prev => !prev)}
          isLocked={isLocked}
          getLockOwner={getLockOwner}
          versions={versions}
          onRevert={handleRevert}
        />

        <div className="flex-1 overflow-hidden group/resize">
          <style>{`.group\\/resize:has([data-resize-handle-active]) iframe { pointer-events: none !important; }`}</style>
          <ResizablePanelGroup direction="horizontal">
            {layoutSwapped ? (
              <>
                <ResizablePanel defaultSize={50} minSize={10} className="!overflow-hidden">
                  <div className="h-full w-full overflow-hidden">
                    {renderPanel()}
                  </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={50} minSize={10}>
                  <ErrorBoundary fallbackTitle="Chat">
                    <ChatPanel ref={chatRef} initialPrompt={initialPrompt} onVersionCreated={handleVersionCreated} />
                  </ErrorBoundary>
                </ResizablePanel>
              </>
            ) : (
              <>
                <ResizablePanel defaultSize={50} minSize={10}>
                  <ErrorBoundary fallbackTitle="Chat">
                    <ChatPanel ref={chatRef} initialPrompt={initialPrompt} onVersionCreated={handleVersionCreated} />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={50} minSize={10} className="!overflow-hidden">
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
