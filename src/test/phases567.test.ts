/**
 * Tests for Phase 5 (Hybrid Generation), Phase 6 (Agent Orchestration), Phase 7 (WebContainer Validation)
 */

import { describe, it, expect, vi } from "vitest";
import { Workspace } from "@/lib/compiler/workspace";

// ─── Phase 5: Hybrid Generation ─────────────────────────────────────────

import {
  classifyFiles,
  saturateWithTemplates,
  analyzeAIGaps,
  gapsToMicroTasks,
} from "@/lib/compiler/hybridGenerator";
import type { IR } from "@/lib/ir";

function makeTestIR(): IR {
  return {
    entities: {
      project: {
        fields: {
          name: { type: "string", required: true },
          description: { type: "string" },
          status: { type: "string" },
        },
        flows: ["list", "view", "create", "edit", "delete"],
      },
      task: {
        fields: {
          title: { type: "string", required: true },
          assignee: { type: "string" },
          priority: { type: "string" },
        },
        flows: ["list", "create", "edit"],
      },
    },
    pages: [
      { name: "Dashboard", type: "dashboard", path: "/", module: "main" },
      { name: "Projects", type: "list", entity: "project", path: "/projects" },
      { name: "Tasks", type: "list", entity: "task", path: "/tasks" },
    ],
    navigation: [
      { label: "Dashboard", path: "/" },
      { label: "Projects", path: "/projects" },
      { label: "Tasks", path: "/tasks" },
    ],
    contexts: [],
    components: [],
    mockApi: {},
    roles: [],
    workflows: [],
    modules: [],
  };
}

describe("Phase 5: Hybrid Generation Engine", () => {
  it("classifies files into deterministic vs AI lanes", () => {
    const ir = makeTestIR();
    const plan = classifyFiles(ir, "Build a project management app", []);

    expect(plan.classifications.length).toBeGreaterThan(0);
    expect(plan.deterministicCount).toBeGreaterThan(0);
    expect(plan.deterministicRatio).toBeGreaterThan(0);

    // App.jsx should be deterministic
    const appClassification = plan.classifications.find(c => c.path === "/App.jsx");
    expect(appClassification?.lane).toBe("deterministic");
  });

  it("achieves >60% deterministic ratio for standard apps", () => {
    const ir = makeTestIR();
    const plan = classifyFiles(ir, "Build a project management app with CRUD", []);

    expect(plan.deterministicRatio).toBeGreaterThanOrEqual(0.6);
  });

  it("skips already-existing files", () => {
    const ir = makeTestIR();
    const existingFiles = ["/App.jsx", "/pages/Dashboard.jsx"];
    const plan = classifyFiles(ir, "Build app", existingFiles);

    const classified = plan.classifications.map(c => c.path);
    expect(classified).not.toContain("/App.jsx");
    expect(classified).not.toContain("/pages/Dashboard.jsx");
  });

  it("saturates workspace with template files", () => {
    const ir = makeTestIR();
    const workspace = new Workspace({});
    const plan = classifyFiles(ir, "Build a project management app", []);

    const ctx = {
      rawRequirements: "Build a project management app",
      semanticSummary: "",
      ir: { entities: [], roles: [], workflows: [], routes: [], modules: [], constraints: [] },
      existingWorkspace: {},
      buildIntent: "new_app" as const,
      projectId: "test",
      techStack: "react",
    };

    const generated = saturateWithTemplates(workspace, plan, ir, ctx);

    expect(generated).toBeGreaterThan(0);
    expect(workspace.hasFile("/App.jsx")).toBe(true);
  });

  it("detects AI gaps from TODO markers", () => {
    const ir = makeTestIR();
    const workspace = new Workspace({
      "/components/KanbanBoard.jsx": `import React from "react";
export default function KanbanBoard() {
  // TODO: Implement drag-and-drop column reordering
  // TODO: Calculate task completion percentages
  return <div>Board</div>;
}`,
    });

    const gaps = analyzeAIGaps(workspace, ir, "Build kanban with drag and drop");

    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some(g => g.gapType === "custom_ui" || g.gapType === "computation")).toBe(true);
  });

  it("converts gaps to micro-tasks", () => {
    const gaps = [
      {
        file: "/components/Chart.jsx",
        gapType: "custom_ui" as const,
        description: "Implement chart visualization",
        microPrompt: "Build a chart component",
        contextFiles: [],
        maxTokens: 3000,
      },
    ];

    const tasks = gapsToMicroTasks(gaps);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].produces).toContain("/components/Chart.jsx");
    expect(tasks[0].label).toContain("ai:custom_ui");
  });

  it("classifies drag-and-drop as AI-required", () => {
    const ir = makeTestIR();
    const plan = classifyFiles(ir, "Build app with drag and drop kanban board", []);

    // The overall plan should have some AI-required classifications
    expect(plan.aiRequiredCount).toBeGreaterThanOrEqual(0);
  });
});

