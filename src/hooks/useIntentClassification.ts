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
import { isEditIntent } from "@/lib/editEngine";

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
      // Fallback: if classify-intent fails and we have existing code, default to edit (not rebuild)
      if (hasExistingCode) {
        return { intent: "edit" as AgentIntent };
      }
      return null;
    }
  }, [sandpackFiles, previewHtml, messageCount, setPipelineStep]);

  // Client-side fast classification — obvious intents skip the 1-2s server round-trip
  const fastClassifyLocal = useCallback((text: string): AgentIntent | null => {
    const t = text.trim().toLowerCase();

    // Long requirement documents (>3000 chars) are always "build"
    if (text.length > 3000) return "build";

    // ── Greetings — always chat, never build ──
    if (/^(hello|hi|hey|yo|good morning|good evening|good afternoon|what'?s up|how are you|hello there|hey phoenix|sup|hiya|evening|morning|howdy|greetings|hey there|hi there|heya)\b/i.test(t)) return "chat";

    // ── Small talk — always chat ──
    if (/^(how'?s it going|what are you doing|can you talk|are you there|what'?s new|tell me something|how have you been|what'?s happening)\b/i.test(t)) return "chat";

    // ── Capability questions — always chat ──
    if (/\b(what can you do|what are your .*(skills|capabilities|features)|how does this work|your core skills)\b/i.test(t)) return "chat";

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
    // Ambiguous help-seeking — always chat
    if (/\b(can you help|i need help|i'?m stuck|this is weird|why is this happening|can you check something)\b/i.test(t)) return "chat";

    // ── Edit patterns (check BEFORE build — edits are more specific) ──
    const hasExistingCode = !!(sandpackFiles && Object.keys(sandpackFiles).length > 0) || !!(previewHtml && previewHtml.length > 0);
    if (hasExistingCode && isEditIntent(text, true)) return "edit";
    // Bug reports with existing code → edit (not rebuild) — broad pattern, no target required
    if (hasExistingCode && /\b(doesn['']?t work|does not work|not working|broken|bug|crash|error|fails?|failing|wrong|issue|problem|stuck|blank|empty|missing|disappeared|nothing shows|nothing loads|nothing happens|white screen|no content|not loading|not showing|not rendering|not displaying|can['']?t see|cannot see|shows nothing|displays nothing|is blank)\b/i.test(t)) return "edit";

    // ── Build patterns ──
    // Clear build commands (verb-first)
    if (/^(build|create|make|add|generate|implement|develop|set up|scaffold|wire up|produce|write code for)\b/i.test(t)) return "build";
    // Modification commands (verb-first) — only if no existing code (otherwise it's an edit)
    if (/^(change|update|fix|modify|replace|remove|delete|move|rename|resize|recolor|restyle)\b/i.test(t)) {
      return hasExistingCode ? "edit" : "build";
    }
    // Descriptive app prompts — require a build verb AND a target noun
    if (/\b(build|create|make|generate|design)\b/i.test(t) && /\b(app|website|dashboard|landing page|portal|system|platform|page|form|module|component)\b/i.test(t)) return "build";
    // Affirmative confirmations (only short ones — long "yes" messages might be specs)
    if (/^(yes|go ahead|do it|build it|sounds good|sure|let's go|proceed)\b/i.test(t) && t.length < 100) return "build";

    return null;
  }, [sandpackFiles, previewHtml]);

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
