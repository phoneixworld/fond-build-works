import { describe, it, expect } from "vitest";
import {
  classifyEditIntent,
  executeSurgicalEdit,
  analyzeRenameImpact,
  findUnusedImports,
} from "@/lib/compiler/surgicalEditor";

// ─── Test Workspace ──────────────────────────────────────────────────────

const WORKSPACE: Record<string, string> = {
  "App.tsx": `
import React from "react";
import Dashboard from "./components/Dashboard";
import { Button } from "./components/ui/button";

const App = () => {
  return (
    <div>
      <Dashboard />
      <Button>Click</Button>
    </div>
  );
};

export default App;
`,
  "components/Dashboard.tsx": `
import React from "react";
import { Card } from "./ui/card";
import { unusedHelper } from "../lib/helpers";

const Dashboard = ({ title }) => {
  return (
    <Card>
      <h1>{title}</h1>
      <p>Welcome to the dashboard</p>
    </Card>
  );
};

export default Dashboard;
`,
  "lib/helpers.ts": `
export function unusedHelper() {
  return "helper";
}

export function usedHelper() {
  return "used";
}
`,
};

// ─── Intent Classification ───────────────────────────────────────────────

describe("classifyEditIntent", () => {
  it("classifies add import instructions", () => {
    const result = classifyEditIntent("add useState from react", WORKSPACE);
    expect(result.type).toBe("add_import");
    expect(result.params.symbol).toBe("useState");
    expect(result.params.source).toBe("react");
    expect(result.deterministic).toBe(true);
  });

  it("classifies rename component instructions", () => {
    const result = classifyEditIntent("rename component Dashboard to HomePage", WORKSPACE);
    expect(result.type).toBe("rename_component");
    expect(result.params.from).toBe("Dashboard");
    expect(result.params.to).toBe("HomePage");
    expect(result.deterministic).toBe(true);
  });

  it("classifies add prop instructions", () => {
    const result = classifyEditIntent("add prop className to Card", WORKSPACE);
    expect(result.type).toBe("add_prop");
    expect(result.params.propName).toBe("className");
    expect(result.params.element).toBe("Card");
  });

  it("classifies remove prop instructions", () => {
    const result = classifyEditIntent("remove the prop title from Card", WORKSPACE);
    expect(result.type).toBe("remove_prop");
    expect(result.params.propName).toBe("title");
    expect(result.params.element).toBe("Card");
  });

  it("classifies add state instructions", () => {
    const result = classifyEditIntent("add a state for loading", WORKSPACE);
    expect(result.type).toBe("add_state");
    expect(result.params.stateName).toBe("loading");
  });

  it("classifies wrap with provider instructions", () => {
    const result = classifyEditIntent("wrap with ThemeProvider", WORKSPACE);
    expect(result.type).toBe("wrap_with_provider");
    expect(result.params.provider).toBe("ThemeProvider");
  });

  it("classifies remove import instructions", () => {
    const result = classifyEditIntent("remove the import of unusedHelper", WORKSPACE);
    expect(result.type).toBe("remove_import");
    expect(result.params.symbol).toBe("unusedHelper");
  });

  it("falls back to business_logic for complex instructions", () => {
    const result = classifyEditIntent("make the table sortable by clicking on column headers", WORKSPACE);
    expect(result.type).toBe("business_logic");
    expect(result.deterministic).toBe(false);
  });

  it("classifies style change instructions as non-deterministic", () => {
    const result = classifyEditIntent("change the background color to blue", WORKSPACE);
    expect(result.type).toBe("change_styling");
    expect(result.deterministic).toBe(false);
  });
});

// ─── Surgical Execution ──────────────────────────────────────────────────

describe("executeSurgicalEdit", () => {
  it("adds an import deterministically", () => {
    const intent = classifyEditIntent("add useState from react", WORKSPACE);
    const result = executeSurgicalEdit(intent, WORKSPACE);

    expect(result).not.toBeNull();
    expect(result!.fullyDeterministic).toBe(true);
  });

  it("returns null for non-deterministic intents", () => {
    const intent = classifyEditIntent("make the form validate on submit", WORKSPACE);
    const result = executeSurgicalEdit(intent, WORKSPACE);

    expect(result).toBeNull();
  });

  it("renames a symbol across files", () => {
    const intent = classifyEditIntent("rename component Dashboard to HomePage", WORKSPACE);
    const result = executeSurgicalEdit(intent, WORKSPACE);

    expect(result).not.toBeNull();
    // Should have patches for files containing "Dashboard"
    expect(result!.patches.length).toBeGreaterThan(0);
  });
});

// ─── Impact Analysis ─────────────────────────────────────────────────────

describe("analyzeRenameImpact", () => {
  it("finds all files referencing a symbol", () => {
    const impact = analyzeRenameImpact("Dashboard", WORKSPACE);
    expect(impact.files.length).toBeGreaterThanOrEqual(1);
    expect(impact.usageCount).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for non-existent symbols", () => {
    const impact = analyzeRenameImpact("NonExistentComponent", WORKSPACE);
    expect(impact.files.length).toBe(0);
    expect(impact.usageCount).toBe(0);
  });
});

// ─── Unused Import Detection ─────────────────────────────────────────────

describe("findUnusedImports", () => {
  it("detects unused imports", () => {
    const unused = findUnusedImports(WORKSPACE);
    // Should detect at least one unused import across the workspace
    expect(unused.length).toBeGreaterThan(0);
    // unusedHelper is imported but not used in Dashboard component body
    const hasUnused = unused.some(u =>
      u.file === "components/Dashboard.tsx" && u.source === "../lib/helpers"
    );
    expect(hasUnused).toBe(true);
  });
});
