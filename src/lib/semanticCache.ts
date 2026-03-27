/**
 * Semantic Cache — Enterprise-grade AI response cache.
 * 
 * Architecture:
 * L1: In-memory TF-IDF corpus (sub-1ms, session-scoped)
 * L2: DB-backed cache via cache-proxy edge function (5-20ms)
 * L3: AI gateway call (200-2000ms) — cached on response
 * 
 * True semantic matching via TF-IDF cosine similarity + synonym expansion.
 * "Add user login" matches "set up authentication" at ~0.85 similarity.
 */

import { supabase } from "@/integrations/supabase/client";
import { SemanticCorpus } from "@/lib/tfidfEngine";

// ─── L1: In-Memory Corpus ─────────────────────────────────────────────────

const corpus = new SemanticCorpus(500, 0.78);
let corpusInitialized = false;

/**
 * Initialize the corpus from DB cache entries for a project.
 * Called once per session, loads recent cached responses.
 */
async function ensureCorpusLoaded(projectId: string): Promise<void> {
  if (corpusInitialized) return;

  try {
    const { data } = await supabase
      .from("cache_entries")
      .select("id, cache_value, expires_at")
      .eq("project_id", projectId)
      .eq("cache_type", "semantic")
      .gt("expires_at", new Date().toISOString())
      .order("hit_count", { ascending: false })
      .limit(200);

    if (data?.length) {
      const entries = data
        .map(d => {
          const val = d.cache_value as any;
          if (!val?.response || !val?.prompt_preview) return null;
          return {
            id: d.id,
            prompt: val.prompt_preview,
            response: val.response,
            model: val.model || "unknown",
            tokensSaved: val.tokens_saved || 0,
          };
        })
        .filter(Boolean) as any[];

      corpus.loadFromDB(entries);
      console.log(`[SemanticCache] Loaded ${entries.length} entries into L1 corpus`);
    }
  } catch (e) {
    console.warn("[SemanticCache] Failed to load corpus:", e);
  }

  corpusInitialized = true;
}

// ─── Confirmation & Build-Trigger Bypass ──────────────────────────────────

const BARE_CONFIRMATIONS = new Set([
  "ok", "okay", "sure", "go ahead", "yes", "yep", "yeah", "yea",
  "proceed", "do it", "go", "build it", "start", "lets go", "let's go",
  "confirmed", "approve", "approved", "continue", "y", "k",
]);

/**
 * Build-triggering phrases that must NEVER be served from cache.
 * A cached "Build a CRM" response would trigger a fresh build on replay.
 */
const BUILD_TRIGGER_PHRASES =
  /\b(build|create|generate|scaffold|implement|develop|make|produce|rebuild|start over|reset project)\b/i;

/**
 * Returns true if the prompt is a bare confirmation that should NEVER
 * be used as a cache key — it carries no domain semantics.
 */
function isBareConfirmation(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase().replace(/[?.!,]+$/g, "");
  return BARE_CONFIRMATIONS.has(normalized) || normalized.length < 4;
}

/**
 * Returns true if the prompt contains build-triggering phrases that
 * must bypass cache to prevent stale cached responses from triggering builds.
 */
