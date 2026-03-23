import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Simple tokenizer + stemmer for server-side similarity ────────────────

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","can","need",
  "to","of","in","for","on","with","at","by","from","as","into","through",
  "during","before","after","above","below","between","out","off","over","under",
  "again","then","here","there","when","where","why","how","all","both","each",
  "few","more","most","other","some","no","not","only","so","than","too","very",
  "just","but","and","or","if","while","about","up","it","its","i","me","my",
  "we","our","you","your","he","she","they","them","this","that","please","help",
  "want","like","make","get","actually","basically","really","think","know","also",
]);

const SYNONYMS: Record<string, string> = {
  "login":"auth","signin":"auth","signup":"auth","register":"auth","authenticate":"auth",
  "authentication":"auth","password":"auth","credential":"auth",
  "button":"ui","input":"ui","form":"ui","modal":"dialog","popup":"dialog",
  "database":"datastore","db":"datastore","table":"datastore","schema":"datastore",
  "fetch":"retrieve","query":"retrieve","load":"retrieve",
  "create":"crud_c","add":"crud_c","new":"crud_c","insert":"crud_c",
  "update":"crud_u","edit":"crud_u","modify":"crud_u","change":"crud_u",
  "delete":"crud_d","remove":"crud_d","destroy":"crud_d",
  "list":"crud_r","show":"crud_r","display":"crud_r","view":"crud_r",
  "style":"styling","css":"styling","design":"styling","theme":"styling",
  "search":"search_f","filter":"search_f","sort":"search_f",
  "upload":"file_h","download":"file_h","file":"file_h","image":"file_h",
  "cache":"caching","memoize":"caching","store":"caching",
  "deploy":"deployment","publish":"deployment","release":"deployment",
};

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w))
    .map(w => SYNONYMS[w] || w);
}

function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

function extractUserText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
      .map((part: any) => part.text)
      .join(" ");
  }
  return "";
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const BARE_CONFIRMATIONS = new Set(["ok", "okay", "sure", "go ahead", "yes", "yep", "yeah", "proceed", "do it", "start", "continue", "approved"]);
const ACTIONABLE_INTENT = /\b(build|create|generate|scaffold|fix|edit|modify|change|update|refactor|add|remove|delete|implement|rewrite|repair|patch)\b/i;
const READ_ONLY_QA = /^(what|why|how|when|where|who|can you explain|explain|tell me|help me understand|compare|difference between|is it|are we)\b/i;
const META_CONVERSATION_QA = /\b(what was my request|what did i ask|what am i asking|what did i say|what are you generating|is that all|is this all|did you understand|why are you building|why are you still building|remember my request|repeat my request|summarize my request|do you know how to build)\b/i;
const FRUSTRATION_OR_ESCALATION = /\b(you are continuing to build|i said do not build|dont build anything|don't build anything|stop building|why are you continuing|why are you still)\b/i;

function isEmailRegistrationCheckPrompt(prompt: string): boolean {
  if (!EMAIL_REGEX.test(prompt)) return false;
  const normalized = prompt.toLowerCase();
  const hasCheckVerb = /\b(check|verify|confirm|see|is|if|whether|can you check)\b/.test(normalized);
  const hasRegistrationSignal = /\b(register(?:ed|d)?|exist(?:s)?|signed?\s*up|already\s+registered|already\s+exists?|account)\b/.test(normalized);
  return hasCheckVerb && hasRegistrationSignal;
}

function isBareConfirmation(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase().replace(/[?.!,]+$/g, "");
  return BARE_CONFIRMATIONS.has(normalized) || normalized.length < 4;
}

function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferCacheIntent(prompt: string, explicitIntent?: string): "read_only_qa" | "actionable" {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return "actionable";

  // Meta/loop-breaking prompts should NEVER be cached, regardless of explicit intent.
  if (META_CONVERSATION_QA.test(normalized) || FRUSTRATION_OR_ESCALATION.test(normalized)) return "actionable";

  if (explicitIntent === "read_only_qa" || explicitIntent === "actionable") return explicitIntent;
  if (isBareConfirmation(normalized)) return "actionable";
  if (ACTIONABLE_INTENT.test(normalized)) return "actionable";
  if (READ_ONLY_QA.test(normalized) || normalized.endsWith("?")) return "read_only_qa";
  return "actionable";
}

function deriveRequirementsSnippet(messages: any[], explicitSnippet?: string): string {
  if (explicitSnippet && explicitSnippet.trim()) return explicitSnippet.trim().slice(0, 1200);
  const userTurns = (messages || [])
    .filter((m: any) => m?.role === "user")
    .map((m: any) => extractUserText(m?.content || ""))
    .filter((t: string) => t && !isBareConfirmation(t));
  return userTurns.join("\n\n").slice(0, 1200);
}

// Jaccard + token overlap similarity (fast, no corpus needed)
function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = intersection / union;

  // Also compute ordered overlap bonus
  const minLen = Math.min(a.length, b.length);
  let ordered = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) ordered++;
  }
  const orderBonus = ordered / minLen * 0.15;

  return Math.min(jaccard + orderBonus, 1.0);
}

