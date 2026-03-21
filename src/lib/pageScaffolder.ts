import type { IR, IRPage, IREntity } from "./ir";

/**
 * Deterministic page scaffolder — generates page files from IR
 * BEFORE any model code is streamed. This ensures the workspace
 * always has valid, importable page files that match the IR manifest.
 */
export function scaffoldPagesFromIR(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const page of ir.pages) {
    const filePath = `/pages/${page.name}.jsx`;
    files[filePath] = scaffoldPage(page, ir);
  }

  return files;
}

function scaffoldPage(page: IRPage, ir: IR): string {
  if (page.type === "list" && page.entity) {
    return scaffoldListPage(page, ir);
  }
  if (page.type === "dashboard") {
    return scaffoldDashboardPage(page, ir);
  }
  if (page.type === "create" && page.entity) {
    return scaffoldFormPage(page, ir, "create");
  }
  if (page.type === "edit" && page.entity) {
    return scaffoldFormPage(page, ir, "edit");
  }
  if (page.type === "view" && page.entity) {
    return scaffoldViewPage(page, ir);
  }
  return scaffoldFallbackPage(page);
}

function scaffoldListPage(page: IRPage, ir: IR): string {
  const entity = page.entity!;
  const entityDef = ir.entities[entity];
  const fields = entityDef ? Object.keys(entityDef.fields) : ["name"];
  const title = entity.endsWith("s") ? entity : `${entity}s`;

  const columnHeaders = fields
    .map(f => `            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">${capitalize(f)}</th>`)
    .join("\n");

  const columnCells = fields
    .map(f => `              <td className="px-4 py-3 text-sm">{item.${f}}</td>`)
    .join("\n");

  return `import React, { useState } from "react";

export default function ${page.name}() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");

  const filtered = items.filter(item =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${title}</h1>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90">
          New ${entity}
        </button>
      </div>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 border rounded-md"
      />

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
${columnHeaders}
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={${fields.length + 1}} className="px-4 py-8 text-center text-muted-foreground">
                  No ${title.toLowerCase()} found
                </td>
              </tr>
            ) : (
              filtered.map((item, i) => (
                <tr key={i} className="hover:bg-muted/50">
${columnCells}
                  <td className="px-4 py-3 text-sm">
                    <button className="text-primary hover:underline">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}`;
}

function scaffoldDashboardPage(page: IRPage, ir: IR): string {
  const entityNames = Object.keys(ir.entities);
  const statCards = entityNames
    .slice(0, 4)
    .map(
      (e, i) => `
        <div className="p-6 bg-card border rounded-lg">
          <p className="text-sm text-muted-foreground">${capitalize(e)}s</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>`
    )
    .join("");

  return `import React from "react";

export default function ${page.name}() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
${statCards}
      </div>
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <p className="text-muted-foreground">No recent activity</p>
      </div>
    </div>
  );
}`;
}

function scaffoldFormPage(page: IRPage, ir: IR, mode: "create" | "edit"): string {
  const entity = page.entity!;
  const entityDef = ir.entities[entity];
  const fields = entityDef ? Object.keys(entityDef.fields) : ["name"];
  const title = mode === "create" ? `New ${entity}` : `Edit ${entity}`;

  const formFields = fields
    .map(
      f => `
      <div>
        <label className="block text-sm font-medium mb-1">${capitalize(f)}</label>
        <input
          type="text"
          name="${f}"
          className="w-full px-3 py-2 border rounded-md"
          placeholder="Enter ${f}"
        />
      </div>`
    )
    .join("");

  return `import React from "react";

export default function ${page.name}() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">${title}</h1>
      <form className="space-y-4" onSubmit={e => e.preventDefault()}>
${formFields}
        <div className="flex gap-3 pt-4">
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90">
            ${mode === "create" ? "Create" : "Save Changes"}
          </button>
          <button type="button" className="px-4 py-2 border rounded-md hover:bg-muted">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}`;
}

function scaffoldViewPage(page: IRPage, ir: IR): string {
  const entity = page.entity!;
  const entityDef = ir.entities[entity];
  const fields = entityDef ? Object.keys(entityDef.fields) : ["name"];

  const fieldRows = fields
    .map(
      f => `
        <div>
          <dt className="text-sm text-muted-foreground">${capitalize(f)}</dt>
          <dd className="text-base font-medium mt-0.5">—</dd>
        </div>`
    )
    .join("");

  return `import React from "react";

export default function ${page.name}() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${entity} Details</h1>
        <button className="px-4 py-2 border rounded-md hover:bg-muted">Edit</button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 border rounded-lg bg-card">
${fieldRows}
      </dl>
    </div>
  );
}`;
}

function scaffoldFallbackPage(page: IRPage): string {
  return `import React from "react";

export default function ${page.name}() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">${page.name.replace(/Page$/, "")}</h1>
    </div>
  );
}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
