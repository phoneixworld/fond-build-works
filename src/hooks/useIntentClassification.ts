/**
 * useIntentClassification — Manages intent classification, follow-up questions, and fast local classification.
 * Extracted from ChatPanel to reduce monolith complexity.
 * 
 * Responsibilities:
 * - Client-side fast classification (regex-based, skips server round-trip)
 * - Server-side intent classification via classify-intent edge function
 * - Follow-up questions state management (clarifying questions flow)
 * - Analysis result tracking
 */

import { useState, useCallback } from "react";
import { classifyIntent, type AgentIntent } from "@/lib/agentPipeline";

interface ClassificationHookResult {
  // Follow-up questions
  followUpQuestions: any[];
  setFollowUpQuestions: React.Dispatch<React.SetStateAction<any[]>>;
  followUpAnswers: Record<string, string>;
  setFollowUpAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  pendingFollowUpPrompt: string;
  setPendingFollowUpPrompt: React.Dispatch<React.SetStateAction<string>>;
  analysisResult: any;
  setAnalysisResult: React.Dispatch<React.SetStateAction<any>>;
  isAnalyzing: boolean;
  setIsAnalyzing: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Classification
  classifyUserIntent: (prompt: string) => Promise<{ intent: AgentIntent; questions?: any[] } | null>;
  fastClassifyLocal: (text: string) => AgentIntent | null;
  
  // Helpers
  resetClassificationState: () => void;
}

export function useIntentClassification(
  sandpackFiles: Record<string, string> | null,
  previewHtml: string,
  messageCount: number,
  setPipelineStep: (step: any) => void,
): ClassificationHookResult {
  const [followUpQuestions, setFollowUpQuestions] = useState<any[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [pendingFollowUpPrompt, setPendingFollowUpPrompt] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const classifyUserIntent = useCallback(async (prompt: string): Promise<{ intent: AgentIntent; questions?: any[] } | null> => {
    if (prompt.length < 15 || prompt.startsWith("🔧 AUTO-FIX") || prompt.startsWith("🔧")) return null;
    
    const hasHistory = messageCount > 0;
    const hasExistingCode = !!(sandpackFiles && Object.keys(sandpackFiles).length > 0) || !!(previewHtml && previewHtml.length > 0);
    const existingFileNames = sandpackFiles ? Object.keys(sandpackFiles) : [];
    
    setIsAnalyzing(true);
    setPipelineStep("classifying");
    try {
      const result = await classifyIntent(prompt, hasHistory, hasExistingCode, existingFileNames);
      setAnalysisResult(result);
      
      if (result.intent === "clarify" && result.questions?.length) {
        setFollowUpQuestions(result.questions);
        setPendingFollowUpPrompt(prompt);
        setIsAnalyzing(false);
        setPipelineStep(null);
        return { intent: "clarify", questions: result.questions };
      }
      
      setIsAnalyzing(false);
      return { intent: result.intent };
    } catch {
      setIsAnalyzing(false);
      setPipelineStep(null);
      return null;
    }
  }, [sandpackFiles, previewHtml, messageCount, setPipelineStep]);

  // Client-side fast classification — obvious intents skip the 1-2s server round-trip
  const fastClassifyLocal = useCallback((text: string): AgentIntent | null => {
    const t = text.trim().toLowerCase();

    // Long requirement documents (>3000 chars) are always "build"
    if (text.length > 3000) return "build";

    // ── Chat patterns (check FIRST to avoid false build matches) ──
    // Phased/incremental work signals — user wants to discuss before building
    if (/\b(phase by phase|step by step|i'll give you|ill give you|one at a time|let me explain|first let me|i'll share|ill share|i'll provide|ill provide|wait for my|before you start)\b/i.test(t)) return "chat";
    // "These are the..." / "Here are the..." — user is providing info, not requesting a build
    if (/^(these are|here are|here is|this is|below are|following are|attached are)\b/i.test(t)) return "chat";
    // Questions starting with interrogative words — with or without "?"
    if (/^(what|how|why|can you|could you|should|is it|tell me|explain|help me understand|describe|what's|how's|why's|when|where|who)\b/i.test(t)) return "chat";
    // Conversational phrases
    if (/^(thanks|thank you|got it|i see|okay so|i understand|that makes sense|cool|great|nice|awesome|perfect|no worries)/i.test(t)) return "chat";
    // Asking about something (even without question mark)
    if (/\b(what does|how does|how do|what is|what are|can i|should i|is there|would it|will it)\b/i.test(t)) return "chat";

    // ── Build patterns ──
    // Clear build commands (verb-first)
    if (/^(build|create|make|add|generate|implement|develop|set up|scaffold|wire up)\b/i.test(t)) return "build";
    // Modification commands (verb-first)
    if (/^(change|update|fix|modify|replace|remove|delete|move|rename|resize|recolor|restyle)\b/i.test(t)) return "build";
    // Descriptive app prompts — require a build verb AND a target noun
    if (/\b(build|create|make|generate|design)\b/i.test(t) && /\b(app|website|dashboard|landing page|portal|system|platform|page|form|module|component)\b/i.test(t)) return "build";
    // Affirmative confirmations (only short ones — long "yes" messages might be specs)
    if (/^(yes|go ahead|do it|build it|sounds good|sure|let's go|proceed)\b/i.test(t) && t.length < 100) return "build";

    return null;
  }, []);

  const resetClassificationState = useCallback(() => {
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setPendingFollowUpPrompt("");
    setAnalysisResult(null);
    setIsAnalyzing(false);
  }, []);

  return {
    followUpQuestions, setFollowUpQuestions,
    followUpAnswers, setFollowUpAnswers,
    pendingFollowUpPrompt, setPendingFollowUpPrompt,
    analysisResult, setAnalysisResult,
    isAnalyzing, setIsAnalyzing,
    classifyUserIntent,
    fastClassifyLocal,
    resetClassificationState,
  };
}
