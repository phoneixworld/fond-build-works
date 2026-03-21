/**
 * useSelfHealing — Manages runtime error detection and auto-fix loop.
 * 
 * Enhanced with:
 * - Smarter error deduplication and categorization
 * - Better file context extraction from error messages
 * - Targeted fix prompts based on error type
 * - Auto-heal with rate limiting (prevents infinite loops)
 */

import { useState, useCallback, useEffect, useRef } from "react";

const MAX_HEAL_ATTEMPTS = 3;
const HEAL_COOLDOWN_MS = 10000; // Minimum 10s between auto-heal attempts

interface SelfHealingConfig {
  isBuildingValue: boolean;
  isLoading: boolean;
  sandpackFilesRef: React.RefObject<Record<string, string> | null>;
  isSendingRef: React.RefObject<boolean>;
  isLoadingRef: React.RefObject<boolean>;
  sendMessage: (text: string) => Promise<void> | void;
}

/** Categorize errors for better fix prompts */
interface CategorizedError {
  type: "import" | "export" | "syntax" | "runtime" | "render" | "unknown";
  message: string;
  file?: string;
  identifier?: string;
}

function categorizeError(error: string): CategorizedError {
  // "Module not found" or "Cannot find module"
  if (/module\s+not\s+found|cannot\s+find\s+module/i.test(error)) {
    const fileMatch = error.match(/['"]([^'"]+)['"]/);
    return { type: "import", message: error, file: fileMatch?.[1] };
  }

  // "Element type is invalid"
  if (/element\s+type\s+is\s+invalid/i.test(error)) {
    const compMatch = error.match(/type\s+(?:of|is)\s+(?:the\s+)?(?:element|component)\s+['"]?(\w+)/i);
    return { type: "export", message: error, identifier: compMatch?.[1] };
  }

  // Duplicate symbol export/declaration
  if (/already\s+been\s+(?:declared|exported)/i.test(error)) {
    const idMatch =
      error.match(/Identifier\s+['"`](\w+)['"`]/i)?.[1] ||
      error.match(/`(\w+)`\s+has\s+already\s+been\s+exported/i)?.[1];
    const fileMatch = error.match(/\/([^\s:]+\.\w+)/);
    return { type: "syntax", message: error, identifier: idMatch, file: fileMatch?.[1] };
  }

  // "X is not defined" or "X is not a function"
  if (/is\s+not\s+(?:defined|a\s+function)/i.test(error)) {
    const idMatch = error.match(/(\w+)\s+is\s+not/);
    const fileMatch = error.match(/\/([^\s:]+\.\w+)/);
    const identifier = idMatch?.[1];
    // In Sandpack classic JSX runtime, missing React import appears as "React is not defined".
    if (identifier === "React") {
      return { type: "import", message: error, identifier, file: fileMatch?.[1] };
    }
    return { type: "runtime", message: error, identifier, file: fileMatch?.[1] };
  }

  // "Cannot read properties of null/undefined"
  if (/cannot\s+read\s+propert/i.test(error)) {
    return { type: "render", message: error };
  }

  // SyntaxError
  if (/SyntaxError/i.test(error)) {
    const fileMatch = error.match(/\/([^\s:]+\.\w+)/);
    return { type: "syntax", message: error, file: fileMatch?.[1] };
  }

  return { type: "unknown", message: error };
}

function buildSmartFixPrompt(errors: CategorizedError[], fileContext: string, attempt: number): string {
  const errorsByType = new Map<string, CategorizedError[]>();
  for (const err of errors) {
    const list = errorsByType.get(err.type) || [];
    list.push(err);
    errorsByType.set(err.type, list);
  }

  const parts: string[] = [];
  parts.push(`🔧 AUTO-FIX (attempt ${attempt}/${MAX_HEAL_ATTEMPTS}):`);
  parts.push("");

  if (errorsByType.has("syntax")) {
    const syntaxErrs = errorsByType.get("syntax")!;
    parts.push("**SYNTAX ERRORS** (fix these first — they block everything else):");
    for (const err of syntaxErrs) {
      parts.push(`- ${err.message}`);
      if (err.identifier) parts.push(`  → Identifier '${err.identifier}' is declared/exported twice. Remove the duplicate declaration/export.`);
      if (err.file) parts.push(`  → In file: ${err.file}`);
    }
    parts.push("");
  }

  if (errorsByType.has("import")) {
    const importErrs = errorsByType.get("import")!;
    parts.push("**MISSING IMPORTS** (files that can't be found):");
    for (const err of importErrs) {
      parts.push(`- ${err.message}`);
      if (err.identifier === "React") {
        parts.push("  → Add `import React from \"react\";` at the top of JSX files that use JSX");
      } else if (err.file) {
        parts.push("  → Create the missing file or fix the import path");
      }
    }
    parts.push("");
  }

  if (errorsByType.has("export")) {
    const exportErrs = errorsByType.get("export")!;
    parts.push("**EXPORT MISMATCHES** (component type is invalid):");
    for (const err of exportErrs) {
      parts.push(`- ${err.message}`);
      if (err.identifier) parts.push(`  → Check that ${err.identifier} has the correct export (default vs named)`);
    }
    parts.push("");
  }

  for (const [type, errs] of errorsByType) {
    if (["syntax", "import", "export"].includes(type)) continue;
    parts.push(`**RUNTIME ERRORS**:`);
    for (const err of errs) {
      parts.push(`- ${err.message}`);
    }
    parts.push("");
  }

  if (fileContext) {
    parts.push("**Current code for relevant files:**");
    parts.push(fileContext);
  }

  parts.push("");
  parts.push("Fix ALL errors. Output COMPLETE corrected files. Do not skip any file that needs changes.");
  parts.push("CRITICAL: Check for duplicate import blocks, duplicate function declarations, and duplicate exports before outputting.");

  return parts.join("\n");
}

export function useSelfHealing(config: SelfHealingConfig) {
  const { isBuildingValue, isLoading, sandpackFilesRef, isSendingRef, isLoadingRef, sendMessage } = config;

  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [healAttempts, setHealAttempts] = useState(0);
  const [isHealing, setIsHealing] = useState(false);
  const [healingStatus, setHealingStatus] = useState<string>("");
  const lastHealTimeRef = useRef<number>(0);

  // Listen for preview errors from Sandpack/Vite/iframe bridge
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "preview-error") {
        const msg = event.data.message || event.data.msg || "Unknown error";
        const errorType = event.data.errorType || (/syntax|unexpected token|already been (?:declared|exported)/i.test(msg) ? "syntax" : "unknown");
        const enriched = `[${errorType}] ${msg}`;
        setPreviewErrors((prev) => {
          if (prev.includes(enriched)) return prev;
          // Keep only unique errors, max 10
          return [...prev.slice(-9), enriched];
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const triggerSelfHeal = useCallback(() => {
    const now = Date.now();
    if (isLoadingRef.current || isHealing || isSendingRef.current) return;
    if (healAttempts >= MAX_HEAL_ATTEMPTS) return;
    if (previewErrors.length === 0) return;
    if (now - lastHealTimeRef.current < HEAL_COOLDOWN_MS) return;

    setIsHealing(true);
    lastHealTimeRef.current = now;
    const attempt = healAttempts + 1;
    setHealAttempts(attempt);
    setHealingStatus(`Self-healing attempt ${attempt}/${MAX_HEAL_ATTEMPTS}...`);

    // Categorize errors for smarter fix prompts
    const categorized = previewErrors.slice(0, 8).map(categorizeError);

    // Extract relevant file context
    const currentFiles = sandpackFilesRef.current;
    let fileContext = "";
    if (currentFiles) {
      const errorFiles = new Set<string>();
      
      // Extract files from errors
      for (const err of categorized) {
        if (err.file) errorFiles.add(err.file.startsWith("/") ? err.file : `/${err.file}`);
      }
      
      // Also extract from raw messages
      for (const err of previewErrors) {
        const match = err.match(/\/([\w/.-]+\.\w+)/);
        if (match) errorFiles.add(`/${match[1]}`);
      }
      
      // Always include App.jsx
      errorFiles.add("/App.jsx");

      for (const filePath of errorFiles) {
        const code = currentFiles[filePath];
        if (code) {
          fileContext += `\n--- ${filePath} (current) ---\n${code.slice(0, 3000)}\n`;
        }
      }
    }

    const healPrompt = buildSmartFixPrompt(categorized, fileContext, attempt);
    setPreviewErrors([]);
    
    Promise.resolve(sendMessage(healPrompt)).finally(() => {
      setIsHealing(false);
      setHealingStatus("");
    });
  }, [isHealing, healAttempts, previewErrors, sendMessage, sandpackFilesRef, isSendingRef, isLoadingRef]);

  // Auto-run self-heal when preview errors appear and build is idle
  useEffect(() => {
    if (isBuildingValue || isLoading) return;
    if (previewErrors.length === 0) return;
    triggerSelfHeal();
  }, [previewErrors, isBuildingValue, isLoading, triggerSelfHeal]);

  const handleAutoFix = useCallback(() => {
    setHealAttempts(0);
    lastHealTimeRef.current = 0;
    
    const categorized = previewErrors.map(categorizeError);
    const currentFiles = sandpackFilesRef.current;
    let fileContext = "";
    if (currentFiles) {
      const errorFiles = new Set<string>();
      for (const err of categorized) {
        if (err.file) errorFiles.add(err.file.startsWith("/") ? err.file : `/${err.file}`);
      }
      for (const err of previewErrors) {
        const match = err.match(/\/([\w/.-]+\.\w+)/);
        if (match) errorFiles.add(`/${match[1]}`);
      }
      errorFiles.add("/App.jsx");
      for (const filePath of errorFiles) {
        const code = currentFiles[filePath];
        if (code) fileContext += `\n--- ${filePath} ---\n${code.slice(0, 3000)}\n`;
      }
    }

    const prompt = buildSmartFixPrompt(categorized, fileContext, 1);
    sendMessage(prompt);
  }, [previewErrors, sendMessage, sandpackFilesRef]);

  const resetHealing = useCallback(() => {
    setHealAttempts(0);
    setIsHealing(false);
    setHealingStatus("");
    setPreviewErrors([]);
    lastHealTimeRef.current = 0;
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
