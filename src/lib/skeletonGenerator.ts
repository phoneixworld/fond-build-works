// src/lib/skeletonGenerator.ts

import type { IR, IRPage } from "./ir";

/**
 * Generates skeleton components for every page in the IR.
 * Skeletons render immediately (0–50ms) before data is available.
 * Layout matches the final page structure with shimmer animations.
 */
export function generateSkeletonFiles(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  for (const page of ir.pages) {
    const safeName = page.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || page.name;
    files[`/components/skeletons/${safeName}Skeleton.jsx`] = generateSkeleton(page);
  }

  // Global loading/thinking screen
  files["/components/skeletons/ThinkingScreen.jsx"] = generateThinkingScreen();

  return files;
}

function generateSkeleton(page: IRPage): string {
  switch (page.type) {
    case "dashboard":
      return dashboardSkeleton(page.name);
    case "list":
      return listSkeleton(page.name);
    case "view":
      return viewSkeleton(page.name);
    case "create":
    case "edit":
      return formSkeleton(page.name);
    default:
      return blankSkeleton(page.name);
  }
}

/* -------------------------------------------------------------------------- */
/*                            SHIMMER BASE                                     */
/* -------------------------------------------------------------------------- */

const SHIMMER_CLASS = `"animate-pulse bg-muted rounded"`;

function shimmerBlock(w: string, h: string, extra = ""): string {
  return `<div className=${SHIMMER_CLASS} style={{ width: "${w}", height: "${h}" }}${extra ? ` ${extra}` : ""} />`;
}

/* -------------------------------------------------------------------------- */
/*                           DASHBOARD SKELETON                                */
/* -------------------------------------------------------------------------- */

function dashboardSkeleton(name: string): string {
  return `
import React from "react";

function ${name}Skeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header placeholder */}
      <div className="flex items-center justify-between">
        <div>
          <div className="animate-pulse bg-muted rounded h-8 w-48 mb-2" />
          <div className="animate-pulse bg-muted rounded h-4 w-64" />
        </div>
        <div className="animate-pulse bg-muted rounded h-10 w-32" />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6">
            <div className="animate-pulse bg-muted rounded h-4 w-20 mb-3" />
            <div className="animate-pulse bg-muted rounded h-8 w-24 mb-2" />
            <div className="animate-pulse bg-muted rounded h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-6">
          <div className="animate-pulse bg-muted rounded h-4 w-32 mb-4" />
          <div className="animate-pulse bg-muted rounded h-48 w-full" />
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="animate-pulse bg-muted rounded h-4 w-32 mb-4" />
          <div className="animate-pulse bg-muted rounded h-48 w-full" />
        </div>
      </div>

      {/* Activity table */}
      <div className="rounded-lg border bg-card p-6">
        <div className="animate-pulse bg-muted rounded h-4 w-40 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
            <div className="animate-pulse bg-muted rounded-full h-8 w-8" />
            <div className="animate-pulse bg-muted rounded h-4 w-48" />
            <div className="animate-pulse bg-muted rounded h-4 w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ${name}Skeleton;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                              LIST SKELETON                                  */
/* -------------------------------------------------------------------------- */

function listSkeleton(name: string): string {
  return `
import React from "react";

function ${name}Skeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="animate-pulse bg-muted rounded h-8 w-48 mb-2" />
          <div className="animate-pulse bg-muted rounded h-4 w-64" />
        </div>
        <div className="animate-pulse bg-muted rounded h-10 w-32" />
      </div>

      {/* Search/filter bar */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="animate-pulse bg-muted rounded h-10 flex-1" />
          <div className="animate-pulse bg-muted rounded h-10 w-24" />
          <div className="animate-pulse bg-muted rounded h-10 w-24" />
        </div>

        {/* Table header */}
        <div className="flex items-center gap-4 py-3 border-b border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-muted rounded h-4 flex-1" />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
            <div className="animate-pulse bg-muted rounded-full h-8 w-8 shrink-0" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="animate-pulse bg-muted rounded h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="animate-pulse bg-muted rounded h-4 w-32" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-muted rounded h-8 w-8" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ${name}Skeleton;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                              VIEW SKELETON                                  */
/* -------------------------------------------------------------------------- */

function viewSkeleton(name: string): string {
  return `
import React from "react";

function ${name}Skeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="animate-pulse bg-muted rounded h-8 w-56 mb-2" />
          <div className="animate-pulse bg-muted rounded h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <div className="animate-pulse bg-muted rounded h-10 w-20" />
          <div className="animate-pulse bg-muted rounded h-10 w-20" />
        </div>
      </div>

      {/* Detail card */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
            <div className="animate-pulse bg-muted rounded h-4 w-28" />
            <div className="animate-pulse bg-muted rounded h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ${name}Skeleton;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                              FORM SKELETON                                  */
/* -------------------------------------------------------------------------- */

function formSkeleton(name: string): string {
  return `
import React from "react";

function ${name}Skeleton() {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="animate-pulse bg-muted rounded h-8 w-40 mb-2" />
        <div className="animate-pulse bg-muted rounded h-4 w-56" />
      </div>

      {/* Form card */}
      <div className="rounded-lg border bg-card p-6 space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="animate-pulse bg-muted rounded h-4 w-24" />
            <div className="animate-pulse bg-muted rounded h-10 w-full" />
          </div>
        ))}

        <div className="flex gap-3 pt-4">
          <div className="animate-pulse bg-muted rounded h-10 w-24" />
          <div className="animate-pulse bg-muted rounded h-10 w-20" />
        </div>
      </div>
    </div>
  );
}

export default ${name}Skeleton;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                              BLANK SKELETON                                 */
/* -------------------------------------------------------------------------- */

function blankSkeleton(name: string): string {
  return `
import React from "react";

function ${name}Skeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 animate-fade-in">
      <div className="animate-pulse bg-muted rounded h-8 w-48 mb-2" />
      <div className="animate-pulse bg-muted rounded h-4 w-full" />
      <div className="animate-pulse bg-muted rounded h-4 w-3/4" />
      <div className="animate-pulse bg-muted rounded h-64 w-full mt-4" />
    </div>
  );
}

export default ${name}Skeleton;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                          THINKING SCREEN                                    */
/* -------------------------------------------------------------------------- */

function generateThinkingScreen(): string {
  return `
import React, { useState, useEffect } from "react";

function ThinkingScreen() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? "" : prev + ".");
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[400px] animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-muted border-t-primary animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">
            Nimbus is preparing{dots}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Setting up your workspace
          </p>
        </div>
      </div>
    </div>
  );
}

export default ThinkingScreen;
`.trim();
}
