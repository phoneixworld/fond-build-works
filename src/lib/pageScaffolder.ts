// src/lib/pageScaffolder.ts

import type { IR, IRPage } from "./ir";

/**
 * Generates deterministic Shadcn-based page scaffolds from the IR.
 * These files are created BEFORE the model runs, ensuring:
 * - No missing imports
 * - No broken JSX
 * - No empty pages
 * - No inconsistent structure
 *
 * The model can refine these pages later, but the skeleton is always correct.
 */
export function scaffoldPagesFromIR(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const page of ir.pages) {
    // Sanitize: "News & Events" → "NewsEvents.jsx"
    const safeName = page.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || page.name;
    const filePath = `/pages/${safeName}.jsx`;
    files[filePath] = scaffoldPage(page, ir);
  }

  return files;
}

/**
 * Dispatch to the correct scaffold generator.
 */
function scaffoldPage(page: IRPage, ir: IR): string {
  switch (page.type) {
    case "list":
      return scaffoldListPage(page, ir);
    case "view":
      return scaffoldViewPage(page, ir);
    case "create":
    case "edit":
      return scaffoldFormPage(page, ir);
    case "dashboard":
      return scaffoldDashboardPage(page, ir);
    default:
      return scaffoldBlankPage(page);
  }
}

/* -------------------------------------------------------------------------- */
/*                                LIST PAGE                                   */
/* -------------------------------------------------------------------------- */

function scaffoldListPage(page: IRPage, ir: IR): string {
  const entity = page.entity!;
  const entityPlural = plural(entity);
  const hookName = `use${entityPlural}`;
  const title = humanize(entityPlural);

  return `
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/domain/DataTable";
import { PageHeader } from "@/components/domain/PageHeader";
import { SearchFilterBar } from "@/components/domain/SearchFilterBar";
import { ${hookName} } from "@/contexts/${entity}Context";

export default function ${page.name}() {
  const { items, loading, createItem } = ${hookName}();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="${title}"
        subtitle="Manage all ${title.toLowerCase()} in the system"
        actions={<Button onClick={() => createItem()}>Add ${entity}</Button>}
      />

      <Card className="p-4">
        <SearchFilterBar
          onSearch={() => {}}
          onFilter={() => {}}
          addLabel="Add ${entity}"
          onAdd={() => createItem()}
        />

        <DataTable data={items} loading={loading} />
      </Card>
    </div>
  );
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                                VIEW PAGE                                   */
/* -------------------------------------------------------------------------- */

function scaffoldViewPage(page: IRPage, ir: IR): string {
  const entity = page.entity!;
  const hookName = `use${entity}`;
  const title = humanize(entity);

  return `
import React from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/PageHeader";
import { ${hookName} } from "@/contexts/${entity}Context";

export default function ${page.name}() {
  const { item, loading } = ${hookName}();

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="${title} Details" />

      <Card className="p-6 space-y-4">
        {Object.entries(item || {}).map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <span className="font-medium">{key}</span>
            <span>{String(value)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                                FORM PAGE                                   */
/* -------------------------------------------------------------------------- */

function scaffoldFormPage(page: IRPage, ir: IR): string {
  const entity = page.entity!;
  const hookName = `use${entity}`;
  const title = page.type === "create" ? `Create ${entity}` : `Edit ${entity}`;

  const fields = Object.entries(ir.entities[entity].fields)
    .map(([name, field]) => {
      return `
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">${humanize(name)}</label>
          <Input
            name="${name}"
            placeholder="Enter ${humanize(name)}"
            value={form.${name} || ""}
            onChange={e => setForm({ ...form, ${name}: e.target.value })}
          />
        </div>
      `;
    })
    .join("\n");

  return `
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/PageHeader";
import { ${hookName} } from "@/contexts/${entity}Context";

export default function ${page.name}() {
  const { item, saveItem } = ${hookName}();
  const [form, setForm] = useState(item || {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="${title}" />

      <Card className="p-6 space-y-6">
${fields}

        <Button onClick={() => saveItem(form)}>
          Save
        </Button>
      </Card>
    </div>
  );
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                              DASHBOARD PAGE                                */
/* -------------------------------------------------------------------------- */

function scaffoldDashboardPage(page: IRPage, ir: IR): string {
  return `
import React from "react";
import { StatCard } from "@/components/domain/StatCard";
import { ActivityFeed } from "@/components/domain/ActivityFeed";
import { QuickActions } from "@/components/domain/QuickActions";
import { PageHeader } from "@/components/domain/PageHeader";

export default function ${page.name}() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your application"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Users" value="1,204" trend="+12%" />
        <StatCard label="Sessions" value="8,932" trend="+5%" />
        <StatCard label="Conversions" value="312" trend="+3%" />
        <StatCard label="Revenue" value="$12,430" trend="+8%" />
      </div>

      <QuickActions />

      <ActivityFeed />
    </div>
  );
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                                BLANK PAGE                                  */
/* -------------------------------------------------------------------------- */

function scaffoldBlankPage(page: IRPage): string {
  return `
import React from "react";

export default function ${page.name}() {
  return <div className="p-4">${page.name}</div>;
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                                HELPERS                                     */
/* -------------------------------------------------------------------------- */

function plural(name: string): string {
  return name.endsWith("s") ? name : `${name}s`;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
