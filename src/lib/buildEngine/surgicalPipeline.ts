/**
 * Surgical Pipeline — Pillar 2, Component 3
 * 
 * Replaces full-file writes with AST-level patches for edit operations.
 * When the intent is "edit" (not "new_app"), this pipeline:
 * 1. Identifies affected files via dependency graph
 * 2. Classifies the edit intent into patch operations
 * 3. Applies surgical AST patches
 * 4. Falls back to full-file replacement if patches fail
 */

import { getASTWorkspace } from "./astBridge";
import type { PatchOperation } from "@/lib/ast/types";
import type { PatchResult } from "@/lib/ast/patch";
import generate from "@babel/generator";

export interface SurgicalEditRequest {
  /** Target file path */
  filePath: string;
  /** What to change (structured) */
  patches: PatchOperation[];
}

export interface SurgicalEditResult {
  success: boolean;
  filePath: string;
  /** Updated source code */
  newSource?: string;
  /** What was done */
  patchResults: PatchResult[];
  /** Whether we fell back to full replacement */
  usedFallback: boolean;
}

/**
 * Apply surgical patches to a file using AST manipulation.
 */
export function applySurgicalEdit(request: SurgicalEditRequest): SurgicalEditResult {
  const ws = getASTWorkspace();
  const { filePath, patches } = request;

  // Check file exists in AST store
  if (!ws.store.hasFile(filePath)) {
    return {
      success: false,
      filePath,
      patchResults: [{ success: false, description: "File not in AST store" }],
      usedFallback: false,
    };
  }

  const results = ws.patcher.applyPatches(filePath, patches);
  const allSucceeded = results.every(r => r.success);

  // Get updated source from the last successful patch
  const lastSuccess = [...results].reverse().find(r => r.success);

  return {
    success: allSucceeded,
    filePath,
    newSource: lastSuccess?.newSource || ws.store.getSource(filePath),
    patchResults: results,
    usedFallback: false,
  };
}

/**
 * Apply surgical edits across multiple files.
 */
export function applySurgicalEdits(requests: SurgicalEditRequest[]): SurgicalEditResult[] {
  return requests.map(req => applySurgicalEdit(req));
}

/**
 * Classify an edit instruction into patch operations.
 * This is a deterministic classifier — no AI needed for common patterns.
 */
export function classifyEditIntent(
  instruction: string,
  targetFile: string,
): PatchOperation[] {
  const patches: PatchOperation[] = [];
  const lower = instruction.toLowerCase();

  // Add import pattern
  const addImportMatch = instruction.match(
    /add\s+(?:an?\s+)?import\s+(?:of\s+)?(?:{?\s*(\w+)\s*}?\s+from\s+)?["']([^"']+)["']/i
  );
  if (addImportMatch) {
    patches.push({
      type: "add_import",
      source: addImportMatch[2],
      specifiers: addImportMatch[1]
        ? [{ imported: addImportMatch[1], type: "named" }]
        : [{ imported: "default", type: "default" }],
    });
  }

  // Remove import pattern
  const removeImportMatch = instruction.match(
    /remove\s+(?:the\s+)?import\s+(?:of\s+|from\s+)?["']([^"']+)["']/i
  );
  if (removeImportMatch) {
    patches.push({
      type: "remove_import",
      source: removeImportMatch[1],
    });
  }

  // Rename pattern
  const renameMatch = instruction.match(
    /rename\s+(\w+)\s+to\s+(\w+)/i
  );
  if (renameMatch) {
    patches.push({
      type: "rename_symbol",
      from: renameMatch[1],
      to: renameMatch[2],
      scope: "file",
    });
  }

  // Add prop pattern
  const addPropMatch = instruction.match(
    /add\s+(?:a\s+)?prop\s+(\w+)\s*=\s*(?:["']([^"']+)["']|{([^}]+)})\s+to\s+<(\w+)/i
  );
  if (addPropMatch) {
    patches.push({
      type: "add_prop",
      component: "", // Will be inferred
      element: addPropMatch[4],
      propName: addPropMatch[1],
      propValue: addPropMatch[2] || `{${addPropMatch[3]}}`,
    });
  }

  // Remove component/function pattern
  const removeMatch = instruction.match(
    /(?:remove|delete)\s+(?:the\s+)?(?:component|function)\s+(\w+)/i
  );
  if (removeMatch) {
    patches.push({
      type: "remove_node",
      target: `function:${removeMatch[1]}`,
    });
  }

  return patches;
}

/**
 * Get the current source for a file from the AST store.
 * Used for generating diffs.
 */
export function getASTSource(filePath: string): string | undefined {
  return getASTWorkspace().store.getSource(filePath);
}

/**
 * Regenerate source from AST (after patches).
 */
export function regenerateSource(filePath: string): string | null {
  const ws = getASTWorkspace();
  const ast = ws.store.getAST(filePath);
  if (!ast) return null;
  return generate(ast, { retainLines: true }).code;
}
