/**
 * useChatAgent — Chat-only agent flow (no code generation).
 * Extracted from useBuildOrchestration to reduce monolith complexity.
 *
 * Handles streaming chat responses, build confirmation detection,
 * and message persistence.
 */

import { useCallback } from "react";
import { streamChatAgent, hasBuildConfirmation, stripBuildMarker } from "@/lib/agentPipeline";
import type { PipelineStep } from "@/lib/agentPipeline";
import { supabase } from "@/integrations/supabase/client";
import { type MsgContent, getTextContent } from "@/lib/codeParser";
import { semanticCacheGet, semanticCacheSet } from "@/lib/semanticCache";

type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number };

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
}

export function useChatAgent(config: ChatAgentConfig) {
  const {
    currentProject, saveProject,
    setMessages, setInput, setAttachedImages, setBuildStep,
    setPipelineStep, setCurrentAgent, setPendingBuildPrompt, setIsLoading,
    messagesRef, isSendingRef, isLoadingRef, buildMessageContent,
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

    // ─── Semantic Cache Check ─────────────────────────────────────────
    const userText = typeof text === "string" ? text : "";
    const cacheContext = knowledge.join("|").slice(0, 500);
    
    if (currentProject.id && userText.length > 5) {
      try {
        const cached = await semanticCacheGet(currentProject.id, userText, cacheContext);
        if (cached.hit && cached.response) {
          console.log(`[ChatAgent] Semantic cache ${cached.matchType} hit — saved ~${cached.tokensSaved} tokens`);
          const displayText = stripBuildMarker(cached.response);
          setMessages((prev) => [...prev, { role: "assistant", content: `${displayText}\n\n_⚡ Cached response_`, timestamp: Date.now() }]);
          setIsLoading(false);
          setBuildStep("");
          setPipelineStep("complete");
          setCurrentAgent(null);
          isSendingRef.current = false;

          if (hasBuildConfirmation(cached.response)) {
            setPendingBuildPrompt(userText);
          }

          // Persist
          setMessages((prev) => {
            const persistMessages = prev.map(m => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));
            saveProject({ chat_history: persistMessages });
            return prev;
          });
          return;
        }
      } catch (e) {
        console.warn("[ChatAgent] Semantic cache check failed:", e);
      }
    }

    // ─── Stream from AI ───────────────────────────────────────────────
    await streamChatAgent({
      messages: apiMessages,
      projectId: currentProject.id,
      techStack: currentProject.tech_stack || "react-cdn",
      knowledge,
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
        setIsLoading(false);
        setBuildStep("");
        setPipelineStep("complete");
        setCurrentAgent(null);
        isSendingRef.current = false;

        if (hasBuildConfirmation(finalText)) {
          const userText = typeof text === "string" ? text : "";
          setPendingBuildPrompt(userText);
        }

        // Cache the response for future use
        if (currentProject.id && userText.length > 5) {
          const estimatedTokens = Math.round(finalText.length / 4);
          semanticCacheSet(
            currentProject.id, userText, finalText, "chat-agent", estimatedTokens, cacheContext
          ).catch(() => {});
        }

        const displayText = stripBuildMarker(finalText);
        setMessages((prev) => {
          const final = prev.map((m, i) =>
            i === prev.length - 1 && m.role === "assistant" ? { ...m, content: displayText } : m
          );
          const persistMessages = final.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages });
          return final;
        });
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
  }, [currentProject, saveProject, setBuildStep, buildMessageContent, setInput, setAttachedImages, setMessages]);

  return { sendChatMessage };
}