const SIMILARITY_THRESHOLD = 0.75;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const {
      messages,
      project_id,
      tech_stack,
      knowledge,
      workspace_files,
      recent_errors,
      model,
      stream = true,
      cache_ttl = 3600,
      bypass_cache = false,
      cache_intent,
      requirements_snippet,
    } = body;

    // Extract the latest user message for cache key
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userPrompt = extractUserText(lastUserMsg?.content);
    const requirementsSnippet = deriveRequirementsSnippet(messages, requirements_snippet);
    const resolvedIntent = inferCacheIntent(userPrompt, cache_intent);

    const isEmailRegistrationCheck = isEmailRegistrationCheckPrompt(userPrompt);
    const shouldBypassCache =
      bypass_cache ||
      isEmailRegistrationCheck ||
      isBareConfirmation(userPrompt) ||
      resolvedIntent !== "read_only_qa";

    const semanticSeed = `${project_id || "no_project"}|${resolvedIntent}|${normalizeForHash(requirementsSnippet)}|${normalizeForHash(userPrompt)}`;
    const promptTokens = tokenize(`${requirementsSnippet} ${userPrompt}`.trim());
    const exactHash = fnv1a(semanticSeed);

    // ─── Cache Check ────────────────────────────────────────────────
    if (!shouldBypassCache && project_id && userPrompt.length > 5) {
      // 1. Exact hash match (fastest)
      const { data: exactMatch } = await supabase
        .from("cache_entries")
        .select("id, cache_value, expires_at, hit_count")
        .eq("project_id", project_id)
        .eq("cache_type", "semantic")
        .eq("prompt_hash", exactHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (exactMatch) {
        console.log("[CacheProxy] Exact hit!");
        // Increment hit count
        await supabase
          .from("cache_entries")
          .update({ hit_count: (exactMatch.hit_count || 0) + 1 })
          .eq("id", exactMatch.id);

        const cached = exactMatch.cache_value as any;
        return new Response(JSON.stringify({
          cached: true,
          match_type: "exact",
          similarity: 1.0,
          response: cached.response,
          model: cached.model,
          tokens_saved: cached.tokens_saved || 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Semantic similarity match (check recent entries)
      const { data: candidates } = await supabase
        .from("cache_entries")
        .select("id, cache_key, cache_value, hit_count, expires_at")
        .eq("project_id", project_id)
        .eq("cache_type", "semantic")
        .gt("expires_at", new Date().toISOString())
        .order("hit_count", { ascending: false })
        .limit(100);

      if (candidates && candidates.length > 0) {
        let bestMatch: any = null;
        let bestScore = 0;

        for (const candidate of candidates) {
          const val = candidate.cache_value as any;
          if (!val?.prompt_tokens) continue;

          const score = tokenSimilarity(promptTokens, val.prompt_tokens);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = { ...candidate, similarity: score };
          }
        }

        if (bestMatch && bestScore >= SIMILARITY_THRESHOLD) {
          console.log(`[CacheProxy] Semantic hit! Score: ${bestScore.toFixed(3)}`);
          await supabase
            .from("cache_entries")
            .update({ hit_count: (bestMatch.hit_count || 0) + 1 })
            .eq("id", bestMatch.id);

          const cached = bestMatch.cache_value as any;
          return new Response(JSON.stringify({
            cached: true,
            match_type: "semantic",
            similarity: bestScore,
            response: cached.response,
            model: cached.model,
            tokens_saved: cached.tokens_saved || 0,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ─── Cache Miss → Forward to chat-agent edge function ─────────────
    // FIX #1: Instead of using an inline system prompt, forward to chat-agent
    // which has the full prompt with workspace context and error info.
    const chatAgentUrl = `${SUPABASE_URL}/functions/v1/chat-agent`;

    const aiResponse = await fetch(chatAgentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: JSON.stringify({
        messages,
        project_id,
        tech_stack: tech_stack || "react",
        knowledge,
        workspace_files,
        recent_errors,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    if (stream) {
      // For streaming: collect full response in background for caching, passthrough stream to client
      const [clientStream, cacheStream] = aiResponse.body!.tee();

      // Background: read cacheStream, extract full text, store in cache
      (async () => {
        try {
          const reader = cacheStream.getReader();
          const decoder = new TextDecoder();
          let fullText = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) fullText += content;
              } catch {}
            }
          }

          // Store in cache
          if (project_id && fullText.length > 10 && !shouldBypassCache) {
            const tokensSaved = Math.round(fullText.length / 4);
            await supabase.from("cache_entries").upsert({
              project_id,
              cache_type: "semantic",
              cache_key: `semantic:${exactHash}`,
              prompt_hash: exactHash,
              cache_value: {
                response: fullText,
                model: model || "google/gemini-3-flash-preview",
                tokens_saved: tokensSaved,
                prompt_tokens: promptTokens,
                prompt_preview: userPrompt.slice(0, 200),
              },
              ttl_seconds: cache_ttl,
              expires_at: new Date(Date.now() + cache_ttl * 1000).toISOString(),
              hit_count: 0,
            }, { onConflict: "project_id,cache_type,cache_key" });

            console.log(`[CacheProxy] Cached response (${tokensSaved} tokens, TTL ${cache_ttl}s)`);
          }
        } catch (e) {
          console.error("[CacheProxy] Background cache error:", e);
        }
      })();

      return new Response(clientStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Non-streaming: read, cache, return
    const data = await aiResponse.json();
    const responseText = data.choices?.[0]?.message?.content || "";

    if (project_id && responseText.length > 10 && !shouldBypassCache) {
      const tokensSaved = Math.round(responseText.length / 4);
      await supabase.from("cache_entries").upsert({
        project_id,
        cache_type: "semantic",
        cache_key: `semantic:${exactHash}`,
        prompt_hash: exactHash,
        cache_value: {
          response: responseText,
          model: model || "google/gemini-3-flash-preview",
          tokens_saved: tokensSaved,
          prompt_tokens: promptTokens,
          prompt_preview: userPrompt.slice(0, 200),
        },
        ttl_seconds: cache_ttl,
        expires_at: new Date(Date.now() + cache_ttl * 1000).toISOString(),
        hit_count: 0,
      }, { onConflict: "project_id,cache_type,cache_key" });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[CacheProxy] Error:", e);
    const message = e instanceof Error ? e.message : "Cache proxy error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});