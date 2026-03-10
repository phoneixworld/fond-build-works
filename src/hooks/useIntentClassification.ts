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

    // Long requirement documents (>3000 chars) are always "build" — skip keyword matching
    // which can falsely match chat patterns in spec documents
    if (text.length > 3000) return "build";

    // Clear build commands
    if (/^(build|create|make|add|generate|design|implement|develop|set up|scaffold|wire up)\b/i.test(t)) return "build";
    // Descriptive app prompts
    if (/\b(app|website|dashboard|landing page|erp|portal|system|platform|page|form|module|component)\b/i.test(t) && t.length > 20) return "build";
    // Modification commands
    if (/^(change|update|fix|modify|replace|remove|delete|move|rename|resize|recolor|restyle)\b/i.test(t)) return "build";
    // Affirmative confirmations
    if (/^(yes|go ahead|do it|build it|sounds good|ok|sure|let's go|proceed)/i.test(t)) return "build";
    // Clear chat intents
    if (/^(what|how|why|can you|could you|should|is it|tell me|explain|help me understand)\b/i.test(t) && t.endsWith("?")) return "chat";
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
