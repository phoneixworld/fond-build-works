/**
 * Build Compiler v1.0 — Workspace Model
 * 
 * First-class codebase object. All file operations go through here.
 * Maintains a symbol index (exports/imports) for verification.
 */

import type { FileEntry, SymbolIndex, ImportRef } from "./types";

export class Workspace {
  private files: Map<string, string>;
  private _index: SymbolIndex;
  private _dirty: boolean = true;

  constructor(initial?: Record<string, string>) {
    this.files = new Map(Object.entries(initial || {}));
    this._index = { exports: {}, imports: {} };
    if (this.files.size > 0) this.rebuildIndex();
  }

  // ─── File Operations ──────────────────────────────────────────────

  addFile(path: string, content: string): void {
    const normalized = this.normalizePath(path);
    this.files.set(normalized, content);
    this._dirty = true;
  }

  updateFile(path: string, content: string): void {
    this.addFile(path, content);
  }

  deleteFile(path: string): void {
    this.files.delete(this.normalizePath(path));
    this._dirty = true;
  }

  getFile(path: string): string | undefined {
    return this.files.get(this.normalizePath(path));
  }

  hasFile(path: string): boolean {
    return this.files.has(this.normalizePath(path));
  }

  listFiles(): string[] {
    return [...this.files.keys()].sort();
  }

  fileCount(): number {
    return this.files.size;
  }

  /** Apply a batch of file changes from a task output */
  applyPatch(patch: Record<string, string>): string[] {
    const applied: string[] = [];
    for (const [path, content] of Object.entries(patch)) {
      this.addFile(path, content);
      applied.push(this.normalizePath(path));
    }
    return applied;
  }

  /** Export workspace as a plain object */
  toRecord(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, content] of this.files) {
      result[path] = content;
    }
    return result;
  }

  /** Total size in bytes */
  totalSize(): number {
    let size = 0;
    for (const content of this.files.values()) size += content.length;
    return size;
  }

  // ─── Symbol Index ─────────────────────────────────────────────────

  get index(): SymbolIndex {
    if (this._dirty) this.rebuildIndex();
    return this._index;
  }

  private rebuildIndex(): void {
    this._index = { exports: {}, imports: {} };

    for (const [path, content] of this.files) {
      this._index.exports[path] = extractExports(content);
      this._index.imports[path] = extractImports(content);
    }

    this._dirty = false;
  }

  // ─── Import Resolution ────────────────────────────────────────────

  /**
   * Resolve an import path from a source file to a workspace file.
   * Returns the resolved path or null if unresolvable.
   */
  resolveImport(fromFile: string, importPath: string): string | null {
    // Skip external packages
    if (!importPath.startsWith(".") && !importPath.startsWith("/") && !importPath.startsWith("@/")) {
      return importPath; // External — not our problem
    }

    // Normalize @/ prefix
    let resolved = importPath;
    if (resolved.startsWith("@/")) {
      resolved = "/" + resolved.slice(2);
    }

    // Resolve relative paths
    if (resolved.startsWith(".")) {
      const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
      const parts = [...fromDir.split("/"), ...resolved.split("/")].filter(Boolean);
      const stack: string[] = [];
      for (const part of parts) {
        if (part === "..") stack.pop();
        else if (part !== ".") stack.push(part);
      }
      resolved = "/" + stack.join("/");
    }

    // Try exact match, then with extensions
    const extensions = ["", ".jsx", ".tsx", ".js", ".ts", ".css"];
    for (const ext of extensions) {
      if (this.hasFile(resolved + ext)) return resolved + ext;
    }

    // Try /index variants
    for (const ext of [".jsx", ".tsx", ".js", ".ts"]) {
      if (this.hasFile(resolved + "/index" + ext)) return resolved + "/index" + ext;
    }

    return null;
  }

  /**
   * Find all unresolved imports across the workspace.
   */
  findUnresolvedImports(): { file: string; importPath: string; symbols: string[] }[] {
    const unresolved: { file: string; importPath: string; symbols: string[] }[] = [];
    const idx = this.index;

    for (const [file, imports] of Object.entries(idx.imports)) {
      for (const imp of imports) {
        // Skip external packages
        if (!imp.from.startsWith(".") && !imp.from.startsWith("/") && !imp.from.startsWith("@/")) continue;

        const resolved = this.resolveImport(file, imp.from);
        if (!resolved) {
          unresolved.push({ file, importPath: imp.from, symbols: imp.symbols });
        }
      }
    }

    return unresolved;
  }

  // ─── Path Utils ───────────────────────────────────────────────────

  private normalizePath(path: string): string {
    let p = path.replace(/\\/g, "/");
    if (!p.startsWith("/")) p = "/" + p;
    // Remove /src/ prefix for Sandpack compat
    p = p.replace(/^\/src\//, "/");
    return p;
  }
}

// ─── Static Analysis Helpers ──────────────────────────────────────────────

function extractExports(code: string): string[] {
  const exports: string[] = [];

  // export default
  if (/export\s+default\s/.test(code)) exports.push("default");

  // export const/function/class Name
  const namedExports = code.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g);
  for (const m of namedExports) exports.push(m[1]);

  // export { A, B, C }
  const braceExports = code.matchAll(/export\s*\{([^}]+)\}/g);
  for (const m of braceExports) {
    const names = m[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
    exports.push(...names);
  }

  return [...new Set(exports)];
}

function extractImports(code: string): ImportRef[] {
  const imports: ImportRef[] = [];

  // import X from 'path'  /  import { A, B } from 'path'  /  import 'path'
  const importRegex = /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const defaultImport = match[1];
    const namedImports = match[2];
    const from = match[3];

    const symbols: string[] = [];
    const isDefault = !!defaultImport;
    if (defaultImport) symbols.push(defaultImport);
    if (namedImports) {
      const names = namedImports.split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      symbols.push(...names);
    }

    imports.push({ from, symbols, isDefault });
  }

  return imports;
}
