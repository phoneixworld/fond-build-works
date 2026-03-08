import { Globe, RefreshCw, ExternalLink, Loader2, Monitor, Tablet, Smartphone, Code2, FileText } from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import DirectTouch, { DIRECT_TOUCH_SCRIPT } from "@/components/DirectTouch";
import SandpackPreview from "@/components/SandpackPreview";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%", maxWidth: "none" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px", maxWidth: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "375px", maxWidth: "375px" },
] as const;

type ViewportId = typeof VIEWPORTS[number]["id"];

const PreviewPanel = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const [directTouchActive, setDirectTouchActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
        {/* URL bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[hsl(var(--ide-panel-header))]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBuilding ? "animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Refresh preview</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-2 flex-1 bg-secondary rounded-md px-3 py-1">
            <Globe className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">my-app.lovable.app</span>
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
        <div className="flex-1 relative flex items-start justify-center overflow-auto bg-background">
          {previewMode === "sandpack" ? (
            <div className="h-full w-full" key={`sandpack-${refreshKey}`}>
              {sandpackFiles ? (
                <SandpackPreview
                  viewport={{ width: currentViewport.width, maxWidth: currentViewport.maxWidth }}
                />
              ) : (
                <EmptyState />
              )}
            </div>
          ) : (
            // Legacy HTML iframe
            <>
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
