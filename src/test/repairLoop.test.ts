/**
 * Build Repair Loop Tests
 * 
 * Verifies error classification, deterministic fixes, and loop convergence.
 */

import { describe, it, expect } from "vitest";
import { ASTStore } from "../lib/ast/store";
import { BuildErrorClassifier } from "../lib/compiler/errorClassifier";
import { RepairExecutor } from "../lib/compiler/repairExecutor";

// ─── Error Classifier Tests ─────────────────────────────────────────────

describe("BuildErrorClassifier", () => {
  it("should detect parse errors", () => {
    const store = new ASTStore();
    store.setFile("src/broken.tsx", "const x = {;");

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    expect(errors.some(e => e.category === "parse_error")).toBe(true);
    expect(errors.find(e => e.category === "parse_error")?.severity).toBe("error");
  });

  it("should detect broken import paths", () => {
    const store = new ASTStore();
    store.setFile("src/App.tsx", `
      import React from "react";
      import Foo from "./components/NonExistent";
      export default function App() { return <div />; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    expect(errors.some(e => e.category === "broken_import_path")).toBe(true);
  });

  it("should detect missing named exports", () => {
    const store = new ASTStore();
    store.setFile("src/utils.ts", `export function add(a, b) { return a + b; }`);
    store.setFile("src/App.tsx", `
      import React from "react";
      import { multiply } from "./utils";
      export default function App() { return <div>{multiply(2,3)}</div>; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    const missingExport = errors.find(e => e.category === "missing_export");
    expect(missingExport).toBeDefined();
    expect(missingExport?.context.symbol).toBe("multiply");
    expect(missingExport?.context.availableExports).toContain("add");
  });

  it("should detect alias imports", () => {
    const store = new ASTStore();
    store.setFile("src/App.tsx", `
      import React from "react";
      import { cn } from "@/lib/utils";
      export default function App() { return <div className={cn("p-4")} />; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    expect(errors.some(e => e.category === "alias_import")).toBe(true);
  });

  it("should detect missing default export", () => {
    const store = new ASTStore();
    store.setFile("src/Header.tsx", `
      import React from "react";
      export function Header() { return <h1>Header</h1>; }
    `);
    store.setFile("src/App.tsx", `
      import React from "react";
      import Header from "./Header";
      export default function App() { return <Header />; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    expect(errors.some(e => e.category === "default_import_missing")).toBe(true);
  });

  it("should detect missing JSX React import", () => {
    const store = new ASTStore();
    store.setFile("src/Card.tsx", `
      export default function Card() { return <div>Card</div>; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    expect(errors.some(e => e.category === "missing_jsx_import")).toBe(true);
  });

  it("should sort errors by severity and confidence", () => {
    const store = new ASTStore();
    store.setFile("src/broken.tsx", "const x = {;");
    store.setFile("src/App.tsx", `
      import React from "react";
      import Foo from "./missing";
      export default function App() { return <Foo />; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    // Errors should come before warnings
    const firstWarningIdx = errors.findIndex(e => e.severity === "warning");
    if (firstWarningIdx !== -1) {
      const lastErrorIdx = errors.reduce((max, e, i) => e.severity === "error" ? i : max, -1);
      expect(lastErrorIdx).toBeLessThan(firstWarningIdx);
    }
  });

  it("should return empty for clean workspace", () => {
    const store = new ASTStore();
    store.setFile("src/App.tsx", `
      import React from "react";
      export default function App() { return <div>Hello</div>; }
    `);

    const classifier = new BuildErrorClassifier(store);
    const errors = classifier.classify();

    const realErrors = errors.filter(e => e.severity === "error");
    expect(realErrors.length).toBe(0);
  });
});

// ─── Repair Executor Tests ──────────────────────────────────────────────

describe("RepairExecutor", () => {
  it("should fix alias imports", async () => {
    const store = new ASTStore();
    store.setFile("src/lib/utils.ts", `export function cn(...args) { return args.join(" "); }`);
    store.setFile("src/App.tsx", `
      import React from "react";
      import { cn } from "@/lib/utils";
      export default function App() { return <div className={cn("p-4")} />; }
    `);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    // Should have fixed the alias
    const source = store.getSource("src/App.tsx");
    expect(source).not.toContain("@/");
  });

  it("should add missing React import", async () => {
    const store = new ASTStore();
    store.setFile("src/Card.tsx", `
      export default function Card() { return <div>Card</div>; }
    `);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    const source = store.getSource("src/Card.tsx");
    expect(source).toContain("React");
  });

  it("should fix missing export by adding export statement", async () => {
    const store = new ASTStore();
    store.setFile("src/utils.ts", `
      function cn(...args) { return args.join(" "); }
      export function add(a, b) { return a + b; }
    `);
    store.setFile("src/App.tsx", `
      import React from "react";
      import { cn } from "./utils";
      export default function App() { return <div className={cn("p-4")} />; }
    `);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    // cn should now be exported
    const source = store.getSource("src/utils.ts");
    expect(source).toContain("export");
    // The exported symbol 'cn' should be accessible
    const meta = store.getMetadata("src/utils.ts");
    const hasCnExport = meta?.exports.some(e => e.name === "cn" || e.localName === "cn");
    expect(hasCnExport).toBe(true);
  });

  it("should create stub for broken import path", async () => {
    const store = new ASTStore();
    store.setFile("src/App.tsx", `
      import React from "react";
      import Header from "./components/Header";
      export default function App() { return <Header />; }
    `);

    const executor = new RepairExecutor(store);
    await executor.runRepairLoop({ allowAI: false });

    // Should have created a stub
    expect(store.hasFile("src/components/Header.tsx")).toBe(true);
  });

  it("should converge on clean workspace", async () => {
    const store = new ASTStore();
    store.setFile("src/App.tsx", `
      import React from "react";
      export default function App() { return <div>Hello World</div>; }
    `);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    expect(result.converged).toBe(true);
    expect(result.totalRounds).toBeLessThanOrEqual(1);
  });

  it("should respect maxRounds config", async () => {
    const store = new ASTStore();
    store.setFile("src/broken.tsx", "const x = {;"); // Unfixable deterministically

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ maxRounds: 2, allowAI: false });

    expect(result.totalRounds).toBeLessThanOrEqual(2);
  });

  it("should generate summary", async () => {
    const store = new ASTStore();
    store.setFile("src/App.tsx", `
      import React from "react";
      export default function App() { return <div>Hello</div>; }
    `);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    expect(result.summary).toContain("✅");
  });

  it("should handle multiple errors in one round", async () => {
    const store = new ASTStore();
    store.setFile("src/Card.tsx", `export default function Card() { return <div>Card</div>; }`);
    store.setFile("src/Button.tsx", `export default function Button() { return <button>Click</button>; }`);
    store.setFile("src/App.tsx", `
      import React from "react";
      import Card from "./Card";
      import Button from "./Button";
      export default function App() { return <div><Card /><Button /></div>; }
    `);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    // Both Card and Button should have React imported
    expect(store.getSource("src/Card.tsx")).toContain("React");
    expect(store.getSource("src/Button.tsx")).toContain("React");
  });
});

// ─── Integration: Classify → Repair → Verify ───────────────────────────

describe("Repair Loop Integration", () => {
  it("should fix a multi-error workspace end-to-end", async () => {
    const store = new ASTStore();

    // File with alias import, missing React, broken path
    store.setFile("src/App.tsx", `
      import Header from "./components/Header";
      import { cn } from "@/lib/utils";
      export default function App() { return <div className={cn("p-4")}><Header /></div>; }
    `);
    store.setFile("src/lib/utils.ts", `export function cn(...args) { return args.join(" "); }`);

    const executor = new RepairExecutor(store);
    const result = await executor.runRepairLoop({ allowAI: false });

    // Should have:
    // 1. Fixed alias import
    // 2. Added React import
    // 3. Created Header stub
    const appSource = store.getSource("src/App.tsx");
    expect(appSource).toContain("React");
    expect(appSource).not.toContain("@/");
    expect(store.hasFile("src/components/Header.tsx")).toBe(true);

    expect(result.totalRepairs).toBeGreaterThanOrEqual(3);
  });
});
