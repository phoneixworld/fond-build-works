/**
 * AST Patch System — Surgical Node-Level Editing
 * 
 * Applies structured patch operations to files via AST manipulation,
 * then regenerates source code. No full-file rewrites.
 */

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import type { ASTStore } from "./store";
import type {
  PatchOperation,
  AddImportPatch,
  RemoveImportPatch,
  ReplaceNodePatch,
  InsertNodePatch,
  RemoveNodePatch,
  AddPropPatch,
  RemovePropPatch,
  WrapNodePatch,
  RenameSymbolPatch,
  AddExportPatch,
} from "./types";

// ─── Patch Result ────────────────────────────────────────────────────────

export interface PatchResult {
  success: boolean;
  /** Updated source code */
  newSource?: string;
  /** What was changed */
  description: string;
  /** Error if failed */
  error?: string;
}

// ─── Parser Helpers ──────────────────────────────────────────────────────

function getPlugins(path: string): parser.ParserPlugin[] {
  const isTS = /\.tsx?$/.test(path);
  const isJSX = /\.(jsx|tsx)$/.test(path);
  return [
    ...(isJSX ? ["jsx" as const] : []),
    ...(isTS ? ["typescript" as const] : []),
    "decorators-legacy" as const,
    "classProperties" as const,
    "optionalChaining" as const,
    "nullishCoalescingOperator" as const,
    "dynamicImport" as const,
    "objectRestSpread" as const,
  ];
}

function parseExpression(code: string): t.Expression {
  const wrapped = `(${code})`;
  const ast = parser.parse(wrapped, {
    sourceType: "module",
    plugins: ["jsx", "typescript", "objectRestSpread"],
  });
  const stmt = ast.program.body[0];
  if (t.isExpressionStatement(stmt)) return stmt.expression;
  throw new Error("Failed to parse expression");
}

function parseStatements(code: string, filePath: string = "patch.tsx"): t.Statement[] {
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: getPlugins(filePath),
  });
  return ast.program.body;
}

// ─── Main Patcher ────────────────────────────────────────────────────────

export class ASTPatcher {
  constructor(private store: ASTStore) {}

  /**
   * Apply a single patch to a file.
   */
  applyPatch(filePath: string, patch: PatchOperation): PatchResult {
    const entry = this.store.getFile(filePath);
    if (!entry) {
      return { success: false, description: "File not found", error: `${filePath} not in store` };
    }

    try {
      // Clone the AST to avoid mutating the cached version
      const astClone = t.cloneNode(entry.ast, true);
      let result: PatchResult;

      switch (patch.type) {
        case "add_import":
          result = this.applyAddImport(astClone, patch, filePath);
          break;
        case "remove_import":
          result = this.applyRemoveImport(astClone, patch, filePath);
          break;
        case "add_export":
          result = this.applyAddExport(astClone, patch, filePath);
          break;
        case "replace_node":
          result = this.applyReplaceNode(astClone, patch, filePath, entry.source);
          break;
        case "insert_node":
          result = this.applyInsertNode(astClone, patch, filePath);
          break;
        case "remove_node":
          result = this.applyRemoveNode(astClone, patch, filePath);
          break;
        case "add_prop":
          result = this.applyAddProp(astClone, patch, filePath);
          break;
        case "remove_prop":
          result = this.applyRemoveProp(astClone, patch, filePath);
          break;
        case "wrap_node":
          result = this.applyWrapNode(astClone, patch, filePath, entry.source);
          break;
        case "rename_symbol":
          result = this.applyRenameSymbol(astClone, patch, filePath);
          break;
        default:
          return { success: false, description: "Unknown patch type", error: `Unknown: ${(patch as any).type}` };
      }

      if (result.success && result.newSource) {
        // Re-parse into store to update metadata
        this.store.setFile(filePath, result.newSource);
      }

      return result;
    } catch (err: any) {
      return {
        success: false,
        description: `Patch failed: ${patch.type}`,
        error: err.message,
      };
    }
  }

  /**
   * Apply multiple patches to a file in sequence.
   */
  applyPatches(filePath: string, patches: PatchOperation[]): PatchResult[] {
    const results: PatchResult[] = [];
    for (const patch of patches) {
      const result = this.applyPatch(filePath, patch);
      results.push(result);
      if (!result.success) break; // Stop on first failure
    }
    return results;
  }

  /**
   * Apply patches across multiple files.
   */
  applyMultiFilePatches(patches: { file: string; operations: PatchOperation[] }[]): PatchResult[] {
    const results: PatchResult[] = [];
    for (const { file, operations } of patches) {
      results.push(...this.applyPatches(file, operations));
    }
    return results;
  }