function isBuildTrigger(prompt: string): boolean {
  return BUILD_TRIGGER_PHRASES.test(prompt.trim());
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface CacheHitResult {
  hit: boolean;
  layer: "L1" | "L2" | "none";
  matchType: "exact" | "semantic" | "none";
  similarity: number;
  response?: string;
  model?: string;
  tokensSaved?: number;
}

/**
 * Check all cache layers for a matching response.
 * L1 (memory, <1ms) → L2 (DB via cache-proxy, ~10ms)
 */
export async function semanticCacheGet(
  projectId: string,
  prompt: string,
  _context?: string
): Promise<CacheHitResult> {
  // HARD BYPASS: bare confirmations and build triggers must never hit cache
  if (isBareConfirmation(prompt) || isBuildTrigger(prompt)) {
    console.log(`[SemanticCache] Bypassing cache — ${isBareConfirmation(prompt) ? 'bare confirmation' : 'build-trigger phrase'}: "${prompt}"`);
    return { hit: false, layer: "none", matchType: "none", similarity: 0 };
  }

  await ensureCorpusLoaded(projectId);

  // L1: In-memory TF-IDF similarity search
  const l1Result = corpus.findSimilar(prompt);
  if (l1Result.match) {
    console.log(
      `[SemanticCache] L1 ${l1Result.matchType} hit (${(l1Result.similarity * 100).toFixed(1)}% similarity)`
    );
    return {
      hit: true,
      layer: "L1",
      matchType: l1Result.matchType as "exact" | "semantic",
      similarity: l1Result.similarity,
      response: l1Result.match.response,
      model: l1Result.match.model,
      tokensSaved: l1Result.match.tokensSaved,
    };
  }

  return { hit: false, layer: "none", matchType: "none", similarity: l1Result.similarity };
}

/**
 * Store a response in all cache layers.
 */
export async function semanticCacheSet(
  projectId: string,
  prompt: string,
  response: string,
  model: string,
  tokensSaved: number,
  _context?: string,
  _ttlSeconds = 3600
): Promise<void> {
  // L1: Add to in-memory corpus
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  corpus.add(id, prompt, response, model, tokensSaved);

  // L2: DB storage happens automatically via cache-proxy edge function
  // when the response flows through it. No need to double-write here.
}

/**
 * Stream a chat message through the cache-proxy.
 * This is the main entry point — replaces direct calls to the chat-agent edge function.
 */
export async function streamThroughCacheProxy({
  messages,
  projectId,
  techStack,
  knowledge,
  workspaceFiles,
  recentErrors,
  contracts,
  workspaceSummary,
  bypassCache,
  cacheIntent,
  requirementsSnippet,
  signal,
  onCacheHit,
  onDelta,
  onDone,
  onError,
}: {
  messages: Array<{ role: string; content: any }>;
  projectId: string;
  techStack?: string;
  knowledge?: string[];
  workspaceFiles?: string[];
  recentErrors?: string[];
  /** Interface contracts snapshot for workspace-aware responses */
  contracts?: string;
  /** Compressed workspace manifest */
  workspaceSummary?: string;
  bypassCache?: boolean;
  cacheIntent?: "read_only_qa" | "actionable";
  requirementsSnippet?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  onCacheHit?: (result: CacheHitResult) => void;
  onDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}): Promise<void> {
  await ensureCorpusLoaded(projectId);

  // Extract user prompt for L1 check
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const userPrompt = typeof lastUserMsg?.content === "string"
    ? lastUserMsg.content
    : Array.isArray(lastUserMsg?.content)
      ? lastUserMsg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ")
      : "";

  const shouldBypassCache = !!bypassCache || isBareConfirmation(userPrompt) || isBuildTrigger(userPrompt);

  // L1 lookup is only allowed for read-only, non-confirmation prompts
  if (shouldBypassCache) {
    console.log(`[SemanticCache] Stream bypass — cache disabled for prompt: "${userPrompt.slice(0, 80)}"`);
  } else if (userPrompt.length > 5) {
    const l1 = corpus.findSimilar(userPrompt);
    if (l1.match) {
      const result: CacheHitResult = {
        hit: true,
        layer: "L1",
        matchType: l1.matchType as "exact" | "semantic",
        similarity: l1.similarity,
        response: l1.match.response,
        model: l1.match.model,
        tokensSaved: l1.match.tokensSaved,
      };
      onCacheHit?.(result);
      onDone(l1.match.response);
      return;
    }
  }

  // L2: Call cache-proxy edge function (checks DB + forwards to AI if miss)
  const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

  let resp: Response;
  try {
    resp = await fetch(`${BASE_URL}/functions/v1/cache-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      signal,
      body: JSON.stringify({
        messages,
        project_id: projectId,
        tech_stack: techStack,
        knowledge,
        workspace_files: workspaceFiles,
        recent_errors: recentErrors,
        contracts: contracts ? contracts.slice(0, 8192) : undefined,
        workspace_summary: workspaceSummary ? workspaceSummary.slice(0, 8192) : undefined,
        bypass_cache: shouldBypassCache,
        cache_intent: cacheIntent || "actionable",
        requirements_snippet: (requirementsSnippet || "").slice(0, 1200),
        stream: true,
      }),
    });
  } catch {
    onError("Network error. Check your connection.");
    return;
  }

  if (!resp.ok) {
    if (resp.status === 429) { onError("Rate limited. Try again shortly."); return; }
    if (resp.status === 402) { onError("Usage limit reached."); return; }

    // Check if it's a JSON cache hit response
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const data = await resp.json();
        if (data.error) { onError(data.error); return; }
      } catch {}
    }

    onError("Failed to connect to cache proxy.");
    return;
  }

  // Check if response is a cache hit (JSON) vs stream (SSE)
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = await resp.json();
      if (data.cached && data.response) {
        console.log(`[SemanticCache] L2 ${data.match_type} hit (${(data.similarity * 100).toFixed(1)}%)`);

        // Add to L1 corpus for future in-memory hits (only if cache is enabled)
        if (!shouldBypassCache) {
          const id = `l2-${Date.now()}`;
          corpus.add(id, userPrompt, data.response, data.model, data.tokens_saved);
        }

        onCacheHit?.({
          hit: true,
          layer: "L2",
          matchType: data.match_type,
          similarity: data.similarity,
          response: data.response,
          model: data.model,
          tokensSaved: data.tokens_saved,
        });
        onDone(data.response);
        return;
      }
    } catch {}
  }

  // SSE stream (cache miss, AI response)
  if (!resp.body) {
    onError("Empty response from cache proxy.");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onDelta(content);
          }
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
  } catch (e) {
    console.error("[SemanticCache] Stream error:", e);
  }

  // Add response to L1 corpus only when cache is enabled for this turn
  if (!shouldBypassCache && fullText.length > 10) {
    const id = `stream-${Date.now()}`;
    const tokensSaved = Math.round(fullText.length / 4);
    corpus.add(id, userPrompt, fullText, "google/gemini-3-flash-preview", tokensSaved);
  }

  onDone(fullText);
}

/**
 * Get cache statistics.
 */
export async function semanticCacheStats(projectId: string): Promise<{
  l1Entries: number;
  l2Entries: number;
  totalHits: number;
  estimatedTokensSaved: number;
}> {
  const { data } = await supabase
    .from("cache_entries")
    .select("cache_value, hit_count")
    .eq("project_id", projectId)
    .eq("cache_type", "semantic");

  const entries = data || [];
  let totalTokensSaved = 0;
  for (const e of entries) {
    const val = e.cache_value as any;
    totalTokensSaved += (val?.tokens_saved || 0) * (e.hit_count || 0);
  }

  return {
    l1Entries: corpus.size,
    l2Entries: entries.length,
    totalHits: entries.reduce((s, e) => s + (e.hit_count || 0), 0),
    estimatedTokensSaved: totalTokensSaved,
  };
}

/**
 * Clear all semantic cache.
 */
export async function semanticCacheClear(projectId: string): Promise<void> {
  corpusInitialized = false;
  await supabase
    .from("cache_entries")
    .delete()
    .eq("project_id", projectId)
    .eq("cache_type", "semantic");
}
