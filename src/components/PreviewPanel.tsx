import { Loader2, CheckCircle2, Sparkles, Cpu, FileCode, Boxes } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { motion, AnimatePresence } from "framer-motion";
import { DIRECT_TOUCH_SCRIPT } from "@/components/DirectTouch";
import SandpackPreview from "@/components/SandpackPreview";
import ESMPreview from "@/components/ESMPreview";

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

const PreviewPanel = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { previewHtml, isBuilding, buildStep, previewMode, sandpackFiles, viewport, refreshKey, currentPath, setCurrentPath } = usePreview();
  const buildStepHistory = useBuildStepHistory(buildStep, isBuilding);

  const currentViewport = VIEWPORTS_MAP[viewport];
  const hasAppFile = sandpackFiles ? Object.keys(sandpackFiles).some(p => /\/?(?:src\/)?App\.(tsx?|jsx?)$/.test(p)) : false;
  const hasContent = previewMode === "esm" ? hasAppFile && !isBuilding : previewMode === "sandpack" ? !!sandpackFiles : !!previewHtml;

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

  return (
    <div className="flex flex-col bg-[hsl(var(--ide-panel))]" style={{ height: '100%', minHeight: 0 }}>
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

        {previewMode === "esm" ? (
          <div className="absolute inset-0" key="esm-container" style={{ display: 'flex', flexDirection: 'column' }}>
            {isBuilding && (!sandpackFiles || Object.keys(sandpackFiles).length === 0) ? (
              <EmptyState />
            ) : (
              <ESMPreview
                key={refreshKey}
                viewport={{ width: currentViewport.width, maxWidth: currentViewport.maxWidth }}
                initialPath={currentPath}
              />
            )}
          </div>
        ) : previewMode === "sandpack" ? (
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