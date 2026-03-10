import { Zap, LogOut, ArrowLeft, ChevronDown, Command as CommandIcon, MessageCircle, Settings, Pencil, GitBranch, Globe, Tag, Clock, Brain, Activity, Users, Palette, FlaskConical, Puzzle, User, CreditCard, HelpCircle, ArrowLeftRight, Lock } from "lucide-react";
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

export type PanelId = "code" | "preview" | "cloud" | "history" | "brain" | "pulse" | "crew" | "brandkit" | "abtesting" | "plugins" | "whitelabel" | "github" | "domains" | "planning" | "quality" | "search" | "ir" | "settings";

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
  publishRef: RefObject<{ openPublish: () => void; handleExport: () => void } | null>;
  primaryTabs: TabDef[];
  secondaryTabs: TabDef[];
  versionsCount: number;
  onlineUsers: any[];
  userEmail: string;
  myColor: string;
  layoutSwapped?: boolean;
  onSwapLayout?: () => void;
  isLocked?: (panelId: PanelId) => boolean;
  getLockOwner?: (panelId: PanelId) => { email: string; color: string } | null;
}

// GitHub SVG icon as a component compatible with LucideIcon interface
const GitHubIcon = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg ref={ref} className={className} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
);
GitHubIcon.displayName = "GitHubIcon";

// Tools that go under project menu
const PROJECT_MENU_ITEMS: { id: PanelId; label: string; icon: LucideIcon }[] = [
  { id: "brain", label: "Project Brain", icon: Brain },
  { id: "pulse", label: "Analytics", icon: Activity },
  { id: "brandkit", label: "Brand Kit", icon: Palette },
  { id: "abtesting", label: "A/B Tests", icon: FlaskConical },
  { id: "plugins", label: "Plugins", icon: Puzzle },
  { id: "history", label: "Version History", icon: Clock },
];

// Tools that go under settings/integrations
const INTEGRATION_ITEMS: { id: PanelId; label: string; icon: any }[] = [
  { id: "github", label: "GitHub", icon: GitHubIcon },
  { id: "domains", label: "Custom Domains", icon: Globe },
  { id: "whitelabel", label: "White-label", icon: Tag },
  { id: "crew", label: "Team & Crew", icon: Users },
];

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
  publishRef,
  primaryTabs,
  secondaryTabs,
  versionsCount,
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

        {/* Project Name Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/60 transition-colors min-w-0 group">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                <Zap className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                {currentProject?.name || "Phoneix.World"}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px]">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Project</DropdownMenuLabel>
            
            <DropdownMenuItem onClick={onRenameClick} className="text-xs gap-2">
              <Pencil className="w-3.5 h-3.5" />
              Rename project
            </DropdownMenuItem>

            {/* Tech Stack sub-menu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs gap-2">
                {currentStackInfo?.icon && <currentStackInfo.icon className="w-3.5 h-3.5" />}
                Stack: {currentStackInfo?.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[200px]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Frontend</DropdownMenuLabel>
                {TECH_STACKS.filter(s => s.category === "frontend").map((stack) => {
                  const Icon = stack.icon;
                  return (
                    <DropdownMenuItem key={stack.id} onClick={() => onTechStackChange(stack.id)} className={`text-xs gap-2 ${currentStack === stack.id ? "text-primary font-medium" : ""}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {stack.label}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Full-Stack</DropdownMenuLabel>
                {TECH_STACKS.filter(s => s.category === "fullstack").map((stack) => {
                  const Icon = stack.icon;
                  return (
                    <DropdownMenuItem key={stack.id} onClick={() => onTechStackChange(stack.id)} className={`text-xs gap-2 ${currentStack === stack.id ? "text-primary font-medium" : ""}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {stack.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Tools</DropdownMenuLabel>

            {PROJECT_MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => setRightPanel(item.id)}
                  className={`text-xs gap-2 ${rightPanel === item.id ? "text-primary font-medium" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                  {item.id === "history" && versionsCount > 0 && (
                    <span className="ml-auto text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">{versionsCount}</span>
                  )}
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Integrations</DropdownMenuLabel>

            {INTEGRATION_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => setRightPanel(item.id)}
                  className={`text-xs gap-2 ${rightPanel === item.id ? "text-primary font-medium" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Primary tabs only — clean pill group */}
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
        {/* Online presence */}
        <PresenceAvatars onlineUsers={onlineUsers} currentUserEmail={userEmail} myColor={myColor} onToggleChat={onTeamChatToggle} />

        {/* Team chat */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onTeamChatToggle} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Team Chat</TooltipContent>
        </Tooltip>

        {/* Swap Layout */}
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

        {/* Cmd K */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onCmdOpen} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <CommandIcon className="w-3 h-3" />
              <kbd className="font-mono">K</kbd>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Command palette (⌘K)</TooltipContent>
        </Tooltip>

        {/* Publish */}
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
