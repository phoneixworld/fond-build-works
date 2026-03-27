/**
 * Project Identity — Persists template identity per project.
 * 
 * Invariant: Every project that has been built carries a durable identity
 * (template name, schema snapshot, last build result) that is passed into
 * the orchestrator on every turn.
 * 
 * Storage: project_data table, collection = "template_identity"
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Schema Identity Types ─────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string; // text | number | boolean | date | json | email | url | select | relation
  required: boolean;
  defaultValue?: string;
  options?: string[];       // for select
  relationTo?: string;      // for relation — target entity name
}

export interface SchemaEntity {
  name: string;             // e.g. "contacts", "deals", "activities"
  fields: SchemaField[];
  relationships: SchemaRelationship[];
}

export interface SchemaRelationship {
  type: "belongs_to" | "has_many" | "many_to_many";
  from: string;             // source entity
  to: string;               // target entity
  foreignKey?: string;
}

export interface SchemaRoute {
  path: string;
  label: string;
  icon?: string;
  component?: string;       // file path
  isProtected: boolean;
}

export interface SchemaComponent {
  name: string;             // e.g. "ContactsTable", "DealPipeline"
  filePath: string;
  entity?: string;          // which entity it renders
  type: "page" | "widget" | "form" | "list" | "detail" | "chart" | "layout";
}

// ─── Template Identity ─────────────────────────────────────────────────────

export interface TemplateIdentity {
  templateId: string;
  templateName: string;
  /** ISO timestamp of when the template was first applied */
  appliedAt: string;
  /** Legacy: table names only */
  schemaSnapshot: string[];
  /** Full entity schema with fields and relationships */
  entities: SchemaEntity[];
  /** Registered routes */
  routes: SchemaRoute[];
  /** Component registry */
  components: SchemaComponent[];
}

export interface LastBuildResult {
  status: "success" | "partial" | "failed";
  fileCount: number;
  filesChanged: string[];
  verificationOk: boolean;
  timestamp: number;
  summary: string;
}

export interface ProjectIdentity {
  template: TemplateIdentity | null;
  lastBuild: LastBuildResult | null;
  /** Full file map keys (not content) from last build */
  fileMapKeys: string[];
}

const COLLECTION = "template_identity";

// In-memory cache keyed by projectId
const identityCache = new Map<string, ProjectIdentity>();

/**
 * Load project identity from DB (cached after first load per session).
 */
export async function loadProjectIdentity(projectId: string): Promise<ProjectIdentity> {
  const cached = identityCache.get(projectId);
  if (cached) return cached;

  try {
    const { data } = await supabase
      .from("project_data")
      .select("data")
      .eq("project_id", projectId)
      .eq("collection", COLLECTION)
      .maybeSingle();

    if (data?.data) {
      const identity = data.data as unknown as ProjectIdentity;
      identityCache.set(projectId, identity);
      return identity;
    }
  } catch (err) {
    console.warn("[ProjectIdentity] Failed to load:", err);
  }

  const empty: ProjectIdentity = { template: null, lastBuild: null, fileMapKeys: [] };
  identityCache.set(projectId, empty);
  return empty;
}

/**
 * Save project identity to DB and update cache.
 */
export async function saveProjectIdentity(
  projectId: string,
  identity: ProjectIdentity,
): Promise<void> {
  identityCache.set(projectId, identity);

  try {
    await supabase
      .from("project_data")
      .upsert(
        {
          project_id: projectId,
          collection: COLLECTION,
          data: identity as any,
        },
        { onConflict: "project_id,collection" },
      );
  } catch (err) {
    console.warn("[ProjectIdentity] Failed to save:", err);
  }
}

/**
 * Update template identity after a successful template build.
 */
export async function setTemplateIdentity(
  projectId: string,
  templateId: string,
  templateName: string,
  schemas: string[] = [],
): Promise<void> {
  const current = await loadProjectIdentity(projectId);
  const updated: ProjectIdentity = {
    ...current,
    template: {
      templateId,
      templateName,
      appliedAt: new Date().toISOString(),
      schemaSnapshot: schemas,
    },
  };
  await saveProjectIdentity(projectId, updated);
}

/**
 * Update last build result.
 */
export async function setLastBuildResult(
  projectId: string,
  result: LastBuildResult,
  fileMapKeys: string[],
): Promise<void> {
  const current = await loadProjectIdentity(projectId);
  const updated: ProjectIdentity = {
    ...current,
    lastBuild: result,
    fileMapKeys,
  };
  await saveProjectIdentity(projectId, updated);
}

/**
 * Clear cached identity (e.g. on project switch).
 */
export function clearIdentityCache(projectId?: string): void {
  if (projectId) {
    identityCache.delete(projectId);
  } else {
    identityCache.clear();
  }
}
