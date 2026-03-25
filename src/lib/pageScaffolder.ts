// src/lib/pageScaffolder.ts

import type { IR, IRPage } from "./ir";

/**
 * Generates deterministic Shadcn-based page scaffolds from the IR.
 * 
 * All pages now support Two-Phase Rendering:
 * - Accept { data, isHydrated } props
 * - Phase 1: Render with stub data (isHydrated=false)  
 * - Phase 2: Render with real data (isHydrated=true)
 * - Subcomponents handle placeholder rendering when !isHydrated
 */
export function scaffoldPagesFromIR(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const page of ir.pages) {
    const safeName = page.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || page.name;
    const filePath = `/pages/${safeName}.tsx`;
    files[filePath] = scaffoldPage(page, ir);
  }

  return files;
}

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

export default function ${page.name}({ data, isHydrated }) {
  const { items: contextItems, loading, createItem } = ${hookName}();

  // Two-phase: use prop data in stub phase, context data when hydrated
  const items = isHydrated ? contextItems : (data?.items || []);
  const isReady = isHydrated && !loading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="${title}"
        subtitle="Manage all ${title.toLowerCase()} in the system"
        actions={<Button onClick={() => createItem()} disabled={!isHydrated}>Add ${entity}</Button>}
      />

      <Card className="p-4">
        <SearchFilterBar
          onSearch={() => {}}
          onFilter={() => {}}
          addLabel="Add ${entity}"
          onAdd={() => createItem()}
        />

        <DataTable
          data={items}
          loading={!isReady}
          className={!isHydrated ? "opacity-60 transition-opacity" : "transition-opacity"}
        />
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

export default function ${page.name}({ data, isHydrated }) {
  const { item: contextItem, loading } = ${hookName}();

  // Two-phase: use prop data in stub phase, context data when hydrated
  const item = isHydrated ? contextItem : (data?.item || {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="${title} Details" />

      <Card className={\`p-6 space-y-4 \${!isHydrated ? "opacity-60" : ""} transition-opacity\`}>
        {Object.entries(item || {}).map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <span className="font-medium">{key}</span>
            <span>{isHydrated ? String(value) : "—"}</span>
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
            disabled={!isHydrated}
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

export default function ${page.name}({ data, isHydrated }) {
  const { item: contextItem, saveItem } = ${hookName}();

  // Two-phase: use prop data in stub phase, context data when hydrated
  const item = isHydrated ? contextItem : (data?.item || {});
  const [form, setForm] = useState(item || {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="${title}" />

      <Card className={\`p-6 space-y-6 \${!isHydrated ? "opacity-60" : ""} transition-opacity\`}>
${fields}

        <Button onClick={() => saveItem(form)} disabled={!isHydrated}>
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

export default function ${page.name}({ data, isHydrated }) {
  // Two-phase: show placeholder stats in stub phase
  const stats = isHydrated
    ? [
        { label: "Users", value: "1,204", trend: "+12%" },
        { label: "Sessions", value: "8,932", trend: "+5%" },
        { label: "Conversions", value: "312", trend: "+3%" },
        { label: "Revenue", value: "$12,430", trend: "+8%" },
      ]
    : (data?.stats || [
        { label: "—", value: "—", trend: "" },
        { label: "—", value: "—", trend: "" },
        { label: "—", value: "—", trend: "" },
        { label: "—", value: "—", trend: "" },
      ]);

  return (
    <div className={\`flex flex-col gap-6 \${!isHydrated ? "opacity-60" : ""} transition-opacity\`}>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your application"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <StatCard key={i} label={s.label} value={s.value} trend={s.trend} />
        ))}
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

export default function ${page.name}({ data, isHydrated }) {
  return (
    <div className={\`p-4 \${!isHydrated ? "opacity-60" : ""} transition-opacity\`}>
      ${page.name}
    </div>
  );
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
