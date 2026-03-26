/**
 * AST Dependency Graph
 * 
 * Builds and maintains a file-level dependency graph from
 * AST import/export analysis. Supports:
 * - Topological sorting
 * - Cycle detection
 * - Impact analysis (what breaks if X changes)
 * - Unused file detection
 */

import type { ASTStore } from "./store";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";

// ─── Import Resolution ──────────────────────────────────────────────────

const JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function resolveImportPath(
  fromFile: string,
  importSource: string,
  allFiles: string[]
): string | null {
  // Skip external packages
  if (!importSource.startsWith(".") && !importSource.startsWith("/")) {
    return null;
  }

  // Resolve relative path
  const fromDir = fromFile.split("/").slice(0, -1).join("/");
  const segments = [...fromDir.split("/"), ...importSource.split("/")];
  const resolved: string[] = [];

  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") { resolved.pop(); continue; }
    if (seg) resolved.push(seg);
  }

  const basePath = resolved.join("/");

  // Try exact match first
  if (allFiles.includes(basePath)) return basePath;

  // Try adding extensions
  for (const ext of JS_EXTENSIONS) {
    if (allFiles.includes(basePath + ext)) return basePath + ext;
  }

  // Try index files
  for (const ext of JS_EXTENSIONS) {
    if (allFiles.includes(basePath + "/index" + ext)) return basePath + "/index" + ext;
  }

  return null;
}

// ─── Graph Builder ──────────────────────────────────────────────────────

export class ASTDependencyGraph {
  private graph: DependencyGraph | null = null;
  private store: ASTStore;

  constructor(store: ASTStore) {
    this.store = store;
  }

  /**
   * Build (or rebuild) the full dependency graph from the AST store.
   */
  build(): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const edges: DependencyEdge[] = [];
    const allFiles = this.store.paths;

    // Initialize nodes
    for (const path of allFiles) {
      nodes.set(path, {
        path,
        dependencies: [],
        dependents: [],
        order: 0,
      });
    }

    // Build edges from import analysis
    for (const path of allFiles) {
      const meta = this.store.getMetadata(path);
      if (!meta) continue;

      for (const imp of meta.imports) {
        const resolved = resolveImportPath(path, imp.source, allFiles);
        if (!resolved) continue;

        const specifiers = imp.specifiers.map(s => s.local);
        edges.push({
          from: path,
          to: resolved,
          specifiers,
          isTypeOnly: imp.isTypeOnly,
        });

        // Update adjacency
        const fromNode = nodes.get(path);
        const toNode = nodes.get(resolved);
        if (fromNode && !fromNode.dependencies.includes(resolved)) {
          fromNode.dependencies.push(resolved);
        }
        if (toNode && !toNode.dependents.includes(path)) {
          toNode.dependents.push(path);
        }
      }
    }

    // Find roots (no dependents) and leaves (no dependencies)
    const roots: string[] = [];
    const leaves: string[] = [];
    for (const [path, node] of nodes) {
      if (node.dependents.length === 0) roots.push(path);
      if (node.dependencies.length === 0) leaves.push(path);
    }

    // Topological sort (Kahn's algorithm)
    const order = this.topologicalSort(nodes);
    for (let i = 0; i < order.length; i++) {
      const node = nodes.get(order[i]);
      if (node) node.order = i;
    }

    // Cycle detection
    const cycles = this.detectCycles(nodes);

