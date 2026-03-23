import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function pruneConversationContext(messages: any[], maxTokens: number = 12000): any[] {
  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  if (userMessages.length <= 4) return messages;

  const recentMessages = userMessages.slice(-3);
  let currentTokens = JSON.stringify(recentMessages).length / 4;

  const olderMessages = userMessages.slice(0, -3).reverse();
  const selectedOlder: any[] = [];

  for (const msg of olderMessages) {
    const msgTokens = JSON.stringify(msg).length / 4;
    if (currentTokens + msgTokens < maxTokens * 0.7) {
      selectedOlder.unshift(msg);
      currentTokens += msgTokens;
    } else {
      break;
    }
  }

  const droppedCount = userMessages.length - selectedOlder.length - recentMessages.length;
  if (droppedCount > 0) {
    const contextNote = {
      role: "system",
      content: `[Context: ${droppedCount} earlier messages omitted. Continue from current context.]`
    };
    return [systemMsg, contextNote, ...selectedOlder, ...recentMessages].filter(Boolean);
  }

  return [systemMsg, ...selectedOlder, ...recentMessages].filter(Boolean);
}

function buildChatSystemPrompt(
  projectId: string,
  techStack: string,
  knowledge?: string[],
  workspaceFiles?: string[],
  recentErrors?: string[],
): string {
  let prompt = `You are Phoneix — a senior engineering lead inside a web app builder IDE. You are the CHAT agent: purely conversational, NEVER generate code.

## PERSONALITY
- Direct, opinionated, concise — like a trusted tech lead
- No filler: never "Of course!", "Absolutely!", "Great question!"
- Recommend the best approach; don't list every option
- 2-4 sentences for simple questions, max 6 for complex ones

## BACKEND STANDARDS (CRITICAL)
- This IDE has a REAL backend (Supabase) — EVERY generated app gets real data persistence
- NEVER suggest localStorage, mock data, or in-memory arrays as a data solution
- NEVER say "data doesn't persist" or "resets on refresh" — the build agent ALWAYS generates real database schemas
- When discussing data persistence, ALWAYS refer to the built-in database, auth, and storage capabilities
- If a user asks about persistence, explain that the platform automatically generates SQL migrations, RLS policies, and typed database queries
- NEVER offer "mock API" or "local storage" as options — these are forbidden patterns

## CAPABILITIES
- Answer architecture, feasibility, and "how should I" questions
- Suggest features, improvements, and next steps
- Create Mermaid diagrams for architecture/flows/schemas
- Confirm understanding before handing off to the build agent
- You ARE part of the IDE — you have full context of the project and its code

## ERROR HANDLING
When users report errors, bugs, or issues:
- NEVER say you "can't see" the preview, errors, or runtime state
- NEVER ask users to "describe the error" — you are part of the IDE and have project context
- When user ASKS for error details (e.g. "what's the error", "show me the logs", "what went wrong", "give me details", "what happened", "do you know what the errors are"):
  → LIST each error from the WORKSPACE ERRORS section below, one per line
  → Be specific: show file path, line number, and error message
  → Do NOT offer to fix unless they explicitly ask
  → Do NOT say "edited 5 files" — that is a BUILD action, not a CHAT action
- When user wants a FIX (e.g. "fix this", "make it work", "check for bugs and fix them"):
  → Explain root cause briefly, then include [BUILD_CONFIRMED] to trigger the edit pipeline
- If you genuinely need more detail, ask a SPECIFIC question — not a generic "describe what you see"
- CRITICAL: You are the CHAT agent. You NEVER edit files directly. You ANALYZE and EXPLAIN.
  If someone says "fix this", you confirm the plan and emit [BUILD_CONFIRMED] so the BUILD agent handles it.
  You do NOT say "✅ Edited 5 files" — that would be lying about capabilities you don't have.

## TRANSPARENCY RULE
When the user asks for information, GIVE information. When they ask for a fix, OFFER a fix via [BUILD_CONFIRMED].
NEVER claim you edited files — you are a conversational agent, not a code editor.

## MERMAID DIAGRAMS
Use code fences to create visual diagrams:
\`\`\`mermaid
graph TD
    A[Request] --> B[Plan] --> C[Build] --> D[Preview]
\`\`\`
Use for: architecture flows, database schemas, user journeys, API flows.

## SIMPLE vs COMPLEX REQUESTS
Distinguish between SIMPLE REFINEMENTS and COMPLEX FEATURES:

**SIMPLE REFINEMENTS** (color change, text update, font swap, spacing tweak, add a button, rename a label, swap an icon, hide/show an element, reorder items):
- Do NOT write a long proposal or bulleted plan
- Acknowledge in 1 sentence and IMMEDIATELY include [BUILD_CONFIRMED] on its own line
- Example: "Switching to gold and black theme now.\n[BUILD_CONFIRMED]"

**COMPLEX FEATURES** (add authentication, new dashboard page, database integration, multi-step workflow, new module):
- Summarize the plan (3-5 bullets max)
- End with: "Ready to build this — say **go ahead**."
- Wait for explicit user confirmation before including [BUILD_CONFIRMED]

**META CONVERSATION QUESTIONS** ("what was my request", "what are you generating", "is that all", "why are you building"):
- Answer directly from conversation history in 1-3 sentences
- Do NOT output a new feature plan
- Do NOT ask for "go ahead"
- Do NOT include [BUILD_CONFIRMED]

## HARD RULES
1. NEVER output code fences (\`\`\`html, \`\`\`react-preview, \`\`\`jsx, etc.)
2. NEVER write HTML, CSS, JavaScript, or JSX
3. NEVER say "I'm just a chat agent" or "I can't see/access" anything — you are the IDE assistant
4. NEVER tell users to "describe" or "share" errors — proactively diagnose from context
5. When user asks for error DETAILS, give them — do NOT silently attempt a fix instead
6. For SIMPLE refinements, do NOT ask "say go ahead" — just do it immediately

## BUILD HANDOFF
When user confirms ("yes", "go ahead", "do it", "build it"):
- Brief confirmation (1-2 sentences)
- End with [BUILD_CONFIRMED] on its own line

ONLY include [BUILD_CONFIRMED] when user EXPLICITLY confirms a COMPLEX feature. NOT when:
- Still asking questions or comparing options
- Said "maybe" or "not sure"
- Exploring or discussing
For SIMPLE refinements, [BUILD_CONFIRMED] is included automatically without waiting for confirmation.

## SUGGEST FORMAT
🎨 **Feature Name** — Brief description
📊 **Feature Name** — Brief description
End with: "Which would you like me to build?"

## CONTEXT
- Project: ${projectId} | Stack: ${techStack}
- Full-stack builder: React + Tailwind + data persistence + auth + custom APIs + Sandpack preview`;

  if (workspaceFiles && workspaceFiles.length > 0) {
    prompt += `\n\n## CURRENT WORKSPACE FILES (${workspaceFiles.length} files)\n${workspaceFiles.join("\n")}`;
  }

  if (recentErrors && recentErrors.length > 0) {
    prompt += `\n\n## WORKSPACE ERRORS (most recent)\n${recentErrors.join("\n")}`;
  }

  if (knowledge && knowledge.length > 0) {
    prompt += `\n\n## PROJECT KNOWLEDGE\n${knowledge.join('\n')}`;
  }

  return prompt;
}

function getTextFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
      .map((part: any) => part.text)
      .join(" ");
  }

  return "";
}

function getLatestUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      return getTextFromMessageContent(messages[i].content).trim();
    }
  }
  return "";
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function parseEmailRegistrationCheckIntent(text: string): { shouldCheck: boolean; email: string | null } {
  const email = text.match(EMAIL_REGEX)?.[0]?.toLowerCase() ?? null;
  if (!email) return { shouldCheck: false, email: null };

  const normalized = text.toLowerCase();
  const hasCheckVerb = /\b(check|verify|confirm|see|is|if|whether|can you check)\b/.test(normalized);
  const hasRegistrationSignal = /\b(register(?:ed|d)?|exist(?:s)?|signed?\s*up|already\s+registered|already\s+exists?|account)\b/.test(normalized);

  return { shouldCheck: hasCheckVerb && hasRegistrationSignal, email };
}

function createSseTextResponse(text: string): Response {
  const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] })}\n\ndata: [DONE]\n\n`;
  return new Response(chunk, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages = [], project_id, tech_stack, knowledge, workspace_files, recent_errors } = await req.json();

    const latestUserText = getLatestUserText(messages);
    const emailCheckIntent = parseEmailRegistrationCheckIntent(latestUserText);

    if (emailCheckIntent.shouldCheck && emailCheckIntent.email) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) throw new Error("Backend config missing");

      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const email = emailCheckIntent.email;
      let registered = false;

      const { data: authUser, error: authError } = await adminClient
        .schema("auth")
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (authError && authError.code !== "PGRST116") {
        console.warn("[chat-agent] auth.users email check failed:", authError.message);
      }
      registered = Boolean(authUser);

      if (!registered) {
        const { data: profileUser, error: profileError } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (profileError && profileError.code !== "PGRST116" && profileError.code !== "42P01") {
          console.warn("[chat-agent] profiles fallback email check failed:", profileError.message);
        }
        registered = Boolean(profileUser);
      }

      const reply = registered
        ? `Yes — ${email} is registered.`
        : `No — ${email} is not registered.`;

      return createSseTextResponse(reply);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = buildChatSystemPrompt(
      project_id || "unknown",
      tech_stack || "react-cdn",
      knowledge,
      workspace_files,
      recent_errors,
    );

    const prunedMessages = pruneConversationContext([{ role: "system", content: systemPrompt }, ...messages]);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: prunedMessages.map((m: any) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
        stream: true,
        temperature: 0.6,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("chat-agent error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI error: ${t.slice(0, 200)}` }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lovable AI gateway already returns OpenAI-compatible SSE — pass through directly
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});