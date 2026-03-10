import { Loader2, CheckCircle2, Sparkles, Cpu, FileCode, Boxes } from "lucide-react";
import { useRef, useMemo, useEffect, useCallback } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { motion, AnimatePresence } from "framer-motion";
import { DIRECT_TOUCH_SCRIPT } from "@/components/DirectTouch";
import SandpackPreview from "@/components/SandpackPreview";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const VIEWPORTS = [
  { id: "desktop" as const, label: "Desktop", icon: Monitor },
  { id: "tablet" as const, label: "Tablet", icon: Tablet },
  { id: "mobile" as const, label: "Mobile", icon: Smartphone },
];

const VIEWPORTS_MAP = {
  desktop: { width: "100%", maxWidth: "none" },
  tablet: { width: "768px", maxWidth: "768px" },
  mobile: { width: "375px", maxWidth: "375px" },
} as const;

/** Track build steps as they happen for a live timeline */
function useBuildStepHistory(buildStep: string, isBuilding: boolean) {
  const [steps, setSteps] = useState<{ label: string; time: number }[]>([]);
  const startTime = useRef(Date.now());

  useEffect(() => {
    if (isBuilding && steps.length === 0) {
      startTime.current = Date.now();
    }
    if (!isBuilding) {
      setSteps([]);
    }
  }, [isBuilding]);

  useEffect(() => {
    if (buildStep && isBuilding) {
      setSteps(prev => {
        if (prev.length > 0 && prev[prev.length - 1].label === buildStep) return prev;
        return [...prev, { label: buildStep, time: Date.now() - startTime.current }];
      });
    }
  }, [buildStep, isBuilding]);

  return steps;
}

/** Simple elapsed timer component */
function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <span className="font-mono">{mins}:{secs.toString().padStart(2, '0')}</span>;
}

const PIPELINE_STAGES = [
  { icon: Sparkles, label: "Planning", color: "text-purple-400" },
  { icon: Cpu, label: "Generating", color: "text-blue-400" },
  { icon: FileCode, label: "Validating", color: "text-emerald-400" },
  { icon: Boxes, label: "Assembling", color: "text-amber-400" },
];

