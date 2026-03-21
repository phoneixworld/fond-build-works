/**
 * Build Compiler v1.0 — File Deduplication Pass
 * 
 * Detects when the AI generates a file with duplicate content blocks
 * (e.g., the entire file content repeated twice) and removes the duplicate.
 * Also catches duplicate React imports, secondary import blocks after code,
 * and duplicate component declarations.
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
    if (content.length < 100) continue;

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
  const halfLen = Math.floor(content.length / 2);
  const tolerance = 20;
  
  for (let offset = -tolerance; offset <= tolerance; offset++) {
    const splitPoint = halfLen + offset;
    if (splitPoint < 50 || splitPoint >= content.length - 50) continue;
    
    const firstHalf = content.slice(0, splitPoint).trim();
    const secondHalf = content.slice(splitPoint).trim();
    
    if (firstHalf === secondHalf) {
      return firstHalf;
    }
  }

  // Strategy 2: Detect secondary import block after functional code
  const importBlockEnd = findImportBlockEnd(content);
  if (importBlockEnd > 0 && importBlockEnd < content.length * 0.8) {
    const importBlock = content.slice(0, importBlockEnd).trim();
    const rest = content.slice(importBlockEnd);
    
    const secondImportStart = findSecondImportBlock(rest);
    if (secondImportStart !== -1) {
      const afterSecondImport = rest.slice(secondImportStart).trim();
      const originalAfterImports = rest.slice(0, secondImportStart).trim();
      
      const secondBlock = afterSecondImport;
      const firstBlock = content.slice(0, importBlockEnd + secondImportStart).trim();
      
      if (isDuplicateBlock(firstBlock, importBlock + "\n\n" + secondBlock)) {
        return firstBlock;
      }
      
      if (originalAfterImports.length > 50) {
        const hasExportOrFunction = /(?:export\s+(?:default\s+)?(?:function|const|class)|function\s+\w+|const\s+\w+\s*=)/.test(originalAfterImports);
        if (hasExportOrFunction) {
          return (importBlock + "\n\n" + originalAfterImports).trim();
        }
      }
    }
  }

  // Strategy 3: Detect duplicate function/component declarations
  const exportDefaultMatches = [...content.matchAll(/export\s+default\s+(?:function\s+)?(\w+)?/g)];
  if (exportDefaultMatches.length >= 2) {
    const firstMatch = exportDefaultMatches[0];
    const secondMatch = exportDefaultMatches[1];
    
    if (firstMatch[1] && secondMatch[1] && firstMatch[1] === secondMatch[1]) {
      const secondExportPos = secondMatch.index!;
      
      const beforeSecondExport = content.slice(0, secondExportPos);
      const lastImportBeforeSecond = beforeSecondExport.lastIndexOf("\nimport ");
      
      if (lastImportBeforeSecond > content.length * 0.3) {
        const lineStart = content.lastIndexOf("\n", lastImportBeforeSecond - 1) + 1;
        const truncated = content.slice(0, lineStart).trim();
        
        if (truncated.length > 100) {
          return truncated;
        }
      }
    }
  }

  // Strategy 4: Detect duplicate React import lines (FIXED regex — was broken with \\s)
  const reactImportPattern = /^import\s+\{[^}]*\}\s+from\s+['"]react['"];?\s*$/gm;
  const reactImports = [...content.matchAll(reactImportPattern)];
  if (reactImports.length >= 2) {
    const firstPos = reactImports[0].index!;
    const secondPos = reactImports[reactImports.length - 1].index!;
    
    if (secondPos - firstPos > content.length * 0.3) {
      const lineStart = content.lastIndexOf("\n", secondPos - 1);
      if (lineStart > 100) {
        const truncated = content.slice(0, lineStart).trim();
        if (/export\s/.test(truncated)) {
          return truncated;
        }
      }
    }
  }

  // Strategy 5: Detect `import React` appearing more than once (default import pattern)
  const reactDefaultImports = [...content.matchAll(/^import\s+React[\s,]/gm)];
  if (reactDefaultImports.length >= 2) {
    const secondPos = reactDefaultImports[1].index!;
    const lineStart = content.lastIndexOf("\n", secondPos - 1);
    if (lineStart > 100) {
      const truncated = content.slice(0, lineStart).trim();
      if (/export\s/.test(truncated)) {
        return truncated;
      }
    }
  }

  // Strategy 6: Detect "Identifier 'X' has already been declared" pattern
  // Look for any identifier declared twice (const X = ... appears twice)
  const constDecls = [...content.matchAll(/^(?:const|let|var|function)\s+(\w+)\s*[=(]/gm)];
  const seen = new Map<string, number>();
  for (const m of constDecls) {
    const name = m[1];
    if (seen.has(name)) {
      // Same identifier declared twice — truncate at the second occurrence
      const secondPos = m.index!;
      // Walk back to find the start of the duplicate block (likely an import)
      const before = content.slice(0, secondPos);
      const lastImport = before.lastIndexOf("\nimport ");
      const cutPoint = lastImport > before.length * 0.3 ? lastImport : secondPos;
      const lineStart = content.lastIndexOf("\n", cutPoint - 1) + 1;
      const truncated = content.slice(0, lineStart).trim();
      if (truncated.length > 100 && /export\s/.test(truncated)) {
        return truncated;
      }
    }
    seen.set(name, m.index!);
  }

  // Strategy 7: Merge duplicate import lines from same source
  const result = mergeDuplicateImports(content);
  if (result !== content) return result;

  // Strategy 8: Remove conflicting named + default exports of same symbol
  // e.g., `export { Button };` + `export default Button;` → keep only default
  const defaultExportMatch = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (defaultExportMatch) {
    const symbol = defaultExportMatch[1];
    // Check for `export { Symbol }` or `export { Symbol, ... }` that re-exports the same name
    const namedExportRegex = new RegExp(`^export\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*;?\\s*$`, "m");
    if (namedExportRegex.test(content)) {
      // Remove the named export line that conflicts
      const cleaned = content.replace(namedExportRegex, "").replace(/\n{3,}/g, "\n\n");
      if (cleaned !== content) {
        console.log(`[Deduplicator] 🔧 Removed conflicting named export of '${symbol}' (kept default export)`);
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Merge duplicate import lines from the same source module.
 * e.g., two `import { X } from "react"` lines → one `import { X, Y } from "react"`
 */
