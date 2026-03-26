import { describe, it, expect } from "vitest";
import {
  verifyWithAST,
  formatVerificationSummary,
  type ASTVerificationResult,
} from "@/lib/compiler/astVerifier";

// ─── Test Workspace: Clean ──────────────────────────────────────────────

const CLEAN_WORKSPACE: Record<string, string> = {
  "App.tsx": `
import React from "react";
import Dashboard from "./components/Dashboard";

const App = () => {
  return <Dashboard title="Hello" />;
};

export default App;
`,
  "components/Dashboard.tsx": `
import React, { useState } from "react";

const Dashboard = ({ title }: { title: string }) => {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
};

export default Dashboard;
`,
};

// ─── Test Workspace: Broken ─────────────────────────────────────────────

const BROKEN_WORKSPACE: Record<string, string> = {
  "App.tsx": `
import React from "react";
import Dashboard from "./components/Dashboard";
import MissingPage from "./pages/MissingPage";
import { nonExistent } from "./utils/helpers";

const App = () => {
  return (
    <div>
      <Dashboard />
      <MissingPage />
    </div>
  );
};

export default App;
`,
  "components/Dashboard.tsx": `
import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer } from "react";
import { Card } from "./ui/card";

const Dashboard = () => {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [c, setC] = useState(0);
  const [d, setD] = useState(0);
  const [e, setE] = useState(0);
  const [f, setF] = useState(0);
  return <div>{a}{b}{c}{d}{e}{f}</div>;
};

export default Dashboard;
`,
  "components/ui/card.tsx": `
import React from "react";
export const Card = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
`,
};

// ─── Test: Clean Workspace ───────────────────────────────────────────────

describe("verifyWithAST", () => {
  it("passes for a clean workspace", () => {
    const result = verifyWithAST(CLEAN_WORKSPACE);
    expect(result.ok).toBe(true);
    expect(result.score.overall).toBeGreaterThanOrEqual(70);
    expect(result.score.issueCounts.error).toBe(0);
  });

  it("returns quality score breakdown", () => {
    const result = verifyWithAST(CLEAN_WORKSPACE);
    expect(result.score.categories.importHealth).toBeGreaterThanOrEqual(0);
    expect(result.score.categories.exportConsistency).toBeGreaterThanOrEqual(0);
    expect(result.score.categories.componentQuality).toBeGreaterThanOrEqual(0);
    expect(result.score.categories.hookSafety).toBeGreaterThanOrEqual(0);
    expect(result.score.categories.dependencyHealth).toBeGreaterThanOrEqual(0);
    expect(result.score.filesAnalyzed).toBe(2);
  });

  it("detects broken imports in broken workspace", () => {
    const result = verifyWithAST(BROKEN_WORKSPACE);
    const importIssues = result.issues.filter(
      i => i.category === "import_export_mismatch" && i.severity === "error"
    );
    // MissingPage and nonExistent should be flagged
    expect(importIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("detects excessive useState", () => {
    const result = verifyWithAST(BROKEN_WORKSPACE);
    const rerenderIssues = result.issues.filter(i => i.category === "excessive_rerenders");
    expect(rerenderIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("produces lower score for broken workspace", () => {
    const clean = verifyWithAST(CLEAN_WORKSPACE);
    const broken = verifyWithAST(BROKEN_WORKSPACE);
    expect(broken.score.overall).toBeLessThan(clean.score.overall);
  });

  it("identifies hotspot files", () => {
    const result = verifyWithAST(BROKEN_WORKSPACE);
    expect(result.hotspots.length).toBeGreaterThan(0);
    // App.tsx should be a hotspot due to broken imports
    const appHotspot = result.hotspots.find(h => h.file === "App.tsx");
    expect(appHotspot).toBeDefined();
  });
});

// ─── Test: Unused Imports ────────────────────────────────────────────────

describe("unused import detection", () => {
  it("detects unused imports", () => {
    const workspace: Record<string, string> = {
      "App.tsx": `
import React from "react";
import { unusedThing } from "./utils";
const App = () => <div>Hello</div>;
export default App;
`,
      "utils.ts": `
export const unusedThing = "unused";
export const usedThing = "used";
`,
    };

    const result = verifyWithAST(workspace);
    const unused = result.issues.filter(i => i.category === "unused_import");
    expect(unused.length).toBeGreaterThan(0);
  });
});

// ─── Test: Circular Dependencies ─────────────────────────────────────────

describe("circular dependency detection", () => {
  it("detects circular imports", () => {
    const workspace: Record<string, string> = {
      "a.ts": `import { b } from "./b";\nexport const a = "a" + b;`,
      "b.ts": `import { a } from "./a";\nexport const b = "b" + a;`,
    };

    const result = verifyWithAST(workspace);
    const cycles = result.issues.filter(i => i.category === "circular_dependency");
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Test: Summary Formatter ─────────────────────────────────────────────

describe("formatVerificationSummary", () => {
  it("produces readable markdown summary", () => {
    const result = verifyWithAST(CLEAN_WORKSPACE);
    const summary = formatVerificationSummary(result);
    expect(summary).toContain("Build Quality Score");
    expect(summary).toContain("/100");
    expect(summary).toContain("Import Health");
  });
});

// ─── Test: Dead Code Detection ───────────────────────────────────────────

describe("dead code detection", () => {
  it("detects files with exports that nobody imports", () => {
    const workspace: Record<string, string> = {
      "App.tsx": `
import React from "react";
const App = () => <div>Hello</div>;
export default App;
`,
      "components/Orphan.tsx": `
import React from "react";
const Orphan = () => <div>Nobody imports me</div>;
export default Orphan;
`,
    };

    const result = verifyWithAST(workspace);
    const deadCode = result.issues.filter(i => i.category === "dead_code");
    expect(deadCode.length).toBeGreaterThanOrEqual(1);
    expect(deadCode.some(d => d.file.includes("Orphan"))).toBe(true);
  });
});
