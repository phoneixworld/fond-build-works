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
    currentProject,
    saveProject,
    setSandpackFiles,
    setSandpackDeps,
    setPreviewMode,
    setIsBuilding,
    setBuildStep,
    setIsLoading,
    setMessages,
    setPipelineStep,
    setCurrentAgent,
    setBuildRetryCount,
    setBuildStreamContent,
    messagesRef,
    isSendingRef,
    selectedModel,
    selectedTheme,
    syncSandpackToVirtualFS,
    handleOnError,
  } = config;

  const tryInstantBuild = useCallback(
    async (
      template: PageTemplate | null,
      userText: string,
      schemas: any[],
      irContext: string,
      templateCtx: string,
      buildProjectId: string,
      upsert: (chunk: string) => void,
    ): Promise<boolean> => {
      // Guard: Don't use instant templates for long requirement documents
      if (userText.length > 3000) {
        console.log("[InstantBuild] Skipping instant path — input too long for template customization");
        return false;
      }

      // Only use instant templates when a specific template was explicitly matched
      if (!template) {
        console.log("[InstantBuild] No template matched — skipping instant path, using full AI build");
        return false;
      }

      const capturedProjectId = buildProjectId;

      let files: Record<string, string>;
      let deps: Record<string, string>;
      const templateName = template.name;

      try {
        const { findInstantTemplate, hydrateTemplate } = await import("@/lib/instantTemplates");
        const instantTemplate = findInstantTemplate(template.id);
        if (!instantTemplate) {
          console.log("[InstantBuild] No instant template variant found — falling back to full build");
          return false;
        }

        console.log(`[InstantBuild] ⚡ INSTANT PATH: Rendering "${templateName}" in <1s`);
        setBuildStep("⚡ Instant preview loading...");
        setPipelineStep("bundling");

        // Keep only leading scaffolding verbs out of the description; preserve style/constraints
        const promptDesc = userText.replace(/^\s*(build|create|make)\s+/i, "").trim();
        const projectName = currentProject.name || "My App";

        const hydrated = hydrateTemplate(
          instantTemplate,
          projectName,
          promptDesc || "Build applications at the speed of thought",
        );
        const templateFiles = hydrated.files;
        deps = hydrated.deps;

        const { getSharedUIComponents, getDomainComponents, getGlobalStyles, getUseApiHook } =
          await import("@/lib/templates/scaffoldTemplates");

        const uiComponents = getSharedUIComponents();
        const domainComponents = getDomainComponents();
        files = { ...templateFiles };

        // Add UI components (don't overwrite template-specific files)
        for (const [path, code] of Object.entries(uiComponents)) {
          if (!files[path]) {
            files[path] = code;
          }
        }

        // Add domain component fallbacks
        for (const [path, code] of Object.entries(domainComponents)) {
          if (!files[path]) {
            files[path] = code;
          }
        }

        // Add globals.css with full design tokens if not already present
        if (!files["/styles/globals.css"] || files["/styles/globals.css"].length < 500) {
          files["/styles/globals.css"] = getGlobalStyles();
        }

        // Add useApi hook
        if (!files["/hooks/useApi.js"]) {
          files["/hooks/useApi.js"] = getUseApiHook();
        }
      } catch (err) {
        console.error("[InstantBuild] Instant path failed, falling back to full build:", err);
        return false;
      }

      console.log(`[InstantBuild] Enriched template: ${Object.keys(files).length} files`);

      setSandpackFiles(files);
      syncSandpackToVirtualFS(files);
      if (Object.keys(deps).length > 0) setSandpackDeps(deps);
      setPreviewMode("sandpack");

      const fileCount = Object.keys(files).length;
      const instantMsg =
        `⚡ **Instant Preview** — ${fileCount} files rendered in under 1 second!\n\n` +
        `Your ${templateName} is ready. I'm now polishing the content based on your prompt...`;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: instantMsg } : m));
        }
        return [...prev, { role: "assistant", content: instantMsg, timestamp: Date.now() }];
      });

      // Persist instant template (recoverable state)
      const payload = { files, deps };
      supabase
        .from("project_data")
        .upsert(
          { project_id: buildProjectId, collection: "sandpack_state", data: payload as any },
          { onConflict: "project_id,collection" },
        )
        .then(({ error }) => {
          if (error) console.warn("[InstantBuild] Persist failed:", error);
        });

      // Polish with AI
      setBuildStep("🎨 AI is customizing your content...");
      setPipelineStep("generating");

      const themeInfo = DESIGN_THEMES.find((t) => t.id === selectedTheme);

      // Token-budgeted file summary for polish context
      const MAX_CHARS = 20000;
      let remaining = MAX_CHARS;
      const fileSummaries: string[] = [];

      for (const [path, code] of Object.entries(files)) {
        if (remaining <= 0) break;
        const sliceLen = Math.max(200, Math.floor(remaining * 0.6));
        const snippet = code.slice(0, sliceLen);
        remaining -= snippet.length;
        const truncated = code.length > snippet.length;
        fileSummaries.push(
          `--- ${path}\n${snippet}${truncated ? `\n...[truncated — ${code.length} chars total]` : ""}`,
        );
      }

      const polishContext = `## INSTANT TEMPLATE LOADED
The user already sees a live preview of a ${templateName} template. Your job is to CUSTOMIZE the existing template files with the user's specific content, branding, and requirements.

## USER REQUEST
"${userText}"

## CURRENT FILES (already rendered, summarized)
${fileSummaries.join("\n\n")}

## INSTRUCTIONS
1. Keep the EXACT same file structure and component architecture
2. Customize ALL placeholder text to match the user's specific request
3. Adjust colors, content, and details to fit their brand/idea
4. Output ALL files (even unchanged ones) in \`\`\`react-preview format
5. Do NOT add new files unless necessary — focus on content customization`;

      await streamBuildAgent({
        messages: [{ role: "user" as const, content: polishContext }],
        projectId: buildProjectId,
        techStack: currentProject.tech_stack || "react-cdn",
        schemas,
        model: selectedModel ?? "google/gemini-2.5-flash",
        designTheme: themeInfo?.prompt,
        templateContext: templateCtx || undefined,
        irContext: irContext || undefined,
        onDelta: (chunk) => {
          // If project switched mid-polish, ignore further deltas
          if (capturedProjectId !== currentProject?.id) return;
          upsert(chunk);
        },
        onDone: async (responseText) => {
          // Guard against project switch during polish
          if (capturedProjectId !== currentProject?.id) {
            console.warn("[InstantBuild] Project switched during polish, discarding result");
            isSendingRef.current = false;
            return;
          }

          const reactResult = parseReactFiles(responseText);
          if (reactResult.files && Object.keys(reactResult.files).length > 0) {
            // Merge polished files into enriched template
            const mergedFiles = { ...files, ...reactResult.files };

            // Deterministic stabilization pass (imports/exports/structure)
            const repairWorkspace = new Workspace(mergedFiles);
            const importFixes = fixMissingImports(repairWorkspace);
            const exportFixes = fixExportMismatches(repairWorkspace);
            const structureFixes = normalizeGeneratedStructure(repairWorkspace);
            const stabilizedFiles = repairWorkspace.toRecord();

            console.log(
              `[InstantBuild] Merged polish: ${Object.keys(reactResult.files).length} polished + ` +
                `${Object.keys(files).length} base = ${Object.keys(stabilizedFiles).length} total ` +
                `(imports=${importFixes}, exports=${exportFixes}, structure=${structureFixes})`,
            );

            setSandpackFiles(stabilizedFiles);
            syncSandpackToVirtualFS(stabilizedFiles);
            if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);

            const polishedPayload = {
              files: stabilizedFiles,
              deps: { ...deps, ...(reactResult.deps || {}) },
            };
            supabase
              .from("project_data")
              .upsert(
                { project_id: buildProjectId, collection: "sandpack_state", data: polishedPayload as any },
                { onConflict: "project_id,collection" },
              )
              .then(({ error }) => {
                if (error) console.warn("[InstantBuild] Polish persist error:", error);
              });

            const polishedMsg =
              reactResult.chatText ||
              `✅ **${templateName} customized!** Your site is ready with personalized content.`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: polishedMsg } : m));
              }
              return [...prev, { role: "assistant", content: polishedMsg, timestamp: Date.now() }];
            });
          } else {
            const msg = `✅ **${templateName} is ready!** Your site is live with all sections.`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
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

          const persistMessages = messagesRef.current.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });
        },
        onError: (err) => {
          // handleOnError already resets isSendingRef and pipeline state
          handleOnError(err);
        },
      });

      return true;
    },
    [
      currentProject,
      saveProject,
      setSandpackFiles,
      setSandpackDeps,
      setPreviewMode,
      setIsBuilding,
      setBuildStep,
      setIsLoading,
      setMessages,
      setPipelineStep,
      setCurrentAgent,
      setBuildRetryCount,
      setBuildStreamContent,
      messagesRef,
      isSendingRef,
      selectedModel,
      selectedTheme,
      syncSandpackToVirtualFS,
      handleOnError,
    ],
  );

  return { tryInstantBuild };
}
