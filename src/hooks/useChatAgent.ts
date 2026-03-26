/**
 * useChatAgent — Chat-only agent flow (no direct code generation).
 * Extracted from useBuildOrchestration to reduce monolith complexity.
 *
 * FIX #1: Sends workspace file list + recent preview errors to chat-agent
 * so Phoenix can actually diagnose issues instead of bluffing.
 *
 * FIX #2: Feeds interface contracts + workspace summary into chat-agent context
 * so answers are grounded in the real workspace shape.
 *
 * FIX #3: Tightens BUILD_CONFIRMED handoff by sending a structured build envelope
 * instead of a raw string, so the build pipeline can pick it up with full context.
 */

import { useCallback, useEffect, useRef } from "react";
import { stripBuildMarker, hasBuildConfirmation } from "@/lib/agentPipeline";
import type { PipelineStep } from "@/lib/agentPipeline";
import { supabase } from "@/integrations/supabase/client";
import { type MsgContent, getTextContent } from "@/lib/codeParser";
import { streamThroughCacheProxy, type CacheHitResult } from "@/lib/semanticCache";
import { TokenBuffer } from "@/lib/tokenBuffer";

// Interface contracts + workspace summary
import { getInterfaceContractsSnapshot } from "@/lib/codeMerger/interfaceContracts";
import { buildWorkspaceSummary } from "@/lib/workspaceSummary";

type MsgMeta = { tokens?: number; durationMs?: number; model?: string };
type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number; meta?: MsgMeta };

const BARE_CONFIRMATIONS = new Set([
  "ok",
  "okay",
  "sure",
  "go ahead",
  "yes",
  "yep",
  "yeah",
  "proceed",
  "do it",
  "start",
  "continue",
  "approved",
]);

const ACTIONABLE_INTENT =
  /\b(build|create|generate|scaffold|fix|edit|modify|change|update|refactor|add|remove|delete|implement|rewrite|repair|patch)\b/i;
const READ_ONLY_QA =
  /^(what|why|how|when|where|who|can you explain|explain|tell me|help me understand|compare|difference between|is it|are we)\b/i;
const NEGATIVE_BUILD =
  /\b(do not build|don't build|dont build|do not edit|don't edit|dont edit|stop building|root cause only|just explain|only explain)\b/i;
const META_CONVERSATION_QA =
  /\b(what was my request|what did i ask|what am i asking|what did i say|what are you generating|is that all|is this all|did you understand|why are you building|why are you still building|remember my request|repeat my request|summarize my request|do you know how to build)\b/i;
