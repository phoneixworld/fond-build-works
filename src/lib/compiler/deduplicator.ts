/**
 * Build Compiler v1.0 — File Deduplication Pass
 * 
 * Detects when the AI generates a file with duplicate content blocks
 * (e.g., the entire file content repeated twice) and removes the duplicate.
 * This is a common failure mode when the AI model concatenates two copies
 * of the same module.
 */

import type { Workspace } from "./workspace";

/**
 * Scan all JS/JSX/TS/TSX files for duplicate content blocks.
 * Returns the number of files that were deduplicated.
 */
export function deduplicateFiles(workspace: Workspace): number {
  let fixed = 0;

  for (const filePath of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) continue;

    const content = workspace.getFile(filePath)!;
    if (content.length < 100) continue; // Too small to have meaningful duplicates

    const deduplicated = deduplicateContent(content);
    if (deduplicated !== null) {
      workspace.updateFile(filePath, deduplicated);
      fixed++;
      console.log(`[Deduplicator] 🔧 Removed duplicate content block in ${filePath} (${content.length} → ${deduplicated.length} chars)`);
    }
  }

  return fixed;
}

/**
 * Check if file content contains a duplicate block and return cleaned content,
 * or null if no duplication was detected.
 */
function deduplicateContent(content: string): string | null {
  // Strategy 1: Exact-half duplication
  // The AI sometimes outputs the entire file twice
  const halfLen = Math.floor(content.length / 2);
  const tolerance = 20; // Allow slight whitespace differences
  
  for (let offset = -tolerance; offset <= tolerance; offset++) {
    const splitPoint = halfLen + offset;
    if (splitPoint < 50 || splitPoint >= content.length - 50) continue;
    
    const firstHalf = content.slice(0, splitPoint).trim();
    const secondHalf = content.slice(splitPoint).trim();
    
    if (firstHalf === secondHalf) {
      return firstHalf;
    }
  }

  // Strategy 2: Detect duplicate import blocks
  // Find the first import block, then check if it appears again later in the file
  const importBlockEnd = findImportBlockEnd(content);
  if (importBlockEnd > 0 && importBlockEnd < content.length * 0.8) {
    const importBlock = content.slice(0, importBlockEnd).trim();
    const rest = content.slice(importBlockEnd);
    
    // Look for the import block repeated in the rest of the file
    const secondImportStart = findSecondImportBlock(rest);
    if (secondImportStart !== -1) {
      const afterSecondImport = rest.slice(secondImportStart).trim();
      const originalAfterImports = rest.slice(0, secondImportStart).trim();
      
      // Check if the second half is a near-duplicate of the full file
      const secondBlock = afterSecondImport;
      const firstBlock = content.slice(0, importBlockEnd + secondImportStart).trim();
      
      // If the content after the second import block duplicates what came before,
      // keep only the first occurrence
      if (isDuplicateBlock(firstBlock, importBlock + "\n\n" + secondBlock)) {
        return firstBlock;
      }
      
      // Simpler check: if we find import statements appearing after function/component code,
      // that's always wrong — truncate at the second import block
      if (originalAfterImports.length > 50) {
        const hasExportOrFunction = /(?:export\s+(?:default\s+)?(?:function|const|class)|function\s+\w+|const\s+\w+\s*=)/.test(originalAfterImports);
        if (hasExportOrFunction) {
          // The real code is between the first imports and the second import block
          return (importBlock + "\n\n" + originalAfterImports).trim();
        }
      }
    }
  }

  // Strategy 3: Detect duplicate function/component declarations
  // Find `export default function X` or `export default` appearing twice
  const exportDefaultMatches = [...content.matchAll(/export\s+default\s+(?:function\s+)?(\w+)?/g)];
  if (exportDefaultMatches.length >= 2) {
    const firstMatch = exportDefaultMatches[0];
    const secondMatch = exportDefaultMatches[1];
    
    // If the same default export name appears twice, keep the first complete version
    if (firstMatch[1] && secondMatch[1] && firstMatch[1] === secondMatch[1]) {
      // Find where the second declaration starts (go back to its import block)
      const secondExportPos = secondMatch.index!;
      
      // Look backwards from secondExportPos to find imports that belong to the duplicate
      const beforeSecondExport = content.slice(0, secondExportPos);
      const lastImportBeforeSecond = beforeSecondExport.lastIndexOf("\nimport ");
      
      if (lastImportBeforeSecond > content.length * 0.3) {
        // There's an import statement appearing late in the file — likely start of duplicate
        // Find the actual start of the duplicate block (first import in the second cluster)
        const lineStart = content.lastIndexOf("\n", lastImportBeforeSecond - 1) + 1;
        const truncated = content.slice(0, lineStart).trim();
        
        if (truncated.length > 100) {
          return truncated;
        }
      }
    }
  }

  // Strategy 4: Detect duplicate `import { useState...} from "react"` lines
  // This catches the exact error pattern from the bug report
  const reactImportPattern = /^import\s+\{[^}]*\}\\s+from\s+['"]react['"];?\s*$/gm;
  const reactImports = [...content.matchAll(reactImportPattern)];
  if (reactImports.length >= 2) {
    const firstPos = reactImports[0].index!;
    const secondPos = reactImports[reactImports.length - 1].index!;
    
    // If the second react import is far from the first, we likely have a duplicate block
    if (secondPos - firstPos > content.length * 0.3) {
      // Truncate at the line before the second react import
      const lineStart = content.lastIndexOf("\n", secondPos - 1);
      if (lineStart > 100) {
        const truncated = content.slice(0, lineStart).trim();
        // Verify the truncated version still has exports
        if (/export\s/.test(truncated)) {
          return truncated;
        }
      }
    }
  }

  return null;
}

