/**
 * Global Error Boundary (GEB) + Error Overlay UI (EOU)
 * 
 * Wraps the entire app. On crash:
 * - Captures error, component stack, route, classification
 * - Shows branded Nimbus overlay with "Fix Now"
 * - Sends structured error to Self-Repair Engine
 */
import { Component, ErrorInfo, ReactNode } from "react";
import { classifyError, type ClassifiedError, type ErrorCategory } from "@/lib/errorClassifier";
import { AlertTriangle, RefreshCw, Wand2, ChevronDown, ChevronRight, Loader2, FileX, Link2Off, Code2, Bug, Route, Box, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────

interface GEBProps {
  children: ReactNode;
  onRepairRequest?: (error: StructuredError) => void;
}

interface GEBState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  classified: ClassifiedError | null;
  isRepairing: boolean;
  repairAttempts: number;
  showDetails: boolean;
}

export interface StructuredError {
  message: string;
  componentStack: string;
  route: string;
  file?: string;
  component?: string;
  identifier?: string;
  classification: ClassifiedError;
  timestamp: number;
}

// ─── Category Icon Map ────────────────────────────────────────────────────

const CATEGORY_ICONS: Partial<Record<ErrorCategory, typeof Bug>> = {
  missing_export: FileX,
  missing_component: Box,
  wrong_import_style: Link2Off,
  duplicate_export: Layers,
  route_mismatch: Route,
  syntax_error: Code2,
  component_not_found: FileX,
  undefined_symbol: Bug,
};

const CATEGORY_LABELS: Partial<Record<ErrorCategory, string>> = {
  missing_export: "Missing Export",
  missing_component: "Missing Component",
  wrong_import_style: "Import Mismatch",
  undefined_symbol: "Undefined Symbol",
  route_mismatch: "Route Mismatch",
  hydration_mismatch: "Hydration Error",
  lazy_import_failure: "Lazy Import Failed",
  missing_skeleton: "Missing Skeleton",
  missing_stub: "Missing Stub",
  missing_default_export: "Missing Default Export",
  duplicate_export: "Duplicate Export",
  component_not_found: "Component Not Found",
  api_mismatch: "API Mismatch",
  syntax_error: "Syntax Error",
  unknown: "Unknown Error",
};

// ─── Component ────────────────────────────────────────────────────────────

export default class GlobalErrorBoundary extends Component<GEBProps, GEBState> {
  constructor(props: GEBProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: "",
      classified: null,
      isRepairing: false,
      repairAttempts: 0,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<GEBState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack || "";
    const route = typeof window !== "undefined" ? window.location.pathname : "/";

    const classified = classifyError({
      message: error.message,
      componentStack: stack,
      route,
    });

    this.setState({ componentStack: stack, classified });

    console.error("[GEB] Caught error:", {
      message: error.message,
      category: classified.category,
      file: classified.file,
      component: classified.component,
      route,
    });

    // Bridge to repair engine via postMessage
    const structured: StructuredError = {
      message: error.message,
      componentStack: stack,
      route,
      file: classified.file,
      component: classified.component,
      identifier: classified.identifier,
      classification: classified,
      timestamp: Date.now(),
    };

    window.postMessage({ type: "geb-error", error: structured }, "*");
  }

  handleFixNow = () => {
    const { error, componentStack, classified } = this.state;
    if (!error || !classified) return;

    const route = typeof window !== "undefined" ? window.location.pathname : "/";
    const structured: StructuredError = {
      message: error.message,
      componentStack,
      route,
      file: classified.file,
      component: classified.component,
      identifier: classified.identifier,
      classification: classified,
      timestamp: Date.now(),
    };

    this.setState({
      isRepairing: true,
      repairAttempts: this.state.repairAttempts + 1,
    });

    // Notify the repair engine
    this.props.onRepairRequest?.(structured);
    window.postMessage({ type: "geb-fix-request", error: structured }, "*");

    // Auto-reset after 8s to let user retry if repair didn't work
    setTimeout(() => {
      this.setState({ isRepairing: false });
    }, 8000);
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: "",
      classified: null,
      isRepairing: false,
      showDetails: false,
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, classified, isRepairing, repairAttempts, showDetails, componentStack } = this.state;
    const CatIcon = (classified && CATEGORY_ICONS[classified.category]) || Bug;
    const catLabel = (classified && CATEGORY_LABELS[classified.category]) || "Unknown Error";
    const route = typeof window !== "undefined" ? window.location.pathname : "/";

    // ─── Repairing Screen ─────────────────────────────────────────────
    if (isRepairing) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 p-8"
          >
            <div className="relative">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <Wand2 className="w-5 h-5 text-accent absolute -top-1 -right-1" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Nimbus is fixing this…
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm text-center">
              Auto-repairing {catLabel.toLowerCase()}. This usually takes a few seconds.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className="h-1 w-32 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 6, ease: "easeInOut" }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                Attempt {repairAttempts}
              </span>
            </div>
          </motion.div>
        </div>
      );
    }

    // ─── Error Overlay ────────────────────────────────────────────────
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-destructive/5">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Something went wrong
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <CatIcon className="w-3 h-3 text-destructive/70" />
                <span className="text-xs font-medium text-destructive/80">
                  {catLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Error Summary */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-foreground/80 font-mono leading-relaxed break-all">
              {error?.message?.slice(0, 300)}
            </p>

            {/* Quick Info Pills */}
            <div className="flex flex-wrap gap-1.5">
              {classified?.file && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                  <FileX className="w-2.5 h-2.5" />
                  {classified.file}
                </span>
              )}
              {classified?.component && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                  <Box className="w-2.5 h-2.5" />
                  {classified.component}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                <Route className="w-2.5 h-2.5" />
                {route}
              </span>
            </div>

            {/* Repair Hint */}
            {classified?.repairHint && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                <p className="text-[11px] text-primary/80">
                  <span className="font-semibold">Suggested fix:</span>{" "}
                  {classified.repairHint}
                </p>
              </div>
            )}

            {/* Expandable Details */}
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Component Stack
            </button>

            <AnimatePresence>
              {showDetails && componentStack && (
                <motion.pre
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-40 overflow-y-auto"
                >
                  {componentStack.trim()}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
            <button
              onClick={this.handleFixNow}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Fix Now
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
}
