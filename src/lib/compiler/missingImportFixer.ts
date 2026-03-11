/**
 * Build Compiler v1.0 — Missing Import Auto-Injector
 * 
 * Deterministic pass: detects usage of known identifiers (clsx, React, hooks, etc.)
 * without a corresponding import statement, and injects the import.
 * Also fixes provider ordering in App.jsx.
 */

import type { Workspace } from "./workspace";

// ─── Known Import Map ─────────────────────────────────────────────────────

interface KnownImport {
  /** Regex to detect usage in code */
  usagePattern: RegExp;
  /** Regex to detect existing import */
  importPattern: RegExp;
  /** The import statement to inject (may be a function of file path) */
  importStatement: string | ((filePath: string) => string);
}

/**
 * Compute relative path from a source file to a target file in the workspace.
 * E.g. from "/pages/Auth/LoginPage.jsx" to "/lib/utils" → "../../lib/utils"
 */
function computeRelativePath(fromFile: string, toFile: string): string {
  const fromParts = fromFile.split("/").slice(1, -1); // directory parts
  const toParts = toFile.split("/").slice(1); // full path without leading /
  
  // Find common prefix length
  let common = 0;
  while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
    common++;
  }
  
  const ups = fromParts.length - common;
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  return prefix + toParts.slice(common).join("/");
}

const KNOWN_IMPORTS: KnownImport[] = [
  // ── Libraries ──
  {
    usagePattern: /\bclsx\s*\(/,
    importPattern: /import\s+(?:clsx|{[^}]*clsx[^}]*})\s+from\s+['"]clsx['"]/,
    importStatement: `import clsx from "clsx";`,
  },
  {
    usagePattern: /\bReact\b/,
    importPattern: /import\s+React/,
    importStatement: `import React from "react";`,
  },
  // ── React hooks ──
  {
    usagePattern: /\buseState\b/,
    importPattern: /import\s+(?:React\s*,\s*\{[^}]*\buseState\b[^}]*\}|\{[^}]*\buseState\b[^}]*\})\s+from\s+['"]react['"]/,
    importStatement: () => `import { useState } from "react";`,
  },
  {
    usagePattern: /\buseEffect\b/,
    importPattern: /import\s+(?:React\s*,\s*\{[^}]*\buseEffect\b[^}]*\}|\{[^}]*\buseEffect\b[^}]*\})\s+from\s+['"]react['"]/,
    importStatement: `import { useEffect } from "react";`,
  },
  {
    usagePattern: /\buseCallback\b/,
    importPattern: /import\s+(?:React\s*,\s*\{[^}]*\buseCallback\b[^}]*\}|\{[^}]*\buseCallback\b[^}]*\})\s+from\s+['"]react['"]/,
    importStatement: `import { useCallback } from "react";`,
  },
  {
    usagePattern: /\buseContext\b/,
    importPattern: /import\s+(?:React\s*,\s*\{[^}]*\buseContext\b[^}]*\}|\{[^}]*\buseContext\b[^}]*\})\s+from\s+['"]react['"]/,
    importStatement: `import { useContext } from "react";`,
  },
  {
    usagePattern: /\buseRef\b/,
    importPattern: /import\s+(?:React\s*,\s*\{[^}]*\buseRef\b[^}]*\}|\{[^}]*\buseRef\b[^}]*\})\s+from\s+['"]react['"]/,
    importStatement: `import { useRef } from "react";`,
  },
  {
    usagePattern: /\buseMemo\b/,
    importPattern: /import\s+(?:React\s*,\s*\{[^}]*\buseMemo\b[^}]*\}|\{[^}]*\buseMemo\b[^}]*\})\s+from\s+['"]react['"]/,
    importStatement: `import { useMemo } from "react";`,
  },
  // ── Utility: cn ──
  {
    usagePattern: /\bcn\s*\(/,
    importPattern: /import\s+(?:{[^}]*\bcn\b[^}]*}|cn)\s+from/,
    importStatement: (filePath: string) => {
      const relPath = computeRelativePath(filePath, "/lib/utils");
      return `import { cn } from "${relPath}";`;
    },
  },
];

// ─── Main Function ────────────────────────────────────────────────────────

/**
 * Scan every JS/JSX file in workspace and inject missing imports
 * for well-known identifiers. Merges React hook imports into a single line.
 * Returns the number of imports injected.
 */
