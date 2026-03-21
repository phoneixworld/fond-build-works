/**
 * ErrorRecoveryBanner — Actionable error UI with categorized errors and one-click fix buttons.
 * Replaces the generic "X errors detected" banner.
 */
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Wand2, Bug, FileX, Link2Off, Code2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface ErrorRecoveryBannerProps {
  errors: string[];
  healAttempts: number;
  maxHealAttempts: number;
  onAutoFix: () => void;
  onResetAndFix: () => void;
  isLoading: boolean;
}

function categorizeError(error: string): { icon: typeof Bug; label: string; category: string } {
  const lower = error.toLowerCase();
  if (lower.includes("import") || lower.includes("module not found") || lower.includes("cannot find module")) {
    return { icon: Link2Off, label: "Missing Import", category: "import" };
  }
  if (lower.includes("export") || lower.includes("not a function") || lower.includes("is not defined")) {
    return { icon: FileX, label: "Export Mismatch", category: "export" };
  }
  if (lower.includes("syntax") || lower.includes("unexpected token") || lower.includes("parsing error")) {
    return { icon: Code2, label: "Syntax Error", category: "syntax" };
  }
  return { icon: Bug, label: "Runtime Error", category: "runtime" };
}

export default function ErrorRecoveryBanner({
  errors, healAttempts, maxHealAttempts, onAutoFix, onResetAndFix, isLoading,
}: ErrorRecoveryBannerProps) {
  const [expanded, setExpanded] = useState(false);
  if (errors.length === 0 || isLoading) return null;

  const categorized = errors.map((e) => ({ error: e, ...categorizeError(e) }));
  const categories = [...new Set(categorized.map(c => c.category))];
  const isMaxRetries = healAttempts >= maxHealAttempts;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-t border-destructive/30 bg-destructive/5"
    >
      {/* Summary row */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive font-medium">
            {errors.length} error{errors.length > 1 ? "s" : ""} detected
          </span>
          <div className="flex gap-1">
            {categories.map((cat) => {
              const info = categorized.find(c => c.category === cat)!;
              const CatIcon = info.icon;
              return (
                <span key={cat} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-destructive/10 text-destructive font-medium">
                  <CatIcon className="w-2.5 h-2.5" />
                  {info.label}
                </span>
              );
            })}
          </div>
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {isMaxRetries ? (
            <button
              onClick={onResetAndFix}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ShieldCheck className="w-3 h-3" />
              Retry Fix
            </button>
          ) : (
            <>
              {healAttempts > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {healAttempts}/{maxHealAttempts}
                </span>
              )}
              <button
                onClick={onAutoFix}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                Fix now
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded error details */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-3 pb-2 space-y-1"
        >
          {categorized.slice(0, 5).map((item, i) => {
            const CatIcon = item.icon;
            return (
              <div key={i} className="flex items-start gap-2 text-[11px] text-destructive/80 bg-destructive/5 rounded-lg px-2.5 py-1.5">
                <CatIcon className="w-3 h-3 mt-0.5 shrink-0 text-destructive/60" />
                <span className="font-mono break-all leading-relaxed">{item.error.slice(0, 200)}</span>
              </div>
            );
          })}
          {errors.length > 5 && (
            <span className="text-[10px] text-muted-foreground pl-5">
              +{errors.length - 5} more errors
            </span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
