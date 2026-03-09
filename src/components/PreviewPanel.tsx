import { Globe, RefreshCw, ExternalLink, Loader2, Monitor, Tablet, Smartphone, Code2, FileText, ChevronLeft, ChevronRight, ChevronDown, MapPin } from "lucide-react";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import DirectTouch, { DIRECT_TOUCH_SCRIPT } from "@/components/DirectTouch";
import SandpackPreview from "@/components/SandpackPreview";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%", maxWidth: "none" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px", maxWidth: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "375px", maxWidth: "375px" },
] as const;

type ViewportId = typeof VIEWPORTS[number]["id"];

/** Extract routes from generated React code by scanning for <Route path="..."> patterns */
function detectRoutes(files: Record<string, string> | null): { path: string; label: string }[] {
  if (!files) return [];
  
  const routes: { path: string; label: string }[] = [];
  const seen = new Set<string>();
  
  for (const [, code] of Object.entries(files)) {
    // Match <Route path="/about" ...> or path: "/about"
    const routeMatches = code.matchAll(/<Route\s+[^>]*path\s*=\s*["']([^"']+)["']/g);
    for (const match of routeMatches) {
      const path = match[1];
      if (!seen.has(path)) {
        seen.add(path);
        // Generate readable label from path
        const label = path === "/" || path === "/*" 
          ? "Home" 
          : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase()).replace(/:\w+/g, "⟨param⟩");
        routes.push({ path, label });
      }
    }
    
    // Also detect navigate("/path") calls
    const navMatches = code.matchAll(/navigate\s*\(\s*["']([^"']+)["']/g);
    for (const match of navMatches) {
      const path = match[1];
      if (!seen.has(path) && path.startsWith("/")) {
        seen.add(path);
        const label = path === "/" ? "Home" : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase());
        routes.push({ path, label });
      }
    }

    // Detect <Link to="/path"> patterns
    const linkMatches = code.matchAll(/<Link\s+[^>]*to\s*=\s*["']([^"']+)["']/g);
    for (const match of linkMatches) {
      const path = match[1];
      if (!seen.has(path) && path.startsWith("/")) {
        seen.add(path);
        const label = path === "/" ? "Home" : path.replace(/^\//, "").replace(/[/-]/g, " ").replace(/^\w/, c => c.toUpperCase());
        routes.push({ path, label });
      }
    }
  }
  
  // Sort: Home first, then alphabetical
  routes.sort((a, b) => {
    if (a.path === "/" || a.path === "/*") return -1;
    if (b.path === "/" || b.path === "/*") return 1;
    return a.path.localeCompare(b.path);
  });
  
  return routes;
}

