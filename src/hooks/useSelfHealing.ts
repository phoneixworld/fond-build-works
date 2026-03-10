/**
 * useSelfHealing — Manages runtime error detection and auto-fix loop.
 * Extracted from ChatPanel to reduce monolith complexity.
 * 
 * Responsibilities:
 * - Tracks preview errors from Sandpack console
 * - Auto-triggers self-healing 4s after build completes if errors exist
 * - Limits heal attempts to MAX_HEAL_ATTEMPTS (3)
 * - Provides manual "Fix now" trigger
 * - Builds error context with relevant file snippets
 */

import { useState, useCallback, useEffect, useRef } from "react";

const MAX_HEAL_ATTEMPTS = 3;

interface SelfHealingConfig {
  isBuildingValue: boolean;
  isLoading: boolean;
  sandpackFilesRef: React.RefObject<Record<string, string> | null>;
  isSendingRef: React.RefObject<boolean>;
  isLoadingRef: React.RefObject<boolean>;
  sendMessage: (text: string) => Promise<void> | void;
}

export function useSelfHealing(config: SelfHealingConfig) {
  const { isBuildingValue, isLoading, sandpackFilesRef, isSendingRef, isLoadingRef, sendMessage } = config;

  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [healAttempts, setHealAttempts] = useState(0);
  const [isHealing, setIsHealing] = useState(false);
  const [healingStatus, setHealingStatus] = useState<string>("");
  const postBuildHealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for preview errors from Sandpack
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "preview-error") {
        const errorType = event.data.errorType || "unknown";
        const msg = event.data.message || "Unknown error";
        const enriched = `[${errorType}] ${msg}`;
        setPreviewErrors((prev) => {
          if (prev.includes(enriched)) return prev;
          return [...prev.slice(-9), enriched];
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const triggerSelfHeal = useCallback(() => {
    if (isLoadingRef.current || isHealing || isSendingRef.current || healAttempts >= MAX_HEAL_ATTEMPTS || previewErrors.length === 0) return;
    setIsHealing(true);
    setHealAttempts(prev => prev + 1);
    const attempt = healAttempts + 1;
    setHealingStatus(`Self-healing attempt ${attempt}/${MAX_HEAL_ATTEMPTS}...`);
    const errorSummary = previewErrors.slice(0, 5).join("\n");
    const currentFiles = sandpackFilesRef.current;
    let fileContext = "";
    if (currentFiles) {
      const errorFiles = new Set<string>();
      for (const err of previewErrors) {
        const match = err.match(/\/([\w/.-]+\.\w+)/);
        if (match) errorFiles.add(`/${match[1]}`);
      }
      errorFiles.add("/App.jsx");
      for (const filePath of errorFiles) {
        const code = currentFiles[filePath];
        if (code) {
          fileContext += `\n--- ${filePath} (current) ---\n${code.slice(0, 2000)}\n`;
        }
      }
    }
    const healPrompt = `🔧 AUTO-FIX (attempt ${attempt}/${MAX_HEAL_ATTEMPTS}): The preview detected these runtime errors:\n${errorSummary}\n${fileContext ? `\nRelevant current code:${fileContext}` : ""}\n\nFix ALL these errors. Output the COMPLETE corrected files. Do not skip any file that needs changes.`;
    setPreviewErrors([]);
    Promise.resolve(sendMessage(healPrompt)).finally(() => {
      setIsHealing(false);
      setHealingStatus("");
    });
  }, [isHealing, healAttempts, previewErrors, sendMessage, sandpackFilesRef, isSendingRef, isLoadingRef]);

  // Auto-trigger self-heal 4 seconds after build finishes if errors exist
  useEffect(() => {
    if (postBuildHealTimerRef.current) {
      clearTimeout(postBuildHealTimerRef.current);
      postBuildHealTimerRef.current = null;
    }
    if (!isBuildingValue && !isLoading && previewErrors.length > 0 && healAttempts < MAX_HEAL_ATTEMPTS && !isHealing) {
      postBuildHealTimerRef.current = setTimeout(() => {
        if (previewErrors.length > 0 && !isLoadingRef.current && !isSendingRef.current) {
          console.log(`[SelfHeal] Auto-triggering heal: ${previewErrors.length} error(s) detected post-build`);
          triggerSelfHeal();
        }
      }, 4000);
    }
    return () => {
      if (postBuildHealTimerRef.current) clearTimeout(postBuildHealTimerRef.current);
    };
  }, [isBuildingValue, isLoading, previewErrors.length, healAttempts, isHealing, triggerSelfHeal, isLoadingRef, isSendingRef]);

  const handleAutoFix = useCallback(() => {
    setHealAttempts(0);
    const errorSummary = previewErrors.join("\n");
    sendMessage(`The app preview has these errors, please fix them:\n${errorSummary}`);
  }, [previewErrors, sendMessage]);

  const resetHealing = useCallback(() => {
    setHealAttempts(0);
    setIsHealing(false);
    setHealingStatus("");
    setPreviewErrors([]);
  }, []);

  return {
    previewErrors,
    setPreviewErrors,
    healAttempts,
    setHealAttempts,
    isHealing,
    healingStatus,
    triggerSelfHeal,
    handleAutoFix,
    resetHealing,
    MAX_HEAL_ATTEMPTS,
  };
}
