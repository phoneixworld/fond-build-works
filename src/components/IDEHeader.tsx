import { Zap, LogOut, ArrowLeft, ChevronDown, Settings, Pencil, ArrowLeftRight, Lock, User, CreditCard, HelpCircle, Globe, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Monitor, Tablet, Smartphone, FileText, Code2, MapPin } from "lucide-react";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { TechStackId } from "@/lib/techStacks";
import PresenceAvatars from "@/components/PresenceAvatars";
import PublishExportButtons from "@/components/PublishExportButtons";
import { usePreview } from "@/contexts/PreviewContext";
import DirectTouch, { DIRECT_TOUCH_SCRIPT } from "@/components/DirectTouch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
  isLocked?: (panelId: PanelId) => boolean;
  getLockOwner?: (panelId: PanelId) => { email: string; color: string } | null;
}

/** Extract routes from generated React code */
function detectRoutes(files: Record<string, string> | null): { path: string; label: string }[] {
  if (!files) return [];
  const routes: { path: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const [, code] of Object.entries(files)) {
    const routeMatches = code.matchAll(/<Route\s+[^>]*path\s*=\s*["']([^"']+)["']/g);
    for (const match of routeMatches) {
      const path = match[1];
      if (!seen.has(path)) {
        seen.add(path);
        const label = path === "/" || path === "/*" ? "Home" : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase()).replace(/:\w+/g, "⟨param⟩");
        routes.push({ path, label });
      }
    }
    for (const match of code.matchAll(/navigate\s*\(\s*["']([^"']+)["']/g)) {
      const path = match[1];
      if (!seen.has(path) && path.startsWith("/")) {
        seen.add(path);
        routes.push({ path, label: path === "/" ? "Home" : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase()) });
      }
    }
    for (const match of code.matchAll(/<Link\s+[^>]*to\s*=\s*["']([^"']+)["']/g)) {
      const path = match[1];
      if (!seen.has(path) && path.startsWith("/")) {
        seen.add(path);
        routes.push({ path, label: path === "/" ? "Home" : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase()) });
      }
    }
  }
  routes.sort((a, b) => {
    if (a.path === "/" || a.path === "/*") return -1;
    if (b.path === "/" || b.path === "/*") return 1;
    return a.path.localeCompare(b.path);
  });
  return routes;
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
  const { viewport, setViewport, triggerRefresh, isBuilding, previewMode, setPreviewMode, sandpackFiles, currentPath, setCurrentPath } = usePreview();

  const [urlInput, setUrlInput] = useState("/");
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const detectedRoutes = useMemo(() => detectRoutes(sandpackFiles), [sandpackFiles]);
  const hasRoutes = detectedRoutes.length > 1;

  const navigateToRoute = useCallback((path: string) => {
    setCurrentPath(path);
    setUrlInput(path);
    const sandpackIframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;
    if (sandpackIframe?.contentWindow) {
      sandpackIframe.contentWindow.postMessage({ type: "navigate", path }, "*");
    }
  }, [setCurrentPath]);

  const handleUrlSubmit = useCallback(() => {
    setIsEditingUrl(false);
    if (urlInput.startsWith("/")) navigateToRoute(urlInput);
  }, [urlInput, navigateToRoute]);

  // Sync urlInput with currentPath
  useEffect(() => {
    if (!isEditingUrl) setUrlInput(currentPath);
  }, [currentPath, isEditingUrl]);

  // Listen for route changes from Sandpack iframe
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

  return (
    <header className="h-11 flex items-center px-3 border-b border-border shrink-0 z-10 relative bg-ide-panel-header">
      {/* Left: Back + Project dropdown */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
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
      </div>

      {/* Center: Tabs + Preview toolbar */}
      <div className="flex items-center gap-2 mx-auto min-w-0">
        {/* Primary tabs */}
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all relative ${
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
                      <span className="w-2 h-2 rounded-full ring-1 ring-background absolute -top-0.5 -right-0.5" style={{ backgroundColor: lockOwner.color }} />
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

        {/* Preview toolbar — only when preview tab active */}
        {isPreview && (
          <>
            <div className="w-px h-4 bg-border shrink-0" />

            {/* Nav arrows + refresh */}
            <div className="flex items-center gap-0.5 shrink-0">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={triggerRefresh} className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                    <RefreshCw className={`w-3.5 h-3.5 ${isBuilding ? "animate-spin" : ""}`} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Refresh preview</TooltipContent>
              </Tooltip>
            </div>

            {/* URL bar */}
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 min-w-0 max-w-[280px] flex-1">
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
                  <span className="text-muted-foreground/60">phoneix.world</span>
                  <span className="text-foreground font-medium">{currentPath}</span>
                </button>
              )}

              {previewMode === "sandpack" && hasRoutes && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-0.5 px-1 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0">
                      <MapPin className="w-3 h-3" />
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Pages ({detectedRoutes.length})
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {detectedRoutes.map((route) => (
                      <DropdownMenuItem key={route.path} onClick={() => navigateToRoute(route.path)} className={`text-xs gap-2 ${currentPath === route.path ? "bg-primary/10 text-primary font-medium" : ""}`}>
                        <span className="font-mono text-muted-foreground text-[10px] min-w-[60px]">{route.path}</span>
                        <span>{route.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Viewport toggles */}
            <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5 shrink-0">
              {VIEWPORTS.map((vp) => {
                const Icon = vp.icon;
                const isActive = viewport === vp.id;
                return (
                  <Tooltip key={vp.id}>
                    <TooltipTrigger asChild>
                      <button onClick={() => setViewport(vp.id)} className={`p-1.5 rounded-md transition-all ${isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{vp.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Open in new tab */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50 shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Open in new tab</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Right: Actions + User menu */}
      <div className="flex items-center gap-1 shrink-0">
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