  // ─── Patch Implementations ──────────────────────────────────────────────

  private applyAddImport(ast: t.File, patch: AddImportPatch, filePath: string): PatchResult {
    // Check if import from this source already exists
    let existingImport: t.ImportDeclaration | null = null;
    for (const stmt of ast.program.body) {
      if (t.isImportDeclaration(stmt) && stmt.source.value === patch.source) {
        existingImport = stmt;
        break;
      }
    }

    if (existingImport) {
      // Merge specifiers into existing import
      for (const spec of patch.specifiers) {
        const alreadyExists = existingImport.specifiers.some(s => {
          if (spec.type === "default") return t.isImportDefaultSpecifier(s);
          if (spec.type === "namespace") return t.isImportNamespaceSpecifier(s);
          return t.isImportSpecifier(s) && (
            t.isIdentifier(s.imported) ? s.imported.name === spec.imported : false
          );
        });

        if (!alreadyExists) {
          if (spec.type === "default") {
            existingImport.specifiers.unshift(
              t.importDefaultSpecifier(t.identifier(spec.local || spec.imported))
            );
          } else if (spec.type === "namespace") {
            existingImport.specifiers.push(
              t.importNamespaceSpecifier(t.identifier(spec.local || spec.imported))
            );
          } else {
            existingImport.specifiers.push(
              t.importSpecifier(
                t.identifier(spec.local || spec.imported),
                t.identifier(spec.imported)
              )
            );
          }
        }
      }
    } else {
      // Create new import declaration
      const specifiers: (t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier | t.ImportSpecifier)[] = [];

      for (const spec of patch.specifiers) {
        if (spec.type === "default") {
          specifiers.push(t.importDefaultSpecifier(t.identifier(spec.local || spec.imported)));
        } else if (spec.type === "namespace") {
          specifiers.push(t.importNamespaceSpecifier(t.identifier(spec.local || spec.imported)));
        } else {
          specifiers.push(t.importSpecifier(
            t.identifier(spec.local || spec.imported),
            t.identifier(spec.imported)
          ));
        }
      }

      const importDecl = t.importDeclaration(specifiers, t.stringLiteral(patch.source));
      if (patch.isTypeOnly) importDecl.importKind = "type";

      // Insert after last import
      let lastImportIdx = -1;
      for (let i = 0; i < ast.program.body.length; i++) {
        if (t.isImportDeclaration(ast.program.body[i])) lastImportIdx = i;
      }
      ast.program.body.splice(lastImportIdx + 1, 0, importDecl);
    }

    const newSource = generate(ast, { retainLines: true }).code;
    return { success: true, newSource, description: `Added import from '${patch.source}'` };
  }

  private applyRemoveImport(ast: t.File, patch: RemoveImportPatch, filePath: string): PatchResult {
    let removed = false;

    ast.program.body = ast.program.body.filter(stmt => {
      if (!t.isImportDeclaration(stmt) || stmt.source.value !== patch.source) return true;

      if (!patch.specifiers) {
        // Remove entire import
        removed = true;
        return false;
      }

      // Remove specific specifiers
      stmt.specifiers = stmt.specifiers.filter(spec => {
        const name = t.isImportDefaultSpecifier(spec) ? "default" :
          t.isImportNamespaceSpecifier(spec) ? "*" :
          t.isIdentifier(spec.imported) ? spec.imported.name : "";
        return !patch.specifiers!.includes(name);
      });

      if (stmt.specifiers.length === 0) {
        removed = true;
        return false;
      }

      removed = true;
      return true;
    });

    if (!removed) {
      return { success: false, description: "Import not found", error: `No import from '${patch.source}'` };
    }

    const newSource = generate(ast, { retainLines: true }).code;
    return { success: true, newSource, description: `Removed import from '${patch.source}'` };
  }

  private applyAddExport(ast: t.File, patch: AddExportPatch, filePath: string): PatchResult {
    if (patch.exportType === "default") {
      ast.program.body.push(
        t.exportDefaultDeclaration(t.identifier(patch.name))
      );
    } else {
      ast.program.body.push(
        t.exportNamedDeclaration(
          null,
          [t.exportSpecifier(t.identifier(patch.name), t.identifier(patch.name))]
        )
      );
    }

    const newSource = generate(ast, { retainLines: true }).code;
    return { success: true, newSource, description: `Added ${patch.exportType} export '${patch.name}'` };
  }