/** Extract routes from generated React code */
function detectRoutes(files: Record<string, string> | null): { path: string; label: string }[] {
  if (!files) return [];
  const routes: { path: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const [, code] of Object.entries(files)) {
    for (const match of code.matchAll(/<Route\s+[^>]*path\s*=\s*["']([^"']+)["']/g)) {
      const path = match[1];
      if (!seen.has(path)) {
        seen.add(path);
        const label = path === "/" || path === "/*" ? "Home" : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase()).replace(/:\w+/g, "⟨param⟩");
        routes.push({ path, label });
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

const PreviewPanel = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { previewHtml, isBuilding, buildStep, previewMode, sandpackFiles, viewport, setViewport, refreshKey, triggerRefresh, currentPath, setCurrentPath } = usePreview();
  const buildStepHistory = useBuildStepHistory(buildStep, isBuilding);

  const [urlInput, setUrlInput] = useState("/");
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const currentViewport = VIEWPORTS_MAP[viewport];
  const hasContent = previewMode === "sandpack" ? !!sandpackFiles : !!previewHtml;

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

  // Listen for route changes from inside the Sandpack iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "route-change" && typeof e.data.path === "string") {
        setCurrentPath(e.data.path);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setCurrentPath]);

  const ViewportIcon = VIEWPORTS.find(v => v.id === viewport)!.icon;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex flex-col bg-[hsl(var(--ide-panel))]" style={{ height: '100%', minHeight: 0 }}>
      {/* Preview toolbar */}
      <div className="flex items-center h-9 px-2 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0">
        {/* Left: Preview label */}
        <div className="flex items-center gap-1.5 shrink-0 mr-3">
          <Eye className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-foreground">Preview</span>
        </div>

        {/* Center: controls */}
        <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
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
          <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 min-w-0 max-w-[300px] flex-1">
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

            {hasRoutes && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-0.5 px-1 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0">
                    <MapPin className="w-3 h-3" />
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">Pages ({detectedRoutes.length})</DropdownMenuLabel>
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

          {/* Refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={triggerRefresh} className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                <RefreshCw className={`w-3.5 h-3.5 ${isBuilding ? "animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Refresh</TooltipContent>
          </Tooltip>

          {/* Viewport cycle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  const order = VIEWPORTS.map(v => v.id);
                  const idx = order.indexOf(viewport);
                  setViewport(order[(idx + 1) % order.length]);
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
              >
                <ViewportIcon className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{VIEWPORTS.find(v => v.id === viewport)!.label} — click to switch</TooltipContent>
          </Tooltip>

          {/* Open in new tab */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Open in new tab</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {/* Build progress overlay */}
      <AnimatePresence>
        {isBuilding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[hsl(var(--ide-panel-header))] border-b border-border overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-xs text-primary font-medium">{buildStep || "Building..."}</span>
            </div>
            <div className="h-0.5 bg-border">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 8, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview content */}
      <div className="flex-1 relative overflow-hidden bg-background" style={{ minHeight: 0 }}>
        {/* Building overlay — live pipeline view */}
        <AnimatePresence>
          {isBuilding && !hasContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              className="absolute inset-0 z-10 bg-background flex flex-col items-center justify-center p-8 overflow-hidden"
            >
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
              }} />
              <motion.div
                className="absolute inset-0 opacity-[0.04]"
                style={{ background: `radial-gradient(circle at 50% 50%, hsl(var(--primary)), transparent 70%)` }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.04, 0.08, 0.04] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />

              <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="flex flex-col items-center gap-4">
                  <motion.div className="relative" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center backdrop-blur-sm">
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                    </div>
                    <motion.div
                      className="absolute -inset-1 rounded-2xl border border-primary/30"
                      animate={{ opacity: [0, 0.5, 0], scale: [1, 1.15, 1.3] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                    />
                  </motion.div>
                  <div className="text-center">
                    <motion.h3 key={buildStep} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-semibold text-foreground">
                      {buildStep || "Initializing build..."}
                    </motion.h3>
                    <p className="text-xs text-muted-foreground mt-1">Watch the pipeline in real-time</p>
                  </div>
                </div>

                {/* Pipeline stages */}
                <div className="flex items-center justify-center gap-1">
                  {PIPELINE_STAGES.map((stage, i) => {
                    const stepLower = (buildStep || "").toLowerCase();
                    const isActive =
                      (i === 0 && stepLower.includes("plan")) ||
                      (i === 1 && (stepLower.includes("generat") || stepLower.includes("task") || stepLower.includes("build"))) ||
                      (i === 2 && stepLower.includes("validat")) ||
                      (i === 3 && (stepLower.includes("assembl") || stepLower.includes("merg") || stepLower.includes("bundl")));
                    const isPast = buildStepHistory.some(s => {
                      const l = s.label.toLowerCase();
                      if (i === 0) return l.includes("plan");
                      if (i === 1) return l.includes("generat") || l.includes("task");
                      if (i === 2) return l.includes("validat");
                      if (i === 3) return l.includes("assembl") || l.includes("merg");
                      return false;
                    }) && !isActive;
                    const Icon = stage.icon;

                    return (
                      <div key={stage.label} className="flex items-center gap-1">
                        <motion.div
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                            isActive ? "bg-primary/15 text-primary border border-primary/30" : isPast ? "bg-muted/50 text-muted-foreground" : "text-muted-foreground/40"
                          }`}
                          animate={isActive ? { scale: [1, 1.02, 1] } : {}}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          {isPast ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Icon className={`w-3.5 h-3.5 ${isActive ? stage.color : ""}`} />}
                          {stage.label}
                        </motion.div>
                        {i < PIPELINE_STAGES.length - 1 && <div className={`w-4 h-px ${isPast ? "bg-emerald-500/50" : "bg-border"}`} />}
                      </div>
                    );
                  })}
                </div>

                {/* Live step log */}
                {buildStepHistory.length > 0 && (
                  <div className="border border-border rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pipeline Log</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {buildStepHistory.map((step, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`flex items-center gap-2 px-3 py-1.5 text-[11px] ${
                            i === buildStepHistory.length - 1 ? "text-primary font-medium bg-primary/5" : "text-muted-foreground"
                          }`}
                        >
                          {i === buildStepHistory.length - 1 ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                          <span className="truncate">{step.label}</span>
                          <span className="ml-auto text-[9px] font-mono text-muted-foreground/60 flex-shrink-0">{(step.time / 1000).toFixed(1)}s</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Overall progress bar + elapsed timer */}
                <div className="space-y-1.5">
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full" initial={{ width: "0%" }} animate={{ width: "70%" }} transition={{ duration: 30, ease: "easeOut" }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{buildStepHistory.length} step{buildStepHistory.length !== 1 ? "s" : ""} completed</span>
                    <ElapsedTimer />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {previewMode === "sandpack" ? (
          <div className="absolute inset-0" key="sandpack-container" style={{ display: 'flex', flexDirection: 'column' }}>
            {isBuilding && (!sandpackFiles || Object.keys(sandpackFiles).length === 0) ? (
              <EmptyState />
            ) : (
              <SandpackPreview
                key={refreshKey}
                viewport={{ width: currentViewport.width, maxWidth: currentViewport.maxWidth }}
                initialPath={currentPath}
              />
            )}
          </div>
        ) : (
          <div className="absolute inset-0">
            {previewHtml ? (
              <div
                className="h-full transition-all duration-300 ease-in-out"
                style={{
                  width: currentViewport.width,
                  maxWidth: currentViewport.maxWidth,
                  ...(viewport !== "desktop" ? { boxShadow: "0 0 0 1px hsl(var(--border))", borderRadius: "8px", margin: "12px 0" } : {}),
                }}
              >
                <iframe
                  ref={iframeRef}
                  key={refreshKey}
                  srcDoc={`${previewHtml}
${DIRECT_TOUCH_SCRIPT}
<script>
(function() {
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target.tagName !== 'A') { target = target.parentElement; }
    if (target && target.tagName === 'A') {
      var href = target.getAttribute('href');
      var targetAttr = target.getAttribute('target');
      if (targetAttr === '_parent' || targetAttr === '_top') { e.preventDefault(); return; }
      if (href === '/' || href === '' || href === '#') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }
  }, true);
})();
(function() {
  var errors = [];
  var sendError = function(type, msg) {
    if (!msg || errors.indexOf(msg) !== -1) return;
    errors.push(msg);
    window.parent.postMessage({ type: 'preview-error', errorType: type, message: msg }, '*');
  };
  window.onerror = function(msg, url, line, col) { sendError('runtime', msg + ' (line ' + line + (col ? ':' + col : '') + ')'); };
  window.addEventListener('unhandledrejection', function(e) { sendError('promise', 'Unhandled promise: ' + (e.reason?.message || e.reason || 'unknown')); });
  var origError = console.error;
  console.error = function() { var args = Array.from(arguments).map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' '); sendError('console', args); origError.apply(console, arguments); };
  var origFetch = window.fetch;
  window.fetch = function() { return origFetch.apply(this, arguments).then(function(resp) { if (!resp.ok && resp.status >= 400) { sendError('network', 'Fetch failed: ' + resp.status + ' ' + resp.statusText + ' — ' + resp.url); } return resp; }).catch(function(err) { sendError('network', 'Fetch error: ' + (err.message || err)); throw err; }); };
  window.addEventListener('error', function(e) { if (e.target && e.target !== window) { var tag = e.target.tagName || ''; var src = e.target.src || e.target.href || ''; if (src) sendError('resource', tag + ' failed to load: ' + src); } }, true);
  document.addEventListener('securitypolicyviolation', function(e) { sendError('csp', 'CSP blocked: ' + e.blockedURI + ' (' + e.violatedDirective + ')'); });
  window.parent.postMessage({ type: 'preview-ready' }, '*');
})();
</script>`}
                  className="w-full h-full border-0 bg-white"
                  style={viewport !== "desktop" ? { borderRadius: "8px" } : {}}
                  title="Preview"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            ) : (
              <EmptyState />
            )}
          </div>
        )}
      </div>

      {/* Viewport indicator */}
      {viewport !== "desktop" && (
        <div className="flex items-center justify-center py-1 border-t border-border bg-[hsl(var(--ide-panel-header))] text-[10px] text-muted-foreground">
          {currentViewport.width} viewport
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <span className="text-2xl font-bold text-primary-foreground">L</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Your App</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start building by chatting with the AI assistant
          </p>
        </div>
      </div>
    </div>
  );
}

export default PreviewPanel;