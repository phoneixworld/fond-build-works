/**
 * AST Workspace — Public API
 * 
 * Persistent Babel AST layer providing:
 * - Parse & cache every file as a live AST
 * - Query engine for finding nodes across the workspace
 * - Surgical patch system for node-level edits
 * - Dependency graph with impact analysis
 */

export { ASTStore } from "./store";
export { ASTQueryEngine } from "./query";
export { ASTPatcher } from "./patch";
export type { PatchResult } from "./patch";
export { ASTDependencyGraph } from "./graph";

// Re-export all types
export type {
  ASTFileEntry,
  FileMetadata,
  ImportInfo,
  ExportInfo,
  ComponentInfo,
  HookUsage,
  DeclarationInfo,
  NodeLocation,
  ParseError,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  PatchOperation,
  AddImportPatch,
  RemoveImportPatch,
  AddExportPatch,
  ReplaceNodePatch,
  InsertNodePatch,
  RemoveNodePatch,
  AddPropPatch,
  RemovePropPatch,
  WrapNodePatch,
  RenameSymbolPatch,
  ASTQuery,
  QueryResult,
  ProvenanceRecord,
  ASTStoreEvent,
  ASTStoreListener,
} from "./types";

// ─── Convenience Factory ─────────────────────────────────────────────────

import { ASTStore } from "./store";
import { ASTQueryEngine } from "./query";
import { ASTPatcher } from "./patch";
import { ASTDependencyGraph } from "./graph";

export interface ASTWorkspace {
  store: ASTStore;
  query: ASTQueryEngine;
  patcher: ASTPatcher;
  graph: ASTDependencyGraph;
}

/**
 * Create a fully wired AST Workspace from a set of files.
 */
export function createASTWorkspace(files?: Record<string, string>): ASTWorkspace {
  const store = new ASTStore();
  const query = new ASTQueryEngine(store);
  const patcher = new ASTPatcher(store);
  const graph = new ASTDependencyGraph(store);

  if (files) {
    store.setFiles(files);
  }

  // Auto-invalidate graph when files change
  store.on((event) => {
    if (event.type === "file_added" || event.type === "file_updated" || event.type === "file_removed") {
      graph.invalidate();
    }
  });

  return { store, query, patcher, graph };
}
