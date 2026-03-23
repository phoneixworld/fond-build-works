/**
 * Auth Regression Test Suite — Ensures auth generation follows canonical patterns.
 */

import { describe, it, expect } from "vitest";
import { validateAuthConformance, detectAuthIntent } from "@/lib/validateAuth";
import { detectAuthVariant, generateAuthTemplateSet } from "@/lib/phoenix/auth/variants";

// ─── Auth Intent Detection ─────────────────────────────────────────────────

describe("Auth Intent Detection", () => {
  const authPrompts = [
    "Add authentication",
    "Add login and signup pages",
    "Add admin-only dashboard",
    "Add role-based access control",
    "Add protected routes",
    "Add user profile page",
    "Create a sign in page",
    "Add password reset functionality",
    "Implement RBAC for the app",
    "Add user accounts and sessions",
  ];

  for (const prompt of authPrompts) {
    it(`detects auth intent: "${prompt}"`, () => {
      expect(detectAuthIntent(prompt)).toBe(true);
    });
  }

  const nonAuthPrompts = [
    "Add a chart to the dashboard",
    "Fix the CSS on the homepage",
    "Add a contact form",
    "Create a product listing page",
  ];

  for (const prompt of nonAuthPrompts) {
    it(`does NOT detect auth intent: "${prompt}"`, () => {
      expect(detectAuthIntent(prompt)).toBe(false);
    });
  }
});

// ─── Auth Variant Detection ─────────────────────────────────────────────────

describe("Auth Variant Detection", () => {
  it("detects email-password for basic auth", () => {
    expect(detectAuthVariant("Add authentication")).toBe("email-password");
  });

  it("detects role-based for admin requests", () => {
    expect(detectAuthVariant("Add admin-only dashboard")).toBe("role-based");
  });

  it("detects role-based for RBAC", () => {
    expect(detectAuthVariant("Implement role-based access control")).toBe("role-based");
  });

  it("detects role-based for permission requests", () => {
    expect(detectAuthVariant("Add permission levels")).toBe("role-based");
  });

  it("detects social for OAuth", () => {
    expect(detectAuthVariant("Add Google sign in")).toBe("social");
  });
});

// ─── Auth Template Generation ───────────────────────────────────────────────

describe("Auth Template Generation", () => {
  it("generates email-password template set", () => {
    const set = generateAuthTemplateSet("email-password");
    expect(set.variant).toBe("email-password");
    expect(Object.keys(set.files).length).toBeGreaterThanOrEqual(5);
    expect(set.files).toHaveProperty("/pages/LoginPage.jsx");
    expect(set.files).toHaveProperty("/pages/SignupPage.jsx");
    expect(set.files).toHaveProperty("/hooks/useSession.js");
    expect(set.files).toHaveProperty("/auth/auth.client.js");
    expect(set.files).toHaveProperty("/components/ProtectedRoute.jsx");
  });

  it("generates role-based template set with migrations", () => {
    const set = generateAuthTemplateSet("role-based");
    expect(set.variant).toBe("role-based");
    expect(set.migrations.length).toBeGreaterThan(0);
    expect(set.files).toHaveProperty("/hooks/useUserRole.js");
    expect(set.files).toHaveProperty("/migrations/003_roles.sql");
  });

  it("email-password templates use supabase.auth", () => {
    const set = generateAuthTemplateSet("email-password");
    const allContent = Object.values(set.files).join("\n");
    expect(allContent).toContain("signInWithPassword");
    expect(allContent).toContain("signUp");
    expect(allContent).toContain("signOut");
    expect(allContent).toContain("onAuthStateChange");
    expect(allContent).toContain("getSession");
  });

  it("templates do NOT contain forbidden patterns", () => {
    const set = generateAuthTemplateSet("email-password");
    const allContent = Object.values(set.files).join("\n");
    expect(allContent).not.toMatch(/localStorage\.setItem\s*\(\s*['"`]token/);
    expect(allContent).not.toMatch(/bcrypt/);
    expect(allContent).not.toMatch(/jsonwebtoken/);
    expect(allContent).not.toMatch(/fakeUser/);
  });

  it("role-based templates include user_roles migration", () => {
    const set = generateAuthTemplateSet("role-based");
    const migration = set.migrations[0];
    expect(migration).toContain("CREATE TABLE");
    expect(migration).toContain("user_roles");
    expect(migration).toContain("has_role");
    expect(migration).toContain("ROW LEVEL SECURITY");
  });
});

// ─── Auth Conformance Validation ────────────────────────────────────────────

describe("Auth Conformance Validation", () => {
  it("passes valid auth files", () => {
    const files = {
      "/auth/auth.client.js": 'import { createClient } from "@supabase/supabase-js";\nexport const supabase = createClient();\nsupabase.auth.getSession();',
      "/hooks/useSession.js": 'supabase.auth.onAuthStateChange(); supabase.auth.signInWithPassword()',
      "/pages/LoginPage.jsx": 'import { useSession } from "../hooks/useSession";',
      "/components/ProtectedRoute.jsx": 'export function ProtectedRoute({ children }) {}',
    };
    const result = validateAuthConformance(files, "Add authentication");
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("fails when localStorage token is used", () => {
    const files = {
      "/auth.js": 'localStorage.setItem("token", response.jwt);',
    };
    const result = validateAuthConformance(files, "Add login");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("localStorage"))).toBe(true);
  });

  it("fails when bcrypt is used client-side", () => {
    const files = {
      "/auth.js": 'import bcrypt from "bcryptjs"; const hash = bcrypt.hash(password);',
    };
    const result = validateAuthConformance(files, "Add authentication");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("bcrypt"))).toBe(true);
  });

  it("fails when custom JWT is used", () => {
    const files = {
      "/auth.js": 'import jwt from "jsonwebtoken"; jwt.sign({ userId }, secret);',
    };
    const result = validateAuthConformance(files, "Add authentication");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("JWT"))).toBe(true);
  });

  it("skips validation for non-auth prompts", () => {
    const files = {
      "/page.js": 'localStorage.setItem("token", "abc");', // Would normally fail
    };
    const result = validateAuthConformance(files, "Add a chart");
    expect(result.valid).toBe(true); // Skipped — no auth intent
  });

  it("warns when roles requested but user_roles missing", () => {
    const files = {
      "/auth.js": 'supabase.auth.signInWithPassword(); supabase.auth.onAuthStateChange();',
      "/ProtectedRoute.jsx": 'export function ProtectedRoute() {}',
    };
    const result = validateAuthConformance(files, "Add admin dashboard with role-based access");
    expect(result.warnings.some(w => w.includes("user_roles") || w.includes("has_role"))).toBe(true);
  });
});
