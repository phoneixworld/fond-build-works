/**
 * useChatAgent — Chat-only agent flow (no code generation).
 * Extracted from useBuildOrchestration to reduce monolith complexity.
 *
 * FIX #1: Now sends workspace file list + recent preview errors to chat-agent
 * so Phoenix can actually diagnose issues instead of bluffing.
 */

import { useCallback } from "react";
import { hasBuildConfirmation, stripBuildMarker } from "@/lib/agentPipeline";
import type { PipelineStep } from "@/lib/agentPipeline";
import { supabase } from "@/integrations/supabase/client";
import { type MsgContent, getTextContent } from "@/lib/codeParser";
import { streamThroughCacheProxy, type CacheHitResult } from "@/lib/semanticCache";

type MsgMeta = { tokens?: number; durationMs?: number; model?: string };
type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number; meta?: MsgMeta };

export interface ChatAgentConfig {
  currentProject: any;
  saveProject: (data: any) => void;
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  setInput: (s: string) => void;
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  setBuildStep: (s: string) => void;
  setPipelineStep: (step: PipelineStep | null) => void;
  setCurrentAgent: (agent: string | null) => void;
  setPendingBuildPrompt: (prompt: string | null) => void;
  setIsLoading: (v: boolean) => void;
  messagesRef: React.RefObject<Msg[]>;
  isSendingRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  buildMessageContent: (text: string, images: string[]) => MsgContent;
  // FIX #1: Workspace context for chat-agent
  sandpackFilesRef: React.RefObject<Record<string, string> | null>;
  previewErrors: string[];
}

export function useChatAgent(config: ChatAgentConfig) {
  const {
    currentProject, saveProject,
    setMessages, setInput, setAttachedImages, setBuildStep,
    setPipelineStep, setCurrentAgent, setPendingBuildPrompt, setIsLoading,
    messagesRef, isSendingRef, isLoadingRef, buildMessageContent,
    sandpackFilesRef, previewErrors,
  } = config;

  const sendChatMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!text || !currentProject) return;
    if (isSendingRef.current || isLoadingRef.current) return;
    isSendingRef.current = true;

    const content = buildMessageContent(text, images);
    const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
    setInput("");
    setAttachedImages([]);
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setBuildStep("Thinking...");
    const chatStartTime = Date.now();
    let tokenCount = 0;
    let fullChatResponse = "";
    const currentMessages = messagesRef.current;
    const apiMessages = [...currentMessages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    let knowledge: string[] = [];
    try {
      const { data } = await supabase
        .from("project_knowledge" as any)
        .select("title, content")
        .eq("project_id", currentProject.id)
        .eq("is_active", true);
      knowledge = (data || []).map((k: any) => `[${k.title}]: ${k.content}`);
    } catch {}

    const userText = typeof text === "string" ? text : "";

    // FIX #1: Collect workspace file list for chat-agent context
    const workspaceFiles: string[] = [];
    if (sandpackFilesRef.current) {
      for (const path of Object.keys(sandpackFilesRef.current)) {
        workspaceFiles.push(path);
      }
    }

    // FIX #1: Collect recent preview errors for chat-agent context
    const recentErrors = previewErrors.slice(-10);

    // Helper to finalize
    const finalize = (responseText: string, isCached: boolean, cacheInfo?: CacheHitResult) => {
      setIsLoading(false);
      setBuildStep("");
      setPipelineStep(null); // Chat responses don't produce builds — never set "complete"
      setCurrentAgent(null);
      isSendingRef.current = false;

      if (hasBuildConfirmation(responseText)) {
        setPendingBuildPrompt(userText);
      }

      const displayText = stripBuildMarker(responseText);
      const cacheTag = isCached && cacheInfo
        ? `\n\n_⚡ ${cacheInfo.layer} cache ${cacheInfo.matchType} hit (${(cacheInfo.similarity * 100).toFixed(0)}% match)_`
        : "";

      setMessages((prev) => {
        const withResponse = [...prev];
        const lastIdx = withResponse.length - 1;
        if (lastIdx >= 0 && withResponse[lastIdx].role === "assistant") {
          withResponse[lastIdx] = { ...withResponse[lastIdx], content: displayText + cacheTag };
        } else {
          withResponse.push({ role: "assistant", content: displayText + cacheTag, timestamp: Date.now() });
        }

        const persistMessages = withResponse.map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : getTextContent(m.content),
        }));
        saveProject({ chat_history: persistMessages });
        return withResponse;
      });
    };

    // Stream through the 3-layer cache proxy — now with workspace context
    await streamThroughCacheProxy({
      messages: apiMessages,
      projectId: currentProject.id,
      techStack: currentProject.tech_stack || "react-cdn",
      knowledge,
      workspaceFiles: workspaceFiles.length > 0 ? workspaceFiles : undefined,
      recentErrors: recentErrors.length > 0 ? recentErrors : undefined,
      onCacheHit: (result) => {
        console.log(`[ChatAgent] Cache hit: ${result.layer} ${result.matchType} (${(result.similarity * 100).toFixed(1)}%)`);
        setBuildStep(`⚡ ${result.layer} cache hit`);
        if (result.response) {
          finalize(result.response, true, result);
        }
      },
      onDelta: (chunk) => {
        fullChatResponse += chunk;
        const displayText = stripBuildMarker(fullChatResponse);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: displayText } : m));
          }
          return [...prev, { role: "assistant", content: displayText, timestamp: Date.now() }];
        });
      },
      onDone: (finalText) => {
        if (fullChatResponse) {
          finalize(finalText, false);
        }
      },
      onError: (err) => {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, timestamp: Date.now() }]);
        setIsLoading(false);
        setBuildStep("");
        setPipelineStep(null);
        setCurrentAgent(null);
        isSendingRef.current = false;
      },
    });
  }, [currentProject, saveProject, setBuildStep, buildMessageContent, setInput, setAttachedImages, setMessages, sandpackFilesRef, previewErrors]);

  return { sendChatMessage };
}
