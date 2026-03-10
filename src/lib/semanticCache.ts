/**
 * Semantic Cache — caches AI responses by prompt similarity.
 * 
 * Uses FNV-1a hashing on normalized prompts to detect identical/near-identical
 * requests and return cached responses instead of calling the AI gateway.
 * 
 * Two layers:
 * 1. Exact match: hash of normalized prompt → cached response (fast, in-memory + DB)
 * 2. Fuzzy match: strips whitespace, normalizes casing, removes filler words
 *    to catch prompts that are semantically identical but written differently
 */

import { supabase } from "@/integrations/supabase/client";

// ─── FNV-1a Hash ──────────────────────────────────────────────────────────

function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

// ─── Prompt Normalization ─────────────────────────────────────────────────

const FILLER_WORDS = /\b(please|can you|could you|i want|i need|help me|just|actually|basically|really)\b/gi;

function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(FILLER_WORDS, "")
    .replace(/[^\w\s]/g, " ")  // remove punctuation
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim();
}

/**
 * Generate both exact and fuzzy hash keys for a prompt.
 */
function getPromptHashes(prompt: string, context?: string): {
  exactHash: string;
  fuzzyHash: string;
} {
  const contextSuffix = context ? `||${fnv1a(context)}` : "";
  return {
    exactHash: fnv1a(prompt + contextSuffix),
    fuzzyHash: fnv1a(normalizePrompt(prompt) + contextSuffix),
  };
}

// ─── In-Memory Layer ──────────────────────────────────────────────────────

interface SemanticCacheEntry {
  response: string;
  model: string;
  tokensSaved: number;
  timestamp: number;
}

const semanticMemory = new Map<string, SemanticCacheEntry>();
const MAX_SEMANTIC_MEMORY = 100;
const SEMANTIC_TTL_MS = 30 * 60 * 1000; // 30 minutes in-memory

// ─── Public API ───────────────────────────────────────────────────────────

export interface SemanticCacheResult {
  hit: boolean;
  response?: string;
  model?: string;
  tokensSaved?: number;
  matchType?: "exact" | "fuzzy";
}

/**
 * Check if a prompt has a cached response.
 * Checks memory first, then DB, trying exact match then fuzzy.
 */
export async function semanticCacheGet(
  projectId: string,
  prompt: string,
  context?: string
): Promise<SemanticCacheResult> {
  const { exactHash, fuzzyHash } = getPromptHashes(prompt, context);

  // Check memory (exact then fuzzy)
  for (const [hash, matchType] of [
    [exactHash, "exact"] as const,
    [fuzzyHash, "fuzzy"] as const,
  ]) {
    const mem = semanticMemory.get(hash);
    if (mem && Date.now() - mem.timestamp < SEMANTIC_TTL_MS) {
      console.log(`[SemanticCache] Memory ${matchType} hit for prompt`);
      return {
        hit: true,
        response: mem.response,
        model: mem.model,
        tokensSaved: mem.tokensSaved,
        matchType,
      };
    }
  }

  // Check DB (exact then fuzzy)
  for (const [hash, matchType] of [
    [exactHash, "exact"] as const,
    [fuzzyHash, "fuzzy"] as const,
  ]) {
    const { data } = await supabase
      .from("cache_entries")
      .select("cache_value, expires_at, hit_count")
      .eq("project_id", projectId)
      .eq("cache_type", "semantic")
      .eq("prompt_hash", hash)
      .maybeSingle();

    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      const val = data.cache_value as any;
      console.log(`[SemanticCache] DB ${matchType} hit for prompt`);

      // Update hit count
      supabase
        .from("cache_entries")
        .update({ hit_count: (data.hit_count || 0) + 1 } as any)
        .eq("project_id", projectId)
        .eq("cache_type", "semantic")
        .eq("prompt_hash", hash)
        .then(() => {});

      // Cache in memory
      semanticMemory.set(hash, {
        response: val.response,
        model: val.model,
        tokensSaved: val.tokensSaved || 0,
        timestamp: Date.now(),
      });

      return {
        hit: true,
        response: val.response,
        model: val.model,
        tokensSaved: val.tokensSaved || 0,
        matchType,
      };
    }
  }

  return { hit: false };
}

/**
 * Store an AI response in the semantic cache.
 */
export async function semanticCacheSet(
  projectId: string,
  prompt: string,
  response: string,
  model: string,
  tokensSaved: number,
  context?: string,
  ttlSeconds = 3600 // 1 hour default
): Promise<void> {
  const { exactHash, fuzzyHash } = getPromptHashes(prompt, context);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const cacheValue = { response, model, tokensSaved, prompt: prompt.slice(0, 200) };

  // Store both exact and fuzzy entries
  const entries = [
    {
      project_id: projectId,
      cache_type: "semantic",
      cache_key: `exact:${exactHash}`,
      prompt_hash: exactHash,
      cache_value: cacheValue,
      ttl_seconds: ttlSeconds,
      expires_at: expiresAt,
      hit_count: 0,
    },
    {
      project_id: projectId,
      cache_type: "semantic",
      cache_key: `fuzzy:${fuzzyHash}`,
      prompt_hash: fuzzyHash,
      cache_value: cacheValue,
      ttl_seconds: ttlSeconds,
      expires_at: expiresAt,
      hit_count: 0,
    },
  ];

  await supabase
    .from("cache_entries")
    .upsert(entries as any[], { onConflict: "project_id,cache_type,cache_key" });

  // Store in memory
  if (semanticMemory.size >= MAX_SEMANTIC_MEMORY) {
    const oldest = semanticMemory.keys().next().value;
    if (oldest) semanticMemory.delete(oldest);
  }

  const memEntry: SemanticCacheEntry = { response, model, tokensSaved, timestamp: Date.now() };
  semanticMemory.set(exactHash, memEntry);
  semanticMemory.set(fuzzyHash, memEntry);
}

/**
 * Get semantic cache stats for a project.
 */
export async function semanticCacheStats(projectId: string): Promise<{
  cachedResponses: number;
  totalHits: number;
  estimatedTokensSaved: number;
  memoryEntries: number;
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
    totalTokensSaved += (val?.tokensSaved || 0) * (e.hit_count || 0);
  }

  return {
    cachedResponses: entries.length,
    totalHits: entries.reduce((s, e) => s + (e.hit_count || 0), 0),
    estimatedTokensSaved: totalTokensSaved,
    memoryEntries: semanticMemory.size,
  };
}

/**
 * Clear semantic cache for a project.
 */
export async function semanticCacheClear(projectId: string): Promise<void> {
  semanticMemory.clear();
  await supabase
    .from("cache_entries")
    .delete()
    .eq("project_id", projectId)
    .eq("cache_type", "semantic");
}
