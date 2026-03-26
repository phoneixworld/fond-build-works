/**
 * AST Store — Persistent Babel AST Cache
 * 
 * Parses every file into a Babel AST and maintains it.
 * Provides change detection, incremental re-parsing, and event emission.
 */

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type {
  ASTFileEntry,
  ASTStoreEvent,
  ASTStoreListener,
  FileMetadata,
  ImportInfo,
  ExportInfo,
  ComponentInfo,
  HookUsage,
  DeclarationInfo,
  NodeLocation,
  ParseError,
} from "./types";

// ─── Content Hashing ─────────────────────────────────────────────────────

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

// ─── Parser Config ───────────────────────────────────────────────────────

function getParserPlugins(path: string): parser.ParserPlugin[] {
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
    "exportDefaultFrom" as const,
    "objectRestSpread" as const,
  ];
}

// ─── Location Extractor ──────────────────────────────────────────────────

function toLoc(node: t.Node): NodeLocation {
  return {
    start: node.start ?? 0,
    end: node.end ?? 0,
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
  };
}

// ─── Metadata Extractor ─────────────────────────────────────────────────

function extractMetadata(ast: t.File, source: string): FileMetadata {
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const components: ComponentInfo[] = [];
  const hooks: HookUsage[] = [];
  const declarations: DeclarationInfo[] = [];
  const componentBodies = new Map<string, { hooks: string[]; propNames: string[] }>();

  traverse(ast, {
    // ── Imports ──
    ImportDeclaration(path) {
      const node = path.node;
      const specifiers = node.specifiers.map((spec) => {
        if (t.isImportDefaultSpecifier(spec)) {
          return { imported: "default", local: spec.local.name, type: "default" as const };
        } else if (t.isImportNamespaceSpecifier(spec)) {
          return { imported: "*", local: spec.local.name, type: "namespace" as const };
        } else {
          const imported = t.isStringLiteral(spec.imported)
            ? spec.imported.value
            : spec.imported.name;
          return { imported, local: spec.local.name, type: "named" as const };
        }
      });

      imports.push({
        source: node.source.value,
        specifiers,
        isTypeOnly: node.importKind === "type",
        loc: toLoc(node),
      });
    },

    // ── Exports ──
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      let name = "default";
      if (t.isIdentifier(decl)) name = decl.name;
      else if (t.isFunctionDeclaration(decl) && decl.id) name = decl.id.name;
      else if (t.isClassDeclaration(decl) && decl.id) name = decl.id.name;

      exports.push({
        name: "default",
        localName: name,
        type: "default",
        loc: toLoc(path.node),
      });
    },

    ExportNamedDeclaration(path) {
      const node = path.node;

      if (node.declaration) {
        if (t.isVariableDeclaration(node.declaration)) {
          for (const decl of node.declaration.declarations) {
            if (t.isIdentifier(decl.id)) {
              exports.push({
                name: decl.id.name,
                localName: decl.id.name,
                type: "named",
                loc: toLoc(node),
              });
            }
          }
        } else if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
          exports.push({
            name: node.declaration.id.name,
            localName: node.declaration.id.name,
            type: "named",
            loc: toLoc(node),
          });
        } else if (t.isClassDeclaration(node.declaration) && node.declaration.id) {
          exports.push({
            name: node.declaration.id.name,
            localName: node.declaration.id.name,
            type: "named",
            loc: toLoc(node),
          });
        } else if (t.isTSTypeAliasDeclaration(node.declaration)) {
          exports.push({
            name: node.declaration.id.name,
            localName: node.declaration.id.name,
            type: "named",
            loc: toLoc(node),
          });
        } else if (t.isTSInterfaceDeclaration(node.declaration)) {
          exports.push({
            name: node.declaration.id.name,
            localName: node.declaration.id.name,
            type: "named",
            loc: toLoc(node),
          });
        }
      }

      if (node.specifiers) {
        for (const spec of node.specifiers) {
          if (t.isExportSpecifier(spec)) {
            const exported = t.isStringLiteral(spec.exported)
              ? spec.exported.value
              : spec.exported.name;
            exports.push({
              name: exported,
              localName: spec.local.name,
              type: "named",
              source: node.source?.value,
              loc: toLoc(node),
            });
          }
        }
      }

      if (node.source && node.specifiers.length === 0) {
        exports.push({
          name: "*",
          localName: "*",
          type: "all",
          source: node.source.value,
          loc: toLoc(node),
        });
      }
    },

    ExportAllDeclaration(path) {
      exports.push({
        name: "*",
        localName: "*",
        type: "all",
        source: path.node.source.value,
        loc: toLoc(path.node),
      });
    },

    // ── Function / Variable Declarations ──
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      const name = path.node.id.name;
      const isExported = t.isExportNamedDeclaration(path.parent) || t.isExportDefaultDeclaration(path.parent);

      declarations.push({
        name,
        kind: "function",
        isExported,
        loc: toLoc(path.node),
      });

      // Detect React components (PascalCase + returns JSX)
      if (/^[A-Z]/.test(name)) {
        const bodyHooks: string[] = [];
        const propNames: string[] = [];

        // Extract props from first parameter
        const firstParam = path.node.params[0];
        if (t.isObjectPattern(firstParam)) {
          for (const prop of firstParam.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              propNames.push(prop.key.name);
            }
          }
        }

        componentBodies.set(name, { hooks: bodyHooks, propNames });

        // Traverse body for hook calls
        path.traverse({
          CallExpression(innerPath) {
            const callee = innerPath.node.callee;
            if (t.isIdentifier(callee) && /^use[A-Z]/.test(callee.name)) {
              bodyHooks.push(callee.name);
            }
          },
        });

        components.push({
          name,
          propNames,
          hooks: bodyHooks,
          isDefaultExport: t.isExportDefaultDeclaration(path.parent),
          usesForwardRef: false,
          loc: toLoc(path.node),
        });
      }
    },

    VariableDeclaration(path) {
      for (const decl of path.node.declarations) {
        if (!t.isIdentifier(decl.id)) continue;
        const name = decl.id.name;
        const isExported = t.isExportNamedDeclaration(path.parent);

        declarations.push({
          name,
          kind: path.node.kind,
          isExported,
          loc: toLoc(path.node),
        });

        // Detect arrow function components
        if (/^[A-Z]/.test(name) && decl.init) {
          let funcNode: t.ArrowFunctionExpression | t.FunctionExpression | null = null;
          let usesForwardRef = false;

          if (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init)) {
            funcNode = decl.init;
          } else if (t.isCallExpression(decl.init)) {
            // React.forwardRef or React.memo
            const callee = decl.init.callee;
            if (
              t.isMemberExpression(callee) &&
              t.isIdentifier(callee.object, { name: "React" }) &&
              t.isIdentifier(callee.property, { name: "forwardRef" })
            ) {
              usesForwardRef = true;
              const arg = decl.init.arguments[0];
              if (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
                funcNode = arg;
              }
            }
          }

          if (funcNode) {
            const bodyHooks: string[] = [];
            const propNames: string[] = [];

            const firstParam = funcNode.params[0];
            if (t.isObjectPattern(firstParam)) {
              for (const prop of firstParam.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  propNames.push(prop.key.name);
                }
              }
            }

            path.traverse({
              CallExpression(innerPath) {
                const callee = innerPath.node.callee;
                if (t.isIdentifier(callee) && /^use[A-Z]/.test(callee.name)) {
                  bodyHooks.push(callee.name);
                }
              },
            });

            components.push({
              name,
              propNames,
              hooks: bodyHooks,
              isDefaultExport: false,
              usesForwardRef,
              loc: toLoc(path.node),
            });
          }
        }
      }
    },

    // ── Hook Calls (top-level in components) ──
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee) || !/^use[A-Z]/.test(callee.name)) return;

      // Only track at function body level (not nested callbacks)
      const parentFunc = path.getFunctionParent();
      if (!parentFunc) return;

      const assignedTo: string[] = [];
      const parentNode = path.parentPath?.node;
      if (t.isVariableDeclarator(parentNode)) {
        if (t.isIdentifier(parentNode.id)) {
          assignedTo.push(parentNode.id.name);
        } else if (t.isArrayPattern(parentNode.id)) {
          for (const el of parentNode.id.elements) {
            if (t.isIdentifier(el)) assignedTo.push(el.name);
          }
        } else if (t.isObjectPattern(parentNode.id)) {
          for (const prop of parentNode.id.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) {
              assignedTo.push(prop.value.name);
            }
          }
        }
      }

      hooks.push({
        name: callee.name,
        assignedTo,
        loc: toLoc(path.node),
      });
    },

    // ── Class Declarations ──
    ClassDeclaration(path) {
      if (!path.node.id) return;
      declarations.push({
        name: path.node.id.name,
        kind: "class",
        isExported: t.isExportNamedDeclaration(path.parent) || t.isExportDefaultDeclaration(path.parent),
        loc: toLoc(path.node),
      });
    },

    // ── TypeScript Types/Interfaces ──
    TSTypeAliasDeclaration(path) {
      declarations.push({
        name: path.node.id.name,
        kind: "type",
        isExported: t.isExportNamedDeclaration(path.parent),
        loc: toLoc(path.node),
      });
    },

    TSInterfaceDeclaration(path) {
      declarations.push({
        name: path.node.id.name,
        kind: "interface",
        isExported: t.isExportNamedDeclaration(path.parent),
        loc: toLoc(path.node),
      });
    },
  });

  return { imports, exports, components, hooks, declarations };
}

