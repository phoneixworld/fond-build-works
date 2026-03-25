// src/lib/contextGenerator.ts

import type { IR } from "./ir";

/**
 * Generates React Context + Hooks for each entity.
 * These wrap the mock API and provide CRUD operations.
 */
export function generateContextFiles(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const entityName of Object.keys(ir.entities)) {
    const filePath = `/contexts/${entityName}Context.tsx`;
    files[filePath] = generateContext(entityName);
  }

  return files;
}

function generateContext(entityName: string): string {
  const plural = entityName.endsWith("s") ? entityName : `${entityName}s`;
  const hookPlural = `use${plural}`;
  const hookSingle = `use${entityName}`;

  return `
import React, { createContext, useContext, useState, useEffect } from "react";
import {
  list${entityName}s,
  get${entityName},
  create${entityName},
  update${entityName},
  delete${entityName}
} from "@/lib/mockApi/${entityName.toLowerCase()}";

const ${entityName}Context = createContext(null);

export function ${entityName}Provider({ children }) {
  const [items, setItems] = useState([]);
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load list on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await list${entityName}s();
      setItems(data);
      setLoading(false);
    })();
  }, []);

  const loadItem = async (id) => {
    setLoading(true);
    const data = await get${entityName}(id);
    setItem(data);
    setLoading(false);
  };

  const createItem = async (input = {}) => {
    const next = await create${entityName}(input);
    setItems(prev => [...prev, next]);
    return next;
  };

  const saveItem = async (input) => {
    if (!input.id) return createItem(input);
    const updated = await update${entityName}(input.id, input);
    setItems(prev => prev.map(i => (i.id === input.id ? updated : i)));
    return updated;
  };

  const deleteItem = async (id) => {
    await delete${entityName}(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <${entityName}Context.Provider
      value={{
        items,
        item,
        loading,
        loadItem,
        createItem,
        saveItem,
        deleteItem
      }}
    >
      {children}
    </${entityName}Context.Provider>
  );
}

export function ${hookPlural}() {
  return useContext(${entityName}Context);
}

export function ${hookSingle}() {
  return useContext(${entityName}Context);
}
`.trim();
}
