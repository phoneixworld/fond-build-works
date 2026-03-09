/**
 * Streaming Preview — parses partial AI output during streaming
 * and renders incremental file updates to the preview every 500ms.
 *
 * This gives users real-time visual feedback as code is generated,
 * matching Lovable's streaming preview behavior.
 */

import { parseStructuredOutput } from "@/lib/structuredParser";

export interface StreamingParseResult {
  files: Record<string, string>;
  deps: Record<string, string>;
  isComplete: boolean;
  fileCount: number;
}

/**
 * Parse partial streaming output into renderable files.
 * Handles incomplete fences, partial file content, and in-progress code.
 */
export function parseStreamingOutput(partialText: string): StreamingParseResult {
  // Try the structured parser first — works on complete fences
  const fullResult = parseStructuredOutput(partialText);
  if (fullResult.files && Object.keys(fullResult.files).length > 0) {
    return {
      files: fullResult.files,
      deps: fullResult.deps,
      isComplete: true,
      fileCount: Object.keys(fullResult.files).length,
    };
  }

  // Partial fence parsing — extract files from an incomplete code fence
  return parsePartialFence(partialText);
}

/**
 * Parse files from an incomplete/in-progress code fence.
 * This extracts fully-written files even when the fence hasn't closed yet.
 */
function parsePartialFence(text: string): StreamingParseResult {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};

  // Find any fence opener
  const fencePatterns = ["```react-preview", "```jsx-preview", "```react", "```jsx", "```tsx"];
  let fenceStart = -1;
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) break;
  }

  if (fenceStart === -1) {
    return { files: {}, deps: {}, isComplete: false, fileCount: 0 };
  }

  const codeStart = text.indexOf("\n", fenceStart) + 1;
  if (codeStart === 0) {
    return { files: {}, deps: {}, isComplete: false, fileCount: 0 };
  }

  const block = text.slice(codeStart);
  const FILE_SEP = /^-{3}\s+(\/?\w[\w/.\-]*\.(?:jsx?|tsx?|css|json))\s*(?:-{0,3})?\s*$/;
  const DEPS_SEP = /^-{3}\s+dependencies\s*$/i;

  const lines = block.split("\n");
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  let inDeps = false;
  let depsLines: string[] = [];

  function flush() {
    if (currentFile) {
      const code = currentLines.join("\n").trim();
      if (code.length > 10) { // Only include files with meaningful content
        let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
        fname = fname.replace(/^\/src\//, "/");
        files[fname] = code;
      }
    }
    if (inDeps && depsLines.length > 0) {
      try {
        Object.assign(deps, JSON.parse(depsLines.join("\n").trim()));
      } catch {
        // Incomplete JSON — skip
      }
      inDeps = false;
      depsLines = [];
    }
    currentFile = null;
    currentLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at fence close
    if (/^```\s*$/.test(trimmed)) {
      flush();
      break;
    }

    if (DEPS_SEP.test(trimmed)) {
      flush();
      inDeps = true;
      continue;
    }

    const fileMatch = trimmed.match(FILE_SEP);
    if (fileMatch) {
      flush();
      currentFile = fileMatch[1];
      continue;
    }

    if (inDeps) depsLines.push(line);
    else if (currentFile) currentLines.push(line);
  }

  // Flush the last file (which may be incomplete)
  // Only include if it has enough content to be renderable
  if (currentFile) {
    const code = currentLines.join("\n").trim();
    if (code.length > 30) {
      let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
      fname = fname.replace(/^\/src\//, "/");

      // Check if the code looks complete enough to render
      // (has at least one export or function declaration)
      if (code.includes("export") || code.includes("function") || fname.endsWith(".css")) {
        files[fname] = code;
      }
    }
  }

  return {
    files,
    deps,
    isComplete: false,
    fileCount: Object.keys(files).length,
  };
}

/**
 * Streaming preview controller — manages throttled preview updates
 * during a build stream.
 */
export class StreamingPreviewController {
  private buffer = "";
  private lastUpdateTime = 0;
  private lastFileCount = 0;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private onUpdate: (files: Record<string, string>, deps: Record<string, string>) => void;
  private minIntervalMs: number;

  constructor(
    onUpdate: (files: Record<string, string>, deps: Record<string, string>) => void,
    minIntervalMs = 500
  ) {
    this.onUpdate = onUpdate;
    this.minIntervalMs = minIntervalMs;
  }

  /** Call this on each streaming delta */
  addChunk(chunk: string): void {
    this.buffer += chunk;

    const now = Date.now();
    if (now - this.lastUpdateTime >= this.minIntervalMs) {
      this.tryUpdate();
    }
  }

  /** Start periodic update checks */
  start(): void {
    this.buffer = "";
    this.lastUpdateTime = 0;
    this.lastFileCount = 0;
    this.updateInterval = setInterval(() => this.tryUpdate(), this.minIntervalMs);
  }

  /** Stop and flush final update */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    // Final flush
    this.tryUpdate();
    this.buffer = "";
  }

  private tryUpdate(): void {
    if (!this.buffer) return;

    const result = parseStreamingOutput(this.buffer);
    if (result.fileCount > 0 && result.fileCount > this.lastFileCount) {
      this.lastFileCount = result.fileCount;
      this.lastUpdateTime = Date.now();
      this.onUpdate(result.files, result.deps);
    }
  }
}