/**
 * Find the position after the last consecutive import statement at the top of the file.
 */
function findImportBlockEnd(content: string): number {
  const lines = content.split("\n");
  let lastImportLine = -1;
  let inImport = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    if (trimmed.startsWith("import ") || trimmed.startsWith("import{")) {
      lastImportLine = i;
      inImport = !trimmed.includes("from") || !trimmed.endsWith(";") && !trimmed.endsWith("'") && !trimmed.endsWith('"');
    } else if (inImport) {
      if (trimmed.includes("from") || trimmed.endsWith(";")) {
        lastImportLine = i;
        inImport = false;
      } else {
        lastImportLine = i;
      }
    } else if (trimmed === "" && lastImportLine >= 0) {
      // Allow blank lines between imports
      continue;
    } else if (lastImportLine >= 0 && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
      // Non-import, non-comment line found — end of import block
      break;
    }
  }

  if (lastImportLine < 0) return 0;

  // Return the character offset after the last import line
  let offset = 0;
  for (let i = 0; i <= lastImportLine; i++) {
    offset += lines[i].length + 1; // +1 for \n

  }
  return offset;
}

/**
 * Find the start position of a second import block in the remaining content.
 * Returns -1 if no second import block is found.
 */
function findSecondImportBlock(content: string): number {
  // Look for import statements that appear after non-import code
  const match = content.match(/\n(import\s+(?:\{[^}]*\}|\w+)?\s*(?:,\s*\{[^}]*\})?\s*from\s+['"][^'"]+['"])/);
  if (match && match.index !== undefined) {
    // Make sure there's real code before this import (not just whitespace)
    const before = content.slice(0, match.index).trim();
    if (before.length > 50 && /[};)]/.test(before.slice(-5))) {
      return match.index;
    }
  }
  return -1;
}

/**
 * Check if two blocks are near-duplicates (allowing minor whitespace differences).
 */
function isDuplicateBlock(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const na = normalize(a);
  const nb = normalize(b);
  
  if (na === nb) return true;
  
  // Check similarity — if >90% of characters match, consider it a duplicate
  const shorter = Math.min(na.length, nb.length);
  const longer = Math.max(na.length, nb.length);
  if (shorter / longer > 0.85) {
    let matches = 0;
    for (let i = 0; i < shorter; i++) {
      if (na[i] === nb[i]) matches++;
    }
    return matches / shorter > 0.9;
  }
  
  return false;
}