    this.graph = { nodes, edges, roots, leaves, cycles };
    return this.graph;
  }

  /**
   * Get the current graph (builds if not yet built).
   */
  getGraph(): DependencyGraph {
    if (!this.graph) return this.build();
    return this.graph;
  }

  /**
   * Get all files that would be affected if a file changes.
   * Follows the dependent chain transitively.
   */
  getImpactedFiles(filePath: string): string[] {
    const graph = this.getGraph();
    const impacted = new Set<string>();
    const queue = [filePath];

    while (queue.length > 0) {
      const current = queue.pop()!;
      const node = graph.nodes.get(current);
      if (!node) continue;

      for (const dep of node.dependents) {
        if (!impacted.has(dep)) {
          impacted.add(dep);
          queue.push(dep);
        }
      }
    }

    return Array.from(impacted);
  }

  /**
   * Get all files that a file depends on (transitively).
   */
  getTransitiveDependencies(filePath: string): string[] {
    const graph = this.getGraph();
    const deps = new Set<string>();
    const queue = [filePath];

    while (queue.length > 0) {
      const current = queue.pop()!;
      const node = graph.nodes.get(current);
      if (!node) continue;

      for (const dep of node.dependencies) {
        if (!deps.has(dep)) {
          deps.add(dep);
          queue.push(dep);
        }
      }
    }

    return Array.from(deps);
  }

  /**
   * Find files with no dependents and no exports (potentially unused).
   */
  findUnusedFiles(entryPoints: string[] = []): string[] {
    const graph = this.getGraph();
    const reachable = new Set<string>(entryPoints);
    const queue = [...entryPoints];

    // BFS from entry points
    while (queue.length > 0) {
      const current = queue.pop()!;
      const node = graph.nodes.get(current);
      if (!node) continue;

      for (const dep of node.dependencies) {
        if (!reachable.has(dep)) {
          reachable.add(dep);
          queue.push(dep);
        }
      }
    }

    // If no entry points specified, just return files with no dependents
    if (entryPoints.length === 0) {
      return Array.from(graph.nodes.values())
        .filter(n => n.dependents.length === 0 && n.dependencies.length > 0)
        .map(n => n.path);
    }

    return this.store.paths.filter(p => !reachable.has(p));
  }

  /**
   * Get the optimal build order (topologically sorted).
   */
  getBuildOrder(): string[] {
    const graph = this.getGraph();
    return this.topologicalSort(graph.nodes);
  }

  /**
   * Check which specific symbols from a file are actually used.
   */
  getUsedExports(filePath: string): { symbol: string; usedBy: string[] }[] {
    const graph = this.getGraph();
    const meta = this.store.getMetadata(filePath);
    if (!meta) return [];

    const exportNames = meta.exports.map(e => e.name === "default" ? e.localName : e.name);
    const results: { symbol: string; usedBy: string[] }[] = [];

    for (const exportName of exportNames) {
      const usedBy: string[] = [];

      for (const edge of graph.edges) {
        if (edge.to === filePath && edge.specifiers.includes(exportName)) {
          usedBy.push(edge.from);
        }
      }

      results.push({ symbol: exportName, usedBy });
    }

    return results;
  }

  /**
   * Invalidate the graph (force rebuild on next access).
   */
  invalidate(): void {
    this.graph = null;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private topologicalSort(nodes: Map<string, DependencyNode>): string[] {
    const inDegree = new Map<string, number>();
    for (const [path, node] of nodes) {
      inDegree.set(path, node.dependencies.length);
    }

    const queue: string[] = [];
    for (const [path, deg] of inDegree) {
      if (deg === 0) queue.push(path);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const node = nodes.get(current);
      if (!node) continue;

      for (const dep of node.dependents) {
        const newDeg = (inDegree.get(dep) || 0) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }

    return sorted;
  }

  private detectCycles(nodes: Map<string, DependencyNode>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (path: string, currentPath: string[]) => {
      if (stack.has(path)) {
        // Found a cycle
        const cycleStart = currentPath.indexOf(path);
        if (cycleStart !== -1) {
          cycles.push(currentPath.slice(cycleStart));
        }
        return;
      }
      if (visited.has(path)) return;

      visited.add(path);
      stack.add(path);
      currentPath.push(path);

      const node = nodes.get(path);
      if (node) {
        for (const dep of node.dependencies) {
          dfs(dep, [...currentPath]);
        }
      }

      stack.delete(path);
    };

    for (const path of nodes.keys()) {
      if (!visited.has(path)) {
        dfs(path, []);
      }
    }

    return cycles;
  }
}