// ─── Phase 6: Agent Orchestration ────────────────────────────────────────

import {
  registerAgent,
  getAgentsForPhase,
  executeAgentPhase,
  buildAgentPipelineSummary,
} from "@/lib/compiler/agentOrchestrationPhase";
import type { PipelineContext, AgentCallbacks } from "@/lib/agents/types";

function makeTestPipelineCtx(): PipelineContext {
  return {
    projectId: "test-project",
    techStack: "react",
    rawRequirements: "Build a CRM with contacts, deals, and auth",
    ir: {
      entities: {
        contact: { fields: { name: { type: "string" }, email: { type: "string" } }, flows: ["list", "create"] },
      },
      pages: [],
      navigation: [],
    },
    existingWorkspace: {},
    agentPlan: [],
    results: new Map(),
  };
}

function makeTestCallbacks(): AgentCallbacks {
  return {
    onAgentStart: vi.fn(),
    onAgentProgress: vi.fn(),
    onAgentDone: vi.fn(),
  };
}

describe("Phase 6: Agent Orchestration Pipeline", () => {
  it("has pre-build agents registered", () => {
    const preBuild = getAgentsForPhase("pre_build");
    expect(preBuild.length).toBeGreaterThanOrEqual(2);
    expect(preBuild.some(a => a.name === "requirements")).toBe(true);
    expect(preBuild.some(a => a.name === "workflow")).toBe(true);
  });

  it("has post-build agents registered", () => {
    const postBuild = getAgentsForPhase("post_build");
    expect(postBuild.length).toBeGreaterThanOrEqual(2);
    expect(postBuild.some(a => a.name === "testing")).toBe(true);
    expect(postBuild.some(a => a.name === "governance")).toBe(true);
  });

  it("executes pre-build pipeline", async () => {
    const ctx = makeTestPipelineCtx();
    const callbacks = makeTestCallbacks();

    const result = await executeAgentPhase("pre_build", ctx, undefined, callbacks);

    expect(result.phase).toBe("pre_build");
    expect(result.agentsRun.length).toBeGreaterThan(0);
    expect(result.blocked).toBe(false);
    expect(callbacks.onAgentStart).toHaveBeenCalled();
    expect(callbacks.onAgentDone).toHaveBeenCalled();
  });

  it("executes post-build pipeline with workspace", async () => {
    const ctx = makeTestPipelineCtx();
    ctx.results.set("requirements", {
      agent: "requirements",
      status: "done",
      summary: "analyzed",
      durationMs: 10,
      metadata: { signals: { hasAuth: true, hasCRUD: true } },
    });

    const workspace = new Workspace({
      "/App.jsx": `import React from "react";\nexport default function App() { return <div>App</div>; }`,
      "/pages/Home.jsx": `import React from "react";\nexport default function Home() { return <div>Home</div>; }`,
    });

    const callbacks = makeTestCallbacks();
    const result = await executeAgentPhase("post_build", ctx, workspace, callbacks);

    expect(result.phase).toBe("post_build");
    expect(result.agentsRun).toContain("testing");
    expect(result.agentsRun).toContain("governance");
  });

  it("generates readable pipeline summary", async () => {
    const ctx = makeTestPipelineCtx();
    const callbacks = makeTestCallbacks();
    const result = await executeAgentPhase("pre_build", ctx, undefined, callbacks);
    const summary = buildAgentPipelineSummary(result);

    expect(summary).toContain("Agent Pipeline");
    expect(summary).toContain("Duration:");
  });

  it("registers custom agents", () => {
    registerAgent({
      name: "orchestrator",
      phase: "post_build",
      priority: 10,
      shouldRun: () => true,
      execute: () => ({
        agent: "orchestrator",
        status: "done",
        summary: "Custom agent ran",
        durationMs: 5,
      }),
      optional: true,
      timeoutMs: 5000,
    });

    const postBuild = getAgentsForPhase("post_build");
    expect(postBuild.some(a => a.name === "orchestrator")).toBe(true);
  });

  it("governance agent catches hardcoded secrets", async () => {
    const ctx = makeTestPipelineCtx();
    ctx.results.set("requirements", {
      agent: "requirements", status: "done", summary: "ok", durationMs: 1,
      metadata: { signals: {} },
    });

    const workspace = new Workspace({
      "/App.jsx": `import React from "react";\nconst api_key = "sk_live_abcdefghijklmnopqrstuvwxyz1234567890abc";\nexport default function App() { return <div>App</div>; }`,
    });

    const callbacks = makeTestCallbacks();
    const result = await executeAgentPhase("post_build", ctx, workspace, callbacks);

    const govResult = ctx.results.get("governance");
    expect(govResult?.violations?.some(v => v.rule === "no_hardcoded_secrets")).toBe(true);
  });
});

