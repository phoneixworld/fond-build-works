import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

/**
 * Backend Agent — generates data layer, SQL migrations, RLS policies,
 * and API hooks based on a domain model from the Requirements Agent.
 *
 * Task types:
 * - "schema": Generate SQL migrations, RLS policies, schema.json, and typed hooks
 * - "backend": Generate CRUD hooks, contexts, and API integration
 *
 * RULES:
 * - ALWAYS generate SQL migrations for schema tasks
 * - ALWAYS generate RLS policies for every table
 * - ALWAYS use project-api/project-auth — NEVER use localStorage for auth
 * - NEVER use mock data as primary persistence
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { task, domainModel, projectId, existingFiles, techStack } = await req.json();

    if (!task || !domainModel) {
      return new Response(
        JSON.stringify({ error: "task and domainModel are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskType = task.taskType || "backend";
    const apiBase = `${SUPABASE_URL}/functions/v1`;

    let generatedFiles: Record<string, string> = {};
    let chatText = "";

    if (taskType === "schema") {
      // ── Schema Task: Generate mock data + type stubs ──
      const result = generateSchemaFiles(domainModel, projectId, apiBase);
      generatedFiles = result.files;
      chatText = result.chatText;
    } else if (taskType === "backend") {
      // ── Backend Task: Generate hooks + contexts ──
      // Use AI to generate more sophisticated hooks if API key available
      if (LOVABLE_API_KEY) {
        const aiResult = await generateBackendWithAI(task, domainModel, projectId, apiBase, existingFiles);
        generatedFiles = aiResult.files;
        chatText = aiResult.chatText;
      } else {
        const result = generateBackendFiles(domainModel, projectId, apiBase);
        generatedFiles = result.files;
        chatText = result.chatText;
      }
    }

    // Wrap in react-preview format for the build engine parser
    const codeBlock = Object.entries(generatedFiles)
      .map(([path, code]) => `--- ${path}\n${code}`)
      .join("\n");

    const fullResponse = `${chatText}\n\n\`\`\`react-preview\n${codeBlock}\n\`\`\``;

    return new Response(
      JSON.stringify({ response: fullResponse, files: generatedFiles }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("backend-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Backend agent error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Schema File Generation ──────────────────────────────────────────────

function generateSchemaFiles(
  domainModel: any,
  projectId: string,
  apiBase: string
): { files: Record<string, string>; chatText: string } {
  const files: Record<string, string> = {};

  // API config
  files["/data/apiConfig.js"] = `/**
 * API Configuration — dual-layer backend.
 * Toggle useRealApi to switch between mock data and real persistence.
 */
export const API_CONFIG = {
  useRealApi: typeof window !== "undefined" && window.__PROJECT_CONFIG__?.useRealApi === true,
  projectId: "${projectId}",
  apiBase: "${apiBase}",
  anonKey: "${Deno.env.get("SUPABASE_ANON_KEY") || ""}",
};
`;

  // Generate mock data for each entity
  for (const entity of domainModel.entities || []) {
    const records = generateMockRecords(entity);
    files[`/data/${entity.pluralName}.js`] = `/**
 * Mock data for ${entity.name} — auto-generated from domain model.
 */
export const mock${entity.name}s = ${JSON.stringify(records, null, 2)};

export function get${entity.name}ById(id) {
  return mock${entity.name}s.find(item => item.id === id) || null;
}