  private applyReplaceNode(ast: t.File, patch: ReplaceNodePatch, filePath: string, source: string): PatchResult {
    const targetName = parseTargetSelector(patch.target);
    let replaced = false;

    traverse(ast, {
      enter(path) {
        if (replaced) return;
        const nodeName = getNodeName(path.node);
        if (nodeName !== targetName.name) return;
        if (targetName.type && !matchesType(path.node, targetName.type)) return;

        try {
          const newStatements = parseStatements(patch.code, filePath);
          if (newStatements.length === 1) {
            path.replaceWith(newStatements[0]);
          } else {
            path.replaceWithMultiple(newStatements);
          }
          replaced = true;
          path.stop();
        } catch (e: any) {
          throw new Error(`Failed to parse replacement code: ${e.message}`);
        }
      },
    });

    if (!replaced) {
      return { success: false, description: "Target not found", error: `No node matching '${patch.target}'` };
    }

    const newSource = generate(ast, { retainLines: false }).code;
    return { success: true, newSource, description: `Replaced '${patch.target}'` };
  }

  private applyInsertNode(ast: t.File, patch: InsertNodePatch, filePath: string): PatchResult {
    const newStatements = parseStatements(patch.code, filePath);

    if (patch.anchor === "program_start") {
      // Insert after imports
      let insertIdx = 0;
      for (let i = 0; i < ast.program.body.length; i++) {
        if (t.isImportDeclaration(ast.program.body[i])) insertIdx = i + 1;
      }
      ast.program.body.splice(insertIdx, 0, ...newStatements);
    } else if (patch.anchor === "program_end") {
      ast.program.body.push(...newStatements);
    } else {
      const targetName = parseTargetSelector(patch.anchor);
      let inserted = false;

      traverse(ast, {
        enter(path) {
          if (inserted) return;
          const nodeName = getNodeName(path.node);
          if (nodeName !== targetName.name) return;
          if (targetName.type && !matchesType(path.node, targetName.type)) return;

          if (patch.position === "before") {
            for (const stmt of newStatements) {
              path.insertBefore(stmt);
            }
          } else if (patch.position === "after") {
            for (const stmt of [...newStatements].reverse()) {
              path.insertAfter(stmt);
            }
          }
          inserted = true;
          path.stop();
        },
      });

      if (!inserted) {
        return { success: false, description: "Anchor not found", error: `No node matching '${patch.anchor}'` };
      }
    }

    const newSource = generate(ast, { retainLines: false }).code;
    return { success: true, newSource, description: `Inserted code at '${patch.anchor}'` };
  }

  private applyRemoveNode(ast: t.File, patch: RemoveNodePatch, filePath: string): PatchResult {
    const targetName = parseTargetSelector(patch.target);
    let removed = false;

    traverse(ast, {
      enter(path) {
        if (removed) return;
        const nodeName = getNodeName(path.node);
        if (nodeName !== targetName.name) return;
        if (targetName.type && !matchesType(path.node, targetName.type)) return;

        path.remove();
        removed = true;
        path.stop();
      },
    });

    if (!removed) {
      return { success: false, description: "Target not found", error: `No node matching '${patch.target}'` };
    }

    const newSource = generate(ast, { retainLines: false }).code;
    return { success: true, newSource, description: `Removed '${patch.target}'` };
  }