export function fixMissingImports(workspace: Workspace): number {
  let totalFixed = 0;

  for (const filePath of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) continue;

    let content = workspace.getFile(filePath)!;
    let modified = false;

    // Collect React hooks that need importing
    const missingReactHooks: string[] = [];

    for (const known of KNOWN_IMPORTS) {
      if (!known.usagePattern.test(content)) continue;
      if (known.importPattern.test(content)) continue;

      const importStmt = typeof known.importStatement === "function"
        ? known.importStatement(filePath)
        : known.importStatement;

      // Check if this is a React hook import — collect for merging
      const hookMatch = importStmt.match(/^import\s*\{\s*(\w+)\s*\}\s*from\s*["']react["'];?$/);
      if (hookMatch) {
        missingReactHooks.push(hookMatch[1]);
        continue;
      }

      content = injectImportStatement(content, importStmt);
      modified = true;
      totalFixed++;

      console.log(`[MissingImportFixer] 📥 Injected "${importStmt.trim()}" into ${filePath}`);
    }

    // Merge all missing React hooks into one import or extend existing
    if (missingReactHooks.length > 0) {
      const existingReactImport = content.match(/^(import\s*\{([^}]*)\}\s*from\s*["']react["'];?\s*)$/m);
      if (existingReactImport) {
        const existingHooks = existingReactImport[2].split(",").map(s => s.trim()).filter(Boolean);
        const allHooks = [...new Set([...existingHooks, ...missingReactHooks])];
        const newImport = `import { ${allHooks.join(", ")} } from "react";`;
        content = content.replace(existingReactImport[0].trim(), newImport);
      } else {
        const newImport = `import { ${missingReactHooks.join(", ")} } from "react";`;
        content = injectImportStatement(content, newImport);
      }
      modified = true;
      totalFixed += missingReactHooks.length;
      console.log(`[MissingImportFixer] 📥 Injected React hooks {${missingReactHooks.join(", ")}} into ${filePath}`);
    }

    if (modified) {
      workspace.updateFile(filePath, content);
    }
  }

  return totalFixed;
}

// ─── Provider Ordering Fix ────────────────────────────────────────────────

/**
 * Checks and fixes provider ordering in App.jsx.
 * Ensures ToastProvider wraps AuthProvider (since AuthProvider uses useToast).
 * Returns true if a fix was applied.
 */
export function fixProviderOrdering(workspace: Workspace): boolean {
  const appPath = ["/App.jsx", "/App.tsx", "/App.js"].find(p => workspace.hasFile(p));
  if (!appPath) return false;

  let content = workspace.getFile(appPath)!;

  const authOuterPattern = /<AuthProvider[\s>][\s\S]*?<ToastProvider[\s>]/;
  const toastOuterPattern = /<ToastProvider[\s>][\s\S]*?<AuthProvider[\s>]/;

  if (authOuterPattern.test(content) && !toastOuterPattern.test(content)) {
    content = swapProviderNames(content, "AuthProvider", "ToastProvider");
    workspace.updateFile(appPath, content);
    console.log(`[MissingImportFixer] 🔄 Fixed provider ordering in ${appPath}: ToastProvider now wraps AuthProvider`);
    return true;
  }

  return false;
}

/**
 * Swap two provider tag names at their positions using a placeholder strategy.
 * outerName becomes innerName and innerName becomes outerName (swapping nesting).
 */
function swapProviderNames(code: string, outerName: string, innerName: string): string {
  let result = code;

  // Step 1: Replace outerName tags → placeholder
  result = result.replace(new RegExp(`<${outerName}([ >])`, "g"), `<__SWAP_A__$1`);
  result = result.replace(new RegExp(`</${outerName}>`, "g"), `</__SWAP_A__>`);

  // Step 2: Replace innerName tags → outerName
  result = result.replace(new RegExp(`<${innerName}([ >])`, "g"), `<${outerName}$1`);
  result = result.replace(new RegExp(`</${innerName}>`, "g"), `</${outerName}>`);

  // Step 3: Replace placeholder → innerName
  result = result.replace(/<__SWAP_A__([ >])/g, `<${innerName}$1`);
  result = result.replace(/<\/__SWAP_A__>/g, `</${innerName}>`);

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function injectImportStatement(content: string, importStmt: string): string {
  const lines = content.split("\n");
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) {
      lastImportIndex = i;
    }
  }

  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importStmt);
  } else {
    lines.unshift(importStmt);
  }

  return lines.join("\n");
}
