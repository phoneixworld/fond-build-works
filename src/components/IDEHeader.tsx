import { Zap, LogOut, ArrowLeft, ChevronDown, Command as CommandIcon, MessageCircle, Settings, Pencil, ArrowLeftRight, Lock, User, CreditCard, HelpCircle, SlidersHorizontal } from "lucide-react";
import { forwardRef } from "react";
import { TECH_STACKS, TechStackId } from "@/lib/techStacks";
import PresenceAvatars from "@/components/PresenceAvatars";
import PublishExportButtons from "@/components/PublishExportButtons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LucideIcon } from "lucide-react";
import { RefObject } from "react";

export type PanelId = "code" | "preview" | "cloud";

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
  onProfileClick: () => void;
  onSettingsClick: () => void;
  onBillingClick: () => void;
  onHelpClick: () => void;
  onProjectSettingsClick: () => void;
  publishRef: RefObject<{ openPublish: () => void; handleExport: () => void } | null>;
  primaryTabs: TabDef[];
  onlineUsers: any[];
  userEmail: string;
  myColor: string;
  layoutSwapped?: boolean;
  onSwapLayout?: () => void;
  isLocked?: (panelId: PanelId) => boolean;
  getLockOwner?: (panelId: PanelId) => { email: string; color: string } | null;
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
  onProfileClick,
  onSettingsClick,
  onBillingClick,
  onHelpClick,
  onProjectSettingsClick,
  publishRef,
  primaryTabs,
  onlineUsers,
  userEmail,
  myColor,
  layoutSwapped = false,
  onSwapLayout,
  isLocked,
  getLockOwner,
}: IDEHeaderProps) => {
  const currentStack = (currentProject as any)?.tech_stack || "html-tailwind";
  const currentStackInfo = TECH_STACKS.find(s => s.id === currentStack);

  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();

  return (
    <header className="h-11 flex items-center px-3 border-b border-border shrink-0 z-10 relative bg-ide-panel-header">
      {/* Left: Back + Project dropdown */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Back to projects</TooltipContent>
        </Tooltip>

        {/* Project Name — click to rename */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onRenameClick}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/60 transition-colors min-w-0 group"
            >
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                <Zap className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                {currentProject?.name || "Project"}
              </span>
              <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Click to rename</TooltipContent>
        </Tooltip>
      </div>

      {/* Center: Primary tabs only — Preview / Code / Cloud */}
      <div className="flex items-center mx-auto">
        <div className="flex items-center gap-0.5 bg-secondary/40 rounded-lg p-0.5">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = rightPanel === tab.id;
            const locked = isLocked?.(tab.id);
            const lockOwner = getLockOwner?.(tab.id);
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setRightPanel(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[11px] font-medium transition-all relative ${
                      isActive
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                        : locked
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {locked && lockOwner && (
                      <span
                        className="w-2 h-2 rounded-full ring-1 ring-background absolute -top-0.5 -right-0.5"
                        style={{ backgroundColor: lockOwner.color }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                {locked && lockOwner && (
                  <TooltipContent side="bottom" className="text-xs">
                    <Lock className="w-3 h-3 inline mr-1" />
                    {lockOwner.email.split("@")[0]} is editing
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Right: Presence + Actions + User menu */}
      <div className="flex items-center gap-1 shrink-0">
        <PresenceAvatars onlineUsers={onlineUsers} currentUserEmail={userEmail} myColor={myColor} onToggleChat={onTeamChatToggle} />

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onTeamChatToggle} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Team Chat</TooltipContent>
        </Tooltip>

        {onSwapLayout && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onSwapLayout} className={`p-1.5 rounded-md transition-colors ${layoutSwapped ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {layoutSwapped ? "Chat on left" : "Chat on right"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Project Settings shortcut */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onProjectSettingsClick} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Project Settings</TooltipContent>
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

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* User Avatar Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-secondary transition-colors group">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-border/50"
                style={{ backgroundColor: myColor }}
              >
                {getInitials(userEmail)}
              </div>
              <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <div className="px-3 py-2">
              <p className="text-[11px] font-medium text-foreground truncate">{userEmail}</p>
              <p className="text-[10px] text-muted-foreground/60">Personal workspace</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onProfileClick} className="text-xs gap-2">
              <User className="w-3.5 h-3.5" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSettingsClick} className="text-xs gap-2">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBillingClick} className="text-xs gap-2">
              <CreditCard className="w-3.5 h-3.5" />
              Billing & Usage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onHelpClick} className="text-xs gap-2">
              <HelpCircle className="w-3.5 h-3.5" />
              Help & Support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="text-xs gap-2 text-destructive focus:text-destructive">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default IDEHeader;
