import { Globe, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { motion, AnimatePresence } from "framer-motion";

const PreviewPanel = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { previewHtml, isBuilding, buildStep } = usePreview();

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-ide-panel-header">
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isBuilding ? "animate-spin" : ""}`} />
        </button>
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-md px-3 py-1">
          <Globe className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">my-app.lovable.app</span>
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Build progress overlay */}
      <AnimatePresence>
        {isBuilding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-ide-panel-header border-b border-border overflow-hidden"
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
      <div className="flex-1 relative">
        {previewHtml ? (
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
            title="Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-background">
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
    </div>
  );
};

export default PreviewPanel;
