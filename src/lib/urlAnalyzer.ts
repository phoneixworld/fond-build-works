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

  // Check if the message context is about analyzing/reading the URL
  const withoutUrl = trimmed.replace(URL_REGEX, "").trim();
  const isUrlFocused =
    !withoutUrl || // Just a URL
    withoutUrl.length < 40 || // Short surrounding text — likely about the URL
    // Direct verb-first commands
    /^(read|analyze|check|look at|open|fetch|scan|review|build from|clone|copy|replicate|build something like|build similar to|make something like)\b/i.test(withoutUrl) ||
    // "can you [verb] this" patterns
    /\b(can you|could you|please|pls)\s+(read|analyze|check|look at|open|fetch|scan|review|build from|clone|copy|replicate)\b/i.test(withoutUrl) ||
    // Trailing context about the URL
    /\b(read|analyze|check|look at|build from this|clone this|replicate this|build something like this|build similar|check this|read this|analyze this|look at this|scan this|review this)\s*$/i.test(withoutUrl) ||
    // "check/read/analyze this [url]" anywhere
    /\b(check|read|analyze|scan|review|look at|open|fetch)\s+(this|the|that)\b/i.test(withoutUrl);

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
