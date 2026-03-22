/**
 * UFM+ (Universal Fetcher Module)
 * 
 * Main entry point. Accepts any supported input (URL, PDF, DOCX, image, text)
 * and returns a unified structured UFMResult.
 */

export type { UFMSourceType, UFMInput, UFMResult, UFMSafetyResult } from "./types";
export { detectSourceType } from "./detector";
export { validateInput, createSafetyErrorMessage } from "./safety";
export {
  extractFromUrl,
  extractFromText,
  extractFromPdfText,
  extractFromDocxText,
  extractFromImageAnalysis,
} from "./extractors";

import type { UFMInput, UFMResult } from "./types";
import { detectSourceType } from "./detector";
import { validateInput, createSafetyErrorMessage } from "./safety";
import { extractFromUrl, extractFromText, extractFromPdfText, extractFromDocxText, extractFromImageAnalysis } from "./extractors";

/**
 * Universal fetch — the single entry point for all source types.
 * 
 * For URL sources, `htmlContent` must be provided (fetched externally).
 * For image sources, `visionAnalysis` must be provided (analyzed externally via AI).
 * For PDF/DOCX, `extractedText` must be provided (parsed externally).
 */
export async function universalFetch(input: UFMInput & {
  htmlContent?: string;
  extractedText?: string;
  extractedMetadata?: Record<string, string>;
  visionAnalysis?: string;
}): Promise<UFMResult> {
  const sourceType = input.sourceType || detectSourceType(input.source, input.fileName, input.mimeType);

  // Safety Layer
  const safety = validateInput(input.source, sourceType);
  if (!safety.safe) {
    return {
      sourceType,
      title: "",
      meta: {},
      headings: [],
      text: "",
      links: [],
      images: [],
      layout: { hasNavbar: false, hasSidebar: false, hasFooter: false, hasHero: false, hasDashboard: false, sections: [] },
      components: [],
      tables: [],
      raw: "",
      success: false,
      error: createSafetyErrorMessage(safety),
    };
  }

  // Route to appropriate extractor
  switch (sourceType) {
    case "url":
      if (!input.htmlContent) {
        return failResult(sourceType, "No HTML content provided for URL analysis.");
      }
      return extractFromUrl(input.htmlContent, input.source);

    case "pdf":
      if (!input.extractedText) {
        return failResult(sourceType, "No extracted text provided for PDF analysis. Please process the PDF first.");
      }
      return extractFromPdfText(input.extractedText, input.extractedMetadata);

    case "docx":
      if (!input.extractedText) {
        return failResult(sourceType, "No extracted text provided for DOCX analysis. Please process the document first.");
      }
      return extractFromDocxText(input.extractedText, input.extractedMetadata);

    case "image":
      if (!input.visionAnalysis) {
        return failResult(sourceType, "No vision analysis provided for image. Please analyze the image first.");
      }
      return extractFromImageAnalysis(input.visionAnalysis, input.source);

    case "text":
      return extractFromText(input.source, input.fileName);

    default:
      return failResult(sourceType, "Unsupported source type.");
  }
}

function failResult(sourceType: UFMResult["sourceType"], error: string): UFMResult {
  return {
    sourceType,
    title: "",
    meta: {},
    headings: [],
    text: "",
    links: [],
    images: [],
    layout: { hasNavbar: false, hasSidebar: false, hasFooter: false, hasHero: false, hasDashboard: false, sections: [] },
    components: [],
    tables: [],
    raw: "",
    success: false,
    error,
  };
}
