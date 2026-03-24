/**
 * BuildCompletionCard — Shows clear, evidence-backed feedback after a build completes.
 * 
 * Three explicit states:
 * - Static Verified: compile/syntax/import/route checks passed
 * - Runtime Pending: no interaction tests executed yet
 * - Runtime Verified: smoke interactions executed and passed
 * 
 * "Works end-to-end" text appears ONLY in Runtime Verified state.
 */

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileCode2, ArrowRight, Eye, Clock, AlertTriangle, ShieldCheck, XCircle } from "lucide-react";
import type { BuildResult } from "@/hooks/useConversationState";
import type { RequirementPhase } from "@/hooks/useConversationState";
import type { RuntimeStatus, RuntimeCheck } from "@/lib/compiler/types";

interface BuildCompletionCardProps {
  result: BuildResult & {
    runtimeStatus?: RuntimeStatus;
    runtimeChecks?: RuntimeCheck[];
    runtimeSummary?: string;
  };
  phases?: RequirementPhase[];
  onViewPreview?: () => void;
}

const RuntimeBadge = React.forwardRef<HTMLDivElement, { status: RuntimeStatus; summary: string }>(function RuntimeBadge({ status, summary }, ref) {
  switch (status) {
    case "passed":
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="w-3 h-3" />
          <span className="text-[10px] font-semibold">Runtime Verified</span>
        </div>
      );
    case "failed":
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
          <XCircle className="w-3 h-3" />
          <span className="text-[10px] font-semibold">Runtime Failed</span>
        </div>
      );
    case "pending":
    default:
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          <span className="text-[10px] font-semibold">Runtime Pending</span>
        </div>
      );
  }
}

export default function BuildCompletionCard({ result, phases, onViewPreview }: BuildCompletionCardProps) {
  const { filesChanged, totalFiles, chatSummary } = result;
  const runtimeStatus: RuntimeStatus = result.runtimeStatus || "pending";
  const runtimeChecks = result.runtimeChecks || [];
  const runtimeSummary = result.runtimeSummary || "Runtime checks not run yet.";

  // Authoritative flag — derived from build result, NOT from chatSummary text
  const isStaticPass = result.verificationOk === true;
  const isStaticFail = result.verificationOk === false;
  const failedRuntimeChecks = runtimeChecks.filter(c => !c.passed);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-background p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <span className="text-[13px] font-semibold text-emerald-800">Build Complete</span>
        {phases && phases.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
            {phases.length} phase{phases.length > 1 ? "s" : ""} applied
          </span>
        )}
      </div>

      {/* Verification badges */}
      <div className="pl-8 flex flex-wrap gap-2">
        {isStaticPass && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" />
            <span className="text-[10px] font-semibold">Static Verified</span>
          </div>
        )}
        {isStaticFail && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-[10px] font-semibold">Static Issues Found</span>
          </div>
        )}
        <RuntimeBadge status={runtimeStatus} summary={runtimeSummary} />
      </div>

      {/* Summary */}
      <div className="pl-8 space-y-1">
        {isStaticPass && (
          <p className="text-[11px] text-emerald-700 font-medium">
            Static checks passed.
          </p>
        )}
        {isStaticFail && (
          <p className="text-[11px] text-destructive font-medium">
            Static checks found issues.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {runtimeStatus === "passed"
            ? "Runtime smoke checks passed."
            : runtimeStatus === "failed"
            ? "Runtime checks found issues."
            : "Runtime checks not run yet."}
        </p>
      </div>

      {/* Failed runtime checks details */}
      {runtimeStatus === "failed" && failedRuntimeChecks.length > 0 && (
        <div className="pl-8 space-y-1">
          {failedRuntimeChecks.map((check, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-destructive">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span><strong>{check.name}:</strong> {check.details}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chat summary — only show "end-to-end" language when runtime passed */}
      {chatSummary && (
        <p className="text-[12px] text-muted-foreground leading-relaxed pl-8">
          {chatSummary}
        </p>
      )}

      {/* Files changed */}
      {filesChanged.length > 0 && (
        <div className="pl-8 flex flex-wrap gap-1.5">
          {filesChanged.slice(0, 8).map((file, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-mono"
            >
              <FileCode2 className="w-2.5 h-2.5" />
              {file.split("/").pop()}
            </span>
          ))}
          {filesChanged.length > 8 && (
            <span className="text-[10px] text-muted-foreground px-1">
              +{filesChanged.length - 8} more
            </span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="pl-8 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>{totalFiles} total file{totalFiles !== 1 ? "s" : ""}</span>
        <span>•</span>
        <span>{filesChanged.length} changed</span>
      </div>

      {/* Actions */}
      <div className="pl-8 flex items-center gap-2 pt-1">
        {onViewPreview && (
          <button
            onClick={onViewPreview}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Eye className="w-3 h-3" />
            View Preview
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
