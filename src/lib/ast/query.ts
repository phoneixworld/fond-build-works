/**
 * AST Query Engine
 * 
 * Find components, hooks, imports, exports, and arbitrary nodes
 * across the entire workspace using structured queries.
 */

import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import type { ASTStore } from "./store";
import type { ASTQuery, QueryResult, NodeLocation } from "./types";

// ─── Location Helper ─────────────────────────────────────────────────────

function toLoc(node: t.Node): NodeLocation {
  return {
    start: node.start ?? 0,
    end: node.end ?? 0,
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
  };
}

// ─── Node Source Helper ──────────────────────────────────────────────────

function nodeSource(node: t.Node, fileSource: string): string {
  if (node.start != null && node.end != null) {
    return fileSource.slice(node.start, node.end);
  }
  try {
    return generate(node, { compact: false }).code;
  } catch {
    return "";
  }
}

// ─── Query Engine ────────────────────────────────────────────────────────

export class ASTQueryEngine {
  constructor(private store: ASTStore) {}

  /**
   * Execute a query across all (or filtered) files in the store.
   */
  query(q: ASTQuery): QueryResult[] {
    const results: QueryResult[] = [];
    const files = this.getTargetFiles(q.filePattern);

    for (const filePath of files) {
      const entry = this.store.getFile(filePath);
      if (!entry) continue;

      try {
        traverse(entry.ast, {
          enter(path) {
            // Node type filter
            if (q.nodeType && path.node.type !== q.nodeType) return;

            // Name filter
            if (q.name) {
              const nodeName = getNodeName(path.node);
              if (nodeName !== q.name) return;
            }

            // Pattern filter (on source code)
            if (q.pattern) {
              const src = nodeSource(path.node, entry.source);
              if (!q.pattern.test(src)) return;
            }

            // Exported filter
            if (q.exported !== undefined) {
              const isExported = t.isExportNamedDeclaration(path.parent) ||
                t.isExportDefaultDeclaration(path.parent);
              if (q.exported !== isExported) return;
            }

            // Custom predicate
            if (q.predicate && !q.predicate(path.node, path)) return;

            results.push({
              file: filePath,
              nodeType: path.node.type,
              name: getNodeName(path.node),
              source: nodeSource(path.node, entry.source),
              loc: toLoc(path.node),
              node: path.node,
              path,
            });
          },
        });
      } catch (e) {
        console.warn(`[ASTQuery] Error traversing ${filePath}:`, e);
      }
    }

    return results;
  }

  /**
   * Find a specific component by name across the workspace.
   */
  findComponent(name: string, file?: string): QueryResult | null {
    const results = this.query({
      nodeType: undefined,
      name,
      filePattern: file,
      predicate: (node) => {
        if (t.isFunctionDeclaration(node) && node.id?.name === name) return true;
        if (t.isVariableDeclarator(node) && t.isIdentifier(node.id, { name })) {
          return !!(node.init && (t.isArrowFunctionExpression(node.init) || t.isFunctionExpression(node.init) || t.isCallExpression(node.init)));
        }
        return false;
      },
    });
    return results[0] ?? null;
  }

  /**
   * Find all React components in the workspace.
   */
  findAllComponents(): QueryResult[] {
    return this.query({
      predicate: (node) => {
        const name = getNodeName(node);
        if (!name || !/^[A-Z]/.test(name)) return false;
        if (t.isFunctionDeclaration(node)) return true;
        if (t.isVariableDeclarator(node) && t.isIdentifier(node.id) && /^[A-Z]/.test(node.id.name)) {
          return !!(node.init && (t.isArrowFunctionExpression(node.init) || t.isFunctionExpression(node.init)));
        }
        return false;
      },
    });
  }

  /**
   * Find all imports of a specific module across the workspace.
   */
  findImportsOf(moduleSource: string): QueryResult[] {
    return this.query({
      nodeType: "ImportDeclaration",
      predicate: (node) => {
        if (!t.isImportDeclaration(node)) return false;
        return node.source.value === moduleSource || node.source.value.endsWith(moduleSource);
      },
    });
  }

  /**
   * Find all usages of a specific hook.
   */
  findHookUsages(hookName: string): QueryResult[] {
    return this.query({
      nodeType: "CallExpression",
      predicate: (node) => {
        if (!t.isCallExpression(node)) return false;
        return t.isIdentifier(node.callee, { name: hookName });
      },
    });
  }

  /**
   * Find where a symbol is defined (function, variable, class, type).
   */
  findDefinition(symbolName: string): QueryResult | null {
    const results = this.query({
      name: symbolName,
      predicate: (node) => {
        if (t.isFunctionDeclaration(node) && node.id?.name === symbolName) return true;
        if (t.isClassDeclaration(node) && node.id?.name === symbolName) return true;
        if (t.isVariableDeclarator(node) && t.isIdentifier(node.id, { name: symbolName })) return true;
        if (t.isTSTypeAliasDeclaration(node) && node.id.name === symbolName) return true;
        if (t.isTSInterfaceDeclaration(node) && node.id.name === symbolName) return true;
        return false;
      },
    });
    return results[0] ?? null;
  }

  /**
   * Find all references to a symbol name across files.
   */
  findReferences(symbolName: string): QueryResult[] {
    return this.query({
      nodeType: "Identifier",
      predicate: (node) => {
        return t.isIdentifier(node, { name: symbolName });
      },
    });
  }

  /**
   * Get all JSX elements of a specific component type.
   */
  findJSXUsages(componentName: string): QueryResult[] {
    return this.query({
      predicate: (node) => {
        if (t.isJSXOpeningElement(node)) {
          return t.isJSXIdentifier(node.name, { name: componentName });
        }
        return false;
      },
    });
  }

  /**
   * Find all files that export a specific symbol.
   */
  findExportSource(symbolName: string): { file: string; exportType: string } | null {
    for (const filePath of this.store.paths) {
      const meta = this.store.getMetadata(filePath);
      if (!meta) continue;
      for (const exp of meta.exports) {
        if (exp.name === symbolName || exp.localName === symbolName) {
          return { file: filePath, exportType: exp.type };
        }
      }
    }
    return null;
  }

  // ── Internal ──

  private getTargetFiles(filePattern?: string): string[] {
    if (!filePattern) return this.store.paths;

    // Simple glob matching
    const regex = new RegExp(
      filePattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")
    );

    return this.store.paths.filter(p => regex.test(p));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getNodeName(node: t.Node): string | undefined {
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (t.isClassDeclaration(node) && node.id) return node.id.name;
  if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) return node.id.name;
  if (t.isIdentifier(node)) return node.name;
  if (t.isTSTypeAliasDeclaration(node)) return node.id.name;
  if (t.isTSInterfaceDeclaration(node)) return node.id.name;
  if (t.isImportDeclaration(node)) return node.source.value;
  return undefined;
}