function mergeDuplicateImports(content: string): string {
  const lines = content.split("\n");
  const importsBySource = new Map<string, { indices: number[]; names: Set<string>; defaultName: string | null }>();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match: import { X, Y } from "source" or import Default from "source" or import Default, { X } from "source"
    const match = line.match(/^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/);
    if (!match) continue;
    
    const defaultName = match[1] || null;
    const namedStr = match[2] || "";
    const source = match[3];
    
    const names = namedStr.split(",").map(s => s.trim()).filter(Boolean);
    
    if (!importsBySource.has(source)) {
      importsBySource.set(source, { indices: [i], names: new Set(names), defaultName });
    } else {
      const existing = importsBySource.get(source)!;
      existing.indices.push(i);
      for (const n of names) existing.names.add(n);
      if (defaultName && !existing.defaultName) existing.defaultName = defaultName;
    }
  }
  
  let modified = false;
  for (const [source, info] of importsBySource) {
    if (info.indices.length < 2) continue;
    modified = true;
    
    // Build merged import
    const parts: string[] = [];
    if (info.defaultName) parts.push(info.defaultName);
    if (info.names.size > 0) parts.push(`{ ${[...info.names].join(", ")} }`);
    const merged = `import ${parts.join(", ")} from "${source}";`;
    
    // Replace first occurrence, blank out others
    lines[info.indices[0]] = merged;
    for (let j = 1; j < info.indices.length; j++) {
      lines[info.indices[j]] = "";
    }
  }
  
  if (!modified) return content;
  return lines.filter((l, i) => {
    // Remove blanked-out lines but keep intentional empty lines
    if (l === "" && importsBySource) {
      for (const info of importsBySource.values()) {
        if (info.indices.slice(1).includes(i)) return false;
      }
    }
    return true;
  }).join("\n");
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
      continue;
    } else if (lastImportLine >= 0 && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
      break;
    }
  }

  if (lastImportLine < 0) return 0;

  let offset = 0;
  for (let i = 0; i <= lastImportLine; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

/**
 * Find the start position of a second import block in the remaining content.
 */
function findSecondImportBlock(content: string): number {
  const match = content.match(/\n(import\s+(?:\{[^}]*\}|\w+)?\s*(?:,\s*\{[^}]*\})?\s*from\s+['"][^'"]+['"])/);
  if (match && match.index !== undefined) {
    const before = content.slice(0, match.index).trim();
    if (before.length > 50 && /[};)]/.test(before.slice(-5))) {
      return match.index;
    }
  }
  return -1;
}

/**
 * Check if two blocks are near-duplicates.
 */
function isDuplicateBlock(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const na = normalize(a);
  const nb = normalize(b);
  
  if (na === nb) return true;
  
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