const PreviewPanel = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const [directTouchActive, setDirectTouchActive] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [urlInput, setUrlInput] = useState("/");
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const { previewHtml, isBuilding, buildStep, previewMode, setPreviewMode, sandpackFiles } = usePreview();

  const toggleDirectTouch = useCallback(() => {
    const next = !directTouchActive;
    setDirectTouchActive(next);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "direct-touch-toggle", active: next }, "*");
    }
  }, [directTouchActive]);

  const currentViewport = VIEWPORTS.find(v => v.id === viewport)!;
  const hasContent = previewMode === "sandpack" ? !!sandpackFiles : !!previewHtml;

  // Detect routes from generated code
  const detectedRoutes = useMemo(() => detectRoutes(sandpackFiles), [sandpackFiles]);
  const hasRoutes = detectedRoutes.length > 1; // More than just home

  // Navigate to a specific route via postMessage to Sandpack iframe
  const navigateToRoute = useCallback((path: string) => {
    setCurrentPath(path);
    setUrlInput(path);
    // Sandpack uses an iframe — we post a message to trigger navigation
    // The generated apps use react-router, so we inject a navigation script
    const sandpackIframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;
    if (sandpackIframe?.contentWindow) {
      sandpackIframe.contentWindow.postMessage(
        { type: "navigate", path },
        "*"
      );
    }
  }, []);

  const handleUrlSubmit = useCallback(() => {
    setIsEditingUrl(false);
    if (urlInput.startsWith("/")) {
      navigateToRoute(urlInput);
    }
  }, [urlInput, navigateToRoute]);

  // Listen for route changes from inside the Sandpack iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "route-change" && typeof e.data.path === "string") {
        setCurrentPath(e.data.path);
        setUrlInput(e.data.path);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
        {/* URL bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-[hsl(var(--ide-panel-header))]">
          {/* Navigation buttons */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const sandpackIframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;
                    sandpackIframe?.contentWindow?.history.back();
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Back</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    const sandpackIframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;
                    sandpackIframe?.contentWindow?.history.forward();
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Forward</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBuilding ? "animate-spin" : ""}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Refresh preview</TooltipContent>
            </Tooltip>
          </div>

          {/* URL bar with route input */}
          <div className="flex items-center gap-1.5 flex-1 bg-secondary rounded-lg px-2.5 py-1 min-w-0">
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
                onClick={() => {
                  setIsEditingUrl(true);
                  setTimeout(() => urlInputRef.current?.select(), 0);
                }}
                className="flex-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors truncate min-w-0"
              >
                <span className="text-muted-foreground/60">phoneix.world</span>
                <span className="text-foreground font-medium">{currentPath}</span>
              </button>
            )}

            {/* Route picker dropdown */}
            {previewMode === "sandpack" && hasRoutes && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0">
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
                    <DropdownMenuItem
                      key={route.path}
                      onClick={() => navigateToRoute(route.path)}
                      className={`text-xs gap-2 ${currentPath === route.path ? "bg-primary/10 text-primary font-medium" : ""}`}
                    >
                      <span className="font-mono text-muted-foreground text-[10px] min-w-[60px]">{route.path}</span>
                      <span>{route.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Preview mode toggle */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPreviewMode("html")}
                  className={`p-1.5 rounded-md transition-all ${
                    previewMode === "html"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">HTML Preview</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPreviewMode("sandpack")}
                  className={`p-1.5 rounded-md transition-all ${
                    previewMode === "sandpack"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">React Preview (Sandpack)</TooltipContent>
            </Tooltip>
          </div>

          {/* Viewport toggles */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
            {VIEWPORTS.map((vp) => {
              const Icon = vp.icon;
              const isActive = viewport === vp.id;
              return (
                <Tooltip key={vp.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewport(vp.id)}
                      className={`p-1.5 rounded-md transition-all ${
                        isActive
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{vp.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {previewMode === "html" && (
            <DirectTouch active={directTouchActive} onToggle={toggleDirectTouch} />
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Open in new tab</TooltipContent>
          </Tooltip>
        </div>

        {/* Route tabs — show when multiple pages detected */}
        <AnimatePresence>
          {previewMode === "sandpack" && hasRoutes && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-border bg-[hsl(var(--ide-panel-header))] overflow-hidden"
            >
              <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-none">
                {detectedRoutes.map((route) => (
                  <button
                    key={route.path}
                    onClick={() => navigateToRoute(route.path)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                      currentPath === route.path
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {route.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
        <div className="flex-1 relative flex flex-col overflow-hidden bg-background min-h-0">
          {/* Building skeleton overlay */}
          <AnimatePresence>
            {isBuilding && !hasContent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 bg-background flex flex-col items-center justify-center gap-6 p-8"
              >
                <div className="w-full max-w-md space-y-4">
                  <div className="h-8 w-3/4 mx-auto rounded-lg bg-muted animate-pulse" />
                  <div className="h-4 w-1/2 mx-auto rounded bg-muted animate-pulse" />
                  <div className="h-48 w-full rounded-xl bg-muted/60 animate-pulse mt-6" />
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="h-24 rounded-lg bg-muted animate-pulse" />
                    <div className="h-24 rounded-lg bg-muted animate-pulse" style={{ animationDelay: "0.15s" }} />
                    <div className="h-24 rounded-lg bg-muted animate-pulse" style={{ animationDelay: "0.3s" }} />
                  </div>
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse mt-4" />
                  <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {previewMode === "sandpack" ? (
            <div className="flex-1 w-full min-h-0" key="sandpack-container">
              {isBuilding && (!sandpackFiles || Object.keys(sandpackFiles).length === 0) ? (
                null
              ) : (
                <SandpackPreview
                  key={refreshKey}
                  viewport={{ width: currentViewport.width, maxWidth: currentViewport.maxWidth }}
                  initialPath={currentPath}
                />
              )}
            </div>
          ) : (
            // Legacy HTML iframe
            <div className="flex-1 w-full min-h-0 flex items-center justify-center">
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
// === Prevent navigation to parent/top window ===
(function() {
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target.tagName !== 'A') {
      target = target.parentElement;
    }
    if (target && target.tagName === 'A') {
      var href = target.getAttribute('href');
      var targetAttr = target.getAttribute('target');
      if (targetAttr === '_parent' || targetAttr === '_top') {
        e.preventDefault();
        return;
      }
      if (href === '/' || href === '' || href === '#') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, true);
})();

// === Enhanced Error Intelligence ===
(function() {
  var errors = [];
  var sendError = function(type, msg) {
    if (!msg || errors.indexOf(msg) !== -1) return;
    errors.push(msg);
    window.parent.postMessage({ type: 'preview-error', errorType: type, message: msg }, '*');
  };
  window.onerror = function(msg, url, line, col) {
    sendError('runtime', msg + ' (line ' + line + (col ? ':' + col : '') + ')');
  };
  window.addEventListener('unhandledrejection', function(e) {
    sendError('promise', 'Unhandled promise: ' + (e.reason?.message || e.reason || 'unknown'));
  });
  var origError = console.error;
  console.error = function() {
    var args = Array.from(arguments).map(function(a) {
      return typeof a === 'object' ? JSON.stringify(a) : String(a);
    }).join(' ');
    sendError('console', args);
    origError.apply(console, arguments);
  };
  var origWarn = console.warn;
  console.warn = function() {
    var args = Array.from(arguments).map(function(a) {
      return typeof a === 'object' ? JSON.stringify(a) : String(a);
    }).join(' ');
    if (args.toLowerCase().indexOf('error') !== -1 || args.toLowerCase().indexOf('failed') !== -1) {
      sendError('warning', args);
    }
    origWarn.apply(console, arguments);
  };
  var origFetch = window.fetch;
  window.fetch = function() {
    return origFetch.apply(this, arguments).then(function(resp) {
      if (!resp.ok && resp.status >= 400) {
        sendError('network', 'Fetch failed: ' + resp.status + ' ' + resp.statusText + ' — ' + resp.url);
      }
      return resp;
    }).catch(function(err) {
      sendError('network', 'Fetch error: ' + (err.message || err));
      throw err;
    });
  };
  window.addEventListener('error', function(e) {
    if (e.target && e.target !== window) {
      var tag = e.target.tagName || '';
      var src = e.target.src || e.target.href || '';
      if (src) sendError('resource', tag + ' failed to load: ' + src);
    }
  }, true);
  document.addEventListener('securitypolicyviolation', function(e) {
    sendError('csp', 'CSP blocked: ' + e.blockedURI + ' (' + e.violatedDirective + ')');
  });
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
            </>
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
