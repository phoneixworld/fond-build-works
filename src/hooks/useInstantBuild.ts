/**
 * useInstantBuild — Instant template detection, hydration, and AI polish pass.
 * Extracted from useBuildOrchestration to reduce monolith complexity.
 *
 * Handles the "instant path" where a matched template is rendered immediately (<1s)
 * and then polished with AI customization in the background.
 */

import { useCallback } from "react";
import { streamBuildAgent } from "@/lib/agentPipeline";
import { DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { supabase } from "@/integrations/supabase/client";
import { type MsgContent, getTextContent, parseReactFiles } from "@/lib/codeParser";
import type { PageTemplate } from "@/lib/pageTemplates";
import { Workspace } from "@/lib/compiler/workspace";
import { fixMissingImports } from "@/lib/compiler/missingImportFixer";
import { fixExportMismatches } from "@/lib/compiler/exportMismatchFixer";
import { normalizeGeneratedStructure } from "@/lib/compiler/structureNormalizer";

type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number };

export interface InstantBuildConfig {
  currentProject: any;
  saveProject: (data: any) => void;
  setSandpackFiles: (f: any) => void;
  setSandpackDeps: (d: any) => void;
  setPreviewMode: (m: string) => void;
  setIsBuilding: (v: boolean) => void;
  setBuildStep: (s: string) => void;
  setIsLoading: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  setPipelineStep: (step: any) => void;
  setCurrentAgent: (agent: string | null) => void;
  setBuildRetryCount: (v: number | ((prev: number) => number)) => void;
  setBuildStreamContent: (v: string | ((prev: string) => string)) => void;
  messagesRef: React.RefObject<Msg[]>;
  isSendingRef: React.MutableRefObject<boolean>;
  selectedModel: AIModelId;
  selectedTheme: string;
  syncSandpackToVirtualFS: (files: Record<string, string>) => void;
  handleOnError: (err: string) => void;
}

