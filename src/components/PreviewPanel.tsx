import { Globe, RefreshCw, ExternalLink, Loader2, Monitor, Tablet, Smartphone } from "lucide-react";
import { useState } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%", maxWidth: "none" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px", maxWidth: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "375px", maxWidth: "375px" },
] as const;

type ViewportId = typeof VIEWPORTS[number]["id"];

const PreviewPanel = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const { previewHtml, isBuilding, buildStep } = usePreview();

  const currentViewport = VIEWPORTS.find(v => v.id === viewport)!;

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
                key={refreshKey}
                srcDoc={`${previewHtml}
<script>
window.onerror = function(msg, url, line) {
  window.parent.postMessage({ type: 'preview-error', message: msg + ' (line ' + line + ')' }, '*');
};
window.addEventListener('unhandledrejection', function(e) {
  window.parent.postMessage({ type: 'preview-error', message: 'Unhandled promise: ' + (e.reason?.message || e.reason) }, '*');
});
</script>`}
                className="w-full h-full border-0 bg-white"
                style={viewport !== "desktop" ? { borderRadius: "8px" } : {}}
                title="Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : (
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

export default PreviewPanel;
