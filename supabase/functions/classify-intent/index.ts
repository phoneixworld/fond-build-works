import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { prompt, hasHistory, hasExistingCode, existingFileNames } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build file context for smarter questions
    const fileContext = existingFileNames?.length
      ? `\n\nEXISTING PROJECT FILES:\n${existingFileNames.slice(0, 40).join("\n")}\n\nUse these file names to generate CONTEXTUAL questions. For example, if you see "/pages/Dashboard/Dashboard.jsx" and "/pages/Students/StudentManagement.jsx", ask which specific pages to improve.`
      : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0.1,
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
- Describes an app, system, or feature: "ERP", "dashboard", "landing page", "e-commerce", "management system", "student portal"
- Affirmative response to a previous suggestion: "Yes", "Go ahead", "Do it", "Yes, build it", "Sounds good, go ahead"
- Short modification request with SPECIFIC scope: "Make the header blue", "Add a search bar", "Fix the login button"
- ANY prompt that mentions specific features, modules, pages, or UI elements
${hasHistory ? '- Follow-up modifications with clear scope: "change the sidebar color", "add pagination to the table"' : ''}

**CLARIFY** — Return this when the prompt is genuinely vague:
${hasHistory
  ? `- Use clarify for broad/vague enhancement requests that could go many directions: "improve the design", "enhance the ERP", "make it better", "redesign", "optimize", "polish it", "refine"
- These requests NEED clarification: what specifically to improve? colors? layout? typography? which pages?
- Direct specific requests should be BUILD: "change the header color to blue", "add a search bar"
- When in doubt between clarify and build for vague prompts, choose CLARIFY
- When in doubt for specific prompts, choose BUILD`
  : `- When the message is vague with no clear direction
- "Build me a website" → clarify (too vague)
- "Build me a school ERP with student management" → BUILD (has enough direction)
- "Create a dashboard" with specifics → BUILD
- When in doubt between clarify and build for vague prompts, CHOOSE CLARIFY
- If the user describes features, modules, or gives any detail → BUILD, never clarify`}

QUESTION GENERATION RULES (for "clarify" intent):
- Generate 2-4 questions as separate tabs
- Each question should have a short "header" (1-3 words) used as tab label
- Questions MUST be contextual — reference actual pages/modules from the existing file list
- Use multiSelect: true when multiple options make sense (e.g., "Which pages to improve?")
- Each option needs: value (slug), label (display text), description (brief explanation)
- Generate 3-4 options per question
- ALWAYS include diverse, actionable options — never generic filler

DYNAMIC QUESTION EXAMPLES:
- If files include Dashboard, Students, Fees pages → ask "Which pages?" with those as options
- If request is about "design" → ask about Focus Area (Colors, Typography, Layout, Animations)
- If request is about "enhance/improve" → ask about Priority (Performance, UX, Visual Polish, Features)
- If request is about "redesign" → ask about Style Direction (Minimal, Bold, Corporate, Playful)
${fileContext}

FEW-SHOT EXAMPLES:

Example 1 - CHAT:
User: "Can we add user authentication to this app?"
Intent: "chat" (asking if it's possible, not commanding to build)

Example 2 - BUILD:
User: "Add user authentication with login and signup"
Intent: "build" (direct imperative command)

Example 3 - CLARIFY (with existing code):
User: "Improve the overall design"
Intent: "clarify"
Questions: [
  { id: "focus", header: "Focus Area", text: "What aspects of the design should I focus on?", multiSelect: true, options: [
    { value: "colors", label: "Colors & Theme", description: "Update color palette, gradients, and visual tone" },
    { value: "typography", label: "Typography", description: "Font sizes, weights, line heights, and hierarchy" },
    { value: "spacing", label: "Spacing & Layout", description: "Padding, margins, alignment, and grid structure" },
    { value: "animations", label: "Animations & Micro-interactions", description: "Hover effects, transitions, loading states" }
  ]},
  { id: "pages", header: "Pages", text: "Which pages should I improve first?", multiSelect: true, options: [dynamically from file list] },
  { id: "style", header: "Style", text: "What visual direction do you prefer?", multiSelect: false, options: [
    { value: "minimal", label: "Clean & Minimal", description: "Lots of whitespace, subtle colors" },
    { value: "bold", label: "Bold & Vibrant", description: "Strong colors, dramatic contrasts" },
    { value: "corporate", label: "Professional", description: "Polished, enterprise-grade look" }
  ]}
]

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
                    description: "Clarifying questions (only for clarify intent). Generate 2-4 contextual questions.",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Unique slug like 'focus', 'pages', 'style'" },
                        header: { type: "string", description: "Short tab label: 1-3 words like 'Focus Area', 'Pages', 'Style'" },
                        text: { type: "string", description: "The full question text" },
                        multiSelect: { type: "boolean", description: "true if user can pick multiple options" },
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
        if (!["chat", "build", "clarify"].includes(parsed.intent)) {
          parsed.intent = "build";
        }
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
    // If existing code is present, fallback to edit (not build) to prevent destructive rebuilds
    const fallbackIntent = hasExistingCode ? "edit" : "build";
    return new Response(JSON.stringify({ 
      intent: fallbackIntent, 
      confidence: 0.3, 
      questions: [],
      analysis: { needsBackend: false, needsAuth: false, complexity: "simple" }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