export function useInstantBuild(config: InstantBuildConfig) {
  const {
    currentProject, saveProject,
    setSandpackFiles, setSandpackDeps, setPreviewMode,
    setIsBuilding, setBuildStep, setIsLoading, setMessages,
    setPipelineStep, setCurrentAgent, setBuildRetryCount, setBuildStreamContent,
    messagesRef, isSendingRef, selectedModel, selectedTheme,
    syncSandpackToVirtualFS, handleOnError,
  } = config;

  /**
   * Attempt the instant build path.
   * Returns true if it handled the build (caller should return early).
   * Returns false if no instant template was found.
   */
  const tryInstantBuild = useCallback(async (
    template: PageTemplate | null,
    userText: string,
    schemas: any[],
    irContext: string,
    templateCtx: string,
    buildProjectId: string,
    upsert: (chunk: string) => void,
  ): Promise<boolean> => {
    // Guard: Don't use instant templates for long requirement documents
    // They contain keywords that falsely match templates (e.g. "platform", "system")
    if (userText.length > 3000) {
      console.log("[InstantBuild] Skipping instant path — input too long for template customization");
      return false;
    }

    // Only use instant templates when a specific template was explicitly matched
    // Never default to "saas-landing" — this causes prompt text to render as content
    if (!template) {
      console.log("[InstantBuild] No template matched — skipping instant path, using full AI build");
      return false;
    }

    const { findInstantTemplate, hydrateTemplate } = await import("@/lib/instantTemplates");
    const templateId = template.id;
    const templateName = template.name;
    const instantTemplate = findInstantTemplate(templateId);

    if (!instantTemplate) return false;

    console.log(`[InstantBuild] ⚡ INSTANT PATH: Rendering "${templateName}" in <1s`);
    setBuildStep("⚡ Instant preview loading...");
    setPipelineStep("bundling");

    const promptDesc = userText.replace(/build|create|make|website|app|called|named|beautiful|simple/gi, "").trim();
    const projectName = currentProject.name || "My App";
    const { files: templateFiles, deps } = hydrateTemplate(instantTemplate, projectName, promptDesc || "Build applications at the speed of thought");

    // Inject shared UI + domain components + design tokens
    const { getSharedUIComponents, getDomainComponents, getGlobalStyles, getUseApiHook } = await import("@/lib/templates/scaffoldTemplates");
    const uiComponents = getSharedUIComponents();
    const domainComponents = getDomainComponents();
    const files: Record<string, string> = { ...templateFiles };

    // Add UI components (don't overwrite template-specific files)
    for (const [path, code] of Object.entries(uiComponents)) {
      if (!files[path]) files[path] = code;
    }

    // Add domain component fallbacks (StatCard, StatusBadge, etc.)
    for (const [path, code] of Object.entries(domainComponents)) {
      if (!files[path]) files[path] = code;
    }

    // Add globals.css with full design tokens if not already present
    if (!files["/styles/globals.css"] || files["/styles/globals.css"].length < 500) {
      files["/styles/globals.css"] = getGlobalStyles();
    }

    // Add useApi hook
    if (!files["/hooks/useApi.js"]) {
      files["/hooks/useApi.js"] = getUseApiHook();
    }

    console.log(`[InstantBuild] Enriched template: ${Object.keys(templateFiles).length} → ${Object.keys(files).length} files`);

    setSandpackFiles(files);
    syncSandpackToVirtualFS(files);
    if (Object.keys(deps).length > 0) setSandpackDeps(deps);
    setPreviewMode("sandpack");
...
            // CRITICAL: Merge polished files INTO the enriched template, don't replace.
            // The AI polish pass only returns modified files, so we must preserve
            // the pre-scaffolded components, globals.css, hooks, etc.
            const mergedFiles = { ...files, ...reactResult.files };

            // Deterministic stabilization pass for instant builds (matches compiler pipeline)
            const repairWorkspace = new Workspace(mergedFiles);
            const missingImportFixes = fixMissingImports(repairWorkspace);
            const exportFixes = fixExportMismatches(repairWorkspace);
            const structureFixes = normalizeGeneratedStructure(repairWorkspace);
            const stabilizedFiles = repairWorkspace.toRecord();

            console.log(
              `[InstantBuild] Merged polish: ${Object.keys(reactResult.files).length} polished + ${Object.keys(files).length} base = ${Object.keys(stabilizedFiles).length} total (imports=${missingImportFixes}, exports=${exportFixes}, structure=${structureFixes})`
            );

            setSandpackFiles(stabilizedFiles);
            syncSandpackToVirtualFS(stabilizedFiles);
            if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);

            const polishedPayload = { files: stabilizedFiles, deps: { ...deps, ...(reactResult.deps || {}) } };
            supabase
              .from("project_data")
              .upsert(
                { project_id: buildProjectId, collection: "sandpack_state", data: polishedPayload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => { if (error) console.warn("Polish persist error:", error); });
          }

          const polishedMsg = reactResult.chatText || `✅ **${templateName} customized!** Your site is ready with personalized content.`;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: polishedMsg } : m));
            }
            return [...prev, { role: "assistant", content: polishedMsg, timestamp: Date.now() }];
          });
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const msg = `✅ **${templateName} is ready!** Your site is live with all sections.`;
            if (last?.role === "assistant") {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
            }
            return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
          });
        }

        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        setPipelineStep("complete");
        setCurrentAgent(null);
        isSendingRef.current = false;
        setBuildRetryCount(0);
        setTimeout(() => setBuildStreamContent(""), 3000);

        const persistMessages = messagesRef.current.map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : getTextContent(m.content),
        }));
        saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });
      },
      onError: handleOnError,
    });

    return true;
  }, [currentProject, saveProject, setSandpackFiles, setSandpackDeps, setPreviewMode,
      setIsBuilding, setBuildStep, setIsLoading, setMessages, setPipelineStep,
      setCurrentAgent, setBuildRetryCount, setBuildStreamContent, messagesRef,
      isSendingRef, selectedModel, selectedTheme, syncSandpackToVirtualFS, handleOnError]);

  return { tryInstantBuild };
}
