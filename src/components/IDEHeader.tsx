import { Zap, LogOut, ArrowLeft, ChevronDown, Settings, Pencil, ArrowLeftRight, Lock, User, CreditCard, HelpCircle, Monitor, Tablet, Smartphone, Globe, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Clock, RotateCcw } from "lucide-react";
import { Version } from "@/components/VersionHistory";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState, useCallback, useRef, useEffect } from "react";
import { TechStackId } from "@/lib/techStacks";
import PublishExportButtons from "@/components/PublishExportButtons";
import { usePreview } from "@/contexts/PreviewContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LucideIcon } from "lucide-react";
import { RefObject } from "react";

export type PanelId = "code" | "preview" | "cloud" | "marketing";

const VIEWPORTS = [
  { id: "desktop" as const, label: "Desktop", icon: Monitor },
  { id: "tablet" as const, label: "Tablet", icon: Tablet },
  { id: "mobile" as const, label: "Mobile", icon: Smartphone },
];

interface TabDef {
  id: PanelId;
  label: string;
  icon: LucideIcon;
  iconOnly?: boolean;
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
  versions?: Version[];
  onRevert?: (version: Version) => void;
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
  versions = [],
  onRevert,
  isLocked,
  getLockOwner,
}: IDEHeaderProps) => {
  const { viewport, setViewport, triggerRefresh, isBuilding, currentPath, setCurrentPath } = usePreview();

  const [urlInput, setUrlInput] = useState("/");
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleUrlSubmit = useCallback(() => {
    setIsEditingUrl(false);
    if (urlInput.startsWith("/")) {
      setCurrentPath(urlInput);
      const sandpackIframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;
      if (sandpackIframe?.contentWindow) {
        sandpackIframe.contentWindow.postMessage({ type: "navigate", path: urlInput }, "*");
      }
    }
  }, [urlInput, setCurrentPath]);

  useEffect(() => {
    if (!isEditingUrl) setUrlInput(currentPath);
  }, [currentPath, isEditingUrl]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "route-change" && typeof e.data.path === "string") {
        setCurrentPath(e.data.path);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setCurrentPath]);

  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();
  const isPreview = rightPanel === "preview";
  const ViewportIcon = VIEWPORTS.find(v => v.id === viewport)!.icon;

  return (
    <header className="h-11 flex items-center px-3 border-b border-border shrink-0 z-10 relative bg-ide-panel-header">
      {/* Left: Back + Project name + Tabs */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Back to projects</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onRenameClick} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/60 transition-colors min-w-0 group">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                <Zap className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                {currentProject?.name || "Project"}
              </span>
              <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Click to rename</TooltipContent>
        </Tooltip>

        {/* Version History */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Clock className="w-3.5 h-3.5" />
              {versions.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center">
                  {versions.length > 9 ? "9+" : versions.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-[320px] p-0 max-h-[400px] overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Version History</span>
                <span className="text-[10px] text-muted-foreground">({versions.length})</span>
              </div>
            </div>
            {versions.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No versions yet</p>
                <p className="text-[10px] mt-1 text-muted-foreground/60">Created after each AI build</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[340px] p-2 space-y-0.5">
                {versions.map((version, i) => (
                  <button
                    key={version.id}
                    onClick={() => onRevert?.(version)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-secondary/60 transition-colors group"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? "bg-primary" : "bg-border group-hover:bg-primary/50"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">{version.label}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(version.timestamp), { addSuffix: true })}</p>
                    </div>
                    <RotateCcw className="w-3 h-3 text-muted-foreground/0 group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-secondary/40 rounded-lg p-0.5 shrink-0">
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
                    className={`flex items-center gap-1.5 ${tab.iconOnly ? 'px-2' : 'px-3'} py-1.5 rounded-md text-[11px] font-medium transition-all relative ${
                      isActive
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                        : locked
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {!tab.iconOnly && tab.label}
                    {locked && lockOwner && (
                      <span className="w-2 h-2 rounded-full ring-1 ring-background absolute -top-0.5 -right-0.5" style={{ backgroundColor: lockOwner.color }} />
                    )}
                  </button>
                </TooltipTrigger>
                {locked && lockOwner ? (
                  <TooltipContent side="bottom" className="text-xs">
                    <Lock className="w-3 h-3 inline mr-1" />
                    {lockOwner.email.split("@")[0]} is editing
                  </TooltipContent>
                ) : tab.iconOnly ? (
                  <TooltipContent side="bottom" className="text-xs">{tab.label}</TooltipContent>
                ) : null}
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Right: Preview controls (when preview active) + Actions + User menu */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {/* Preview controls — right side, only when preview tab active */}
        {isPreview && (
          <>
            {/* Viewport cycle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const order = VIEWPORTS.map(v => v.id);
                    const idx = order.indexOf(viewport);
                    setViewport(order[(idx + 1) % order.length]);
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <ViewportIcon className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{VIEWPORTS.find(v => v.id === viewport)!.label} — click to switch</TooltipContent>
            </Tooltip>

            {/* Nav arrows */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => { const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement; iframe?.contentWindow?.history.back(); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Back</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => { const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement; iframe?.contentWindow?.history.forward(); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Forward</TooltipContent>
            </Tooltip>

            {/* URL bar */}
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 min-w-0 w-[320px]">
              <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              {isEditingUrl ? (
                <input
                  ref={urlInputRef}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onBlur={handleUrlSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUrlSubmit();
                    if (e.key === "Escape") { setIsEditingUrl(false); setUrlInput(currentPath); }
                  }}
                  className="flex-1 bg-transparent text-xs text-foreground outline-none min-w-0"
                  autoFocus
                  spellCheck={false}
                />
              ) : (
                <button
                  onClick={() => { setIsEditingUrl(true); setTimeout(() => urlInputRef.current?.select(), 0); }}
                  className="flex-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors truncate min-w-0"
                >
                  <span className="text-foreground font-medium">{currentPath}</span>
                </button>
              )}
            </div>

            {/* Open in new tab */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Open in new tab</TooltipContent>
            </Tooltip>

            {/* Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={triggerRefresh} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                  <RefreshCw className={`w-3.5 h-3.5 ${isBuilding ? "animate-spin" : ""}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Refresh</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border mx-0.5" />
          </>
        )}

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

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onProjectSettingsClick} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Project Settings</TooltipContent>
        </Tooltip>

        <PublishExportButtons ref={publishRef} />

        <div className="w-px h-4 bg-border mx-0.5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-secondary transition-colors group">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-border/50" style={{ backgroundColor: myColor }}>
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
            <DropdownMenuItem onClick={onProfileClick} className="text-xs gap-2"><User className="w-3.5 h-3.5" />Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={onSettingsClick} className="text-xs gap-2"><Settings className="w-3.5 h-3.5" />Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={onBillingClick} className="text-xs gap-2"><CreditCard className="w-3.5 h-3.5" />Billing & Usage</DropdownMenuItem>
            <DropdownMenuItem onClick={onHelpClick} className="text-xs gap-2"><HelpCircle className="w-3.5 h-3.5" />Help & Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="text-xs gap-2 text-destructive focus:text-destructive"><LogOut className="w-3.5 h-3.5" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default IDEHeader;