// ─── AST Store Class ─────────────────────────────────────────────────────

export class ASTStore {
  private files = new Map<string, ASTFileEntry>();
  private listeners: ASTStoreListener[] = [];

  /** Total number of tracked files */
  get size(): number {
    return this.files.size;
  }

  /** Get all file paths */
  get paths(): string[] {
    return Array.from(this.files.keys());
  }

  // ── Parse & Store ──

  /**
   * Parse a file and add/update it in the store.
   * Returns the file entry (with metadata) or null if not a JS/TS file.
   */
  setFile(path: string, source: string): ASTFileEntry | null {
    // Only process JS/TS files
    if (!/\.(jsx?|tsx?|mjs|cjs)$/.test(path)) return null;

    const hash = hashContent(source);
    const existing = this.files.get(path);

    // Skip if unchanged
    if (existing && existing.hash === hash) return existing;

    const isUpdate = !!existing;
    const entry = this.parseFile(path, source, hash);
    this.files.set(path, entry);

    this.emit({
      type: isUpdate ? "file_updated" : "file_added",
      path,
      ...(isUpdate ? { changedNodes: [] } : {}),
    } as ASTStoreEvent);

    return entry;
  }

  /**
   * Bulk-load files into the store. More efficient than individual setFile calls.
   */
  setFiles(files: Record<string, string>): { parsed: number; errors: number } {
    let parsed = 0;
    let errors = 0;

    for (const [path, source] of Object.entries(files)) {
      const entry = this.setFile(path, source);
      if (entry) {
        parsed++;
        if (entry.parseErrors.length > 0) errors++;
      }
    }

    return { parsed, errors };
  }

