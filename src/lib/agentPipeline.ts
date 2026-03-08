/**
 * Agent Pipeline — orchestrates the classify → chat/build flow.
 * 
 * Architecture:
 * 1. Intent Classifier (fast, cheap model) → determines chat/build/clarify
 * 2. Chat Agent (conversational only, no code) — for questions/discussions
 * 3. Build Agent (code generation only) — for creating/modifying apps
 * 4. Sandpack Validation — validates generated code before showing
 */

type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type Msg = { role: "user" | "assistant"; content: MsgContent };

export type AgentIntent = "chat" | "build" | "clarify";

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
  | "bundling"
  | "validating"
  | "complete"
  | "error";

export interface PipelineEvent {
  step: PipelineStep;
  message: string;
  intent?: AgentIntent;
}

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

/**
 * Step 1: Classify user intent
 */
export async function classifyIntent(
  prompt: string,
  hasHistory: boolean,
  hasExistingCode: boolean
): Promise<ClassifyResult> {
  try {
    const resp = await fetch(`${BASE_URL}/functions/v1/classify-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({ prompt, hasHistory, hasExistingCode }),
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
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

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
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onDelta(content);
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  return fullText;
}

/**
 * Validate generated React code (basic checks before Sandpack)
 */
export function validateReactCode(files: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check entry point exists
  if (!files["/App.jsx"] && !files["/App.js"]) {
    errors.push("Missing entry point: /App.jsx");
  }

  // Check for common syntax issues
  for (const [path, code] of Object.entries(files)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    // Check for bracket notation in JSX
    if (/<\w+\[/.test(code)) {
      errors.push(`${path}: Invalid JSX — bracket notation in tags`);
    }

    // Check for unclosed tags (basic heuristic)
    const openTags = (code.match(/<\w+/g) || []).length;
    const closeTags = (code.match(/<\/\w+>/g) || []).length;
    const selfClose = (code.match(/\/>/g) || []).length;
    if (openTags > closeTags + selfClose + 5) {
      errors.push(`${path}: Possible unclosed JSX tags`);
    }

    // Check for missing default export in App.jsx
    if ((path === "/App.jsx" || path === "/App.js") && !code.includes("export default")) {
      errors.push(`${path}: Missing default export`);
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
  return text.replace("[BUILD_CONFIRMED]", "").trim();
}
