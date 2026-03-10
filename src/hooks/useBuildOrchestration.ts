/**
 * useBuildOrchestration — Manages build engine invocation, streaming, retries, safety timeouts.
 * Extracted from ChatPanel to reduce monolith complexity.
 *
 * Sub-hooks:
 * - useChatAgent: chat-only agent flow (no code generation)
 * - useInstantBuild: instant template detection, hydration, and AI polish
 *
 * Responsibilities:
 * - sendMessage: core build agent flow (context fetch, streaming, onDone, retries)
 * - handleSmartSend: intent routing (fast-classify → chat or build)
 * - clearChat: full state reset
 * - Safety timeout (300s)
 * - Abort controller management
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { streamBuildAgent, validateReactCode, formatRetryContext, MAX_BUILD_RETRIES, type AgentIntent, type PipelineStep } from "@/lib/agentPipeline";
import { runBuildEngine, type EngineConfig, type EngineProgress } from "@/lib/buildEngine";
import { matchTemplate, type PageTemplate } from "@/lib/pageTemplates";
import { getSnippetsPromptContext } from "@/lib/componentSnippets";
import { DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { supabase } from "@/integrations/supabase/client";
import { toExportPath } from "@/lib/pathNormalizer";
import { StreamingPreviewController } from "@/lib/streamingPreview";
import {
  type MsgContent,
  getTextContent,
  parseResponse,
  parseReactFiles,
  postProcessHtml,
} from "@/lib/codeParser";
import { parseMultiFileOutput } from "@/contexts/VirtualFSContext";
import { useChatAgent, type ChatAgentConfig } from "@/hooks/useChatAgent";
import { useInstantBuild, type InstantBuildConfig } from "@/hooks/useInstantBuild";
import { triggerBuild } from "@/lib/buildPipelineService";

type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number };

export interface BuildOrchestrationConfig {
  // Project
  currentProject: any;
  saveProject: (data: any) => void;
  onVersionCreated?: (version: any) => void;

  // Preview context setters
  setPreviewHtml: (html: string) => void;
  setIsBuilding: (v: boolean) => void;
  setBuildStep: (s: string) => void;
  setSandpackFiles: (f: any) => void;
  setSandpackDeps: (d: any) => void;
  setPreviewMode: (m: string) => void;
  setBuildMetrics: (m: any) => void;
  saveSnapshot: (label: string) => void;
  currentPreviewHtml: string;
  currentSandpackFiles: Record<string, string> | null;

  // VirtualFS
  setVirtualFiles: (f: any) => void;

  // Messages
  messages: Msg[];
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;

  // UI state
  setInput: (s: string) => void;
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  setPreviewErrors: React.Dispatch<React.SetStateAction<string[]>>;
  setHealAttempts: (n: number) => void;
  resetHealing: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;

  // Model/theme
  selectedModel: AIModelId;
  selectedTheme: string;

  // Hooks
  fetchProjectContext: (pid: string) => Promise<{ schemas: any[]; knowledge: string[]; irContext: string }>;
  classifyUserIntent: (prompt: string) => Promise<{ intent: AgentIntent; questions?: any[] } | null>;
  fastClassifyLocal: (text: string) => AgentIntent | null;
}

export function useBuildOrchestration(config: BuildOrchestrationConfig) {
  const {
    currentProject, saveProject, onVersionCreated,
    setPreviewHtml, setIsBuilding, setBuildStep, setSandpackFiles, setSandpackDeps,
    setPreviewMode, setBuildMetrics, saveSnapshot, currentPreviewHtml, currentSandpackFiles,
    setVirtualFiles, messages, setMessages, setInput, setAttachedImages, setPreviewErrors,
    setHealAttempts, resetHealing, inputRef,
    selectedModel, selectedTheme,
    fetchProjectContext, classifyUserIntent, fastClassifyLocal,
  } = config;

  const [buildStreamContent, setBuildStreamContent] = useState("");
  const [buildRetryCount, setBuildRetryCount] = useState(0);
  const [currentAgent, setCurrentAgent] = useState<AgentIntent | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [pendingBuildPrompt, setPendingBuildPrompt] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [totalPlanTasks, setTotalPlanTasks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PageTemplate | null>(null);

  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const buildSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sandpackFilesRef = useRef<Record<string, string> | null>(null);
  sandpackFilesRef.current = currentSandpackFiles;
  const streamingControllerRef = useRef<StreamingPreviewController | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);

  // Keep lastProjectIdRef synced
  useEffect(() => {
    if (currentProject?.id) {
      lastProjectIdRef.current = currentProject.id;
    } else {
      lastProjectIdRef.current = null;
    }
  }, [currentProject?.id]);

  // Auto-clear safety timeout when isBuilding goes false
  useEffect(() => {
    if (!isLoading && buildSafetyTimeoutRef.current) {
      clearTimeout(buildSafetyTimeoutRef.current);
      buildSafetyTimeoutRef.current = null;
    }
  }, [isLoading]);

  const syncSandpackToVirtualFS = useCallback((sandpackFiles: Record<string, string>) => {
    const virtualFiles: Record<string, { path: string; content: string; language: string }> = {};
    for (const [path, content] of Object.entries(sandpackFiles)) {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      const displayPath = toExportPath(cleanPath);
      const ext = displayPath.split(".").pop()?.toLowerCase() || "";
      const langMap: Record<string, string> = {
        tsx: "typescript", ts: "typescript", jsx: "javascript", js: "javascript",
        css: "css", html: "html", json: "json",
      };
      virtualFiles[displayPath] = { path: displayPath, content, language: langMap[ext] || "text" };
    }
    setVirtualFiles(virtualFiles);
  }, [setVirtualFiles]);

  const buildMessageContent = useCallback((text: string, images: string[]): MsgContent => {
    if (images.length === 0) return text;
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    parts.push({ type: "text", text });
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    return parts;
  }, []);

  // ─── Shared error handler ───
  const handleOnError = useCallback((err: string) => {
    setMessages((prev) => [...prev, { role: "assistant" as const, content: `⚠️ ${err}`, timestamp: Date.now() }]);
    setIsLoading(false);
    setIsBuilding(false);
    setBuildStep("");
    setPipelineStep("error");
    setCurrentAgent(null);
    isSendingRef.current = false;
    streamingControllerRef.current?.stop();
    streamingControllerRef.current = null;
  }, [setMessages, setIsBuilding, setBuildStep]);

  // ─── Sub-hooks ───
  const { sendChatMessage } = useChatAgent({
    currentProject, saveProject, setMessages, setInput, setAttachedImages,
    setBuildStep, setPipelineStep, setCurrentAgent, setPendingBuildPrompt,
    setIsLoading, messagesRef, isSendingRef, isLoadingRef, buildMessageContent,
  } as ChatAgentConfig);

  const { tryInstantBuild } = useInstantBuild({
    currentProject, saveProject, setSandpackFiles, setSandpackDeps, setPreviewMode,
    setIsBuilding, setBuildStep, setIsLoading, setMessages, setPipelineStep,
    setCurrentAgent, setBuildRetryCount, setBuildStreamContent,
    messagesRef, isSendingRef, selectedModel, selectedTheme,
    syncSandpackToVirtualFS, handleOnError,
  } as InstantBuildConfig);

  // Auto-trigger build agent when chat agent confirms a build
  useEffect(() => {
    if (pendingBuildPrompt && !isLoadingRef.current && !isSendingRef.current) {
      const prompt = pendingBuildPrompt;
      setPendingBuildPrompt(null);
      setCurrentAgent("build");
      setPipelineStep("planning");
      sendMessage(prompt);
    }
  }, [pendingBuildPrompt]);

  // ─── Core build message handler ───
  const sendMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!text || !currentProject) return;
    if (isSendingRef.current || isLoadingRef.current) {
      console.warn("[BuildOrch] Blocked duplicate send while already sending");
      return;
    }
    isSendingRef.current = true;

    if (!text.startsWith("🔧 AUTO-FIX")) {
      setHealAttempts(0);
    }

    const content = buildMessageContent(text, images);
    const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
    setInput("");
    setAttachedImages([]);
    setPreviewErrors([]);
    if (inputRef.current) inputRef.current.style.height = "60px";
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setBuildStreamContent("");
    setIsBuilding(true);
    setBuildStep(images.length > 0 ? "🖼️ Analyzing image..." : "🏗️ Build agent generating code...");
    setPipelineStep("generating");

    // Safety timeout
    if (buildSafetyTimeoutRef.current) clearTimeout(buildSafetyTimeoutRef.current);
    buildSafetyTimeoutRef.current = setTimeout(() => {
      console.warn("[BuildOrch] Build safety timeout — forcing isBuilding=false");
      setIsBuilding(false);
      setIsLoading(false);
      setBuildStep("");
      setPipelineStep(null);
      setCurrentAgent(null);
      isSendingRef.current = false;
      setMessages((prev) => {
        const msg = "⚠️ Build timed out after 5 minutes. The AI model may be under heavy load — please try again, or break the request into smaller steps.";
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
        }
        return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
      });
    }, 300_000);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let fullResponse = "";
    let hasSetAnalyzing = false;
    let hasSetBuilding = false;
    let streamParseCount = 0;

    const upsert = (chunk: string) => {
      if (abortController.signal.aborted) return;
      fullResponse += chunk;
      setBuildStreamContent(fullResponse);

      const reactResult = parseReactFiles(fullResponse);
      const [chatText, htmlCode] = reactResult.files ? [reactResult.chatText, null] : parseResponse(fullResponse);
      const displayChat = reactResult.files ? reactResult.chatText : chatText;

      if (!hasSetAnalyzing && fullResponse.length > 20) {
        setBuildStep("🔨 Build agent: generating components...");
        setPipelineStep("generating");
        hasSetAnalyzing = true;
      }

      if (reactResult.files) {
        if (!hasSetBuilding) {
          const fileNames = Object.keys(reactResult.files);
          const totalChars = Object.values(reactResult.files).join('').length;
          console.log(`[upsert] ✅ First React parse success: files=${fileNames.join(',')}, chars=${totalChars}`);
          setBuildStep("📦 Bundling & validating...");
          setPipelineStep("bundling");
          hasSetBuilding = true;
        }
        streamParseCount++;
        setPreviewMode("sandpack");
      } else if (htmlCode) {
        if (!hasSetBuilding) {
          setBuildStep("Building your app...");
          hasSetBuilding = true;
        }
        setPreviewMode("html");
      }

      setMessages((prev) => {
        const text = displayChat || "Building...";
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: text } : m));
        }
        return [...prev, { role: "assistant", content: text, timestamp: Date.now() }];
      });
    };

    try {
      const { schemas, knowledge, irContext } = await fetchProjectContext(currentProject.id);

      const isFirstMessage = messagesRef.current.filter(m => m.role === "user").length <= 1;
      const hasPersistedHistory = (currentProject.chat_history ?? []).length > 0;
      const shouldIncludeCurrentCode = !isFirstMessage || hasPersistedHistory;

      let currentCodeSummary = "";
      const safeSandpackFiles = sandpackFilesRef.current;
      if (shouldIncludeCurrentCode && safeSandpackFiles && Object.keys(safeSandpackFiles).length > 0) {
        const fileEntries = Object.entries(safeSandpackFiles);
        const totalChars = fileEntries.reduce((sum, [, code]) => sum + code.length, 0);
        if (totalChars <= 16000) {
          currentCodeSummary = fileEntries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
        } else {
          const ENTRY_PATTERNS = ["/App.jsx", "/App.tsx", "/App.js"];
          const keyFiles = fileEntries.filter(([p]) => ENTRY_PATTERNS.some(k => p.endsWith(k)));
          const otherFiles = fileEntries.filter(([p]) => !ENTRY_PATTERNS.some(k => p.endsWith(k)));
          const keyCode = keyFiles.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
          let remainingBudget = 14000 - keyCode.length;
          const otherCode = otherFiles.map(([path, code]) => {
            if (remainingBudget <= 0) return `--- ${path} (${code.length} chars — omitted for token budget)`;
            if (code.length <= remainingBudget) {
              remainingBudget -= code.length;
              return `--- ${path}\n${code}`;
            }
            const snippet = code.slice(0, Math.max(200, Math.floor(remainingBudget * 0.6)));
            remainingBudget = 0;
            return `--- ${path} (${code.length} chars)\n${snippet}\n...[truncated]`;
          }).join("\n\n");
          currentCodeSummary = `${keyCode}\n\n${otherCode}`;
        }
      } else if (shouldIncludeCurrentCode && currentPreviewHtml && currentPreviewHtml.length > 0) {
        currentCodeSummary = currentPreviewHtml.length < 16000
          ? currentPreviewHtml
          : currentPreviewHtml.slice(0, 12000) + `\n...[truncated — ${Math.round(currentPreviewHtml.length / 1000)}k chars total]`;
      }

      const snippetsContext = getSnippetsPromptContext();
      const currentMessages = messagesRef.current;
      const apiMessages = [...currentMessages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const themeInfo = DESIGN_THEMES.find(t => t.id === selectedTheme);
      const userText = typeof text === "string" ? text : "";
      const template = selectedTemplate || (currentMessages.length === 0 ? matchTemplate(userText) : null);
      let templateCtx = "";
      if (template) {
        templateCtx = `## MATCHED TEMPLATE: ${template.name}\n\nUse this as your structural blueprint:\n${template.blueprint}\n\nCustomize the content, colors, and details based on the user's specific request. Do NOT copy the blueprint literally — adapt it creatively.`;
        console.log(`[Template Matched] ${template.emoji} ${template.name}`);
        setSelectedTemplate(null);
      }

      // ─── Shared onDone handler ───
      const handleOnDone = async (responseText: string) => {
        if (abortController.signal.aborted) return;
        fullResponse = responseText;
        console.log(`[BuildOrch:onDone] Response length: ${fullResponse.length}`);

        const reactResult = parseReactFiles(fullResponse);
        let finalHtml: string | null = null;

        if (reactResult.files) {
          setPipelineStep("validating");
          setBuildStep("✅ Validating code...");
          const validation = validateReactCode(reactResult.files);

          if (!validation.valid && buildRetryCount < MAX_BUILD_RETRIES) {
            console.warn(`[BuildOrch:onDone] Validation failed (attempt ${buildRetryCount + 1}):`, validation.errors);
            setPipelineStep("retrying");
            setBuildStep(`🔄 Auto-fixing ${validation.errors.length} issue(s)...`);
            setBuildRetryCount(prev => prev + 1);

            setMessages((prev) => {
              const retryMsg = `⚠️ Found ${validation.errors.length} issue(s), auto-fixing...`;
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: retryMsg } : m));
              }
              return [...prev, { role: "assistant", content: retryMsg, timestamp: Date.now() }];
            });

            const retryContext = formatRetryContext(validation.errors, buildRetryCount + 1);
            let retryFullResponse = "";

            await streamBuildAgent({
              messages: apiMessages,
              projectId: currentProject.id,
              techStack: currentProject.tech_stack || "react-cdn",
              schemas,
              model: selectedModel,
              designTheme: themeInfo?.prompt,
              knowledge,
              currentCode: currentCodeSummary || undefined,
              snippetsContext: snippetsContext || undefined,
              irContext: irContext || undefined,
              retryContext,
              onDelta: (chunk) => {
                retryFullResponse += chunk;
                setBuildStreamContent(retryFullResponse);
              },
              onDone: (retryText) => {
                const retryResult = parseReactFiles(retryText);
                if (retryResult.files) {
                  setSandpackFiles(retryResult.files);
                  syncSandpackToVirtualFS(retryResult.files);
                  if (Object.keys(retryResult.deps).length > 0) setSandpackDeps(retryResult.deps);
                  setPreviewMode("sandpack");

                  const retryChatText = retryResult.chatText || "✅ Fixed and rebuilt successfully";
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: retryChatText } : m));
                    }
                    return prev;
                  });
                }

                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
                setTimeout(() => setBuildStreamContent(""), 3000);

                const persistMessages = messagesRef.current.map(m => ({
                  role: m.role,
                  content: typeof m.content === "string" ? m.content : getTextContent(m.content),
                }));
                saveProject({ chat_history: persistMessages });
              },
              onError: (err) => {
                console.error("[BuildOrch:retry] Retry failed:", err);
                setSandpackFiles(reactResult.files!);
                syncSandpackToVirtualFS(reactResult.files!);
                if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
                setPreviewMode("sandpack");
                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
              },
            });
            return;
          }

          if (!validation.valid) {
            console.warn("[BuildOrch:onDone] Validation warnings (max retries reached):", validation.errors);
          }

          const fileNames = Object.keys(reactResult.files);
          console.log(`[BuildOrch:onDone] ✅ React files:`, fileNames);
          setSandpackFiles(reactResult.files);
          syncSandpackToVirtualFS(reactResult.files);
          if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
          setPreviewMode("sandpack");
          setBuildRetryCount(0);
        } else {
          console.log("[BuildOrch:onDone] No React files — falling back to HTML");
          const { files: parsedFiles, html: htmlCode, chatText } = parseMultiFileOutput(fullResponse);

          if (Object.keys(parsedFiles).length > 0) setVirtualFiles(parsedFiles);
          if (htmlCode) setPreviewHtml(postProcessHtml(htmlCode));
          finalHtml = htmlCode;

          if (!htmlCode && buildRetryCount < MAX_BUILD_RETRIES) {
            console.warn("[BuildOrch:onDone] No code in response — auto-retrying with code generation instruction");
            setBuildStep("🔄 Re-generating with code output...");
            setBuildRetryCount(prev => prev + 1);

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: "⏳ Generating code... (retry)" } : m));
              }
              return prev;
            });

            const retryMessages = [
              ...apiMessages,
              { role: "assistant" as const, content: fullResponse },
              { role: "user" as const, content: "Your previous response did not contain any code. You MUST output complete working React code inside ```react-preview fences with --- /App.jsx file markers. Generate the full application code NOW. Do not describe what you plan to build — just output the code." },
            ];

            let retryFullResponse = "";
            await streamBuildAgent({
              messages: retryMessages,
              projectId: currentProject.id,
              techStack: currentProject.tech_stack || "react-cdn",
              schemas,
              model: selectedModel,
              designTheme: themeInfo?.prompt,
              knowledge,
              currentCode: currentCodeSummary || undefined,
              snippetsContext: snippetsContext || undefined,
              irContext: irContext || undefined,
              onDelta: (chunk) => {
                retryFullResponse += chunk;
                setBuildStreamContent(retryFullResponse);
              },
              onDone: (retryText) => {
                const retryResult = parseReactFiles(retryText);
                if (retryResult.files) {
                  setSandpackFiles(retryResult.files);
                  syncSandpackToVirtualFS(retryResult.files);
                  if (Object.keys(retryResult.deps).length > 0) setSandpackDeps(retryResult.deps);
                  setPreviewMode("sandpack");

                  const retryChatText = retryResult.chatText || "✅ Code generated successfully";
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: retryChatText } : m));
                    }
                    return prev;
                  });
                } else {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    const msg = "⚠️ The AI returned a planning response instead of code. Please try a more specific request like: \"Build the Dashboard and Student Management modules with sidebar navigation\"";
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
                    }
                    return [...prev, { role: "assistant" as const, content: msg, timestamp: Date.now() }];
                  });
                }

                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
                setTimeout(() => setBuildStreamContent(""), 3000);

                const persistMessages = messagesRef.current.map(m => ({
                  role: m.role,
                  content: typeof m.content === "string" ? m.content : getTextContent(m.content),
                }));
                saveProject({ chat_history: persistMessages });
              },
              onError: (err) => {
                console.error("[BuildOrch:code-retry] Retry failed:", err);
                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
              },
            });
            return;
          }

          if (htmlCode && htmlCode.length > 200 && currentMessages.length === 0) {
            setBuildStep("Reviewing & polishing...");
            try {
              const reviewResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-code`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({ html: htmlCode }),
              });
              if (reviewResp.ok) {
                const reviewData = await reviewResp.json();
                if (reviewData.reviewed && reviewData.html && reviewData.html.length > 200) {
                  finalHtml = reviewData.html;
                  setPreviewHtml(postProcessHtml(finalHtml));
                }
              }
            } catch (e) {
              console.warn("[Phase 3] Review pass skipped:", e);
            }
          }
        }

        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        setPipelineStep("complete");
        setCurrentAgent(null);
        isSendingRef.current = false;
        setTimeout(() => setBuildStreamContent(""), 3000);

        const processedHtml = finalHtml ? postProcessHtml(finalHtml) : null;

        if (processedHtml && currentProject?.id) {
          supabase
            .from("project_environments" as any)
            .update({ html_snapshot: processedHtml, status: "active", updated_at: new Date().toISOString() } as any)
            .eq("project_id", currentProject.id)
            .eq("name", "development")
            .then(() => {});
        }

        if (processedHtml && onVersionCreated) {
          onVersionCreated({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            label: getTextContent(userMsg.content).slice(0, 60) || "Build update",
            html: processedHtml,
            messageIndex: currentMessages.length,
          });
        }

        const finalChatText = reactResult.files ? reactResult.chatText : (() => {
          const { chatText: ct } = parseMultiFileOutput(fullResponse);
          return ct;
        })();

        setMessages((prev) => {
          const final = finalChatText
            ? prev.map((m, i) => (i === prev.length - 1 && m.role === "assistant" ? { ...m, content: finalChatText } : m))
            : prev;

          const persistMessages = final.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));

          const isFirstMessage = persistMessages.filter(m => m.role === "user").length === 1;
          if (isFirstMessage && currentProject.name === "Untitled Project") {
            const userPromptText = persistMessages[0]?.content || "";
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-name`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
              body: JSON.stringify({ prompt: userPromptText }),
            })
              .then(r => r.json())
              .then(({ name, emoji }) => {
                const fullName = emoji ? `${emoji} ${name}` : name;
                supabase.from("projects").update({ name: fullName, updated_at: new Date().toISOString() } as any).eq("id", currentProject.id).then(() => saveProject({ name: fullName } as any));
              })
              .catch(() => {});
          }

          saveProject({ chat_history: persistMessages, html_content: finalHtml || currentProject.html_content || "" });

          if (reactResult.files && Object.keys(reactResult.files).length > 0) {
            const payload = { files: reactResult.files, deps: reactResult.deps || {} };
            supabase
              .from("project_data")
              .upsert(
                { project_id: currentProject.id, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[BuildOrch] Failed to persist sandpack state:", error);
              });
          }

          return final;
        });
      };

      // ─── CORE: Build engine for code generation ───
      setCurrentAgent("build");
      setPipelineStep("planning");

      const buildProjectId = currentProject.id;
      const liveSandpackFiles = sandpackFilesRef.current;
      const isFirstBuild = !liveSandpackFiles || Object.keys(liveSandpackFiles).length === 0;

      // ─── INSTANT PATH (delegated to useInstantBuild) ───
      const isSimpleBuild = isFirstBuild && !!template;

      if (isSimpleBuild || isFirstBuild) {
        const handled = await tryInstantBuild(
          template, userText, schemas, irContext, templateCtx, buildProjectId, upsert,
        );
        if (handled) return;
      }

      // ─── IR-to-Domain model ───
      let domainModel: any = null;
      if (currentProject.ir_state) {
        try {
          const { irToDomainModel } = await import("@/lib/irToDomain");
          domainModel = irToDomainModel(currentProject.ir_state);
          if (domainModel?.entities?.length > 0) {
            console.log(`[BuildOrch] IR → DomainModel: ${domainModel.entities.length} entities`);
          } else {
            domainModel = null;
          }
        } catch {
          domainModel = null;
        }
      }

      // Priority 2: Keyword matching + Requirements Agent
      if (!domainModel && isFirstBuild) {
        try {
          setBuildStep("🧠 Analyzing domain requirements...");
          const { matchDomainTemplate, serializeDomainModel } = await import("@/lib/domainTemplates");
          const templateMatch = matchDomainTemplate(userText);

          if (templateMatch.template) {
            console.log(`[BuildOrch] Domain template matched: ${templateMatch.template.name} (confidence: ${templateMatch.confidence}, keywords: ${templateMatch.matchedKeywords.join(", ")})`);

            const reqResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/requirements-agent`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                prompt: userText,
                matchedTemplate: templateMatch.template.model,
                existingSchemas: schemas,
              }),
            });

            if (reqResp.ok) {
              domainModel = await reqResp.json();
              console.log(`[BuildOrch] ✅ Domain model extracted: ${domainModel.entities?.length || 0} entities, auth: ${domainModel.requiresAuth}`);
            } else {
              console.warn("[BuildOrch] Requirements agent failed, using template directly");
              domainModel = templateMatch.template.model;
            }
          } else {
            console.log("[BuildOrch] No domain template matched, using direct build");
          }
        } catch (err) {
          console.warn("[BuildOrch] Requirements agent error, proceeding without domain model:", err);
        }
      }

      // Guard against project switch
      if (lastProjectIdRef.current !== buildProjectId) {
        console.warn("[BuildOrch] Project switched during build setup, aborting");
        setIsLoading(false);
        setIsBuilding(false);
        return;
      }

      const safeExistingFiles = shouldIncludeCurrentCode && liveSandpackFiles && Object.keys(liveSandpackFiles).length > 0
        ? liveSandpackFiles
        : undefined;

      const engineConfig: EngineConfig = {
        projectId: buildProjectId,
        techStack: currentProject.tech_stack || "react-cdn",
        schemas: schemas.length > 0 ? schemas : undefined,
        model: selectedModel,
        designTheme: themeInfo?.prompt,
        knowledge: knowledge.length > 0 ? knowledge : undefined,
        snippetsContext: snippetsContext || undefined,
        existingFiles: safeExistingFiles,
        templateContext: templateCtx || undefined,
        chatHistory: currentMessages.map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : getTextContent(m.content),
        })),
        domainModel,
      };

      saveSnapshot(`Pre-build: ${userText.slice(0, 50)}`);

      streamingControllerRef.current = new StreamingPreviewController((files, deps) => {
        if (lastProjectIdRef.current !== buildProjectId) return;
        const currentFiles = sandpackFilesRef.current || {};
        setSandpackFiles({ ...currentFiles, ...files });
        if (Object.keys(deps).length > 0) setSandpackDeps(deps);
        setPreviewMode("sandpack");
      }, 500);
      streamingControllerRef.current.start();

      await runBuildEngine(userText, engineConfig, {
        onProgress: (progress: EngineProgress) => {
          setBuildStep(progress.message);

          if (progress.plan) setCurrentPlan(progress.plan);
          if (progress.totalTasks !== undefined) setTotalPlanTasks(progress.totalTasks);
          if (progress.taskIndex !== undefined) setCurrentTaskIndex(progress.taskIndex);

          if (progress.phase === "planning" && progress.plan) {
            const planSummary = `📋 **Build Plan** (${progress.plan.overallComplexity})\n${progress.plan.summary}\n\n${progress.plan.tasks.map((t: any, i: number) => `⏳ ${i + 1}. ${t.title}`).join("\n")}`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: planSummary } : m));
              }
              return [...prev, { role: "assistant", content: planSummary, timestamp: Date.now() }];
            });
          } else if (progress.phase === "executing" && progress.plan) {
            const progressMsg = `📋 **Building** (${progress.plan.overallComplexity})\n${progress.plan.summary}\n\n${progress.plan.tasks.map((t: any, i: number) => {
              const idx = progress.taskIndex ?? 0;
              const status = i < idx ? "✅" : i === idx ? "🔨" : "⏳";
              return `${status} ${i + 1}. ${t.title}`;
            }).join("\n")}`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: progressMsg } : m));
              }
              return prev;
            });
          }
        },
        onDelta: (chunk) => {
          setBuildStreamContent(prev => prev + chunk);
          streamingControllerRef.current?.addChunk(chunk);
        },
        onFilesReady: (files, deps) => {
          if (lastProjectIdRef.current !== buildProjectId) return;
          setSandpackFiles(files);
          syncSandpackToVirtualFS(files);
          if (Object.keys(deps).length > 0) setSandpackDeps(deps);
          setPreviewMode("sandpack");

          if (Object.keys(files).length > 0) {
            const payload = { files, deps: deps || {} };
            supabase
              .from("project_data")
              .upsert(
                { project_id: buildProjectId, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[BuildOrch] Incremental persist failed:", error);
              });
          }
        },
        onComplete: (result) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const msg = result.chatText;
            if (last?.role === "assistant") {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
            }
            return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
          });

          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");
          setPipelineStep("complete");
          setCurrentAgent(null);
          setCurrentPlan(result.plan || null);
          isSendingRef.current = false;
          setBuildRetryCount(0);
          if (result.metrics) setBuildMetrics(result.metrics);
          streamingControllerRef.current?.stop();
          streamingControllerRef.current = null;
          setTimeout(() => setBuildStreamContent(""), 3000);

          const persistMessages = messagesRef.current.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });

          if (result.files && Object.keys(result.files).length > 0) {
            const payload = { files: result.files, deps: result.deps || {} };
            supabase
              .from("project_data")
              .upsert(
                { project_id: currentProject.id, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[BuildOrch] Failed to persist sandpack state:", error);
                else console.log("[BuildOrch] ✅ Sandpack state persisted");
              });
          }

          if (onVersionCreated) {
            onVersionCreated({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              label: userText.slice(0, 60) || "Build update",
              html: "",
              messageIndex: currentMessages.length,
            });
          }
        },
        onError: (err) => {
          handleOnError(err);
        },
      });
    } catch (e) {
      console.error("[BuildOrch] sendMessage error:", e);
      setIsLoading(false);
      setIsBuilding(false);
      setBuildStep("");
      isSendingRef.current = false;
    }
  }, [currentProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep, selectedModel, selectedTheme, onVersionCreated, setVirtualFiles, fetchProjectContext, syncSandpackToVirtualFS, buildMessageContent, currentPreviewHtml, setMessages, setInput, setAttachedImages, setPreviewErrors, setHealAttempts, setSandpackFiles, setSandpackDeps, setPreviewMode, setBuildMetrics, saveSnapshot, selectedTemplate, tryInstantBuild, handleOnError]);

  // Smart routing
  const handleSmartSend = useCallback(async (text: string, images: string[] = []) => {
    if (!text && images.length === 0) return;
    if (isSendingRef.current || isLoadingRef.current) return;
    const finalText = text || "Replicate this design";

    const isAutoFix = finalText.startsWith("🔧");
    const isShort = finalText.length < 15;
    const hasImages = images.length > 0;
    const isConfirmation = /^(yes|go ahead|do it|build it|sounds good|ok|sure)/i.test(finalText.trim());
    const hasAnswers = finalText.includes("--- Additional Requirements ---");

    if (!isAutoFix && !isShort && !hasImages && !isConfirmation && !hasAnswers) {
      const localIntent = fastClassifyLocal(finalText);

      if (localIntent === "chat") {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }

      if (localIntent === "build") {
        console.log("[FastClassify] Client-side build detection, skipping server classify");
        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(finalText, images);
        return;
      }

      const classification = await classifyUserIntent(finalText);
      if (classification?.intent === "clarify") return;

      if (classification?.intent === "chat") {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }
    }

    // Default: route to build agent
    setCurrentAgent("build");
    setPipelineStep("planning");
    sendMessage(finalText, images);
  }, [classifyUserIntent, fastClassifyLocal, sendChatMessage, sendMessage]);

  const clearChat = useCallback(() => {
    if (!currentProject || isLoading) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setPreviewHtml("");
    setSandpackFiles(null);
    setSandpackDeps({});
    setPreviewMode("html");
    setPreviewErrors([]);
    setHealAttempts(0);
    resetHealing();
    setCurrentAgent(null);
    setPipelineStep(null);
    setPendingBuildPrompt(null);
    setCurrentPlan(null);
    setCurrentTaskIndex(0);
    setTotalPlanTasks(0);
    isSendingRef.current = false;
    saveProject({ chat_history: [], html_content: "" });
  }, [currentProject, isLoading, setPreviewHtml, saveProject, setMessages, setSandpackFiles, setSandpackDeps, setPreviewMode, setPreviewErrors, setHealAttempts, resetHealing]);

  const abortBuild = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsBuilding(false);
    setBuildStep("");
    isSendingRef.current = false;
  }, [setIsBuilding, setBuildStep]);

  return {
    // State
    isLoading,
    buildStreamContent,
    currentAgent,
    pipelineStep,
    setPipelineStep,
    currentPlan,
    currentTaskIndex,
    totalPlanTasks,
    selectedTemplate,
    setSelectedTemplate,
    buildRetryCount,

    // Refs
    isSendingRef,
    isLoadingRef,
    messagesRef,
    sandpackFilesRef,
    abortControllerRef,
    lastProjectIdRef,

    // Actions
    sendMessage,
    sendChatMessage,
    handleSmartSend,
    clearChat,
    abortBuild,
    syncSandpackToVirtualFS,
    buildMessageContent,

    // Pipeline state setters (needed by ChatPanel for project switch reset)
    setCurrentAgent,
    setCurrentPlan,
    setCurrentTaskIndex,
    setTotalPlanTasks,
    setBuildStreamContent,
    setBuildRetryCount,
    setPendingBuildPrompt,
    setIsLoading,
  };
}