  /**
   * Remove a file from the store.
   */
  removeFile(path: string): boolean {
    const existed = this.files.delete(path);
    if (existed) {
      this.emit({ type: "file_removed", path });
    }
    return existed;
  }

  // ── Getters ──

  /**
   * Get a file entry by path.
   */
  getFile(path: string): ASTFileEntry | undefined {
    return this.files.get(path);
  }

  /**
   * Get the AST for a file.
   */
  getAST(path: string): t.File | undefined {
    return this.files.get(path)?.ast;
  }

  /**
   * Get metadata for a file.
   */
  getMetadata(path: string): FileMetadata | undefined {
    return this.files.get(path)?.metadata;
  }

  /**
   * Get the source code for a file.
   */
  getSource(path: string): string | undefined {
    return this.files.get(path)?.source;
  }

  /**
   * Check if a file exists in the store.
   */
  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Get all file entries.
   */
  getAllFiles(): ASTFileEntry[] {
    return Array.from(this.files.values());
  }

  /**
   * Get all files matching a predicate.
   */
  findFiles(predicate: (entry: ASTFileEntry) => boolean): ASTFileEntry[] {
    return this.getAllFiles().filter(predicate);
  }

  // ── Queries on Metadata ──

  /**
   * Find all files that import from a given source.
   */
  findImportersOf(sourcePath: string): { file: string; specifiers: string[] }[] {
    const results: { file: string; specifiers: string[] }[] = [];
    const normalizedTarget = sourcePath.replace(/\.\w+$/, "");

    for (const [filePath, entry] of this.files) {
      for (const imp of entry.metadata.imports) {
        const normalizedSource = imp.source.replace(/\.\w+$/, "");
        if (normalizedSource.endsWith(normalizedTarget) || imp.source === sourcePath) {
          results.push({
            file: filePath,
            specifiers: imp.specifiers.map(s => s.local),
          });
        }
      }
    }

    return results;
  }

