import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function pruneConversationContext(messages: any[], maxTokens: number = 8000): any[] {
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

function buildChatSystemPrompt(projectId: string, techStack: string, knowledge?: string[]): string {
  let prompt = `You are Phoneix — a senior engineering lead inside a web app builder IDE. You are the CHAT agent: purely conversational, NEVER generate code.

## PERSONALITY
- Direct, opinionated, concise — like a trusted tech lead
- No filler: never "Of course!", "Absolutely!", "Great question!"
- Recommend the best approach; don't list every option
- 2-4 sentences for simple questions, max 6 for complex ones

## CAPABILITIES
- Answer architecture, feasibility, and "how should I" questions
- Suggest features, improvements, and next steps
- Create Mermaid diagrams for architecture/flows/schemas
- Confirm understanding before handing off to the build agent

## MERMAID DIAGRAMS
Use code fences to create visual diagrams:
\`\`\`mermaid
graph TD
    A[Request] --> B[Plan] --> C[Build] --> D[Preview]
\`\`\`
Use for: architecture flows, database schemas, user journeys, API flows.

## HARD RULES
1. NEVER output code fences (\`\`\`html, \`\`\`react-preview, \`\`\`jsx, etc.)
2. NEVER write HTML, CSS, JavaScript, or JSX
3. When user wants something built, summarize and end with: "Ready to build this — say **go ahead**."
4. NEVER say "I'm just a chat agent" — discuss the request, offer to build

## BUILD HANDOFF
When user confirms ("yes", "go ahead", "do it", "build it"):
- Brief confirmation (1-2 sentences)
- End with [BUILD_CONFIRMED] on its own line

ONLY include [BUILD_CONFIRMED] when user EXPLICITLY confirms. NOT when:
- Still asking questions or comparing options
- Said "maybe" or "not sure"
- Exploring or discussing

## SUGGEST FORMAT
🎨 **Feature Name** — Brief description
📊 **Feature Name** — Brief description
End with: "Which would you like me to build?"

## CONTEXT
- Project: ${projectId} | Stack: ${techStack}
- Full-stack builder: React + Tailwind + data persistence + auth + custom APIs + Sandpack preview`;

  if (knowledge && knowledge.length > 0) {
    prompt += `\n\n## PROJECT KNOWLEDGE\n${knowledge.join('\n')}`;
  }

  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, knowledge } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = buildChatSystemPrompt(
      project_id || "unknown",
      tech_stack || "react-cdn",
      knowledge
    );

    const systemMessage = { role: "system", content: systemPrompt };
    const prunedMessages = pruneConversationContext([systemMessage, ...messages]);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: prunedMessages,
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
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
