/**
 * UFM+ Safety Layer (SL)
 * 
 * Validates inputs before processing. Catches corrupted, encrypted,
 * unsupported, or unreadable files.
 */

import type { UFMSourceType, UFMSafetyResult } from "./types";
import { isSupported } from "./detector";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_TEXT_LENGTH = 500_000; // ~500K chars

export function validateInput(
  source: string,
  sourceType: UFMSourceType,
): UFMSafetyResult {
  // Empty input
  if (!source || source.trim().length === 0) {
    return {
      safe: false,
      error: "empty",
      message: "The input is empty. Please provide content to analyze.",
    };
  }

  // Unsupported type
  if (!isSupported(sourceType)) {
    return {
      safe: false,
      error: "unsupported",
      message: "I couldn't read this file. Please upload a different version or describe what you want to build.",
    };
  }

  // Size check (for non-URL sources)
  if (sourceType !== "url") {
    const sizeEstimate = new Blob([source]).size;
    if (sizeEstimate > MAX_SIZE_BYTES) {
      return {
        safe: false,
        error: "too_large",
        message: "This file is too large to process. Please upload a smaller version (under 20MB).",
      };
    }
  }

  // Text length check
  if (sourceType === "text" && source.length > MAX_TEXT_LENGTH) {
    return {
      safe: false,
      error: "too_large",
      message: "This text is too long to process. Please provide a shorter version.",
    };
  }

  // PDF encryption hint (basic check)
  if (sourceType === "pdf") {
    // Check for common encrypted PDF markers in base64-decoded content
    if (source.includes("/Encrypt") && source.includes("/Standard")) {
      return {
        safe: false,
        error: "encrypted",
        message: "This PDF appears to be encrypted. Please upload an unencrypted version.",
      };
    }
  }

  return { safe: true };
}

export function createSafetyErrorMessage(error: UFMSafetyResult): string {
  return error.message || "I couldn't read this file. Please upload a different version or describe what you want to build.";
}
