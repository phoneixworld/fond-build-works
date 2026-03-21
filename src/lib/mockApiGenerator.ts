// src/lib/mockApiGenerator.ts

import type { IR } from "./ir";

/**
 * Generates mock API files for each entity in the IR.
 * These are simple in-memory CRUD services.
 */
export function generateMockApiFiles(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const [entityName, entity] of Object.entries(ir.entities)) {
    const filePath = `/lib/mockApi/${entityName.toLowerCase()}.js`;
    files[filePath] = generateMockApi(entityName, entity.fields);
  }

  return files;
}

function generateMockApi(entityName: string, fields: any): string {
  const varName = entityName.toLowerCase() + "Data";

  return `
let ${varName} = [
  {
    id: "1",
${Object.keys(fields)
  .map((f) => `    ${f}: "${f} sample"`)
  .join(",\n")}
  }
];

export async function list${entityName}s() {
  return ${varName};
}

export async function get${entityName}(id) {
  return ${varName}.find(item => item.id === id);
}

export async function create${entityName}(input) {
  const next = { id: String(Date.now()), ...input };
  ${varName}.push(next);
  return next;
}

export async function update${entityName}(id, input) {
  const idx = ${varName}.findIndex(item => item.id === id);
  if (idx === -1) return null;
  ${varName}[idx] = { ...${varName}[idx], ...input };
  return ${varName}[idx];
}

export async function delete${entityName}(id) {
  ${varName} = ${varName}.filter(item => item.id !== id);
  return true;
}
`.trim();
}
