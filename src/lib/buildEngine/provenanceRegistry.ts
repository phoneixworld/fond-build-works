/**
 * Provenance Registry — Pillar 2, Component 2
 * 
 * Maps generated code back to IR nodes using structural fingerprints.
 * Post-hoc matching: after AI generates code, we analyze it and assign
 * provenance records linking AST nodes → IR nodes.
 */

import type { ProvenanceRecord } from "@/lib/ast/types";
import { getASTWorkspace } from "./astBridge";

// ─── Fingerprint Patterns ────────────────────────────────────────────────

interface FingerprintPattern {
  /** Pattern name for debugging */
  name: string;
  /** Regex to match in source code */
  pattern: RegExp;
  /** IR node type this maps to */
  irNodeType: string;
  /** Extract IR node ID from match */
  extractId: (match: RegExpMatchArray, filePath: string) => string;
}

const FINGERPRINT_PATTERNS: FingerprintPattern[] = [
  // Supabase table access → entity
  {
    name: "supabase_from",
    pattern: /supabase\s*\.\s*from\s*\(\s*["'](\w+)["']\s*\)/,
    irNodeType: "entity",
    extractId: (m) => `entity:${m[1]}`,
  },
  // React Router route → page
  {
    name: "route_path",
    pattern: /<Route\s+[^>]*path\s*=\s*["']([^"']+)["']/,
    irNodeType: "page",
    extractId: (m) => `page:${m[1]}`,
  },
  // useState with specific name → state field
  {
    name: "useState_field",
    pattern: /const\s+\[(\w+),\s*set\w+\]\s*=\s*useState/,
    irNodeType: "state",
    extractId: (m, file) => `state:${file}:${m[1]}`,
  },
  // useEffect with dependency → flow
  {
    name: "useEffect_flow",
    pattern: /useEffect\s*\(\s*(?:async\s*)?\(\)\s*=>\s*\{[^}]*fetch|query|supabase/,
    irNodeType: "flow",
    extractId: (_, file) => `flow:${file}:data_fetch`,
  },
  // Form submission handler → flow
  {
    name: "form_submit",
    pattern: /(?:handleSubmit|onSubmit|handle\w*Submit)\s*(?:=|:)\s*(?:async\s*)?\(/,
    irNodeType: "flow",
    extractId: (m, file) => `flow:${file}:form_submit`,
  },
  // Auth check → auth_rule
  {
    name: "auth_check",
    pattern: /(?:supabase\.auth|useAuth|useSession|getSession|signIn|signOut)/,
    irNodeType: "auth_rule",
    extractId: (_, file) => `auth:${file}`,
  },
  // Navigation component → nav
  {
    name: "nav_component",
    pattern: /(?:Sidebar|NavBar|Navigation|Header|TopBar|BottomNav)\b/,
    irNodeType: "navigation",
    extractId: (m, file) => `nav:${file}:${m[0]}`,
  },
];

// ─── Registry ────────────────────────────────────────────────────────────

let _records: ProvenanceRecord[] = [];
let _idCounter = 0;

/**
 * Scan all indexed files and build provenance records.
 * Called after indexFilesIntoAST.
 */
export function buildProvenanceMap(): ProvenanceRecord[] {
  const ws = getASTWorkspace();
  const newRecords: ProvenanceRecord[] = [];

  for (const filePath of ws.store.paths) {
    const source = ws.store.getSource(filePath);
    if (!source) continue;

    for (const fp of FINGERPRINT_PATTERNS) {
      const matches = source.matchAll(new RegExp(fp.pattern, "g"));
      for (const match of matches) {
        const irNodeId = fp.extractId(match, filePath);
        
        // Avoid duplicates
        const exists = newRecords.some(
          r => r.irNodeId === irNodeId && r.filePath === filePath
        );
        if (exists) continue;

        newRecords.push({
          id: `prov_${++_idCounter}`,
          irNodeId,
          irNodeType: fp.irNodeType,
          filePath,
          astPath: `match:${match.index}`,
          confidence: 0.85 + (fp.name === "supabase_from" ? 0.1 : 0),
          fingerprint: `${fp.name}:${match[0].slice(0, 50)}`,
          createdAt: Date.now(),
        });
      }
    }
  }

  _records = newRecords;
  console.log(`[Provenance] Mapped ${newRecords.length} records across ${ws.store.paths.length} files`);
  return newRecords;
}

/**
 * Find all provenance records for a given IR node.
 */
export function findByIRNode(irNodeId: string): ProvenanceRecord[] {
  return _records.filter(r => r.irNodeId === irNodeId);
}

/**
 * Find all provenance records in a given file.
 */
export function findByFile(filePath: string): ProvenanceRecord[] {
  return _records.filter(r => r.filePath === filePath);
}

/**
 * Get all provenance records.
 */
export function getAllProvenance(): ProvenanceRecord[] {
  return [..._records];
}

/**
 * Clear all records (used on project switch).
 */
export function clearProvenance(): void {
  _records = [];
  _idCounter = 0;
}

/**
 * Get a summary of provenance for debugging.
 */
export function getProvenanceSummary(): string {
  const byType = new Map<string, number>();
  for (const r of _records) {
    byType.set(r.irNodeType, (byType.get(r.irNodeType) || 0) + 1);
  }
  return Array.from(byType.entries())
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ");
}
