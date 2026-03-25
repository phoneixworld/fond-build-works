import type { IR, IREntity } from "./ir";

/**
 * Deterministic entity scaffolder — generates mock API + context files
 * for every entity in the IR, BEFORE any model code streams.
 */
export function scaffoldEntitiesFromIR(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const [entityName, entityDef] of Object.entries(ir.entities)) {
    const lower = entityName.toLowerCase();
    const fields = Object.keys(entityDef.fields);

    // Mock API
    files[`/lib/mockApi/${lower}.ts`] = generateMockApi(entityName, entityDef, fields);

    // Context + Provider + hook
    files[`/contexts/${entityName}Context.tsx`] = generateContext(entityName, lower);
  }

  // Domain provider that wraps all entity providers
  if (Object.keys(ir.entities).length > 0) {
    files["/contexts/DomainProvider.jsx"] = generateDomainProvider(Object.keys(ir.entities));
  }

  return files;
}

function generateMockApi(entityName: string, entity: IREntity, fields: string[]): string {
  const lower = entityName.toLowerCase();
  const plural = lower.endsWith("s") ? lower : `${lower}s`;

  const seedFields = fields
    .map(f => {
      const fieldDef = entity.fields[f];
      const val = fieldDef.type === "number" ? "0"
        : fieldDef.type === "boolean" ? "false"
        : fieldDef.type === "date" ? `new Date().toISOString()`
        : `""`;
      return `  ${f}: ${val}`;
    })
    .join(",\n");

  return `// Auto-generated mock API for ${entityName}
let ${plural} = [];

export async function list${entityName}s() {
  return [...${plural}];
}

export async function get${entityName}(id) {
  return ${plural}.find(item => item.id === id) || null;
}

export async function create${entityName}(input) {
  const item = {
    id: String(Date.now()),
${seedFields ? seedFields + ",\n" : ""}    ...input,
    createdAt: new Date().toISOString(),
  };
  ${plural}.push(item);
  return item;
}

export async function update${entityName}(id, updates) {
  const idx = ${plural}.findIndex(item => item.id === id);
  if (idx === -1) return null;
  ${plural}[idx] = { ...${plural}[idx], ...updates, updatedAt: new Date().toISOString() };
  return ${plural}[idx];
}

export async function delete${entityName}(id) {
  const idx = ${plural}.findIndex(item => item.id === id);
  if (idx === -1) return false;
  ${plural}.splice(idx, 1);
  return true;
}
`;
}

function generateContext(entityName: string, lower: string): string {
  const plural = lower.endsWith("s") ? lower : `${lower}s`;

  return `import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  list${entityName}s,
  create${entityName},
  update${entityName},
  delete${entityName},
} from "../lib/mockApi/${lower}";

const ${entityName}Context = createContext({
  items: [],
  loading: false,
  error: null,
  createItem: async () => {},
  updateItem: async () => {},
  deleteItem: async () => {},
  refresh: async () => {},
});

export function ${entityName}Provider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await list${entityName}s();
      setItems(data);
    } catch (err) {
      setError(err.message || "Failed to load ${plural}");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createItem = useCallback(async (input) => {
    const item = await create${entityName}(input || {});
    setItems(prev => [...prev, item]);
    return item;
  }, []);

  const updateItem = useCallback(async (id, updates) => {
    const updated = await update${entityName}(id, updates);
    if (updated) {
      setItems(prev => prev.map(i => (i.id === id ? updated : i)));
    }
    return updated;
  }, []);

  const deleteItem = useCallback(async (id) => {
    const ok = await delete${entityName}(id);
    if (ok) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
    return ok;
  }, []);

  return (
    <${entityName}Context.Provider value={{ items, loading, error, createItem, updateItem, deleteItem, refresh }}>
      {children}
    </${entityName}Context.Provider>
  );
}

export function use${entityName}s() {
  return useContext(${entityName}Context);
}
`;
}

function generateDomainProvider(entityNames: string[]): string {
  const imports = entityNames
    .map(e => `import { ${e}Provider } from "./${e}Context";`)
    .join("\n");

  // Nest providers: outermost first
  let inner = "{children}";
  for (const e of [...entityNames].reverse()) {
    inner = `<${e}Provider>${inner}</${e}Provider>`;
  }

  return `import React from "react";
${imports}

export default function DomainProvider({ children }) {
  return (
    ${inner}
  );
}
`;
}