  /**
   * Find all components across the store.
   */
  findAllComponents(): (ComponentInfo & { file: string })[] {
    const results: (ComponentInfo & { file: string })[] = [];
    for (const [file, entry] of this.files) {
      for (const comp of entry.metadata.components) {
        results.push({ ...comp, file });
      }
    }
    return results;
  }

  /**
   * Find all exports across the store.
   */
  findAllExports(): (ExportInfo & { file: string })[] {
    const results: (ExportInfo & { file: string })[] = [];
    for (const [file, entry] of this.files) {
      for (const exp of entry.metadata.exports) {
        results.push({ ...exp, file });
      }
    }
    return results;
  }

  /**
   * Get a compact summary of the workspace (for context windows).
   */
  getSummary(): string {
    const lines: string[] = [];
    for (const [path, entry] of this.files) {
      const exps = entry.metadata.exports.map(e => e.name).join(", ");
      const comps = entry.metadata.components.map(c => c.name).join(", ");
      const deps = entry.metadata.imports.map(i => i.source).join(", ");
      lines.push(`${path}: exports=[${exps}] components=[${comps}] deps=[${deps}]`);
    }
    return lines.join("\n");
  }

  // ── Events ──

  on(listener: ASTStoreListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: ASTStoreEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[ASTStore] Listener error:", e);
      }
    }
  }

  // ── Clear ──

  clear(): void {
    this.files.clear();
  }

  // ── Internal Parsing ──

  private parseFile(path: string, source: string, hash: string): ASTFileEntry {
    const isTS = /\.tsx?$/.test(path);
    const hasJSX = /\.(jsx|tsx)$/.test(path);
    const parseErrors: ParseError[] = [];

    let ast: t.File;

    try {
      ast = parser.parse(source, {
        sourceType: "module",
        sourceFilename: path,
        plugins: getParserPlugins(path),
        errorRecovery: true, // Parse as much as possible even with errors
      });

      // Collect parse errors from error recovery
      if ((ast as any).errors?.length) {
        for (const err of (ast as any).errors) {
          parseErrors.push({
            message: err.message?.split("\n")[0] || "Parse error",
            line: err.loc?.line,
            column: err.loc?.column,
          });
        }
      }
    } catch (err: any) {
      // Fatal parse error — create empty AST
      parseErrors.push({
        message: err.message?.split("\n")[0] || "Fatal parse error",
        line: err.loc?.line,
        column: err.loc?.column,
      });

      ast = t.file(t.program([]));
    }

    // Extract metadata from AST
    let metadata: FileMetadata;
    try {
      metadata = extractMetadata(ast, source);
    } catch {
      metadata = { imports: [], exports: [], components: [], hooks: [], declarations: [] };
    }

    if (parseErrors.length > 0) {
      this.emit({ type: "parse_error", path, errors: parseErrors });
    }

    return {
      path,
      source,
      ast,
      hash,
      parsedAt: Date.now(),
      parseErrors,
      hasJSX,
      isTypeScript: isTS,
      metadata,
    };
  }
}