const FRUSTRATION_OR_ESCALATION =
  /\b(you are continuing to build|i said do not build|dont build anything|don't build anything|stop building|why are you continuing|why are you still)\b/i;

/**
 * Phase 5: Client-side truthfulness guard
 * Strips false build/edit completion claims from chat agent responses.
 * The chat agent should NEVER claim it edited/built/created files.
 */
const FALSE_COMPLETION_PATTERNS = [
  /✅\s*(?:edited|built|created|generated|updated|modified|fixed)\s+\d+\s+files?/gi,
  /(?:i've|i have|i just)\s+(?:edited|built|created|generated|updated|modified|fixed)\s+(?:the\s+)?(?:files?|code|components?|pages?)/gi,
  /changes?\s+(?:complete|applied|done|saved|committed)/gi,
  /here(?:'s| is) what (?:i|was) (?:built|created|changed|edited|generated)/gi,
];

function sanitizeChatTruthfulness(text: string): string {
  let result = text;
  for (const pattern of FALSE_COMPLETION_PATTERNS) {
    result = result.replace(pattern, (match) => {
      console.warn(`[ChatTruth] Stripped false completion claim: "${match}"`);
      return "";
    });
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function extractTextFromContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
      .map((part: any) => part.text)
      .join(" ");
  }
  return "";
}

function isBareConfirmationText(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[?.!,]+$/g, "");
  return BARE_CONFIRMATIONS.has(normalized) || normalized.length < 4;
}

function inferCacheIntent(text: string): "read_only_qa" | "actionable" {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "actionable";
  if (isBareConfirmationText(normalized)) return "actionable";
  if (NEGATIVE_BUILD.test(normalized)) return "actionable";
  if (META_CONVERSATION_QA.test(normalized) || FRUSTRATION_OR_ESCALATION.test(normalized)) return "actionable";
  if (ACTIONABLE_INTENT.test(normalized)) return "actionable";
  if (READ_ONLY_QA.test(normalized) || normalized.endsWith("?")) return "read_only_qa";
  return "actionable";
}

function buildRequirementsSnippet(apiMessages: Array<{ role: string; content: any }>): string {
  const userMsgs = apiMessages
    .filter((m) => m.role === "user")
    .map((m) => extractTextFromContent(m.content))
    .filter((t) => t && !isBareConfirmationText(t));

  return userMsgs.join("\n\n").slice(0, 1200);
}

export interface ChatAgentConfig {
  currentProject: any;
  saveProject: (data: any) => void;
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  setInput: (s: string) => void;
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  setBuildStep: (s: string) => void;
  setPipelineStep: (step: PipelineStep | null) => void;
  setCurrentAgent: (agent: string | null) => void;
  setIsLoading: (v: boolean) => void;
  setPendingBuildPrompt?: (prompt: string | null) => void;
  messagesRef: React.RefObject<Msg[]>;
  isSendingRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  buildMessageContent: (text: string, images: string[]) => MsgContent;
  // Workspace context for chat-agent
  sandpackFilesRef: React.RefObject<Record<string, string> | null>;
  previewErrors: string[];
}

export function useChatAgent(config: ChatAgentConfig) {
  const {
    currentProject,
    saveProject,
    setMessages,
    setInput,
    setAttachedImages,
    setBuildStep,
    setPipelineStep,
    setCurrentAgent,
    setIsLoading,
    messagesRef,
    isSendingRef,
    isLoadingRef,
    buildMessageContent,
    sandpackFilesRef,
  } = config;
  const setPendingBuildPrompt = config.setPendingBuildPrompt;

  const abortControllerRef = useRef<AbortController | null>(null);
  const tokenBufferRef = useRef<TokenBuffer | null>(null);
  const isMountedRef = useRef(true);

  // Avoid stale closure on streaming text
  const fullChatResponseRef = useRef<string>("");

  // Avoid previewErrors array identity in deps causing re-renders
  const previewErrorsRef = useRef<string[]>([]);
  useEffect(() => {
    previewErrorsRef.current = config.previewErrors;
  }, [config.previewErrors]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (tokenBufferRef.current) {
        tokenBufferRef.current.flush();
        tokenBufferRef.current = null;
      }
    };
  }, []);

  const sendChatMessage = useCallback(
    async (text: string, images: string[] = []) => {
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
      fullChatResponseRef.current = "";
      const currentMessages = messagesRef.current;
      const apiMessages = [...currentMessages, userMsg].map((m) => ({
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
      } catch {
        // ignore knowledge failures
      }

      const userText = typeof text === "string" ? text : "";
      const cacheIntent = inferCacheIntent(userText);
      const bypassCache = cacheIntent !== "read_only_qa";
      const requirementsSnippet = buildRequirementsSnippet(apiMessages);

      // Workspace file list for chat-agent context
      const workspaceFiles: string[] = [];
      let workspaceFileMap: Record<string, string> | null = null;
      if (sandpackFilesRef.current) {
        workspaceFileMap = sandpackFilesRef.current;
        for (const path of Object.keys(sandpackFilesRef.current)) {
          workspaceFiles.push(path);
        }
      }

      // Recent preview errors for chat-agent context
      const recentErrors = previewErrorsRef.current.slice(-10);

      // Interface contracts snapshot
      const contractSnapshot = getInterfaceContractsSnapshot();

      // Workspace summary (compressed manifest of files/exports/routes)
      const workspaceSummary = workspaceFileMap
        ? buildWorkspaceSummary(workspaceFileMap)
        : undefined;

      const finalize = (responseText: string, isCached: boolean, cacheInfo?: CacheHitResult) => {
        if (!isMountedRef.current) {
          isSendingRef.current = false;
          return;
        }

        const durationMs = Date.now() - chatStartTime;
        const estimatedTokens =
          tokenCount > 0 ? tokenCount : Math.ceil(responseText.length / 4);
        const meta: MsgMeta = {
          tokens: estimatedTokens,
          durationMs,
          model: "chat-agent",
        };

        setIsLoading(false);
        setBuildStep("");
        setPipelineStep(null);
        setCurrentAgent(null);
        isSendingRef.current = false;

        // Structured BUILD_CONFIRMED handoff
        if (hasBuildConfirmation(responseText) && setPendingBuildPrompt) {
          console.log(
            "[ChatAgent] BUILD_CONFIRMED detected — signaling build pipeline",
          );

          const buildEnvelope = {
            kind: "chat_build",
            source: "chat-agent",
            prompt: responseText,
            projectId: currentProject.id,
            workspaceFiles,
            workspaceSummary,
            contracts: contractSnapshot,
            recentErrors,
          };

          setPendingBuildPrompt(JSON.stringify(buildEnvelope));
        }

        const displayText = sanitizeChatTruthfulness(stripBuildMarker(responseText));
        const cacheTag =
          isCached && cacheInfo
            ? `\n\n_⚡ ${cacheInfo.layer} cache ${cacheInfo.matchType} hit (${(
                cacheInfo.similarity * 100
              ).toFixed(0)}% match)_`
            : "";

        setMessages((prev) => {
          const withResponse = [...prev];
          const lastIdx = withResponse.length - 1;
          if (lastIdx >= 0 && withResponse[lastIdx].role === "assistant") {
            withResponse[lastIdx] = {
              ...withResponse[lastIdx],
              content: displayText + cacheTag,
              meta,
            };
          } else {
            withResponse.push({
              role: "assistant",
              content: displayText + cacheTag,
              timestamp: Date.now(),
              meta,
            });
          }

          const persistMessages = withResponse.map((m) => ({
            role: m.role,
            content:
              typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages });
          return withResponse;
        });
      };

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      await streamThroughCacheProxy({
        messages: apiMessages,
        projectId: currentProject.id,
        techStack: currentProject.tech_stack || "react-cdn",
        knowledge,
        workspaceFiles: workspaceFiles.length > 0 ? workspaceFiles : undefined,
        recentErrors: recentErrors.length > 0 ? recentErrors : undefined,
        contracts: contractSnapshot,
        workspaceSummary,
        bypassCache,
        cacheIntent,
        requirementsSnippet,
        signal: abortController.signal,
        onCacheHit: (result) => {
          if (!isMountedRef.current) {
            isSendingRef.current = false;
            return;
          }
          console.log(
            `[ChatAgent] Cache hit: ${result.layer} ${result.matchType} (${(
              result.similarity * 100
            ).toFixed(1)}%)`,
          );
          setBuildStep(`⚡ ${result.layer} cache hit`);
          if (result.response) {
            finalize(result.response, true, result);
          }
        },
        onDelta: (chunk) => {
          if (!isMountedRef.current) return;

          if (!tokenBufferRef.current) {
            tokenBufferRef.current = new TokenBuffer({
              tokenDelay: 8,
              onToken: (token) => {
                if (!isMountedRef.current) return;
                fullChatResponseRef.current += token;
                tokenCount += Math.ceil(token.length / 4);
                const displayText = sanitizeChatTruthfulness(stripBuildMarker(fullChatResponseRef.current));
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return prev.map((m, i) =>
                      i === prev.length - 1
                        ? {
                            ...m,
                            content: displayText,
                            meta: { isStreaming: true } as any,
                          }
                        : m,
                    );
                  }
                  return [
                    ...prev,
                    {
                      role: "assistant",
                      content: displayText,
                      timestamp: Date.now(),
                      meta: { isStreaming: true } as any,
                    },
                  ];
                });
              },
            });
          }
          tokenBufferRef.current.push(chunk);
        },
        onDone: (finalText) => {
          if (tokenBufferRef.current) {
            tokenBufferRef.current.flush();
            tokenBufferRef.current = null;
          }

          if (!isMountedRef.current) {
            isSendingRef.current = false;
            return;
          }

          if (fullChatResponseRef.current) {
            finalize(finalText || fullChatResponseRef.current, false);
          } else {
            setIsLoading(false);
            setBuildStep("");
            setPipelineStep(null);
            setCurrentAgent(null);
            isSendingRef.current = false;
          }
        },
        onError: (err) => {
          if (tokenBufferRef.current) {
            tokenBufferRef.current.flush();
            tokenBufferRef.current = null;
          }
          if (!isMountedRef.current) {
            isSendingRef.current = false;
            return;
          }
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `⚠️ ${err}`, timestamp: Date.now() },
          ]);
          setIsLoading(false);
          setBuildStep("");
          setPipelineStep(null);
          setCurrentAgent(null);
          isSendingRef.current = false;
        },
      });
    },
    [
      currentProject,
      saveProject,
      setBuildStep,
      buildMessageContent,
      setInput,
      setAttachedImages,
      setMessages,
      sandpackFilesRef,
      setIsLoading,
      setPipelineStep,
      setCurrentAgent,
      messagesRef,
      isSendingRef,
      isLoadingRef,
      setPendingBuildPrompt,
    ],
  );

  return { sendChatMessage };
}
