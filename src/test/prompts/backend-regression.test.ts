/**
 * Backend Regression Matrix — validates that build output
 * meets quality standards for backend features.
 * 
 * Tests that generated code includes proper migrations, RLS,
 * and doesn't use forbidden patterns like localStorage auth.
 */
import { describe, it, expect } from "vitest";
import {
  validateBuildOutput,
  detectBackendIntent,
  type ValidationResult,
} from "@/lib/validateOutput";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeGoodBackendFiles(): Record<string, string> {
  return {
    "/migrations/001_schema.sql": `
      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        completed boolean DEFAULT false,
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now()
      );
    `,
    "/migrations/002_rls.sql": `
      ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Users can view own tasks" ON tasks
        FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "Users can create own tasks" ON tasks
        FOR INSERT WITH CHECK (auth.uid() = user_id);
    `,
    "/schema.json": JSON.stringify({
      entities: [
        {
          name: "Task",
          table: "tasks",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "title", type: "text", required: true },
            { name: "completed", type: "boolean", default: false },
            { name: "user_id", type: "uuid", reference: "auth.users" },
          ],
        },
      ],
    }),
    "/hooks/useTasks.js": `
      import { useState, useEffect, useCallback } from "react";
      const API_BASE = window.__SUPABASE_URL__;
      const API_KEY = window.__SUPABASE_KEY__;
      const PROJECT_ID = window.__PROJECT_ID__;
      
      const SAMPLE_TASKS = [
        { id: "s1", title: "Sample task", completed: false }
      ];
      
      export function useTasks() {
        const [tasks, setTasks] = useState([]);
        const [loading, setLoading] = useState(true);
        
        const fetchTasks = useCallback(async () => {
          try {
            const resp = await fetch(API_BASE + "/functions/v1/project-api", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_KEY },
              body: JSON.stringify({ project_id: PROJECT_ID, action: "list", collection: "tasks" }),
            });
            const json = await resp.json();
            setTasks(json.data || []);
          } catch {
            setTasks(SAMPLE_TASKS);
          } finally {
            setLoading(false);
          }
        }, []);
        
        useEffect(() => { fetchTasks(); }, [fetchTasks]);
        return { tasks, loading, refresh: fetchTasks };
      }
    `,
    "/contexts/AuthContext.jsx": `
      import React, { createContext, useContext, useState, useEffect } from "react";
      const AuthContext = createContext(null);
      export function AuthProvider({ children }) {
        const [user, setUser] = useState(null);
        const apiBase = window.__SUPABASE_URL__;
        const apiKey = window.__SUPABASE_KEY__;
        const projectId = window.__PROJECT_ID__;
        
        const login = async (email, password) => {
          const resp = await fetch(apiBase + "/functions/v1/project-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({ project_id: projectId, action: "login", email, password }),
          });
          const json = await resp.json();
          if (json.error) throw new Error(json.error);
          setUser(json.user);
          return json.user;
        };
        return <AuthContext.Provider value={{ user, login }}>{children}</AuthContext.Provider>;
      }
      export function useAuth() { return useContext(AuthContext); }
    `,
    "/App.jsx": `
      import React from "react";
      import { HashRouter, Routes, Route } from "react-router-dom";
      export default function App() {
        return <HashRouter><Routes><Route path="/" element={<div>Home</div>} /></Routes></HashRouter>;
      }
    `,
  };
}

function makeBadBackendFiles(): Record<string, string> {
  return {
    "/hooks/useTasks.js": `
      import { useState } from "react";
      const mockData = [
        { id: "1", title: "Buy groceries", completed: false },
        { id: "2", title: "Walk the dog", completed: true },
      ];
      export function useTasks() {
        const [tasks, setTasks] = useState(mockData);
        return { tasks, setTasks };
      }
    `,
    "/contexts/AuthContext.jsx": `
      import React, { createContext, useContext, useState } from "react";
      const AuthContext = createContext(null);
      export function AuthProvider({ children }) {
        const [user, setUser] = useState(null);
        const login = (email, password) => {
          localStorage.setItem("token", "fake-jwt");
          localStorage.setItem("user", JSON.stringify({ email }));
          setUser({ email });
        };
        return <AuthContext.Provider value={{ user, login }}>{children}</AuthContext.Provider>;
      }
      export function useAuth() { return useContext(AuthContext); }
    `,
    "/App.jsx": `
      import React from "react";
      export default function App() { return <div>App</div>; }
    `,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Backend Intent Detection", () => {
  it("detects CRUD prompts", () => {
    expect(detectBackendIntent({}, "Add CRUD for tasks")).toBe(true);
  });

  it("detects auth prompts", () => {
    expect(detectBackendIntent({}, "Add authentication")).toBe(true);
  });

  it("detects admin prompts", () => {
    expect(detectBackendIntent({}, "Add admin-only dashboard")).toBe(true);
  });

  it("detects data management prompts", () => {
    expect(detectBackendIntent({}, "Build a user management system")).toBe(true);
  });

  it("does not flag pure UI prompts", () => {
    expect(detectBackendIntent({}, "Make the button bigger and change color to blue")).toBe(false);
  });

  it("detects from generated code", () => {
    const files = { "/hooks/useUsers.js": 'fetch("/functions/v1/project-api")' };
    expect(detectBackendIntent(files, "update the list")).toBe(true);
  });
});

