/**
 * Two-Pass Build Strategy v1.0
 * 
 * Pass 1 (Structure): Generate correct structure, data flow, routing, components
 * Pass 2 (Polish): Improve spacing, hierarchy, animations, empty states, skeletons, responsive
 * 
 * The polish pass runs deterministically on generated files WITHOUT calling the AI model,
 * applying automated transformations for consistent quality.
 */

import type { Workspace } from "./workspace";

/**
 * Apply Pass 2 polish transformations to the workspace.
 * This is a deterministic pass — no AI calls needed.
 */
export function applyPolishPass(workspace: Workspace): PolishResult {
  const result: PolishResult = {
    filesPolished: 0,
    animationsAdded: 0,
    emptyStatesAdded: 0,
    skeletonsAdded: 0,
    responsiveFixes: 0,
  };

  const files = workspace.listFiles();

  for (const path of files) {
    // Only polish page and component files
    if (!isPolishable(path)) continue;

    const content = workspace.getFile(path);
    if (!content) continue;

    let modified = content;
    let changed = false;

    // 1. Ensure page containers have animate-fade-in
    if (isPageFile(path)) {
      const res = ensurePageAnimation(modified);
      if (res.changed) { modified = res.content; changed = true; result.animationsAdded++; }
    }

    // 2. Add stagger class to grid parents
    {
      const res = addStaggerToGrids(modified);
      if (res.changed) { modified = res.content; changed = true; result.animationsAdded += res.count; }
    }

    // 3. Add hover-lift to interactive cards
    {
      const res = addHoverLiftToCards(modified);
      if (res.changed) { modified = res.content; changed = true; result.animationsAdded += res.count; }
    }

    // 4. Ensure responsive grid classes
    {
      const res = ensureResponsiveGrids(modified);
      if (res.changed) { modified = res.content; changed = true; result.responsiveFixes += res.count; }
    }

    if (changed) {
      workspace.updateFile(path, modified);
      result.filesPolished++;
    }
  }

  return result;
}

export interface PolishResult {
  filesPolished: number;
  animationsAdded: number;
  emptyStatesAdded: number;
  skeletonsAdded: number;
  responsiveFixes: number;
}

function isPolishable(path: string): boolean {
  return (
    (path.endsWith(".tsx") || path.endsWith(".jsx")) &&
    !path.startsWith("/components/ui/") &&
    !path.includes("/utils/") &&
    !path.includes("/services/") &&
    !path.includes("/hooks/")
  );
}

function isPageFile(path: string): boolean {
  return path.startsWith("/pages/") || path.endsWith("Page.tsx") || path.endsWith("Page.jsx");
}

/** Ensure the outermost div in a page component has animate-fade-in */
function ensurePageAnimation(content: string): { content: string; changed: boolean } {
  // Already has it
  if (content.includes("animate-fade-in")) return { content, changed: false };

  // Find the return statement's opening div
  const returnDivMatch = content.match(/(return\s*\(\s*<div\s+className=")/);
  if (returnDivMatch && returnDivMatch.index != null) {
    const idx = returnDivMatch.index + returnDivMatch[0].length;
    const modified = content.slice(0, idx) + "animate-fade-in " + content.slice(idx);
    return { content: modified, changed: true };
  }

  return { content, changed: false };
}

/** Add stagger class to grid container divs that don't already have it */
function addStaggerToGrids(content: string): { content: string; changed: boolean; count: number } {
  let count = 0;
  // Match grid divs without stagger
  const modified = content.replace(
    /className="((?:(?!stagger)[^"])*grid\s+grid-cols-[^"]*?)"/g,
    (match, classes) => {
      if (classes.includes("stagger")) return match;
      count++;
      return `className="${classes} stagger"`;
    }
  );
  return { content: modified, changed: count > 0, count };
}

/** Add hover-lift to Card components that are inside map() loops (likely clickable) */
function addHoverLiftToCards(content: string): { content: string; changed: boolean; count: number } {
  let count = 0;
  // Only add hover-lift to Cards inside .map() patterns
  if (!content.includes(".map(")) return { content, changed: false, count: 0 };

  const modified = content.replace(
    /<Card\s+className="((?:(?!hover-lift)[^"])*?)"/g,
    (match, classes) => {
      if (classes.includes("hover-lift") || classes.includes("hover:")) return match;
      count++;
      return `<Card className="${classes} hover-lift"`;
    }
  );
  return { content: modified, changed: count > 0, count };
}

/** Ensure grid-cols-N patterns have responsive breakpoints */
function ensureResponsiveGrids(content: string): { content: string; changed: boolean; count: number } {
  let count = 0;
  
  // Fix bare grid-cols-4 without responsive prefixes
  const modified = content.replace(
    /className="([^"]*?)(?<!\w:)grid-cols-4(?!\s+sm:)([^"]*?)"/g,
    (match, before, after) => {
      // Already has responsive classes
      if (match.includes("sm:grid-cols") || match.includes("lg:grid-cols")) return match;
      count++;
      return `className="${before}grid-cols-1 sm:grid-cols-2 lg:grid-cols-4${after}"`;
    }
  );

  // Fix bare grid-cols-3 without responsive prefixes
  const modified2 = modified.replace(
    /className="([^"]*?)(?<!\w:)grid-cols-3(?!\s+sm:)([^"]*?)"/g,
    (match, before, after) => {
      if (match.includes("sm:grid-cols") || match.includes("lg:grid-cols")) return match;
      count++;
      return `className="${before}grid-cols-1 sm:grid-cols-2 lg:grid-cols-3${after}"`;
    }
  );

  return { content: modified2, changed: count > 0, count };
}
