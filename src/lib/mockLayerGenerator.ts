/**
 * Mock Layer Generator — generates Sandpack-compatible in-memory data stores
 * that mirror the real backend schema for instant preview.
 */

import type { DomainModel, DomainEntity, DomainField } from "@/lib/domainTemplates";

/**
 * Generate mock data files for Sandpack preview.
 * Creates:
 * - /data/<entity>.js — mock data arrays with realistic seed data
 * - /hooks/use<Entity>.js — dual-layer hooks (mock + real API)
 * - /contexts/DataContext.js — central data provider
 */
export function generateMockLayer(
  domainModel: DomainModel,
  projectId: string,
  apiBase: string,
  anonKey: string
): Record<string, string> {
  const files: Record<string, string> = {};

  // Generate mock data file for each entity
  for (const entity of domainModel.entities) {
    files[`/data/${entity.pluralName}.js`] = generateMockData(entity);
    files[`/hooks/use${entity.name}.js`] = generateEntityHook(entity, projectId, apiBase, anonKey);
  }

  // Generate central data context
  files["/contexts/DataContext.js"] = generateDataContext(domainModel);

  // Generate API config
  files["/data/apiConfig.js"] = generateApiConfig(projectId, apiBase, anonKey);

  return files;
}

function generateMockData(entity: DomainEntity): string {
  const records = [];
  for (let i = 0; i < entity.seedCount; i++) {
    records.push(generateRecord(entity, i));
  }

  return `/**
 * Mock data for ${entity.name} entity
 * Auto-generated from domain model — editable for preview customization.
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

function generateRecord(entity: DomainEntity, index: number): Record<string, any> {
  const record: Record<string, any> = {
    id: `mock-${entity.pluralName}-${index + 1}`,
  };

  for (const field of entity.fields) {
    record[field.name] = generateFieldValue(field, entity.name, index);
  }

  record._created_at = new Date(Date.now() - (entity.seedCount - index) * 86400000).toISOString();
  record._updated_at = record._created_at;

  return record;
}

function generateFieldValue(field: DomainField, entityName: string, index: number): any {
  if (field.default !== undefined && field.default !== null) {
    if (field.type === "select" && field.options?.length) {
      return field.options[index % field.options.length];
    }
    return field.default;
  }

  switch (field.type) {
    case "text":
      return generateTextValue(field.name, entityName, index);
    case "email":
      return `${field.name.replace(/[A-Z]/g, c => c.toLowerCase())}${index + 1}@example.com`;
    case "number":
      if (field.name.includes("price") || field.name.includes("amount") || field.name.includes("cost") || field.name.includes("salary") || field.name.includes("fee") || field.name.includes("value") || field.name.includes("total")) {
        return Math.round((Math.random() * 9000 + 1000) * 100) / 100;
      }
      if (field.name.includes("rating")) return Math.round((Math.random() * 4 + 1) * 10) / 10;
      if (field.name.includes("count") || field.name.includes("quantity")) return Math.floor(Math.random() * 50) + 1;
      if (field.name.includes("probability")) return Math.floor(Math.random() * 100);
      return index + 1;
    case "boolean":
      return index % 3 !== 0;
    case "datetime":
      const daysOffset = Math.floor(Math.random() * 365);
      return new Date(Date.now() - daysOffset * 86400000).toISOString();
    case "url":
      return `https://picsum.photos/seed/${entityName.toLowerCase()}${index}/400/300`;
    case "textarea":
      return `Sample ${field.name} for ${entityName} #${index + 1}. This is auto-generated preview content.`;
    case "select":
      return field.options ? field.options[index % field.options.length] : "default";
    case "json":
      return field.default || {};
    default:
      return `${entityName} ${field.name} ${index + 1}`;
  }
}