describe("Build Output Validation — Good Output", () => {
  const goodFiles = makeGoodBackendFiles();

  it("passes validation for well-structured backend output", () => {
    const result = validateBuildOutput(goodFiles, "Add CRUD for tasks");
    expect(result.forbiddenViolations).toHaveLength(0);
    expect(result.missingRequirements).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
  });

  it("has SQL migrations", () => {
    const sqlFiles = Object.keys(goodFiles).filter(f => f.endsWith(".sql"));
    expect(sqlFiles.length).toBeGreaterThanOrEqual(2);
  });

  it("has schema.json", () => {
    expect(goodFiles["/schema.json"]).toBeDefined();
    const schema = JSON.parse(goodFiles["/schema.json"]);
    expect(schema.entities).toBeDefined();
    expect(schema.entities.length).toBeGreaterThan(0);
  });

  it("has no forbidden patterns", () => {
    const result = validateBuildOutput(goodFiles, "Add CRUD for tasks");
    expect(result.forbiddenViolations).toHaveLength(0);
  });
});

describe("Build Output Validation — Bad Output", () => {
  const badFiles = makeBadBackendFiles();

  it("detects localStorage auth", () => {
    const result = validateBuildOutput(badFiles, "Add authentication");
    const authViolation = result.forbiddenViolations.find(v =>
      v.pattern.includes("localStorage")
    );
    expect(authViolation).toBeDefined();
  });

  it("detects mock data arrays", () => {
    const result = validateBuildOutput(badFiles, "Add CRUD for tasks");
    const mockViolation = result.forbiddenViolations.find(v =>
      v.pattern.toLowerCase().includes("mock") || v.pattern.toLowerCase().includes("fake")
    );
    expect(mockViolation).toBeDefined();
  });

  it("reports missing migrations", () => {
    const result = validateBuildOutput(badFiles, "Add CRUD for tasks");
    const missingMigration = result.missingRequirements.find(r =>
      r.includes("Migration") || r.includes("migration")
    );
    expect(missingMigration).toBeDefined();
  });

  it("reports missing schema.json", () => {
    const result = validateBuildOutput(badFiles, "Add CRUD for tasks");
    const missingSchema = result.missingRequirements.find(r =>
      r.includes("schema.json") || r.includes("Schema")
    );
    expect(missingSchema).toBeDefined();
  });

  it("has a low score", () => {
    const result = validateBuildOutput(badFiles, "Add CRUD for tasks");
    expect(result.score).toBeLessThan(50);
  });

  it("is marked invalid", () => {
    const result = validateBuildOutput(badFiles, "Add authentication with login/signup");
    expect(result.valid).toBe(false);
  });
});

describe("Prompt Regression Matrix", () => {
  // These prompts should all trigger backend intent detection
  const backendPrompts = [
    "Add authentication",
    "Add CRUD for tasks",
    "Add admin-only dashboard",
    "Add file uploads",
    "Add comments with relations",
    "Build a user management system",
    "Create a task board with persistence",
    "Add login and signup pages",
    "Build an inventory management system with CRUD",
    "Create a blog with posts, comments, and auth",
    "Add role-based access control",
    "Build a customer database with search",
    "Create an e-commerce backend with orders and products",
    "Add real-time notifications",
    "Build a project management tool with tasks and teams",
  ];

  for (const prompt of backendPrompts) {
    it(`detects backend intent: "${prompt}"`, () => {
      expect(detectBackendIntent({}, prompt)).toBe(true);
    });
  }

  // Good files should pass for all backend prompts
  const goodFiles = makeGoodBackendFiles();
  for (const prompt of backendPrompts) {
    it(`good output passes for: "${prompt}"`, () => {
      const result = validateBuildOutput(goodFiles, prompt);
      expect(result.forbiddenViolations).toHaveLength(0);
    });
  }

  // Bad files should fail for all backend prompts
  const badFiles = makeBadBackendFiles();
  for (const prompt of backendPrompts) {
    it(`bad output fails for: "${prompt}"`, () => {
      const result = validateBuildOutput(badFiles, prompt);
      expect(result.valid).toBe(false);
    });
  }
});
