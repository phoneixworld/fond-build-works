/**
 * KV Cache — persistent key-value cache backed by the database.
 * 
 * Provides Redis-like get/set/del operations with TTL support.
 * Uses an in-memory LRU layer to avoid repeated DB reads within a session.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── In-Memory LRU Layer ──────────────────────────────────────────────────

interface MemoryCacheEntry {
  value: any;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();
const MAX_MEMORY_ENTRIES = 200;

function memoryKey(projectId: string, key: string): string {
  return `${projectId}:${key}`;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of memoryCache) {
    if (v.expiresAt <= now) memoryCache.delete(k);
  }
}

function evictLRU(): void {
  if (memoryCache.size < MAX_MEMORY_ENTRIES) return;
  // Delete oldest entry (Map preserves insertion order)
  const firstKey = memoryCache.keys().next().value;
  if (firstKey) memoryCache.delete(firstKey);
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Get a cached value by key. Checks memory first, then DB.
 */
export async function kvGet<T = any>(
  projectId: string,
  key: string
): Promise<T | null> {
  evictExpired();

  // Check memory cache first
  const mk = memoryKey(projectId, key);
  const mem = memoryCache.get(mk);
  if (mem && mem.expiresAt > Date.now()) {
    // Move to end (refresh LRU position)
    memoryCache.delete(mk);
    memoryCache.set(mk, mem);
    return mem.value as T;
  }

  // Check DB
  const { data, error } = await supabase
    .from("cache_entries")
    .select("cache_value, expires_at, hit_count")
    .eq("project_id", projectId)
    .eq("cache_type", "kv")
    .eq("cache_key", key)
    .maybeSingle();

  if (error || !data) return null;

  // Check expiry
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    // Expired — delete async
    supabase
      .from("cache_entries")
      .delete()
      .eq("project_id", projectId)
      .eq("cache_type", "kv")
      .eq("cache_key", key)
      .then(() => {});
    return null;
  }

  // Increment hit count (fire & forget)
  supabase
    .from("cache_entries")
    .update({ hit_count: (data.hit_count || 0) + 1 } as any)
    .eq("project_id", projectId)
    .eq("cache_type", "kv")
    .eq("cache_key", key)
    .then(() => {});

  // Store in memory
  evictLRU();
  memoryCache.set(mk, {
    value: data.cache_value,
    expiresAt: new Date(data.expires_at).getTime(),
  });

  return data.cache_value as T;
}

/**
 * Set a cached value with optional TTL in seconds (default 1 hour).
 */
export async function kvSet(
  projectId: string,
  key: string,
  value: any,
  ttlSeconds = 3600
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Upsert in DB
  await supabase
    .from("cache_entries")
    .upsert(
      {
        project_id: projectId,
        cache_type: "kv",
        cache_key: key,
        cache_value: value,
        ttl_seconds: ttlSeconds,
        expires_at: expiresAt,
        hit_count: 0,
      } as any,
      { onConflict: "project_id,cache_type,cache_key" }
    );

  // Update memory cache
  evictLRU();
  memoryCache.set(memoryKey(projectId, key), {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete a cached value.
 */
export async function kvDel(projectId: string, key: string): Promise<void> {
  memoryCache.delete(memoryKey(projectId, key));
  await supabase
    .from("cache_entries")
    .delete()
    .eq("project_id", projectId)
    .eq("cache_type", "kv")
    .eq("cache_key", key);
}

/**
 * Clear all KV cache entries for a project.
 */
export async function kvClear(projectId: string): Promise<void> {
  // Clear memory entries for this project
  for (const k of memoryCache.keys()) {
    if (k.startsWith(`${projectId}:`)) memoryCache.delete(k);
  }
  await supabase
    .from("cache_entries")
    .delete()
    .eq("project_id", projectId)
    .eq("cache_type", "kv");
}

/**
 * Get cache stats for a project.
 */
export async function kvStats(projectId: string): Promise<{
  totalEntries: number;
  totalHits: number;
  memoryEntries: number;
}> {
  const { data } = await supabase
    .from("cache_entries")
    .select("hit_count")
    .eq("project_id", projectId)
    .eq("cache_type", "kv");

  const entries = data || [];
  let memCount = 0;
  for (const k of memoryCache.keys()) {
    if (k.startsWith(`${projectId}:`)) memCount++;
  }

  return {
    totalEntries: entries.length,
    totalHits: entries.reduce((sum, e) => sum + (e.hit_count || 0), 0),
    memoryEntries: memCount,
  };
}