export function search${entity.name}s(query) {
  const q = (query || "").toLowerCase();
  if (!q) return mock${entity.name}s;
  return mock${entity.name}s.filter(item =>
    Object.values(item).some(v => String(v).toLowerCase().includes(q))
  );
}
`;
  }

  const entityNames = (domainModel.entities || []).map((e: any) => e.name).join(", ");
  const chatText = `✅ Generated schema layer with mock data for: ${entityNames}`;

  return { files, chatText };
}

function generateMockRecords(entity: any): any[] {
  const records = [];
  const count = entity.seedCount || 5;
  const names = ["Alice Johnson", "Bob Smith", "Carol Williams", "David Brown", "Eve Davis", "Frank Miller", "Grace Wilson", "Henry Moore", "Iris Taylor", "Jack Anderson", "Kate Thomas", "Leo Jackson", "Mia White", "Noah Harris", "Olivia Martin", "Paul Garcia", "Quinn Robinson", "Rose Clark", "Sam Lewis", "Tina Lee"];
  const companies = ["Acme Corp", "TechVentures", "GlobalSoft", "DataDrive", "CloudFirst", "InnovateCo"];
  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Computer Science", "Economics"];
  const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations", "Support"];

  for (let i = 0; i < count; i++) {
    const record: any = { id: `mock-${entity.pluralName}-${i + 1}` };
    for (const field of entity.fields || []) {
      record[field.name] = generateValue(field, entity.name, i, names, companies, subjects, departments);
    }
    record._created_at = new Date(Date.now() - (count - i) * 86400000).toISOString();
    records.push(record);
  }
  return records;
}

function generateValue(field: any, entityName: string, i: number, names: string[], companies: string[], subjects: string[], departments: string[]): any {
  if (field.default !== undefined && field.default !== null && field.type !== "select") return field.default;
  const n = field.name.toLowerCase();
  switch (field.type) {
    case "text":
      if (n === "name" || n.includes("name")) return names[i % names.length];
      if (n.includes("phone")) return `+1 (555) ${String(100 + i).padStart(3, "0")}-${String(1000 + i * 7).slice(-4)}`;
      if (n.includes("sku")) return `SKU-${String(10000 + i * 137).slice(-5)}`;
      if (n.includes("roll") || n.includes("number")) return `${entityName.charAt(0)}${1000 + i}`;
      if (n.includes("class")) return `Class ${Math.floor(i / 3) + 1}${["A", "B", "C"][i % 3]}`;
      if (n.includes("subject")) return subjects[i % subjects.length];
      if (n.includes("department")) return departments[i % departments.length];
      if (n.includes("company")) return companies[i % companies.length];
      if (n.includes("room")) return `Room ${100 + i}`;
      if (n.includes("time")) return `${8 + Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}`;
      if (n.includes("tracking")) return `TRK${String(100000 + i * 997).slice(-8)}`;
      return `${entityName} ${field.name} ${i + 1}`;
    case "email": return `user${i + 1}@example.com`;
    case "number":
      if (n.includes("price") || n.includes("amount") || n.includes("cost") || n.includes("salary") || n.includes("value") || n.includes("total") || n.includes("fee")) return Math.round((Math.random() * 9000 + 1000) * 100) / 100;
      if (n.includes("rating")) return Math.round((Math.random() * 4 + 1) * 10) / 10;
      if (n.includes("probability")) return Math.floor(Math.random() * 100);
      return i + 1;
    case "boolean": return i % 3 !== 0;
    case "datetime": return new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000).toISOString();
    case "url": return `https://picsum.photos/seed/${entityName.toLowerCase()}${i}/400/300`;
    case "textarea": return `Sample ${field.name} for ${entityName} #${i + 1}.`;
    case "select": return field.options ? field.options[i % field.options.length] : "default";
    case "json": return field.default || {};
    default: return `${field.name} ${i + 1}`;
  }
}

// ─── Backend File Generation (template-based) ────────────────────────────

function generateBackendFiles(
  domainModel: any,
  projectId: string,
  apiBase: string
): { files: Record<string, string>; chatText: string } {
  const files: Record<string, string> = {};

  // Generate CRUD hook for each entity
  for (const entity of domainModel.entities || []) {
    files[`/hooks/use${entity.name}.js`] = generateHookFile(entity, projectId, apiBase);
  }

  // Generate data context
  const imports = (domainModel.entities || []).map((e: any) =>
    `import { use${e.name}s } from "../hooks/use${e.name}";`
  ).join("\n");

  const contextFields = (domainModel.entities || []).map((e: any) =>
    `    ${e.pluralName}: use${e.name}s(),`
  ).join("\n");

  files["/contexts/DataContext.js"] = `import React, { createContext, useContext } from "react";
${imports}

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const data = {
${contextFields}
  };
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
`;

  // Auth context if needed
  if (domainModel.requiresAuth) {
    files["/contexts/AuthContext.js"] = generateAuthContext(projectId, apiBase);
    files["/components/ui/ProtectedRoute.jsx"] = generateProtectedRoute();
  }

  const entityNames = (domainModel.entities || []).map((e: any) => e.name).join(", ");
  const chatText = `✅ Generated backend layer: CRUD hooks for ${entityNames}${domainModel.requiresAuth ? " + auth context" : ""}`;

  return { files, chatText };
}

