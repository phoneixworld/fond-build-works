/**
 * Build Compiler v1.0 — Missing Import Auto-Injector
 * 
 * Deterministic pass: detects usage of known identifiers (clsx, React, etc.)
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
  /** The import statement to inject */
  importStatement: string;
}

const KNOWN_IMPORTS: KnownImport[] = [
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
  {
    usagePattern: /\bcn\s*\(/,
    importPattern: /import\s+(?:{[^}]*\bcn\b[^}]*}|cn)\s+from/,
    importStatement: `import { cn } from "../lib/utils";`,
  },
];

// ─── Main Function ────────────────────────────────────────────────────────

/**
 * Scan every JS/JSX file in workspace and inject missing imports
 * for well-known identifiers. Returns the number of imports injected.
 */
export function fixMissingImports(workspace: Workspace): number {
  let totalFixed = 0;

  for (const filePath of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) continue;

    let content = workspace.getFile(filePath)!;
    let modified = false;

    for (const known of KNOWN_IMPORTS) {
      // Check if the identifier is used
      if (!known.usagePattern.test(content)) continue;
      // Check if it's already imported
      if (known.importPattern.test(content)) continue;

      // Inject at the top (after existing imports)
      content = injectImportStatement(content, known.importStatement);
      modified = true;
      totalFixed++;

      console.log(`[MissingImportFixer] 📥 Injected "${known.importStatement.trim()}" into ${filePath}`);
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

  // Detect the bad pattern: <AuthProvider> wrapping <ToastProvider>
  // i.e. AuthProvider is the outer one
  const authOuterPattern = /<AuthProvider[\s>][\s\S]*?<ToastProvider[\s>]/;
  const toastOuterPattern = /<ToastProvider[\s>][\s\S]*?<AuthProvider[\s>]/;

  if (authOuterPattern.test(content) && !toastOuterPattern.test(content)) {
    // AuthProvider is outside ToastProvider — this is WRONG
    // We need to swap them

    // Strategy: find the AuthProvider open/close and ToastProvider open/close
    // and swap their positions
    content = swapProviders(content, "AuthProvider", "ToastProvider");

    workspace.updateFile(appPath, content);
    console.log(`[MissingImportFixer] 🔄 Fixed provider ordering in ${appPath}: ToastProvider now wraps AuthProvider`);
    return true;
  }

  return false;
}

/**
 * Swap two nested providers so that `inner` becomes outer and `outer` becomes inner.
 * Handles the pattern where providerA wraps providerB and we want providerB to wrap providerA.
 */
function swapProviders(code: string, outerName: string, innerName: string): string {
  // Find outer provider tags
  const outerOpenRegex = new RegExp(`(\\s*)(<${outerName}[^>]*>)`);
  const outerCloseRegex = new RegExp(`(\\s*)(<\\/${outerName}>)`);
  const innerOpenRegex = new RegExp(`(\\s*)(<${innerName}[^>]*>)`);
  const innerCloseRegex = new RegExp(`(\\s*)(<\\/${innerName}>)`);

  const outerOpen = code.match(outerOpenRegex);
  const outerClose = code.match(outerCloseRegex);
  const innerOpen = code.match(innerOpenRegex);
  const innerClose = code.match(innerCloseRegex);

  if (!outerOpen || !outerClose || !innerOpen || !innerClose) return code;

  // Simple swap: replace outer tags with inner name and inner tags with outer name
  let result = code;
  result = result.replace(`<${outerName}>`, `<${innerName}>`);
  result = result.replace(`<${outerName} `, `<${innerName} `);
  result = result.replace(`</${outerName}>`, `</${innerName}>`);
  result = result.replace(`<${innerName}>`, `<${outerName}>`);
  result = result.replace(`<${innerName} `, `<${outerName} `);
  result = result.replace(`</${innerName}>`, `</${outerName}>`);

  // The above simple swap only works when there's exactly one of each.
  // Since we changed outer→inner first then inner→outer, we need a different approach.
  // Let's use placeholder-based swap instead:

  result = code;
  const PLACEHOLDER_A = `<__SWAP_PLACEHOLDER_A__>`;
  const PLACEHOLDER_A_CLOSE = `</__SWAP_PLACEHOLDER_A__>`;
  const PLACEHOLDER_B = `<__SWAP_PLACEHOLDER_B__>`;
  const PLACEHOLDER_B_CLOSE = `</__SWAP_PLACEHOLDER_B__>`;

  // Replace outer (which should become inner) with placeholder A
  result = result.replace(new RegExp(`<${outerName}>`), PLACEHOLDER_A);
  result = result.replace(new RegExp(`<${outerName}\\s`), PLACEHOLDER_A.replace(">", " "));
  result = result.replace(new RegExp(`</${outerName}>`), PLACEHOLDER_A_CLOSE);

  // Replace inner (which should become outer) with placeholder B
  result = result.replace(new RegExp(`<${innerName}>`), PLACEHOLDER_B);
  result = result.replace(new RegExp(`<${innerName}\\s`), PLACEHOLDER_B.replace(">", " "));
  result = result.replace(new RegExp(`</${innerName}>`), PLACEHOLDER_B_CLOSE);

  // Now replace placeholders: A → innerName (was outer, now inner), B → outerName (was inner, now outer)
  // Wait — we want to SWAP, so outer becomes inner and inner becomes outer
  // Actually we want ToastProvider (inner) to become outer, and AuthProvider (outer) to become inner
  // So: placeholder_A (was outerName=AuthProvider) stays AuthProvider
  //     placeholder_B (was innerName=ToastProvider) stays ToastProvider
  // But we need to swap their POSITIONS, not their names.

  // Let me use a cleaner approach: just swap the tag names at their positions
  result = code;
  // Step 1: Replace all outerName tags → placeholder
  result = result.replace(new RegExp(`<${outerName}([ >])`, "g"), `<__OUTER__$1`);
  result = result.replace(new RegExp(`</${outerName}>`, "g"), `</__OUTER__>`);
  // Step 2: Replace all innerName tags → outerName
  result = result.replace(new RegExp(`<${innerName}([ >])`, "g"), `<${outerName}$1`);
  result = result.replace(new RegExp(`</${innerName}>`, "g"), `</${outerName}>`);
  // Step 3: Replace placeholder → innerName
  result = result.replace(/<__OUTER__([ >])/g, `<${innerName}$1`);
  result = result.replace(/<\/__OUTER__>/g, `</${innerName}>`);

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
