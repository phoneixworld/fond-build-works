/**
 * AST Workspace — Core Types
 * 
 * Type definitions for the persistent AST layer that powers
 * surgical editing, dependency tracking, and provenance.
 */

import type { File as BabelFile } from "@babel/types";

// ─── File Entry ───────────────────────────────────────────────────────────

export interface ASTFileEntry {
  /** Relative file path (e.g., "src/components/Dashboard.tsx") */
  path: string;
  /** Raw source code */
  source: string;
  /** Parsed Babel AST */
  ast: BabelFile;
  /** Content hash for change detection */
  hash: string;
  /** Last parse timestamp */
  parsedAt: number;
  /** Parse errors if any (file may have partial AST) */
  parseErrors: ParseError[];
  /** Whether this file contains JSX */
  hasJSX: boolean;
  /** Whether this file uses TypeScript */
  isTypeScript: boolean;
  /** Extracted metadata */
  metadata: FileMetadata;
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

// ─── File Metadata (extracted from AST) ──────────────────────────────────

export interface FileMetadata {
  /** All imports in this file */
  imports: ImportInfo[];
  /** All exports from this file */
  exports: ExportInfo[];
  /** React components defined in this file */
  components: ComponentInfo[];
  /** Hooks used in this file */
  hooks: HookUsage[];
  /** Top-level function/variable declarations */
  declarations: DeclarationInfo[];
}

export interface ImportInfo {
  /** Source module (e.g., "react", "./utils") */
  source: string;
  /** Named imports: { original, local } */
  specifiers: { imported: string; local: string; type: "named" | "default" | "namespace" }[];
  /** Whether it's a type-only import */
  isTypeOnly: boolean;
  /** AST node location for surgical editing */
  loc: NodeLocation;
}

export interface ExportInfo {
  /** Exported name (or "default") */
  name: string;
  /** Local name if different */
  localName: string;
  /** Export type */
  type: "named" | "default" | "re-export" | "all";
  /** Re-export source if applicable */
  source?: string;
  /** AST node location */
  loc: NodeLocation;
}

export interface ComponentInfo {
  /** Component name */
  name: string;
  /** Props interface/type name if found */
  propsType?: string;
  /** Prop names extracted from destructuring or type */
  propNames: string[];
  /** Hooks used inside this component */
  hooks: string[];
  /** Whether it's a default export */
  isDefaultExport: boolean;
  /** Whether it uses forwardRef */
  usesForwardRef: boolean;
  /** AST node location */
  loc: NodeLocation;
}

export interface HookUsage {
  /** Hook name (e.g., "useState", "useEffect") */
  name: string;
  /** Variable names assigned to (e.g., ["count", "setCount"]) */
  assignedTo: string[];
  /** AST node location */
  loc: NodeLocation;
}

export interface DeclarationInfo {
  /** Declaration name */
  name: string;
  /** Kind: function, const, let, var, class, type, interface */
  kind: string;
  /** Whether it's exported */
  isExported: boolean;
  /** AST node location */
  loc: NodeLocation;
}

// ─── Node Location ───────────────────────────────────────────────────────

export interface NodeLocation {
  start: number;
  end: number;
  line: number;
  column: number;
}

// ─── Dependency Graph ────────────────────────────────────────────────────

export interface DependencyEdge {
  /** Source file path */
  from: string;
  /** Target file path (resolved) */
  to: string;
  /** Import specifiers used */
  specifiers: string[];
  /** Whether it's a type-only import */
  isTypeOnly: boolean;
}

export interface DependencyNode {
  /** File path */
  path: string;
  /** Files this file imports from */
  dependencies: string[];
  /** Files that import this file */
  dependents: string[];
  /** Topological sort order (lower = earlier) */
  order: number;
}

export interface DependencyGraph {
  /** All nodes indexed by file path */
  nodes: Map<string, DependencyNode>;
  /** All edges */
  edges: DependencyEdge[];
  /** Files with no dependents (entry points) */
  roots: string[];
  /** Files with no dependencies (leaves) */
  leaves: string[];
  /** Detected circular dependency cycles */
  cycles: string[][];
}

// ─── Patch Operations ────────────────────────────────────────────────────

export type PatchOperation =
  | AddImportPatch
  | RemoveImportPatch
  | AddExportPatch
  | ReplaceNodePatch
  | InsertNodePatch
  | RemoveNodePatch
  | AddPropPatch
  | RemovePropPatch
  | WrapNodePatch
  | RenameSymbolPatch;

export interface AddImportPatch {
  type: "add_import";
  source: string;
  specifiers: { imported: string; local?: string; type: "named" | "default" | "namespace" }[];
  isTypeOnly?: boolean;
}

export interface RemoveImportPatch {
  type: "remove_import";
  source: string;
  /** If specified, only remove these specifiers. Otherwise remove entire import. */
  specifiers?: string[];
}

export interface AddExportPatch {
  type: "add_export";
  name: string;
  exportType: "named" | "default";
}

export interface ReplaceNodePatch {
  type: "replace_node";
  /** Target node selector (e.g., "component:Dashboard", "function:fetchData") */
  target: string;
  /** New source code for the node */
  code: string;
}

export interface InsertNodePatch {
  type: "insert_node";
  /** Where to insert relative to anchor */
  position: "before" | "after" | "first_child" | "last_child";
  /** Anchor node selector */
  anchor: string;
  /** Source code to insert */
  code: string;
}

export interface RemoveNodePatch {
  type: "remove_node";
  /** Target node selector */
  target: string;
}

export interface AddPropPatch {
  type: "add_prop";
  /** Component selector */
  component: string;
  /** JSX element name to add prop to */
  element: string;
  /** Prop name */
  propName: string;
  /** Prop value as source code */
  propValue: string;
}

export interface RemovePropPatch {
  type: "remove_prop";
  component: string;
  element: string;
  propName: string;
}

export interface WrapNodePatch {
  type: "wrap_node";
  /** Target node selector */
  target: string;
  /** Wrapper template with {{children}} placeholder */
  wrapper: string;
}

export interface RenameSymbolPatch {
  type: "rename_symbol";
  /** Old symbol name */
  from: string;
  /** New symbol name */
  to: string;
  /** Scope: "file" | "project" */
  scope: "file" | "project";
}

// ─── Query Types ─────────────────────────────────────────────────────────

export interface ASTQuery {
  /** Node type filter (e.g., "ImportDeclaration", "FunctionDeclaration") */
  nodeType?: string;
  /** Name filter */
  name?: string;
  /** Pattern filter (regex on source code) */
  pattern?: RegExp;
  /** File path filter (glob) */
  filePattern?: string;
  /** Only exported nodes */
  exported?: boolean;
  /** Custom predicate */
  predicate?: (node: any, path: any) => boolean;
}

export interface QueryResult {
  /** File path */
  file: string;
  /** Node type */
  nodeType: string;
  /** Node name if identifiable */
  name?: string;
  /** Source code of the matched node */
  source: string;
  /** Location in file */
  loc: NodeLocation;
  /** The raw Babel AST node */
  node: any;
  /** The Babel NodePath for traversal */
  path?: any;
}

// ─── Provenance ──────────────────────────────────────────────────────────

export interface ProvenanceRecord {
  /** Unique ID */
  id: string;
  /** The IR node ID this code was generated from */
  irNodeId: string;
  /** IR node type (entity, page, flow, etc.) */
  irNodeType: string;
  /** File path containing this code */
  filePath: string;
  /** AST node path (e.g., "program.body[2].declaration") */
  astPath: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Structural fingerprint for re-matching */
  fingerprint: string;
  /** When this mapping was established */
  createdAt: number;
}

// ─── Store Events ────────────────────────────────────────────────────────

export type ASTStoreEvent =
  | { type: "file_added"; path: string }
  | { type: "file_updated"; path: string; changedNodes: string[] }
  | { type: "file_removed"; path: string }
  | { type: "parse_error"; path: string; errors: ParseError[] }
  | { type: "dependency_changed"; from: string; to: string };

export type ASTStoreListener = (event: ASTStoreEvent) => void;
