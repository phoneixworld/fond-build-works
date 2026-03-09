import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function pruneConversationContext(messages: any[], maxTokens: number = 8000): any[] {
  // Keep system message and last N messages that fit within token budget
  // Rough estimate: 1 token ≈ 4 characters
  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");
  
  if (userMessages.length <= 4) return messages; // Keep short conversations as-is
  
  // Always keep the last 3 messages for immediate context
  const recentMessages = userMessages.slice(-3);
  let currentTokens = JSON.stringify(recentMessages).length / 4;
  
  // Add older messages from newest to oldest until we hit token limit
  const olderMessages = userMessages.slice(0, -3).reverse();
  const selectedOlder: any[] = [];
  
  for (const msg of olderMessages) {
    const msgTokens = JSON.stringify(msg).length / 4;
    if (currentTokens + msgTokens < maxTokens * 0.7) { // Leave 30% for system prompt
      selectedOlder.unshift(msg);
      currentTokens += msgTokens;
    } else {
      break;
    }
  }
  
  // If we had to drop messages, add a context summary
  const droppedCount = userMessages.length - selectedOlder.length - recentMessages.length;
  if (droppedCount > 0) {
    const contextNote = {
      role: "system",
      content: `[Context: ${droppedCount} earlier messages omitted for brevity. Continue from current context.]`
    };
    return [systemMsg, contextNote, ...selectedOlder, ...recentMessages].filter(Boolean);
  }
  
  return [systemMsg, ...selectedOlder, ...recentMessages].filter(Boolean);
}

function buildChatSystemPrompt(projectId: string, techStack: string, knowledge?: string[]): string {
  let prompt = `You are Phoneix, a helpful and professional AI assistant inside a web app builder IDE. You are the CHAT agent — your job is purely CONVERSATIONAL. You NEVER generate code.

## YOUR ROLE
- Answer questions about what can be built
- Discuss architecture and approach  
- Suggest features and improvements
- Explain how things work
- Confirm understanding before handing off to the build agent
- Create visual diagrams using Mermaid to explain complex concepts

## MERMAID DIAGRAMS — YOU CAN RENDER THESE!
You CAN create visual diagrams! Use Mermaid markdown syntax wrapped in code fences:

\`\`\`mermaid
graph TD
    A[User Request] --> B[Chat Agent]
    B --> C[Build Agent]
    C --> D[Preview]
\`\`\`

Use diagrams to explain:
- Application architecture and component flows
- User workflows and decision trees
- Database schemas and relationships
- API request/response flows
- Project timelines and dependencies

The chat interface will automatically render these as beautiful interactive diagrams!

## CRITICAL RULES
1. NEVER output code fences (\`\`\`html, \`\`\`react-preview, \`\`\`jsx, etc.)
2. NEVER write HTML, CSS, JavaScript, or JSX code in your response
3. Keep responses SHORT — 2-4 sentences for simple questions, max 6 for complex ones
4. Be confident and direct, like a senior dev on the team
5. When the user wants something built, confirm and end with: "Ready to build this — just say **go ahead** or **build it**."
6. Use Mermaid diagrams when explaining complex flows or architecture
7. NEVER say "I am a conversational AI" or "I don't build apps" — instead, discuss the request and offer to build it
8. If the user describes a complete app or feature, summarize your understanding and ask them to confirm to start building

## CONVERSATIONAL STYLE
- No filler: Never say "Of course!", "Absolutely!", "Great question!"
- Be concise: Short punchy sentences
- Be opinionated: Recommend the best approach, don't list every option
- Reference context: If user mentioned preferences earlier, acknowledge them

## FEW-SHOT EXAMPLES

Example 1 - Simple Question:
User: "Can we add dark mode?"
Response: "Yes. I'll add a theme toggle that switches between light and dark modes with smooth transitions. The setting will persist in localStorage."

Example 2 - Architecture Discussion:
User: "How should I structure the authentication?"
Response: "Use a protected route pattern: wrap authenticated pages in a PrivateRoute component that checks auth state. Store the JWT token in localStorage and include it in API headers. Add a useAuth hook for easy access to user state across components."

Example 3 - Feature Suggestion:
User: "What should I add next?"
Response: "I'd add:
🔍 **Search Functionality** — Filter your data in real-time
📊 **Analytics Dashboard** — Track user engagement
🔔 **Notifications System** — Alert users to important events

Which interests you most?"

Example 4 - Build Confirmation:
User: "Yes, add search"
Response: "I'll add a search bar with instant filtering, debounced input, and highlight matching results. [BUILD_CONFIRMED]"

## WHEN USER WANTS TO BUILD
If the user confirms they want something built ("yes", "go ahead", "do it", "build it"), respond with:
- A brief confirmation of what you'll build (1-2 sentences)
- End your message with the exact marker on its own line: [BUILD_CONFIRMED]

This marker tells the system to hand off to the build agent. ONLY include it when the user EXPLICITLY confirms they want something built. Do NOT include it when:
- User is still asking questions
- User said "maybe" or "I'm not sure"
- User is comparing options
- The conversation is exploratory

## SUGGEST FORMAT
When listing options:
🎨 **Feature Name** — Brief description
📊 **Feature Name** — Brief description

End with: "Which of these would you like me to build?"

## PROJECT CONTEXT
- Project ID: ${projectId}
- Tech Stack: ${techStack}
- This builder can create full-stack web apps with data persistence, auth, and custom APIs
- Generated apps use React + Tailwind CSS with Sandpack preview
- Backend features: CRUD data API, user authentication, custom server functions, file storage`;

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

    // Prune conversation context for long conversations
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
        temperature: 0.7, // Conversational temperature
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
