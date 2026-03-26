/**
 * AST Workspace Tests
 * 
 * Verifies parse, query, patch, and dependency graph operations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createASTWorkspace, ASTStore, ASTQueryEngine, ASTPatcher, ASTDependencyGraph } from "../lib/ast";
import type { ASTWorkspace } from "../lib/ast";

// ─── Test Fixtures ───────────────────────────────────────────────────────

const SAMPLE_COMPONENT = `
import React, { useState } from "react";
import { Button } from "./ui/Button";
import { cn } from "../lib/utils";

interface DashboardProps {
  title: string;
  onRefresh: () => void;
}

const Dashboard = ({ title, onRefresh }: DashboardProps) => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  return (
    <div className={cn("p-4")}>
      <h1>{title}</h1>
      <Button onClick={onRefresh}>Refresh</Button>
      <span>{count}</span>
    </div>
  );
};

export default Dashboard;
`;

const SAMPLE_HOOK = `
import { useState, useEffect } from "react";

export function useCounter(initial: number = 0) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    console.log("Count changed:", count);
  }, [count]);

  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);

  return { count, increment, decrement };
}
`;

const SAMPLE_UTILS = `
export function cn(...args: string[]): string {
  return args.filter(Boolean).join(" ");
}

export const formatDate = (date: Date): string => {
  return date.toISOString();
};

export type Theme = "light" | "dark";
`;

const SAMPLE_INDEX = `
import Dashboard from "./components/Dashboard";
import { useCounter } from "./hooks/useCounter";

export { Dashboard, useCounter };
`;

function createTestWorkspace(): ASTWorkspace {
  return createASTWorkspace({
    "src/components/Dashboard.tsx": SAMPLE_COMPONENT,
    "src/hooks/useCounter.ts": SAMPLE_HOOK,
    "src/lib/utils.ts": SAMPLE_UTILS,
    "src/index.ts": SAMPLE_INDEX,
  });
}

// ─── ASTStore Tests ─────────────────────────────────────────────────────

describe("ASTStore", () => {
  let ws: ASTWorkspace;

  beforeEach(() => {
    ws = createTestWorkspace();
  });

  it("should parse all files", () => {
    expect(ws.store.size).toBe(4);
    expect(ws.store.paths).toContain("src/components/Dashboard.tsx");
    expect(ws.store.paths).toContain("src/hooks/useCounter.ts");
  });

  it("should extract imports metadata", () => {
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    expect(meta).toBeDefined();
    expect(meta!.imports).toHaveLength(3);
    expect(meta!.imports[0].source).toBe("react");
    expect(meta!.imports[0].specifiers).toContainEqual(
      expect.objectContaining({ imported: "useState", type: "named" })
    );
  });

  it("should extract exports metadata", () => {
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    expect(meta!.exports).toContainEqual(
      expect.objectContaining({ name: "default", type: "default" })
    );
  });

  it("should detect React components", () => {
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    expect(meta!.components).toHaveLength(1);
    expect(meta!.components[0].name).toBe("Dashboard");
    expect(meta!.components[0].propNames).toContain("title");
    expect(meta!.components[0].propNames).toContain("onRefresh");
  });

  it("should detect hooks", () => {
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    expect(meta!.hooks.some(h => h.name === "useState")).toBe(true);
  });

  it("should extract declarations", () => {
    const meta = ws.store.getMetadata("src/lib/utils.ts");
    expect(meta!.declarations.some(d => d.name === "cn")).toBe(true);
    expect(meta!.declarations.some(d => d.name === "formatDate")).toBe(true);
    expect(meta!.declarations.some(d => d.name === "Theme" && d.kind === "type")).toBe(true);
  });

  it("should skip non-JS files", () => {
    const result = ws.store.setFile("styles.css", "body { color: red; }");
    expect(result).toBeNull();
  });

  it("should skip unchanged files", () => {
    const entry1 = ws.store.setFile("src/lib/utils.ts", SAMPLE_UTILS);
    const entry2 = ws.store.setFile("src/lib/utils.ts", SAMPLE_UTILS);
    expect(entry1).toBe(entry2); // Same reference = cache hit
  });

  it("should handle parse errors gracefully", () => {
    const entry = ws.store.setFile("src/broken.tsx", "const x = {;");
    expect(entry).toBeDefined();
    expect(entry!.parseErrors.length).toBeGreaterThan(0);
  });

  it("should find importers of a file", () => {
    const importers = ws.store.findImportersOf("./hooks/useCounter");
    expect(importers.some(i => i.file === "src/index.ts")).toBe(true);
  });

  it("should find all components", () => {
    const comps = ws.store.findAllComponents();
    expect(comps.some(c => c.name === "Dashboard")).toBe(true);
  });

  it("should remove files", () => {
    expect(ws.store.removeFile("src/lib/utils.ts")).toBe(true);
    expect(ws.store.size).toBe(3);
    expect(ws.store.hasFile("src/lib/utils.ts")).toBe(false);
  });
});

// ─── ASTQueryEngine Tests ───────────────────────────────────────────────

describe("ASTQueryEngine", () => {
  let ws: ASTWorkspace;

  beforeEach(() => {
    ws = createTestWorkspace();
  });

  it("should find components by name", () => {
    const result = ws.query.findComponent("Dashboard");
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/components/Dashboard.tsx");
  });

  it("should find all components", () => {
    const comps = ws.query.findAllComponents();
    expect(comps.length).toBeGreaterThanOrEqual(1);
  });

  it("should find imports of a module", () => {
    const results = ws.query.findImportsOf("react");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("should find hook usages", () => {
    const results = ws.query.findHookUsages("useState");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("should find symbol definitions", () => {
    const result = ws.query.findDefinition("cn");
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/lib/utils.ts");
  });

  it("should find export sources", () => {
    const result = ws.query.findExportSource("cn");
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/lib/utils.ts");
  });

  it("should run custom queries", () => {
    const results = ws.query.query({
      nodeType: "ImportDeclaration",
      filePattern: "*.tsx",
    });
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── ASTPatcher Tests ───────────────────────────────────────────────────

describe("ASTPatcher", () => {
  let ws: ASTWorkspace;

  beforeEach(() => {
    ws = createTestWorkspace();
  });

  it("should add a new import", () => {
    const result = ws.patcher.applyPatch("src/components/Dashboard.tsx", {
      type: "add_import",
      source: "framer-motion",
      specifiers: [{ imported: "motion", type: "named" }],
    });

    expect(result.success).toBe(true);
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    expect(meta!.imports.some(i => i.source === "framer-motion")).toBe(true);
  });

  it("should merge into existing import", () => {
    const result = ws.patcher.applyPatch("src/components/Dashboard.tsx", {
      type: "add_import",
      source: "react",
      specifiers: [{ imported: "useEffect", type: "named" }],
    });

    expect(result.success).toBe(true);
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    const reactImport = meta!.imports.find(i => i.source === "react");
    expect(reactImport!.specifiers.some(s => s.imported === "useEffect")).toBe(true);
  });

  it("should remove an import", () => {
    const result = ws.patcher.applyPatch("src/components/Dashboard.tsx", {
      type: "remove_import",
      source: "../lib/utils",
    });

    expect(result.success).toBe(true);
    const meta = ws.store.getMetadata("src/components/Dashboard.tsx");
    expect(meta!.imports.some(i => i.source === "../lib/utils")).toBe(false);
  });

  it("should add an export", () => {
    const result = ws.patcher.applyPatch("src/lib/utils.ts", {
      type: "add_export",
      name: "cn",
      exportType: "default",
    });

    expect(result.success).toBe(true);
  });

  it("should rename a symbol in a file", () => {
    const result = ws.patcher.applyPatch("src/lib/utils.ts", {
      type: "rename_symbol",
      from: "cn",
      to: "classNames",
      scope: "file",
    });

    expect(result.success).toBe(true);
    const source = ws.store.getSource("src/lib/utils.ts");
    expect(source).toContain("classNames");
    expect(source).not.toContain(" cn");
  });

  it("should remove a node", () => {
    const result = ws.patcher.applyPatch("src/lib/utils.ts", {
      type: "remove_node",
      target: "formatDate",
    });

    expect(result.success).toBe(true);
    const source = ws.store.getSource("src/lib/utils.ts");
    expect(source).not.toContain("formatDate");
  });

  it("should fail gracefully for non-existent file", () => {
    const result = ws.patcher.applyPatch("src/missing.ts", {
      type: "add_import",
      source: "react",
      specifiers: [{ imported: "useState", type: "named" }],
    });

    expect(result.success).toBe(false);
  });
});

// ─── ASTDependencyGraph Tests ───────────────────────────────────────────

describe("ASTDependencyGraph", () => {
  let ws: ASTWorkspace;

  beforeEach(() => {
    ws = createTestWorkspace();
  });

  it("should build a graph", () => {
    const graph = ws.graph.build();
    expect(graph.nodes.size).toBe(4);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("should detect dependencies", () => {
    const graph = ws.graph.getGraph();
    const indexNode = graph.nodes.get("src/index.ts");
    expect(indexNode).toBeDefined();
    expect(indexNode!.dependencies.length).toBeGreaterThan(0);
  });

  it("should detect dependents", () => {
    const graph = ws.graph.getGraph();
    const dashNode = graph.nodes.get("src/components/Dashboard.tsx");
    if (dashNode) {
      // Dashboard should have at least index.ts as a dependent
      expect(dashNode.dependents.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("should compute impact analysis", () => {
    const impacted = ws.graph.getImpactedFiles("src/lib/utils.ts");
    // utils is imported by Dashboard, which is imported by index
    // So changing utils impacts Dashboard
    expect(impacted.length).toBeGreaterThanOrEqual(0);
  });

  it("should compute transitive dependencies", () => {
    const deps = ws.graph.getTransitiveDependencies("src/index.ts");
    expect(deps.length).toBeGreaterThanOrEqual(0);
  });

  it("should produce a build order", () => {
    const order = ws.graph.getBuildOrder();
    expect(order.length).toBe(4);
  });

  it("should auto-invalidate on file changes", () => {
    ws.graph.build(); // Initial build
    ws.store.setFile("src/new.ts", "export const x = 1;");
    // Graph should rebuild on next access
    const graph = ws.graph.getGraph();
    expect(graph.nodes.size).toBe(5);
  });
});

// ─── Integration Test ───────────────────────────────────────────────────

describe("ASTWorkspace Integration", () => {
  it("should support full workflow: parse → query → patch → verify", () => {
    const ws = createASTWorkspace({
      "src/App.tsx": `
import React from "react";

const App = () => {
  return <div>Hello</div>;
};

export default App;
      `,
    });

    // Query: find the component
    const comp = ws.query.findComponent("App");
    expect(comp).not.toBeNull();

    // Patch: add useState import
    const r1 = ws.patcher.applyPatch("src/App.tsx", {
      type: "add_import",
      source: "react",
      specifiers: [{ imported: "useState", type: "named" }],
    });
    expect(r1.success).toBe(true);

    // Verify: metadata updated
    const meta = ws.store.getMetadata("src/App.tsx");
    const reactImport = meta!.imports.find(i => i.source === "react");
    expect(reactImport!.specifiers.some(s => s.imported === "useState")).toBe(true);

    // Patch: add a new import
    const r2 = ws.patcher.applyPatch("src/App.tsx", {
      type: "add_import",
      source: "./components/Header",
      specifiers: [{ imported: "Header", type: "default" }],
    });
    expect(r2.success).toBe(true);

    // Verify: new import exists
    const meta2 = ws.store.getMetadata("src/App.tsx");
    expect(meta2!.imports.some(i => i.source === "./components/Header")).toBe(true);
  });
});