function generateTextValue(fieldName: string, entityName: string, index: number): string {
  const lower = fieldName.toLowerCase();
  const names = ["Alice Johnson", "Bob Smith", "Carol Williams", "David Brown", "Eve Davis", "Frank Miller", "Grace Wilson", "Henry Moore", "Iris Taylor", "Jack Anderson", "Kate Thomas", "Leo Jackson", "Mia White", "Noah Harris", "Olivia Martin", "Paul Garcia", "Quinn Robinson", "Rose Clark", "Sam Lewis", "Tina Lee"];
  
  if (lower === "name" || lower.includes("name")) return names[index % names.length];
  if (lower.includes("phone")) return `+1 (555) ${String(100 + index).padStart(3, "0")}-${String(1000 + index * 7).slice(-4)}`;
  if (lower.includes("sku")) return `SKU-${String(10000 + index * 137).slice(-5)}`;
  if (lower.includes("roll") || lower.includes("number")) return `${entityName.charAt(0)}${String(1000 + index)}`;
  if (lower.includes("class") || lower.includes("section")) return `Class ${Math.floor(index / 3) + 1}${["A", "B", "C"][index % 3]}`;
  if (lower.includes("subject")) return ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Computer Science", "Economics"][index % 8];
  if (lower.includes("department")) return ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations", "Support"][index % 7];
  if (lower.includes("company")) return ["Acme Corp", "TechVentures", "GlobalSoft", "DataDrive", "CloudFirst", "InnovateCo"][index % 6];
  if (lower.includes("title") || lower === "subject") return `${entityName} Item #${index + 1}`;
  if (lower.includes("room")) return `Room ${100 + index}`;
  if (lower.includes("tracking")) return `TRK${String(100000 + index * 997).slice(-8)}`;
  if (lower.includes("time")) return `${8 + Math.floor(index / 2)}:${index % 2 === 0 ? "00" : "30"}`;
  if (lower.includes("tag")) return ["important", "urgent", "review", "new"][index % 4];
  return `${entityName} ${fieldName} ${index + 1}`;
}

function generateEntityHook(
  entity: DomainEntity,
  projectId: string,
  apiBase: string,
  anonKey: string
): string {
  const name = entity.name;
  const plural = entity.pluralName;

  return `import { useState, useEffect, useCallback } from "react";
import { mock${name}s } from "../data/${plural}";
import { API_CONFIG } from "../data/apiConfig";

/**
 * Dual-layer hook for ${name} entity.
 * Uses mock data for instant Sandpack preview, real API when configured.
 */
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
        // Simulate network delay for realistic preview
        await new Promise(r => setTimeout(r, 300));
        setItems([...mock${name}s]);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch ${plural}");
      // Fallback to mock data on API error
      setItems([...mock${name}s]);
    } finally {
      setLoading(false);
    }
  }, []);

  const create${name} = useCallback(async (data) => {
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
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const update${name} = useCallback(async (id, data) => {
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
        setItems(prev => prev.map(item => item.id === id ? { ...item, ...data, _updated_at: new Date().toISOString() } : item));
        return { id, ...data };
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const delete${name} = useCallback(async (id) => {
    try {
      if (API_CONFIG.useRealApi) {
        await fetch(API_CONFIG.apiBase + "/project-api", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
          body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "delete", collection: "${plural}", id }),
        });
      }
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return {
    ${plural}: items,
    loading,
    error,
    refresh: fetchItems,
    create: create${name},
    update: update${name},
    remove: delete${name},
  };
}

export function use${name}(id) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        if (API_CONFIG.useRealApi) {
          const resp = await fetch(API_CONFIG.apiBase + "/project-api", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_CONFIG.anonKey },
            body: JSON.stringify({ project_id: API_CONFIG.projectId, action: "get", collection: "${plural}", id }),
          });
          const json = await resp.json();
          setItem(json.data);
        } else {
          await new Promise(r => setTimeout(r, 200));
          const found = mock${name}s.find(i => i.id === id);
          setItem(found || null);
        }
      } catch { setItem(null); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  return { ${entity.pluralName.slice(0, -1) || "item"}: item, loading };
}
`;
}

function generateDataContext(domainModel: DomainModel): string {
  const imports = domainModel.entities.map(e =>
    `import { use${e.name}s } from "../hooks/use${e.name}";`
  ).join("\n");

  const contextFields = domainModel.entities.map(e =>
    `  ${e.pluralName}: use${e.name}s(),`
  ).join("\n");

  const typeHints = domainModel.entities.map(e =>
    `  ${e.pluralName}: ReturnType<typeof use${e.name}s>;`
  ).join("\n");

  return `import React, { createContext, useContext } from "react";
${imports}

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const data = {
${contextFields}
  };

  return (
    <DataContext.Provider value={data}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
`;
}

function generateApiConfig(projectId: string, apiBase: string, anonKey: string): string {
  return `/**
 * API Configuration — dual-layer backend setup.
 * Set useRealApi to true to use the real Data API instead of mock data.
 */
export const API_CONFIG = {
  useRealApi: typeof window !== "undefined" && window.__PROJECT_CONFIG__?.useRealApi === true,
  projectId: "${projectId}",
  apiBase: "${apiBase}",
  anonKey: "${anonKey}",
};
`;
}
