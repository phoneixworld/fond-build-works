/**
 * URL Analyzer — Bridges UFM+, WPA+, and BSAG for URL inputs.
 * 
 * Detects URLs in user messages, fetches HTML content via edge function,
 * runs analysis pipeline, and returns confirmation + build prompt.
 */

import { supabase } from "@/integrations/supabase/client";
import { extractFromUrl } from "@/lib/ufm/extractors";
import { validateInput, createSafetyErrorMessage } from "@/lib/ufm/safety";
import { analyzeSource } from "@/lib/wpa/analyzer";
import { generateBuildPromptFromAUM, generateConfirmationMessage } from "@/lib/bsag/generator";
import type { AppUnderstandingModel } from "@/lib/wpa/aum";

const URL_REGEX = /https?:\/\/[^\s)>"']+/i;

/** Check if user message contains a URL that should trigger analysis */
export function extractUrlFromMessage(text: string): string | null {
  // Only trigger for messages that are primarily a URL or "read/analyze/check this URL"
  const trimmed = text.trim();
  const match = trimmed.match(URL_REGEX);
  if (!match) return null;

  const url = match[0];

  // If the message is just a URL (possibly with "read", "analyze", "check", "look at", etc.)
  const withoutUrl = trimmed.replace(URL_REGEX, "").trim();
  const isUrlFocused =
    !withoutUrl || // Just a URL
    /^(read|analyze|check|look at|open|fetch|scan|review|build from|clone|copy|replicate|build something like|build similar to|make something like)\b/i.test(withoutUrl) ||
    /\b(read|analyze|check|look at|can you read|can you analyze|can you check|build from this|clone this|replicate this|build something like this|build similar)\s*$/i.test(withoutUrl);

  return isUrlFocused ? url : null;
}

export interface UrlAnalysisResult {
  success: boolean;
  aum?: AppUnderstandingModel;
  confirmationMessage?: string;
  buildPrompt?: string;
  error?: string;
}

/** Fetch URL content and run full analysis pipeline */
export async function analyzeUrl(url: string): Promise<UrlAnalysisResult> {
  // Safety check
  const safety = validateInput(url, "url");
  if (!safety.safe) {
    return { success: false, error: createSafetyErrorMessage(safety) };
  }

  try {
    // Fetch HTML via edge function
    const { data, error } = await supabase.functions.invoke("fetch-url", {
      body: { url },
    });

    if (error || !data?.html) {
      return {
        success: false,
        error: `I couldn't fetch that URL. ${error?.message || "The site may be blocking requests or unavailable."}`,
      };
    }

    // UFM+: Extract structured data from HTML
    const ufmResult = extractFromUrl(data.html, url);

    if (!ufmResult.success) {
      return { success: false, error: ufmResult.error || "Failed to extract content from the URL." };
    }

    // WPA+: Analyze into App Understanding Model
    const aum = analyzeSource(ufmResult);

    // BSAG: Generate confirmation + build prompt
    const confirmationMessage = generateConfirmationMessage(aum);
    const buildPrompt = generateBuildPromptFromAUM(aum);

    return {
      success: true,
      aum,
      confirmationMessage,
      buildPrompt,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to analyze the URL: ${err.message || "Unknown error"}`,
    };
  }
}
