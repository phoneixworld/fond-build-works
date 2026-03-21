/**
 * ChatModeIndicator — Shows current mode (Chat, Building, Editing) with animated transitions.
 */
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Hammer, Pencil, Sparkles, Loader2 } from "lucide-react";

type Mode = "idle" | "chat" | "build" | "edit" | "analyzing";

interface ChatModeIndicatorProps {
  currentAgent: string | null;
  isLoading: boolean;
  isAnalyzing: boolean;
  pipelineStep: string | null;
  messageCount: number;
}

function getMode(agent: string | null, isLoading: boolean, isAnalyzing: boolean): Mode {
  if (isAnalyzing) return "analyzing";
  if (!isLoading) return "idle";
  if (agent === "chat") return "chat";
  if (agent === "edit") return "edit";
  return "build";
}

const MODE_CONFIG: Record<Mode, { icon: typeof MessageSquare; label: string; color: string; bg: string }> = {
  idle: { icon: MessageSquare, label: "Ready", color: "text-muted-foreground", bg: "bg-secondary" },
  chat: { icon: MessageSquare, label: "Chatting", color: "text-primary", bg: "bg-primary/10" },
  build: { icon: Hammer, label: "Building", color: "text-[hsl(var(--ide-warning))]", bg: "bg-[hsl(var(--ide-warning))]/10" },
  edit: { icon: Pencil, label: "Editing", color: "text-[hsl(var(--ide-success))]", bg: "bg-[hsl(var(--ide-success))]/10" },
  analyzing: { icon: Sparkles, label: "Analyzing", color: "text-accent", bg: "bg-accent/10" },
};

export default function ChatModeIndicator({ currentAgent, isLoading, isAnalyzing, pipelineStep, messageCount }: ChatModeIndicatorProps) {
  const mode = getMode(currentAgent, isLoading, isAnalyzing);
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  if (mode === "idle" && messageCount === 0) return null;

  return (
    <div className="px-4 py-1.5 border-b border-border/40 flex items-center justify-between">
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.15 }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.color} ${config.bg}`}
        >
          {isLoading || isAnalyzing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Icon className="w-3 h-3" />
          )}
          {config.label}
        </motion.div>
      </AnimatePresence>

      {pipelineStep && isLoading && (
        <span className="text-[10px] text-muted-foreground/50 font-mono capitalize">
          {pipelineStep}
        </span>
      )}
    </div>
  );
}
