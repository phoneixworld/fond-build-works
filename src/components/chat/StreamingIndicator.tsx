/**
 * StreamingIndicator — Replaces generic dots with a proper typing animation.
 * Shows word count, elapsed time, and a pulsing cursor effect.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface StreamingIndicatorProps {
  isStreaming: boolean;
  streamContent: string;
  agentLabel?: string;
}

export default function StreamingIndicator({ isStreaming, streamContent, agentLabel = "Phoneix" }: StreamingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isStreaming) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  if (!isStreaming) return null;

  const wordCount = streamContent.trim().split(/\s+/).filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex gap-3 items-start"
    >
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
        <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
      </div>
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground/80">{agentLabel} is thinking...</span>
          <span className="text-[10px] text-muted-foreground/40 font-mono">{elapsed}s</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Animated typing cursor */}
          <div className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
                className="w-1.5 h-1.5 rounded-full bg-primary"
              />
            ))}
          </div>
          {wordCount > 0 && (
            <span className="text-[10px] text-muted-foreground/50">
              {wordCount} word{wordCount !== 1 ? "s" : ""} generated
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
