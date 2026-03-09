/**
 * Prompt Cache — hashes and caches system prompts to avoid
 * rebuilding identical prompts across consecutive build requests.
 *
 * Uses FNV-1a hashing + LRU eviction. Cache key is derived from
 * the combination of projectId + techStack + schema hash + design theme.
 */

// ─── FNV-1a Hash ──────────────────────────────────────────────────────────

function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

// ─── Prompt Config Cache ──────────────────────────────────────────────────

interface CachedPromptConfig {
  configHash: string;
  systemPrompt: string;
  timestamp: number;
}

const promptConfigCache = new Map<string, CachedPromptConfig>();
const MAX_PROMPT_CACHE = 20;
const PROMPT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a cache key from the prompt configuration parameters.
 */
export function getPromptConfigKey(
  projectId: string,
  techStack: string,
  schemas?: any[],
  designTheme?: string,
  knowledge?: string[]
): string {
  const schemaHash = schemas ? fnv1a(JSON.stringify(schemas)) : "none";
  const knowledgeHash = knowledge ? fnv1a(knowledge.join("|")) : "none";
  return `${projectId}:${techStack}:${schemaHash}:${designTheme || "none"}:${knowledgeHash}`;
}

/**
 * Get a cached system prompt if the config hasn't changed.
 */
export function getCachedSystemPrompt(configKey: string): string | null {
  const cached = promptConfigCache.get(configKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > PROMPT_CACHE_TTL_MS) {
    promptConfigCache.delete(configKey);
    return null;
  }
  return cached.systemPrompt;
}

/**
 * Cache a system prompt by config key.
 */
export function setCachedSystemPrompt(configKey: string, systemPrompt: string): void {
  // LRU eviction
  if (promptConfigCache.size >= MAX_PROMPT_CACHE) {
    const oldest = [...promptConfigCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) promptConfigCache.delete(oldest[0]);
  }
  promptConfigCache.set(configKey, {
    configHash: configKey,
    systemPrompt,
    timestamp: Date.now(),
  });
}

/**
 * Get prompt cache stats for observability.
 */
export function getPromptCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: string;
} {
  return {
    size: promptConfigCache.size,
    maxSize: MAX_PROMPT_CACHE,
    hitRate: `${promptConfigCache.size}/${MAX_PROMPT_CACHE}`,
  };
}

// ─── Build Request Deduplication ──────────────────────────────────────────

const pendingRequests = new Map<string, Promise<any>>();

/**
 * Deduplicate identical concurrent build requests.
 * If an identical request is already in-flight, return the same promise.
 */
export function deduplicateRequest<T>(
  key: string,
  executor: () => Promise<T>
): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing) {
    console.log("[PromptCache] Deduplicating concurrent request:", key.slice(0, 20));
    return existing as Promise<T>;
  }

  const promise = executor().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}