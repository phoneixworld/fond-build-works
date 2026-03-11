/**
 * Agent Pipeline — orchestrates the classify → chat/build flow.
 * 
 * Architecture:
 * 1. Intent Classifier (fast, cheap model) → determines chat/build/clarify
 * 2. Chat Agent (conversational only, no code) — for questions/discussions
 * 3. Build Agent (code generation only) — for creating/modifying apps
 * 4. Sandpack Validation — validates generated code before showing
 * 5. Sucrase Syntax Check — catches real parse errors before preview
 * 6. Auto-Retry — if validation fails, retries with error context (up to 3x)
 * 7. Runtime Self-Heal — detects preview console errors and auto-fixes
 */
import { transform } from "sucrase";

type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type Msg = { role: "user" | "assistant"; content: MsgContent };

export type AgentIntent = "chat" | "build" | "edit" | "clarify";

export interface ClassifyResult {
  intent: AgentIntent;
  confidence: number;
  reasoning?: string;
  analysis?: {
    needsBackend: boolean;
    needsAuth: boolean;
    complexity: "simple" | "medium" | "complex";
  };
  questions?: any[];
}

export type PipelineStep =
  | "classifying"
  | "chatting"
  | "planning"
  | "generating"
  | "editing"
  | "resolving"
  | "bundling"
  | "validating"
  | "retrying"
  | "complete"
  | "error";

export interface PipelineEvent {
  step: PipelineStep;
  message: string;
  intent?: AgentIntent;
  retryCount?: number;
}

export const MAX_BUILD_RETRIES = 3;

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

/**
 * Step 1: Classify user intent
 */
export async function classifyIntent(
  prompt: string,
  hasHistory: boolean,
  hasExistingCode: boolean,
  existingFileNames?: string[]
): Promise<ClassifyResult> {
  try {
    const resp = await fetch(`${BASE_URL}/functions/v1/classify-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({ prompt, hasHistory, hasExistingCode, existingFileNames }),
    });

    if (!resp.ok) {
      return { intent: "build", confidence: 0.5, questions: [] };
    }

    return await resp.json();
  } catch {
    return { intent: "build", confidence: 0.5, questions: [] };
  }
}

/**
 * Step 2a: Stream chat response (no code generation)
 */
export async function streamChatAgent({
  messages,
  projectId,
  techStack,
  knowledge,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  projectId?: string;
  techStack?: string;
  knowledge?: string[];
  onDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}) {
  let resp: Response | null = null;
  try {
    resp = await fetch(`${BASE_URL}/functions/v1/chat-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({
        messages,
        project_id: projectId,
        tech_stack: techStack,
        knowledge,
      }),
    });
  } catch {
    onError("Network error. Check your connection.");
    return;
  }

  if (!resp || !resp.ok || !resp.body) {
    if (resp?.status === 429) { onError("Rate limited. Try again shortly."); return; }
    if (resp?.status === 402) { onError("Usage limit reached."); return; }
    onError("Failed to connect to chat agent.");
    return;
  }

  const fullText = await readSSEStream(resp.body, onDelta);
  onDone(fullText);
}

/**
 * Step 2b: Stream build agent response (code generation)
 */
