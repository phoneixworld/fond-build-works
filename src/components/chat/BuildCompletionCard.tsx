/**
 * BuildCompletionCard — Shows clear feedback after a build completes.
 * Displays files changed, summary, and next actions.
 */

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileCode2, ArrowRight, Eye } from "lucide-react";
import type { BuildResult } from "@/hooks/useConversationState";
import type { RequirementPhase } from "@/hooks/useConversationState";

interface BuildCompletionCardProps {
  result: BuildResult;
  phases?: RequirementPhase[];
  onViewPreview?: () => void;
}

export default function BuildCompletionCard({ result, phases, onViewPreview }: BuildCompletionCardProps) {
  const { filesChanged, totalFiles, chatSummary } = result;

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

      {/* Summary */}
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
