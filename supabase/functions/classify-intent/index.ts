import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, hasHistory, hasExistingCode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Upgraded for better classification
        temperature: 0.1, // Low temperature for deterministic classification
        messages: [
          {
            role: "system",
            content: `You are an intent classifier for an AI web app builder. Classify user messages into one of three intents.

INTENTS:
1. "chat" — The user is asking a question, having a conversation, or exploring ideas. They do NOT want code generated yet.
2. "build" — The user wants code generated or modified. This is a direct command to create/change something.
3. "clarify" — The prompt is ambiguous and needs clarifying questions before building.

CLASSIFICATION RULES:

**CHAT** — Return this when:
- Message contains a question mark AND is asking about capabilities, feasibility, or seeking information
- Starts with: "can we", "could you", "should I", "is it possible", "have you", "did you", "what if", "how does"
- Is a conversational reply: "thanks", "ok", "I see", "tell me more"
- Is asking for suggestions or options without a clear build command
- Is discussing architecture, approach, or planning

**BUILD** — Return this when:
- Direct imperative command: "Build a...", "Create a...", "Add a...", "Make the...", "Change the...", "Fix the...", "Update the..."
- Affirmative response to a previous suggestion: "Yes", "Go ahead", "Do it", "Yes, build it", "Sounds good, go ahead"
- Short modification request: "Make it darker", "Add animations", "Improve the design"
- Describes what they want built without asking if it's possible
${hasHistory ? '- Follow-up modifications: "change colors", "add a section", "make it responsive"' : ''}

**CLARIFY** — Return this VERY RARELY:
${hasHistory
  ? `- NEVER use clarify when there's existing code — always build
- When in doubt, choose BUILD`
  : `- ONLY when the message is extremely vague (under 10 words) with no clear direction
- "Build me a website" → clarify (too vague)
- BUT "Build me a school ERP with student management" → BUILD (has enough direction)
- "Create a dashboard" with specifics → BUILD
- When in doubt between clarify and build, ALWAYS choose BUILD
- If the user describes features, modules, or gives any detail → BUILD, never clarify`}

FEW-SHOT EXAMPLES:

Example 1 - CHAT:
User: "Can we add user authentication to this app?"
Intent: "chat" (asking if it's possible, not commanding to build)
Confidence: 0.95

Example 2 - BUILD:
User: "Add user authentication with login and signup"
Intent: "build" (direct imperative command)
Confidence: 0.98

Example 3 - BUILD (follow-up):
User: "Make the buttons bigger"
Intent: "build" (clear modification request)
Confidence: 0.97

Example 4 - CHAT:
User: "What kind of animations can we add?"
Intent: "chat" (exploring options, not ready to build)
Confidence: 0.93

Example 5 - BUILD:
User: "Yes, go ahead"
Intent: "build" (affirmative response to previous suggestion)
Confidence: 0.99

Use the classify_intent tool to return your classification.`
          },
          { role: "user", content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_intent",
              description: "Classify the user's intent and provide analysis",
              parameters: {
                type: "object",
                properties: {
                  intent: {
                    type: "string",
                    enum: ["chat", "build", "clarify"],
                    description: "The classified intent"
                  },
                  confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 1,
                    description: "Confidence score between 0 and 1"
                  },
                  reasoning: {
                    type: "string",
                    description: "One sentence explaining why this intent was chosen"
                  },
                  analysis: {
                    type: "object",
                    properties: {
                      needsBackend: {
                        type: "boolean",
                        description: "Whether the request needs backend/database"
                      },
                      needsAuth: {
                        type: "boolean",
                        description: "Whether the request needs authentication"
                      },
                      complexity: {
                        type: "string",
                        enum: ["simple", "medium", "complex"],
                        description: "Complexity level of the request"
                      }
                    },
                    required: ["needsBackend", "needsAuth", "complexity"]
                  },
                  questions: {
                    type: "array",
                    description: "Clarifying questions (only for clarify intent)",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        header: { type: "string" },
                        text: { type: "string" },
                        multiSelect: { type: "boolean" },
                        options: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              label: { type: "string" },
                              value: { type: "string" },
                              description: { type: "string" }
                            },
                            required: ["label", "value", "description"]
                          }
                        }
                      },
                      required: ["id", "header", "text", "multiSelect", "options"]
                    }
                  }
                },
                required: ["intent", "confidence", "reasoning", "analysis"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_intent" } }
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        intent: "build", 
        confidence: 0.5, 
        questions: [], 
        analysis: { needsBackend: false, needsAuth: false, complexity: "medium" } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        // Ensure valid intent
        if (!["chat", "build", "clarify"].includes(parsed.intent)) {
          parsed.intent = "build";
        }
        // Ensure questions array exists
        if (!parsed.questions) {
          parsed.questions = [];
        }
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }

    // Fallback to build
    return new Response(JSON.stringify({ 
      intent: "build", 
      confidence: 0.5, 
      questions: [], 
      analysis: { needsBackend: false, needsAuth: false, complexity: "medium" } 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-intent error:", e);
    return new Response(JSON.stringify({ 
      intent: "build", 
      confidence: 0.5, 
      questions: [] 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