export async function streamBuildAgent({
  messages,
  projectId,
  techStack,
  schemas,
  model,
  designTheme,
  knowledge,
  templateContext,
  currentCode,
  snippetsContext,
  retryContext,
  maxTokens,
  taskType,
  irContext,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  projectId?: string;
  techStack?: string;
  schemas?: any[];
  model?: string;
  designTheme?: string;
  knowledge?: string[];
  templateContext?: string;
  currentCode?: string;
  snippetsContext?: string;
  retryContext?: string;
  maxTokens?: number;
  taskType?: string;
  irContext?: string;
  onDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}) {
  let resp: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resp = await fetch(`${BASE_URL}/functions/v1/build-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: AUTH_HEADER,
        },
        body: JSON.stringify({
          messages,
          project_id: projectId,
          tech_stack: techStack,
          schemas,
          model,
          design_theme: designTheme,
          knowledge,
          template_context: templateContext,
          current_code: currentCode,
          snippets_context: snippetsContext,
          retry_context: retryContext,
          max_tokens: maxTokens,
          task_type: taskType,
          ir_context: irContext,
        }),
      });
      break;
    } catch (err) {
      if (attempt === 0) {
        console.warn("[buildAgent] Network error, retrying...", err);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      onError("Network error. Check your connection.");
      return;
    }
  }

  if (!resp || !resp.ok || !resp.body) {
    if (resp?.status === 429) { onError("Rate limited. Try again shortly."); return; }
    if (resp?.status === 402) { onError("Usage limit reached."); return; }
    onError("Failed to connect to build agent.");
    return;
  }

  const fullText = await readSSEStream(resp.body, onDelta);
  onDone(fullText);
}

/**
 * Shared SSE stream reader
 */
async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";
  let rawAccumulated = "";
  let done = false;
  let hasReceivedSSEData = false;
  let chunkCount = 0;

  // Timeout: must be longer than the build safety timeout (480s)
  // Complex multi-task builds can take 3-5 minutes with sequential AI calls
  const timeoutMs = 600_000; // 10 minutes
  const startTime = Date.now();
  let lastDataTime = Date.now(); // Track last SSE data for idle timeout

  while (!done) {
    if (Date.now() - startTime > timeoutMs) {
      console.warn("[readSSEStream] Timeout after 120s");
      break;
    }
    const { done: rd, value } = await reader.read();
    if (rd) break;
    const chunk = decoder.decode(value, { stream: true });
    buf += chunk;
    rawAccumulated += chunk;
    chunkCount++;

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        // Check for error in SSE payload
        if (parsed.error) {
          console.error("[readSSEStream] AI gateway error in SSE:", parsed.error);
          const errMsg = typeof parsed.error === "string" ? parsed.error : parsed.error.message || JSON.stringify(parsed.error);
          fullText += `\n[AI Error: ${errMsg}]`;
          onDelta(`\n[AI Error: ${errMsg}]`);
          done = true;
          break;
        }
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          hasReceivedSSEData = true;
          fullText += content;
          onDelta(content);
        }
        // Check for finish_reason
        const finishReason = parsed.choices?.[0]?.finish_reason;
        if (finishReason && finishReason !== "stop") {
          console.warn(`[readSSEStream] Model finished with reason: ${finishReason}`);
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  // If no SSE data was extracted, try parsing raw as JSON error
  if (!hasReceivedSSEData && rawAccumulated.trim().length > 0) {
    console.warn(`[readSSEStream] No SSE content extracted from ${chunkCount} chunks (${rawAccumulated.length} bytes). First 500 chars:`, rawAccumulated.slice(0, 500));
    try {
      const errorJson = JSON.parse(rawAccumulated.trim());
      if (errorJson.error) {
        const errMsg = typeof errorJson.error === "string" ? errorJson.error : errorJson.error.message || JSON.stringify(errorJson.error);
        console.error("[readSSEStream] AI gateway returned JSON error:", errMsg);
        fullText = `[AI Error: ${errMsg}]`;
      }
    } catch {
      // Not JSON either — log raw response
      console.warn("[readSSEStream] Raw non-SSE response:", rawAccumulated.slice(0, 1000));
    }
  }

  if (fullText.length === 0) {
    console.error(`[readSSEStream] Empty response after reading ${chunkCount} chunks`);
  }

  return fullText;
}

/**
 * Validate generated React code with comprehensive checks + Sucrase syntax verification
 */
export function validateReactCode(files: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check entry point exists
  if (!files["/App.jsx"] && !files["/App.js"] && !files["/App.tsx"]) {
    errors.push("Missing entry point: /App.jsx — must have a default-exported App component");
  }

  for (const [path, code] of Object.entries(files)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    // Check for bracket notation in JSX
    if (/<\w+\[/.test(code)) {
      errors.push(`${path}: Invalid JSX — bracket notation in tags (e.g. <arr[0].icon />). Assign to a variable first.`);
    }

    // Check for unclosed tags (basic heuristic)
    const openTags = (code.match(/<\w+/g) || []).length;
    const closeTags = (code.match(/<\/\w+>/g) || []).length;
    const selfClose = (code.match(/\/>/g) || []).length;
    if (openTags > closeTags + selfClose + 5) {
      errors.push(`${path}: Possible unclosed JSX tags (${openTags} open, ${closeTags} close, ${selfClose} self-closing)`);
    }

    // Check for missing default export in App
    if ((path === "/App.jsx" || path === "/App.js" || path === "/App.tsx") && !code.includes("export default")) {
      errors.push(`${path}: Missing default export — App component must use 'export default'`);
    }

    // Check for require() usage
    if (/\brequire\s*\(/.test(code)) {
      errors.push(`${path}: Uses require() — must use ES6 import syntax instead`);
    }

    // Check for empty component files
    if (code.trim().length < 20) {
      errors.push(`${path}: File appears empty or incomplete (${code.trim().length} chars)`);
    }

    // Check for unmatched curly braces (basic)
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (Math.abs(openBraces - closeBraces) > 2) {
      errors.push(`${path}: Mismatched curly braces (${openBraces} open, ${closeBraces} close)`);
    }

    // ─── Sucrase Syntax Validation ─────────────────────────────────────
    // This catches REAL parse errors (unterminated strings, bad JSX, etc.)
    try {
      const isTs = path.endsWith(".tsx") || path.endsWith(".ts");
      transform(code, {
        transforms: isTs ? ["typescript", "jsx"] : ["jsx"],
        jsxRuntime: "automatic",
        production: true,
      });
    } catch (parseErr: any) {
      const msg = parseErr?.message || String(parseErr);
      // Extract line number if available
      const lineMatch = msg.match(/(\d+):(\d+)/);
      const location = lineMatch ? ` (line ${lineMatch[1]}, col ${lineMatch[2]})` : "";
      errors.push(`${path}: Syntax error${location} — ${msg.split("\n")[0]}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a chat response contains a build confirmation marker
 */
export function hasBuildConfirmation(text: string): boolean {
  return text.includes("[BUILD_CONFIRMED]");
}

/**
 * Extract the chat text without the build marker
 */
export function stripBuildMarker(text: string): string {
  return text.replace(/\[BUILD_CONFIRMED\]/g, "").trim();
}

/**
 * Format validation errors as retry context for the build agent
 * Enhanced with code snippets and specific guidance
 */
export function formatRetryContext(errors: string[], attemptNumber: number, files?: Record<string, string>): string {
  let context = `🔴 BUILD VALIDATION FAILED — Attempt ${attemptNumber} of ${MAX_BUILD_RETRIES + 1}

${errors.length} critical error(s) detected:

`;

  errors.forEach((error, i) => {
    context += `${i + 1}. ${error}\n`;
    
    // Extract file path from error message
    const fileMatch = error.match(/^(\/[\w\/\-\.]+):/);
    if (fileMatch && files) {
      const filePath = fileMatch[1];
      const fileCode = files[filePath];
      
      if (fileCode) {
        // Show relevant snippet around the error
        const lines = fileCode.split('\n');
        const previewLines = lines.slice(0, Math.min(15, lines.length));
        context += `\n   📄 Current code in ${filePath} (first 15 lines):\n`;
        context += previewLines.map((line, idx) => `   ${idx + 1}: ${line}`).join('\n');
        context += `\n   ... (${lines.length} total lines)\n\n`;
      }
    }
  });

  context += `\n⚠️ These errors MUST be fixed in this attempt. Review carefully and correct ALL issues.`;
  
  return context;
}
