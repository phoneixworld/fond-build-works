/**
 * Build Compiler v1.0 — Deterministic Import Path Fixer
 * 
 * After the AI generates files, this pass rewrites broken relative imports
 * to point to actual files in the workspace. No AI involved — pure path math.
 */

import type { Workspace } from "./workspace";

/**
 * For every JS/JSX/TS/TSX file in the workspace, find relative imports
 * that don't resolve, and try to fix them by searching the workspace
 * for a file whose basename matches.
 * 
 * Returns the number of imports fixed.
 */
export function fixBrokenImports(workspace: Workspace): number {
  let totalFixed = 0;

  for (const filePath of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) continue;

    const content = workspace.getFile(filePath)!;
    const { fixed, fixCount } = rewriteImports(filePath, content, workspace);

    if (fixCount > 0) {
      workspace.updateFile(filePath, fixed);
      totalFixed += fixCount;
    }
  }

  return totalFixed;
}

/**
 * Rewrite imports in a single file's content.
 */
function rewriteImports(
  filePath: string,
  content: string,
  workspace: Workspace
): { fixed: string; fixCount: number } {
  let fixCount = 0;

  // Match: import ... from './path' or import ... from "../path"
  const importRegex = /(import\s+(?:[\w{},\s*]+\s+from\s+|))(['"])(\.\.\?\/[^'"]+)\2/g;

  const fixed = content.replace(importRegex, (fullMatch, prefix, quote, importPath) => {
    // Check if this import already resolves
    const resolved = workspace.resolveImport(filePath, importPath);
    if (resolved) return fullMatch; // Already fine

    // Extract the target filename we're looking for
    const targetBasename = importPath.split("/").pop()!;
    
    // Search workspace for a file with this basename
    const candidates = findCandidates(targetBasename, workspace);
    
    if (candidates.length === 0) return fullMatch; // Can't fix

    // Pick the best candidate
    const best = pickBestCandidate(filePath, importPath, candidates);
    if (!best) return fullMatch;

    // Build the correct relative path from filePath to best
    const correctPath = buildRelativePath(filePath, best);
    
    // Remove extension for JS/JSX/TS/TSX imports (convention)
    const cleanPath = correctPath.replace(/\.(jsx?|tsx?)$/, "");

    fixCount++;
    console.log(`[ImportFixer] ${filePath}: '${importPath}' → '${cleanPath}'`);
    
    return `${prefix}${quote}${cleanPath}${quote}`;
  });

  return { fixed, fixCount };
}

/**
 * Find all workspace files matching a basename (with or without extension).
 */
function findCandidates(basename: string, workspace: Workspace): string[] {
  const files = workspace.listFiles();
  const nameNoExt = basename.replace(/\.(jsx?|tsx?|css)$/, "");
  
  return files.filter(f => {
    const fName = f.split("/").pop()!;
    const fNameNoExt = fName.replace(/\.(jsx?|tsx?|css)$/, "");
    return fNameNoExt === nameNoExt || fName === basename;
  });
}

/**
 * Pick the best candidate based on the original import path's intent.
 * 
 * E.g., if import was '../ui/Card', prefer '/components/ui/Card.jsx'
 * over '/pages/Card.jsx'.
 */
function pickBestCandidate(
  fromFile: string,
  originalImport: string,
  candidates: string[]
): string | null {
  if (candidates.length === 1) return candidates[0];

  // Extract path segments from the original import for matching
  const importParts = originalImport.replace(/^\.\.\?\//, "").split("/");
  // Remove filename, keep directory hints
  const dirHints = importParts.slice(0, -1);

  // Score each candidate by how many directory hints match
  let bestScore = -1;
  let best: string | null = null;

  for (const candidate of candidates) {
    let score = 0;
    const candParts = candidate.split("/").filter(Boolean);

    for (const hint of dirHints) {
      if (candParts.includes(hint)) score += 10;
    }

    // Bonus: prefer files in standard directories
    if (candidate.includes("/components/")) score += 2;
    if (candidate.includes("/contexts/")) score += 2;
    if (candidate.includes("/hooks/")) score += 2;
    if (candidate.includes("/pages/")) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/**
 * Build a relative path from `fromFile` to `toFile`.
 * Both paths are absolute workspace paths starting with /.
 */
function buildRelativePath(fromFile: string, toFile: string): string {
  const fromParts = fromFile.split("/").filter(Boolean);
  fromParts.pop(); // Remove filename, keep directory
  
  const toParts = toFile.split("/").filter(Boolean);

  // Find common prefix length
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  // Build relative path
  const ups = fromParts.length - common;
  const downs = toParts.slice(common);

  if (ups === 0) {
    return "./" + downs.join("/");
  }

  return "../".repeat(ups) + downs.join("/");
}
