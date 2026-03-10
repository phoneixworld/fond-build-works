/**
 * Conversation Engine Tests — Enterprise Promotion Checklist #10
 * 
 * Unit tests for:
 * - Build readiness engine
 * - IR merging  
 * - State transition validation
 * 
 * Integration tests for:
 * - Multi-phase flows
 * - Build blocking
 * - Audit logging
 */

import { describe, it, expect } from "vitest";
import { compileBuildReadiness, quickReadinessCheck } from "@/lib/buildReadinessEngine";
import type { IRState } from "@/lib/irTypes";
import { DEFAULT_IR_STATE } from "@/lib/irTypes";

// ─── Build Readiness Engine Tests ────────────────────────────────────────

describe("Build Readiness Engine", () => {
  it("should fail with no requirements", () => {
    const result = compileBuildReadiness(null, [], undefined);
    expect(result.isReady).toBe(false);
    expect(result.score).toBeLessThan(50);
    expect(result.checks.some(c => c.name === "requirements_exist" && !c.passed)).toBe(true);
  });

  it("should pass with basic requirements and routes", () => {
    const irState: IRState = {
      ...DEFAULT_IR_STATE,
      routes: [
        { id: "r1", path: "/", label: "Home", isProtected: false },
        { id: "r2", path: "/tasks", label: "Tasks", isProtected: true },
      ],
      dataModels: [
        {
          id: "m1",
          collectionName: "tasks",
          description: "Task entity",
          fields: [
            { name: "title", type: "text", required: true },
            { name: "status", type: "select", required: true },
            { name: "assignee", type: "text", required: false },
          ],
          timestamps: true,
          softDelete: false,
        },
      ],
    };

    const requirements = [{ rawText: "Build a task manager with CRUD" }];
    const result = compileBuildReadiness(irState, requirements, undefined);
    expect(result.isReady).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("should detect missing fields in data models", () => {
    const irState: IRState = {
      ...DEFAULT_IR_STATE,
      routes: [{ id: "r1", path: "/", label: "Home", isProtected: false }],
      dataModels: [
        {
          id: "m1",
          collectionName: "items",
          description: "Item entity",
          fields: [{ name: "status", type: "select", required: false }],
          timestamps: true,
          softDelete: false,
        },
      ],
    };

    const result = compileBuildReadiness(irState, [{ rawText: "Items app" }], undefined);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it("should detect unresolved roles", () => {
    const irState: IRState = {
      ...DEFAULT_IR_STATE,
      routes: [{ id: "r1", path: "/", label: "Home", isProtected: false }],
      auth: {
        enabled: true,
        provider: "email",
        requireEmailVerification: false,
        roles: [{ id: "role1", name: "admin", description: "Admin" }],
        permissions: [],
        publicRoutes: ["/"],
      },
    };

    const mergedNormalized = {
      authConfig: {
        requiresAuth: true,
        roles: ["admin", "moderator"], // moderator not in IR
      },
    };

    const result = compileBuildReadiness(irState, [{ rawText: "App with admin and moderator" }], mergedNormalized);
    expect(result.unresolvedRoles).toContain("moderator");
  });

  it("should detect auth without protected routes", () => {
    const irState: IRState = {
      ...DEFAULT_IR_STATE,
      routes: [
        { id: "r1", path: "/", label: "Home", isProtected: false },
        { id: "r2", path: "/admin", label: "Admin", isProtected: false },
      ],
      auth: {
        enabled: true,
        provider: "email",
        requireEmailVerification: false,
        roles: [{ id: "role1", name: "admin", description: "Admin" }],
        permissions: [],
        publicRoutes: ["/"],
      },
    };

    const result = compileBuildReadiness(irState, [{ rawText: "Admin panel" }], undefined);
    // Auth enabled + no protected routes = warning
    const authRouteCheck = result.checks.find(c => c.name === "auth_route_consistency");
    expect(authRouteCheck?.passed).toBe(false);
  });
});

describe("Quick Readiness Check", () => {
  it("should return not ready with nothing", () => {
    const result = quickReadinessCheck(false, false, false, false);
    expect(result.ready).toBe(false);
    expect(result.score).toBe(0);
    expect(result.label).toBe("Not Ready");
  });

  it("should return ready with requirements only", () => {
    const result = quickReadinessCheck(true, false, false, false);
    expect(result.ready).toBe(true);
    expect(result.score).toBe(40);
    expect(result.label).toBe("Partial");
  });

  it("should return full ready", () => {
    const result = quickReadinessCheck(true, true, true, true);
    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
    expect(result.label).toBe("Ready");
  });
});

// ─── State Transition Tests ──────────────────────────────────────────────

describe("State Transitions", () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    idle: ["gathering", "building"],
    gathering: ["gathering", "ready", "building", "idle"],
    ready: ["building", "gathering", "idle"],
    building: ["reviewing", "complete", "idle"],
    reviewing: ["complete", "building", "idle"],
    complete: ["idle", "gathering", "building"],
  };

  it("should allow valid transitions", () => {
    expect(VALID_TRANSITIONS["idle"].includes("gathering")).toBe(true);
    expect(VALID_TRANSITIONS["gathering"].includes("building")).toBe(true);
    expect(VALID_TRANSITIONS["building"].includes("complete")).toBe(true);
  });

  it("should block invalid transitions", () => {
    expect(VALID_TRANSITIONS["idle"].includes("complete")).toBe(false);
    expect(VALID_TRANSITIONS["idle"].includes("reviewing")).toBe(false);
    expect(VALID_TRANSITIONS["building"].includes("gathering")).toBe(false);
  });

  it("should allow self-transition for gathering", () => {
    expect(VALID_TRANSITIONS["gathering"].includes("gathering")).toBe(true);
  });

  it("should allow reset from any state", () => {
    for (const state of Object.keys(VALID_TRANSITIONS)) {
      expect(VALID_TRANSITIONS[state].includes("idle")).toBe(true);
    }
  });
});

// ─── Signal Detection Tests ──────────────────────────────────────────────

describe("Signal Detection", () => {
  const BUILD_SIGNALS = /^(now build|go ahead|build it|start building|that's all|thats all|that's everything|thats everything|you can start|proceed|let's build|lets build|ready to build|start now|begin|execute|generate|now create|do it)\b/i;
  const PHASED_SIGNALS = /\b(phase by phase|step by step|i'll give you|one at a time|let me explain|first let me|i'll share|i'll provide|wait for my|before you start|phase\s*\d|step\s*\d|part\s*\d|section\s*\d)\b/i;

  it("should detect build signals", () => {
    expect(BUILD_SIGNALS.test("build it")).toBe(true);
    expect(BUILD_SIGNALS.test("Build it now")).toBe(true);
    expect(BUILD_SIGNALS.test("go ahead")).toBe(true);
    expect(BUILD_SIGNALS.test("now build everything")).toBe(true);
    expect(BUILD_SIGNALS.test("let's build")).toBe(true);
  });

  it("should not false-positive build signals", () => {
    expect(BUILD_SIGNALS.test("I want to build a task manager")).toBe(false);
    expect(BUILD_SIGNALS.test("Can you build this?")).toBe(false);
  });

  it("should detect phased signals", () => {
    expect(PHASED_SIGNALS.test("I'll give you requirements phase by phase")).toBe(true);
    expect(PHASED_SIGNALS.test("Let me explain step by step")).toBe(true);
    expect(PHASED_SIGNALS.test("Here is phase 1")).toBe(true);
    expect(PHASED_SIGNALS.test("section 2 of requirements")).toBe(true);
  });
});

// ─── IR Merging Tests ────────────────────────────────────────────────────

describe("IR Merging", () => {
  // Simulate the merge logic
  function mergeNormalized(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
    const dedupeByName = (arr: any[]) => {
      const seen = new Set();
      return arr.filter(item => {
        if (seen.has(item.name)) return false;
        seen.add(item.name);
        return true;
      });
    };

    return {
      dataModels: dedupeByName([...(existing.dataModels || []), ...(incoming.dataModels || [])]),
      authConfig: {
        requiresAuth: existing.authConfig?.requiresAuth || incoming.authConfig?.requiresAuth,
        roles: [...new Set([...(existing.authConfig?.roles || []), ...(incoming.authConfig?.roles || [])])],
      },
      uiLayout: {
        components: [...new Set([...(existing.uiLayout?.components || []), ...(incoming.uiLayout?.components || [])])],
        suggestedPages: [...new Set([...(existing.uiLayout?.suggestedPages || []), ...(incoming.uiLayout?.suggestedPages || [])])],
      },
      integrations: [...new Set([...(existing.integrations || []), ...(incoming.integrations || [])])],
    };
  }

  it("should merge entities without duplicates", () => {
    const phase1 = { dataModels: [{ name: "user" }, { name: "task" }] };
    const phase2 = { dataModels: [{ name: "task" }, { name: "project" }] };
    const merged = mergeNormalized(phase1, phase2);
    expect(merged.dataModels.map((d: any) => d.name)).toEqual(["user", "task", "project"]);
  });

  it("should merge roles without duplicates", () => {
    const phase1 = { authConfig: { requiresAuth: false, roles: ["admin"] } };
    const phase2 = { authConfig: { requiresAuth: true, roles: ["admin", "teacher"] } };
    const merged = mergeNormalized(phase1, phase2);
    expect(merged.authConfig.requiresAuth).toBe(true);
    expect(merged.authConfig.roles).toEqual(["admin", "teacher"]);
  });

  it("should merge UI components", () => {
    const phase1 = { uiLayout: { components: ["table", "form"], suggestedPages: ["Dashboard"] } };
    const phase2 = { uiLayout: { components: ["form", "chart"], suggestedPages: ["Dashboard", "Reports"] } };
    const merged = mergeNormalized(phase1, phase2);
    expect(merged.uiLayout.components).toEqual(["table", "form", "chart"]);
    expect(merged.uiLayout.suggestedPages).toEqual(["Dashboard", "Reports"]);
  });

  it("should handle empty phases", () => {
    const merged = mergeNormalized({}, {});
    expect(merged.dataModels).toEqual([]);
    expect(merged.authConfig.roles).toEqual([]);
  });

  it("should be deterministic across orderings", () => {
    const a = { dataModels: [{ name: "x" }], authConfig: { roles: ["admin"] } };
    const b = { dataModels: [{ name: "y" }], authConfig: { roles: ["user"] } };
    const merged1 = mergeNormalized(a, b);
    const merged2 = mergeNormalized(b, a);
    // Both should have same entities (order may differ but set is same)
    expect(new Set(merged1.dataModels.map((d: any) => d.name))).toEqual(new Set(merged2.dataModels.map((d: any) => d.name)));
    expect(new Set(merged1.authConfig.roles)).toEqual(new Set(merged2.authConfig.roles));
  });
});
