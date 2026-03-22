/**
 * UFM+ Source Type Detector
 * 
 * Auto-detects the type of input based on file extension, MIME type, or content analysis.
 */

import type { UFMSourceType } from "./types";

const EXTENSION_MAP: Record<string, UFMSourceType> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".doc": "docx",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".svg": "image",
  ".txt": "text",
  ".md": "text",
  ".csv": "text",
  ".json": "text",
  ".xml": "text",
  ".html": "text",
  ".htm": "text",
  ".zip": "zip",
};

const MIME_MAP: Record<string, UFMSourceType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "text/html": "text",
  "application/json": "text",
  "application/xml": "text",
  "application/zip": "zip",
};

const URL_PATTERN = /^https?:\/\//i;
const BASE64_PATTERN = /^data:([^;]+);base64,/;

export function detectSourceType(
  source: string,
  fileName?: string,
  mimeType?: string,
): UFMSourceType {
  // Explicit MIME type
  if (mimeType && MIME_MAP[mimeType]) return MIME_MAP[mimeType];

  // Base64 data URL
  const b64Match = source.match(BASE64_PATTERN);
  if (b64Match) {
    const detectedMime = b64Match[1];
    if (MIME_MAP[detectedMime]) return MIME_MAP[detectedMime];
  }

  // URL
  if (URL_PATTERN.test(source)) return "url";

  // File extension
  if (fileName) {
    const ext = fileName.toLowerCase().match(/\.\w+$/)?.[0];
    if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  // Content heuristics
  if (source.startsWith("%PDF")) return "pdf";
  if (source.startsWith("PK")) return "zip"; // ZIP/DOCX magic bytes
  if (source.length < 50000 && !source.includes("\0")) return "text";

  return "unknown";
}

export function isSupported(sourceType: UFMSourceType): boolean {
  return sourceType !== "unknown" && sourceType !== "zip";
}
