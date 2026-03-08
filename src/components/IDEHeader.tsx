import { Zap, LogOut, ArrowLeft, ChevronDown, Command as CommandIcon, MessageCircle } from "lucide-react";
import { TECH_STACKS, TechStackId } from "@/lib/techStacks";
import PresenceAvatars from "@/components/PresenceAvatars";
import PublishExportButtons from "@/components/PublishExportButtons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LucideIcon } from "lucide-react";
import { RefObject } from "react";

export type PanelId = "code" | "preview" | "cloud" | "history" | "brain" | "pulse" | "crew" | "brandkit" | "abtesting" | "plugins" | "whitelabel" | "github" | "domains";

interface TabDef {
  id: PanelId;
  label: string;
  icon: LucideIcon;
}

interface IDEHeaderProps {
  currentProject: { name: string; tech_stack?: string } | null;
  rightPanel: PanelId;
  setRightPanel: (p: PanelId) => void;
  onBack: () => void;
  onRenameClick: () => void;
  onTechStackChange: (id: TechStackId) => void;
  onCmdOpen: () => void;
  onTeamChatToggle: () => void;
  onSignOut: () => void;
  publishRef: RefObject<{ openPublish: () => void; handleExport: () => void } | null>;
  primaryTabs: TabDef[];
  secondaryTabs: TabDef[];
  versionsCount: number;
  onlineUsers: any[];
  userEmail: string;
  myColor: string;
}

const IDEHeader = ({
  currentProject,
  rightPanel,
  setRightPanel,
  onBack,
  onRenameClick,
  onTechStackChange,
  onCmdOpen,
  onTeamChatToggle,
  onSignOut,
  publishRef,
  primaryTabs,
  secondaryTabs,
  versionsCount,
  onlineUsers,
  userEmail,
  myColor,
}: IDEHeaderProps) => {
  const currentStack = (currentProject as any)?.tech_stack || "html-tailwind";
  const currentStackInfo = TECH_STACKS.find(s => s.id === currentStack);
  const StackIcon = currentStackInfo?.icon;

  return (
    <header className="h-11 flex items-center px-3 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0 z-10 relative gap-1">
      {/* Left */}
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary shrink-0">
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
              <button onClick={onRenameClick} className="text-xs font-medium text-foreground truncate max-w-[140px] hover:text-primary transition-colors">
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
                <DropdownMenuItem key={stack.id} onClick={() => onTechStackChange(stack.id)} className={`flex items-center gap-2 text-xs ${currentStack === stack.id ? "text-primary font-medium" : ""}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <div><span>{stack.label}</span><span className="text-muted-foreground ml-1.5">{stack.description}</span></div>
                </DropdownMenuItem>
              );
            })}
            <div className="my-1 border-t border-border" />
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Full-Stack</div>
            {TECH_STACKS.filter(s => s.category === "fullstack").map((stack) => {
              const Icon = stack.icon;
              return (
                <DropdownMenuItem key={stack.id} onClick={() => onTechStackChange(stack.id)} className={`flex items-center gap-2 text-xs ${currentStack === stack.id ? "text-primary font-medium" : ""}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <div><span>{stack.label}</span><span className="text-muted-foreground ml-1.5">{stack.description}</span></div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center tabs */}
      <div className="flex items-center gap-1 mx-auto">
        <div className="flex items-center gap-0.5 bg-secondary/50 rounded-lg p-0.5">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = rightPanel === tab.id;
            return (
              <button key={tab.id} onClick={() => setRightPanel(tab.id)} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
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
                  <button onClick={() => setRightPanel(tab.id)} className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {tab.id === "history" && versionsCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 text-[8px] bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">{versionsCount}</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{tab.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 shrink-0">
        <PresenceAvatars onlineUsers={onlineUsers} currentUserEmail={userEmail} myColor={myColor} onToggleChat={onTeamChatToggle} />
        <div className="w-px h-4 bg-border mx-0.5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onTeamChatToggle} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative">
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Team Chat</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onCmdOpen} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
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
            <button onClick={onSignOut} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-secondary">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Sign out ({userEmail})</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};

export default IDEHeader;
