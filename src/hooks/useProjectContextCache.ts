/**
 * useProjectContextCache — Manages per-project context caching for schemas, knowledge, and IR state.
 * Extracted from ChatPanel to reduce monolith complexity.
 * 
 * Responsibilities:
 * - Fetches schemas, knowledge, decisions, governance rules, and IR state in parallel
 * - Caches results per project with a 5-minute TTL
 * - Prefetches on project load so the first message has zero DB wait
 * - Invalidates cache on project switch
 */

import { useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProjectContext {
  schemas: any[];
  knowledge: string[];
  irContext: string;
}

interface CacheEntry extends ProjectContext {
  projectId: string;
  fetchedAt: number;
}

const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useProjectContextCache(projectId: string | undefined) {
  const cacheRef = useRef<CacheEntry | null>(null);

  const fetchProjectContext = useCallback(async (pid: string): Promise<ProjectContext> => {
    const cache = cacheRef.current;
    if (cache && cache.projectId === pid && (Date.now() - cache.fetchedAt) < CONTEXT_CACHE_TTL_MS) {
      return { schemas: cache.schemas, knowledge: cache.knowledge, irContext: cache.irContext };
    }

    const [schemasRes, knowledgeRes, decisionsRes, governanceRes, irRes] = await Promise.allSettled([
      supabase.from("project_schemas" as any).select("collection_name, schema").eq("project_id", pid),
      supabase.from("project_knowledge" as any).select("title, content").eq("project_id", pid).eq("is_active", true),
      supabase.from("project_decisions" as any).select("category, title, description").eq("project_id", pid).eq("is_active", true),
      supabase.from("project_governance_rules" as any).select("category, name, description, severity").eq("project_id", pid).eq("is_active", true),
      supabase.from("projects").select("ir_state").eq("id", pid).single(),
    ]);

    const schemas = schemasRes.status === "fulfilled" ? (schemasRes.value.data || []) : [];
    const knowledge: string[] = knowledgeRes.status === "fulfilled"
      ? (knowledgeRes.value.data || []).map((k: any) => `[${k.title}]: ${k.content}`)
      : [];

    if (decisionsRes.status === "fulfilled" && decisionsRes.value.data?.length) {
      knowledge.push("[PROJECT DECISIONS - Follow these architectural decisions]:");
      decisionsRes.value.data.forEach((d: any) => {
        knowledge.push(`  [${d.category}] ${d.title}${d.description ? ': ' + d.description : ''}`);
      });
    }
    if (governanceRes.status === "fulfilled" && governanceRes.value.data?.length) {
      knowledge.push("[GOVERNANCE RULES - Enforce these standards in generated code]:");
      governanceRes.value.data.forEach((r: any) => {
        knowledge.push(`  [${r.severity.toUpperCase()}] ${r.name}${r.description ? ': ' + r.description : ''}`);
      });
    }

    // Serialize IR state if present
    let irContext = "";
    if (irRes.status === "fulfilled" && irRes.value.data) {
      const { serializeIR } = await import("@/lib/irSerializer");
      irContext = serializeIR((irRes.value.data as any).ir_state);
    }

    cacheRef.current = { projectId: pid, schemas, knowledge, irContext, fetchedAt: Date.now() };
    return { schemas, knowledge, irContext };
  }, []);

  // Prefetch on project load so the first message has zero DB wait
  useEffect(() => {
    if (projectId) {
      if (cacheRef.current?.projectId !== projectId) {
        cacheRef.current = null;
      }
      fetchProjectContext(projectId);
    }
  }, [projectId, fetchProjectContext]);

  const invalidateCache = useCallback(() => {
    cacheRef.current = null;
  }, []);

  return { fetchProjectContext, invalidateCache };
}