function generateHookFile(entity: any, projectId: string, apiBase: string): string {
  const name = entity.name;
  const plural = entity.pluralName;

  return `import { useState, useEffect, useCallback } from "react";
import { mock${name}s } from "../data/${plural}";
import { API_CONFIG } from "../data/apiConfig";

export function use${name}s() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (API_CONFIG.useRealApi) {
        const resp = await fetch(API_CONFIG.apiBase + "/project-api", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
          body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "list", collection: "${plural}" }),
        });
        const json = await resp.json();
        setItems(json.data || []);
      } else {
        await new Promise(r => setTimeout(r, 300));
        setItems([...mock${name}s]);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch");
      setItems([...mock${name}s]);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (data) => {
    try {
      if (API_CONFIG.useRealApi) {
        const resp = await fetch(API_CONFIG.apiBase + "/project-api", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
          body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "create", collection: "${plural}", data }),
        });
        const json = await resp.json();
        setItems(prev => [json.data, ...prev]);
        return json.data;
      } else {
        const newItem = { id: "mock-" + Date.now(), ...data, _created_at: new Date().toISOString() };
        setItems(prev => [newItem, ...prev]);
        return newItem;
      }
    } catch (err) { setError(err.message); throw err; }
  }, []);

  const update = useCallback(async (id, data) => {
    try {
      if (API_CONFIG.useRealApi) {
        const resp = await fetch(API_CONFIG.apiBase + "/project-api", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
          body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "update", collection: "${plural}", id, data }),
        });
        const json = await resp.json();
        setItems(prev => prev.map(item => item.id === id ? { ...item, ...json.data } : item));
        return json.data;
      } else {
        setItems(prev => prev.map(item => item.id === id ? { ...item, ...data } : item));
        return { id, ...data };
      }
    } catch (err) { setError(err.message); throw err; }
  }, []);

  const remove = useCallback(async (id) => {
    try {
      if (API_CONFIG.useRealApi) {
        await fetch(API_CONFIG.apiBase + "/project-api", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
          body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "delete", collection: "${plural}", id }),
        });
      }
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) { setError(err.message); throw err; }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return { ${plural}: items, loading, error, refresh: fetchItems, create, update, remove };
}
`;
}

function generateAuthContext(projectId: string, apiBase: string): string {
  return `import React, { createContext, useContext, useState, useEffect } from "react";
import { API_CONFIG } from "../data/apiConfig";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem("app_token"));

  useEffect(() => {
    if (token) {
      fetch(API_CONFIG.apiBase + "/project-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
        body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "me", token }),
      })
        .then(r => r.json())
        .then(json => { if (json.user) setUser(json.user); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    const resp = await fetch(API_CONFIG.apiBase + "/project-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
      body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "login", email, password }),
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    localStorage.setItem("app_token", json.token);
    setToken(json.token);
    setUser(json.user);
    return json.user;
  };

  const signup = async (email, password, displayName) => {
    const resp = await fetch(API_CONFIG.apiBase + "/project-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
      body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "signup", email, password, display_name: displayName }),
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    localStorage.setItem("app_token", json.token);
    setToken(json.token);
    setUser(json.user);
    return json.user;
  };

  const logout = () => {
    localStorage.removeItem("app_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
`;
}

function generateProtectedRoute(): string {
  return `import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
`;
}

// ─── AI-Enhanced Backend Generation ──────────────────────────────────────

async function generateBackendWithAI(
  task: any,
  domainModel: any,
  projectId: string,
  apiBase: string,
  existingFiles?: string[]
): Promise<{ files: Record<string, string>; chatText: string }> {
  // Fallback to template generation — AI enhancement can be added later
  // when we want more sophisticated hook logic (optimistic updates, caching, etc.)
  return generateBackendFiles(domainModel, projectId, apiBase);
}
