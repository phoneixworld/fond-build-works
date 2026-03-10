/**
 * ChatStatusBanners — Self-healing status, error banner, template chip, and attached images.
 * 
 * Extracted from ChatPanel.tsx to reduce rendering JSX size.
 */

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck, Wand2, X } from "lucide-react";
import type { PageTemplate } from "@/lib/pageTemplates";

interface ChatStatusBannersProps {
  // Self-healing
  isHealing: boolean;
  healingStatus: string;
  // Errors
  previewErrors: string[];
  isLoading: boolean;
  healAttempts: number;
  maxHealAttempts: number;
  onAutoFix: () => void;
  onResetAndFix: () => void;
  // Template
  selectedTemplate: PageTemplate | null;
  onClearTemplate: () => void;
  // Images
  attachedImages: string[];
  onRemoveImage: (index: number) => void;
}

export default function ChatStatusBanners({
  isHealing, healingStatus,
  previewErrors, isLoading, healAttempts, maxHealAttempts,
  onAutoFix, onResetAndFix,
  selectedTemplate, onClearTemplate,
  attachedImages, onRemoveImage,
}: ChatStatusBannersProps) {
  return (
    <>
      {/* Self-healing status */}
      <AnimatePresence>
        {isHealing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-primary/30 bg-primary/5 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />
              <span className="text-xs text-primary font-medium">{healingStatus}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {previewErrors.length > 0 && !isLoading && !isHealing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-destructive/30 bg-destructive/5 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                <span className="text-xs text-destructive truncate">
                  {previewErrors.length} error{previewErrors.length > 1 ? "s" : ""} detected
                  {healAttempts > 0 && healAttempts < maxHealAttempts && (
                    <span className="ml-1 text-muted-foreground">· auto-fixing in 5s ({healAttempts}/{maxHealAttempts} attempts)</span>
                  )}
                  {healAttempts >= maxHealAttempts && (
                    <span className="ml-1 text-muted-foreground">· max retries reached</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {healAttempts >= maxHealAttempts && (
                  <button
                    onClick={onResetAndFix}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Retry
                  </button>
                )}
                <button
                  onClick={onAutoFix}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  Fix now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected template chip */}
      <AnimatePresence>
        {selectedTemplate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border px-3 py-1.5"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-medium">
              <span>{selectedTemplate.emoji}</span>
              <span>Template: {selectedTemplate.name}</span>
              <button onClick={onClearTemplate} className="ml-1 hover:text-primary/70 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attached images preview */}
      <AnimatePresence>
        {attachedImages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border px-3 py-2"
          >
            <div className="flex gap-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative group"
                >
                  <img src={img} alt="Attached" className="w-16 h-16 object-cover rounded-xl border border-border shadow-sm" />
                  <button
                    onClick={() => onRemoveImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