  private applyAddProp(ast: t.File, patch: AddPropPatch, filePath: string): PatchResult {
    let added = false;

    traverse(ast, {
      JSXOpeningElement(path) {
        if (added) return;
        if (!t.isJSXIdentifier(path.node.name, { name: patch.element })) return;

        // Check we're inside the right component
        const funcParent = path.getFunctionParent();
        if (funcParent) {
          const funcName = getFunctionName(funcParent.node);
          if (patch.component && funcName !== patch.component) return;
        }

        const propValue = patch.propValue.startsWith("{")
          ? t.jsxExpressionContainer(parseExpression(patch.propValue.slice(1, -1)))
          : t.stringLiteral(patch.propValue);

        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(patch.propName), propValue)
        );
        added = true;
      },
    });

    if (!added) {
      return { success: false, description: "Element not found", error: `No <${patch.element}> in ${patch.component}` };
    }

    const newSource = generate(ast, { retainLines: true }).code;
    return { success: true, newSource, description: `Added prop '${patch.propName}' to <${patch.element}>` };
  }

  private applyRemoveProp(ast: t.File, patch: RemovePropPatch, filePath: string): PatchResult {
    let removed = false;

    traverse(ast, {
      JSXOpeningElement(path) {
        if (removed) return;
        if (!t.isJSXIdentifier(path.node.name, { name: patch.element })) return;

        const idx = path.node.attributes.findIndex(attr =>
          t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: patch.propName })
        );

        if (idx !== -1) {
          path.node.attributes.splice(idx, 1);
          removed = true;
        }
      },
    });

    if (!removed) {
      return { success: false, description: "Prop not found", error: `No '${patch.propName}' on <${patch.element}>` };
    }

    const newSource = generate(ast, { retainLines: true }).code;
    return { success: true, newSource, description: `Removed prop '${patch.propName}' from <${patch.element}>` };
  }

  private applyWrapNode(ast: t.File, patch: WrapNodePatch, filePath: string, source: string): PatchResult {
    const targetName = parseTargetSelector(patch.target);
    let wrapped = false;

    traverse(ast, {
      enter(path) {
        if (wrapped) return;
        const nodeName = getNodeName(path.node);
        if (nodeName !== targetName.name) return;
        if (targetName.type && !matchesType(path.node, targetName.type)) return;

        const nodeCode = generate(path.node, { compact: false }).code;
        const wrappedCode = patch.wrapper.replace("{{children}}", nodeCode);

        try {
          const newStatements = parseStatements(wrappedCode, filePath);
          if (newStatements.length === 1) {
            path.replaceWith(newStatements[0]);
          }
          wrapped = true;
          path.stop();
        } catch (e: any) {
          throw new Error(`Failed to parse wrapper: ${e.message}`);
        }
      },
    });

    if (!wrapped) {
      return { success: false, description: "Target not found", error: `No node matching '${patch.target}'` };
    }

    const newSource = generate(ast, { retainLines: false }).code;
    return { success: true, newSource, description: `Wrapped '${patch.target}'` };
  }

  private applyRenameSymbol(ast: t.File, patch: RenameSymbolPatch, filePath: string): PatchResult {
    let count = 0;

    if (patch.scope === "project") {
      // Rename across all files in the store
      for (const fp of this.store.paths) {
        const entry = this.store.getFile(fp);
        if (!entry) continue;

        const fileAst = t.cloneNode(entry.ast, true);
        let changed = false;

        traverse(fileAst, {
          Identifier(path) {
            if (path.node.name === patch.from) {
              path.node.name = patch.to;
              changed = true;
              count++;
            }
          },
          JSXIdentifier(path) {
            if (path.node.name === patch.from) {
              path.node.name = patch.to;
              changed = true;
              count++;
            }
          },
        });

        if (changed) {
          const newSource = generate(fileAst, { retainLines: true }).code;
          this.store.setFile(fp, newSource);
        }
      }
    } else {
      // File-scoped rename
      traverse(ast, {
        Identifier(path) {
          if (path.node.name === patch.from) {
            path.node.name = patch.to;
            count++;
          }
        },
        JSXIdentifier(path) {
          if (path.node.name === patch.from) {
            path.node.name = patch.to;
            count++;
          }
        },
      });
    }

    if (count === 0) {
      return { success: false, description: "Symbol not found", error: `No '${patch.from}' found` };
    }

    const newSource = generate(ast, { retainLines: true }).code;
    if (patch.scope === "file") {
      // Only need to update this one file
      return { success: true, newSource, description: `Renamed '${patch.from}' → '${patch.to}' (${count} occurrences)` };
    }

    return { success: true, newSource, description: `Renamed '${patch.from}' → '${patch.to}' across project (${count} occurrences)` };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Parse a target selector like "component:Dashboard" or "function:fetchData" */
function parseTargetSelector(selector: string): { type?: string; name: string } {
  const parts = selector.split(":");
  if (parts.length === 2) {
    return { type: parts[0], name: parts[1] };
  }
  return { name: selector };
}

function matchesType(node: t.Node, type: string): boolean {
  switch (type) {
    case "component":
    case "function":
      return t.isFunctionDeclaration(node) || t.isVariableDeclarator(node);
    case "class":
      return t.isClassDeclaration(node);
    case "type":
      return t.isTSTypeAliasDeclaration(node);
    case "interface":
      return t.isTSInterfaceDeclaration(node);
    case "variable":
      return t.isVariableDeclarator(node);
    default:
      return node.type === type;
  }
}

function getNodeName(node: t.Node): string | undefined {
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (t.isClassDeclaration(node) && node.id) return node.id.name;
  if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) return node.id.name;
  if (t.isVariableDeclaration(node) && node.declarations[0] && t.isIdentifier(node.declarations[0].id)) {
    return node.declarations[0].id.name;
  }
  if (t.isTSTypeAliasDeclaration(node)) return node.id.name;
  if (t.isTSInterfaceDeclaration(node)) return node.id.name;
  if (t.isIdentifier(node)) return node.name;
  return undefined;
}

function getFunctionName(node: t.Node): string | undefined {
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) return node.id.name;
  return undefined;
}
