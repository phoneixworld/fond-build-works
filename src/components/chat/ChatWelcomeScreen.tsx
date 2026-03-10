/**
 * ChatWelcomeScreen — The welcome/empty-state UI shown when no messages exist.
 * 
 * Extracted from ChatPanel.tsx to reduce rendering JSX size.
 * Includes prompt suggestions, template selector, and capabilities showcase.
 */

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { PROMPT_SUGGESTIONS } from "@/lib/aiModels";
import { PAGE_TEMPLATES } from "@/lib/pageTemplates";
import type { PageTemplate } from "@/lib/pageTemplates";

interface ChatWelcomeScreenProps {
  onSend: (prompt: string) => void;
  selectedTemplate: PageTemplate | null;
  onSelectTemplate: (template: PageTemplate | null) => void;
}

export default function ChatWelcomeScreen({ onSend, selectedTemplate, onSelectTemplate }: ChatWelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-3"
      >
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">What do you want to build?</h3>
        <p className="text-xs text-muted-foreground text-center max-w-[260px]">
          Pick a suggestion below, describe your app, or paste a screenshot to get started
        </p>
      </motion.div>

      {/* Prompt suggestions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="w-full max-w-sm space-y-2"
      >
        <div className="grid grid-cols-2 gap-2">
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              onClick={() => onSend(s.prompt)}
              className="text-left px-3 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 hover:shadow-md hover:shadow-primary/5 transition-all group"
            >
              <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{s.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Template selector */}
        <div className="mt-3">
          <p className="text-[10px] text-muted-foreground/40 font-medium mb-1.5 text-center">Or start with a template:</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {PAGE_TEMPLATES.slice(0, 6).map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTemplate(selectedTemplate?.id === t.id ? null : t)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  selectedTemplate?.id === t.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <span>{t.emoji}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          {PAGE_TEMPLATES.length > 6 && (
            <details className="mt-1.5">
              <summary className="text-[10px] text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/50 text-center">
                +{PAGE_TEMPLATES.length - 6} more templates
              </summary>
              <div className="flex flex-wrap gap-1.5 justify-center mt-1.5">
                {PAGE_TEMPLATES.slice(6).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTemplate(selectedTemplate?.id === t.id ? null : t)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      selectedTemplate?.id === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    <span>{t.emoji}</span>
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </motion.div>

      {/* Capabilities showcase */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="rounded-xl border border-border/50 bg-card/50 p-3">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2 text-center">What Phoneix Builder can do</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { icon: "🧠", label: "Multi-model AI", desc: "GPT-5, Gemini 2.5 & more" },
              { icon: "🎨", label: "Design themes", desc: "10+ curated styles" },
              { icon: "📸", label: "Image-to-code", desc: "Paste screenshot → app" },
              { icon: "🔧", label: "Auto-fix errors", desc: "Self-healing builds" },
              { icon: "⚡", label: "Live preview", desc: "Instant Sandpack render" },
              { icon: "🧩", label: "Smart suggestions", desc: "Context-aware actions" },
            ].map((cap, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                <span className="text-sm shrink-0">{cap.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground leading-tight">{cap.label}</p>
                  <p className="text-[9px] text-muted-foreground/60 leading-tight">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Keyboard hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5"
      >
        <kbd className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-mono">Enter</kbd>
        to send
        <span className="mx-1">·</span>
        <kbd className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-mono">Shift+Enter</kbd>
        new line
      </motion.p>
    </div>
  );
}