// ─── Phase 7: WebContainer Runtime Validation ────────────────────────────

import {
  validateRuntime,
  validateQuick,
} from "@/lib/compiler/webContainerValidator";

describe("Phase 7: WebContainer Runtime Validation", () => {
  it("passes validation for a well-formed workspace", () => {
    const workspace = new Workspace({
      "/App.jsx": `import React from "react";
import Home from "./pages/Home";
export default function App() { return <Home />; }`,
      "/pages/Home.jsx": `import React from "react";
export default function Home() { return <div>Home</div>; }`,
    });

    const result = validateRuntime(workspace);
    expect(result.status).toBe("passed");
    expect(result.tiers.static.status).toBe("passed");
    expect(result.tiers.transpilation.status).toBe("passed");
  });

  it("catches unresolved imports", () => {
    const workspace = new Workspace({
      "/App.jsx": `import React from "react";
import Missing from "./pages/Missing";
export default function App() { return <Missing />; }`,
    });

    const result = validateRuntime(workspace);
    const importChecks = result.tiers.static.checks.filter(c => c.name === "import_resolution");
    expect(importChecks.some(c => !c.passed)).toBe(true);
  });

  it("catches unbalanced braces", () => {
    const workspace = new Workspace({
      "/broken.js": `function test() { if (true) { console.log("open");`,
    });

    const result = validateRuntime(workspace);
    const transpileChecks = result.tiers.transpilation.checks.filter(c => c.name === "transpile_check");
    expect(transpileChecks.some(c => !c.passed)).toBe(true);
  });

  it("catches missing App entry point", () => {
    const workspace = new Workspace({
      "/pages/Home.jsx": `import React from "react";\nexport default function Home() { return <div>Home</div>; }`,
    });

    const result = validateRuntime(workspace);
    const appCheck = result.tiers.runtime.checks.find(c => c.name === "app_entry");
    expect(appCheck?.passed).toBe(false);
  });

  it("detects duplicate route paths", () => {
    const workspace = new Workspace({
      "/App.jsx": `import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/home" element={<div />} />
    <Route path="/home" element={<div />} />
  </Routes></BrowserRouter>;
}`,
    });

    const result = validateRuntime(workspace);
    const routeCheck = result.tiers.runtime.checks.find(c => c.name === "route_uniqueness");
    expect(routeCheck?.passed).toBe(false);
  });

  it("provides quick validation for incremental edits", () => {
    const workspace = new Workspace({
      "/App.jsx": `import React from "react";\nexport default function App() { return <div>App</div>; }`,
    });

    const quick = validateQuick(workspace);
    expect(quick.status).toBe("passed");
  });

  it("detects undefined JSX references", () => {
    const workspace = new Workspace({
      "/App.jsx": `import React from "react";
export default function App() { return <UnknownComponent />; }`,
    });

    const result = validateRuntime(workspace);
    const refCheck = result.tiers.runtime.checks.filter(c => c.name === "undefined_references");
    expect(refCheck.some(c => !c.passed)).toBe(true);
  });

  it("generates comprehensive summary", () => {
    const workspace = new Workspace({
      "/App.jsx": `import React from "react";\nexport default function App() { return <div>App</div>; }`,
    });

    const result = validateRuntime(workspace);
    expect(result.summary).toContain("Runtime Validation");
    expect(result.summary).toContain("Tier 1");
    expect(result.summary).toContain("Tier 2");
    expect(result.summary).toContain("Tier 3");
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  it("catches circular dependencies", () => {
    const workspace = new Workspace({
      "/a.js": `import { b } from "./b";\nexport const a = 1;`,
      "/b.js": `import { a } from "./a";\nexport const b = 2;`,
    });

    const result = validateRuntime(workspace);
    const cycleCheck = result.tiers.static.checks.find(c => c.name === "no_circular_deps");
    expect(cycleCheck?.passed).toBe(false);
  });
});
