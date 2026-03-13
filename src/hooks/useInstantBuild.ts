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

    // Inject shared UI component library + design tokens (matches Lovable's file count)
    const { getSharedUIComponents, getGlobalStyles, getUseApiHook } = await import("@/lib/templates/scaffoldTemplates");
    const uiComponents = getSharedUIComponents();
    const files: Record<string, string> = { ...templateFiles };
    
    // Add UI components (don't overwrite template-specific files)
    for (const [path, code] of Object.entries(uiComponents)) {
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
    
    console.log(`[InstantBuild] Enriched template: ${Object.keys(templateFiles).length} → ${Object.keys(files).length} files`);

    setSandpackFiles(files);
    syncSandpackToVirtualFS(files);
    if (Object.keys(deps).length > 0) setSandpackDeps(deps);
    setPreviewMode("sandpack");

    const fileCount = Object.keys(files).length;
    const instantMsg = `⚡ **Instant Preview** — ${fileCount} files rendered in under 1 second!\n\nYour ${templateName} is ready. I'm now polishing the content based on your prompt...`;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: instantMsg } : m));
      }
      return [...prev, { role: "assistant", content: instantMsg, timestamp: Date.now() }];
    });

    // Persist instant template
    const payload = { files, deps };
    supabase
      .from("project_data")
      .upsert(
        { project_id: buildProjectId, collection: "sandpack_state", data: payload as any },
        { onConflict: "project_id,collection" }
      )
      .then(({ error }) => {
        if (error) console.warn("[InstantBuild] Persist failed:", error);
      });

    // Polish with AI
    setBuildStep("🎨 AI is customizing your content...");
    setPipelineStep("generating");

    const themeInfo = DESIGN_THEMES.find(t => t.id === selectedTheme);
    const polishContext = `## INSTANT TEMPLATE LOADED
The user already sees a live preview of a ${templateName} template. Your job is to CUSTOMIZE the existing template files with the user's specific content, branding, and requirements.

## USER REQUEST
"${userText}"

## CURRENT FILES (already rendered)
${Object.entries(files).map(([path, code]) => `--- ${path}\n${code}`).join("\n\n")}

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
      model: "google/gemini-3-flash-preview",
      designTheme: themeInfo?.prompt,
      templateContext: templateCtx || undefined,
      irContext: irContext || undefined,
      onDelta: upsert,
      onDone: async (responseText) => {
        const reactResult = parseReactFiles(responseText);
        if (reactResult.files && Object.keys(reactResult.files).length > 0) {
          let hasErrors = false;
          try {
            const { transform } = await import("sucrase");
            for (const [fPath, fCode] of Object.entries(reactResult.files)) {
              if (fPath.match(/\.(jsx?|tsx?)$/)) {
                try {
                  transform(fCode, { transforms: ["jsx", "imports"], filePath: fPath });
                } catch {
                  hasErrors = true;
                  break;
                }
                // Auto-create stubs for missing imports
                const importPathRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?["'](\.[^"']+)["']/g;
                let m;
                while ((m = importPathRegex.exec(fCode)) !== null) {
                  const importPath = m[1];
                  const currentDir = fPath.substring(0, fPath.lastIndexOf("/")) || "";
                  let resolved = importPath.startsWith("./") ? currentDir + importPath.substring(1) : importPath;
                  if (importPath.startsWith("../")) {
                    const parts = currentDir.split("/").filter(Boolean);
                    let relParts = importPath.split("/");
                    while (relParts[0] === "..") { parts.pop(); relParts.shift(); }
                    resolved = "/" + parts.concat(relParts).join("/");
                  }
                  if (!resolved.startsWith("/")) resolved = "/" + resolved;
                  const exts = ["", ".jsx", ".js", ".tsx", ".ts"];
                  const found = exts.some(ext => reactResult.files![resolved + ext] !== undefined);
                  const indexFound = exts.some(ext => reactResult.files![resolved + "/index" + ext] !== undefined);
                  if (!found && !indexFound) {
                    const segments = resolved.split("/");
                    const compName = segments[segments.length - 1].replace(/\.\w+$/, "");
                    const stubPath = resolved.match(/\.\w+$/) ? resolved : resolved + ".jsx";
                    // Don't overwrite shared UI components that exist in the scaffold template
                    const sharedUIFiles = ["/components/ui/Toast.jsx", "/components/ui/Toast.js", "/components/ui/Spinner.jsx", "/components/ui/DataTable.jsx"];
                    if (sharedUIFiles.some(f => stubPath === f || stubPath.endsWith(f))) {
                      // Import the real component from scaffold templates instead of stubbing
                      const { getSharedUIComponents } = await import("@/lib/templates/scaffoldTemplates");
                      const shared = getSharedUIComponents();
                      if (shared[stubPath]) {
                        reactResult.files![stubPath] = shared[stubPath];
                        console.log("[InstantBuild] Restored shared UI component:", stubPath);
                      }
                    } else if (/^[A-Z]/.test(compName)) {
                      reactResult.files![stubPath] = `import React from "react";\n\nexport default function ${compName}({ children }) {\n  return <div className="p-4">{children || "${compName}"}</div>;\n}\n`;
                      console.log("[InstantBuild] Auto-created stub:", stubPath);
                    } else {
                      reactResult.files![stubPath] = `export default {};\n`;
                      console.log("[InstantBuild] Auto-created stub:", stubPath);
                    }
                  }
                }
              }
            }
          } catch {
            // Sucrase import failed, skip validation
          }

          if (hasErrors) {
            console.warn("[InstantBuild] Polish pass produced broken code, keeping instant template");
          } else {
            // CRITICAL: Merge polished files INTO the enriched template, don't replace.
            // The AI polish pass only returns modified files, so we must preserve
            // the 27+ UI components, globals.css, hooks, etc. from the original set.
            const mergedFiles = { ...files, ...reactResult.files };
            console.log(`[InstantBuild] Merged polish: ${Object.keys(reactResult.files).length} polished + ${Object.keys(files).length} base = ${Object.keys(mergedFiles).length} total`);
            setSandpackFiles(mergedFiles);
            syncSandpackToVirtualFS(mergedFiles);
            if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);

            const polishedPayload = { files: reactResult.files, deps: reactResult.deps || {} };
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
