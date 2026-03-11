/**
 * Export Mismatch Fixer
 * 
 * Detects and repairs default/named export mismatches that cause
 * "Element type is invalid" runtime errors.
 * 
 * Common AI mistake: generating `export function StudentPage()` 
 * but importing as `import StudentPage from "./StudentPage"` (default import).
 */

import type { Workspace } from "./workspace";

/**
 * Scan workspace for files imported as default but only exporting named symbols.
 * Fix by adding `export default ComponentName` to the target file.
 * Returns count of files fixed.
 */
export function fixExportMismatches(workspace: Workspace): number {
  let fixed = 0;
  const idx = workspace.index;

  for (const [importingFile, imports] of Object.entries(idx.imports)) {
    for (const imp of imports) {
      // Only check local file imports
      if (!imp.from.startsWith(".") && !imp.from.startsWith("/") && !imp.from.startsWith("@/")) continue;

      const resolved = workspace.resolveImport(importingFile, imp.from);
      if (!resolved || !workspace.hasFile(resolved)) continue;

      const targetExports = idx.exports[resolved];
      if (!targetExports) continue;

      // ── Handle default import mismatches ──
      if (imp.isDefault) {
        if (targetExports.includes("default")) continue;

        const defaultName = imp.symbols[0];
        const content = workspace.getFile(resolved)!;

        // Strategy 1: The imported name matches a named export — add export default
        if (defaultName && targetExports.includes(defaultName)) {
          const updatedContent = content + `\nexport default ${defaultName};\n`;
          workspace.updateFile(resolved, updatedContent);
          fixed++;
          console.log(`[ExportMismatchFixer] Added 'export default ${defaultName}' to ${resolved}`);
          continue;
        }

        // Strategy 2: File has exactly one named export that looks like a component
        const componentExports = targetExports.filter(e => /^[A-Z]/.test(e));
        if (componentExports.length === 1) {
          const exportName = componentExports[0];
          const updatedContent = content + `\nexport default ${exportName};\n`;
          workspace.updateFile(resolved, updatedContent);
          fixed++;
          console.log(`[ExportMismatchFixer] Added 'export default ${exportName}' to ${resolved} (single component export)`);
          continue;
        }

        // Strategy 3: Convert the default import to a named import in the importing file
        if (componentExports.length > 0) {
          const importingContent = workspace.getFile(importingFile)!;
          const matchingExport = componentExports.find(e => e === defaultName) || componentExports[0];
          const importRegex = new RegExp(
            `import\\s+${escapeRegex(defaultName)}\\s+from\\s+(['"])${escapeRegex(imp.from)}\\1`
          );
          if (importRegex.test(importingContent)) {
            const newImport = importingContent.replace(
              importRegex,
              `import { ${matchingExport} } from $1${imp.from}$1`
            );
            let finalContent = newImport;
            if (matchingExport !== defaultName) {
              finalContent = finalContent
                .replace(new RegExp(`<${escapeRegex(defaultName)}(\\s|\\/)`, 'g'), `<${matchingExport}$1`)
                .replace(new RegExp(`</${escapeRegex(defaultName)}>`, 'g'), `</${matchingExport}>`);
            }
            workspace.updateFile(importingFile, finalContent);
            fixed++;
            console.log(`[ExportMismatchFixer] Converted default import to named: ${defaultName} → { ${matchingExport} } in ${importingFile}`);
          }
        }
        continue;
      }

      // ── Handle named import mismatches ──
      // Check each named symbol imported from this file
      const missingSymbols = imp.symbols.filter(sym => !targetExports.includes(sym));
      if (missingSymbols.length === 0) continue;

      const content = workspace.getFile(resolved)!;

      for (const missingSym of missingSymbols) {
        // Check if the symbol exists in the file as a non-exported declaration
        const declRegex = new RegExp(`(?:const|let|var|function|class)\\s+${escapeRegex(missingSym)}\\b`);
        if (declRegex.test(content)) {
          // The symbol is declared but not exported — add an export statement
          const updatedContent = workspace.getFile(resolved)! + `\nexport { ${missingSym} };\n`;
          workspace.updateFile(resolved, updatedContent);
          fixed++;
          console.log(`[ExportMismatchFixer] Added missing named export '${missingSym}' to ${resolved}`);
          continue;
        }

        // Check if a case-insensitive match exists (common AI mistake: "Sidebar" vs "sidebar")
        const caseMatch = targetExports.find(e => e.toLowerCase() === missingSym.toLowerCase());
        if (caseMatch) {
          // Fix the import in the importing file to use the correct case
          let importingContent = workspace.getFile(importingFile)!;
          importingContent = importingContent
            .replace(new RegExp(`\\b${escapeRegex(missingSym)}\\b`, 'g'), caseMatch);
          workspace.updateFile(importingFile, importingContent);
          fixed++;
          console.log(`[ExportMismatchFixer] Fixed case mismatch: '${missingSym}' → '${caseMatch}' in ${importingFile}`);
          continue;
        }

        // If it looks like a React component (PascalCase) and no match found,
        // generate a placeholder component in the target file to prevent crashes
        if (/^[A-Z]/.test(missingSym)) {
          const stub = `\nexport const ${missingSym} = ({ children, ...props }) => {\n  return <div {...props}>{children || "${missingSym}"}</div>;\n};\n`;
          const updatedContent = workspace.getFile(resolved)! + stub;
          workspace.updateFile(resolved, updatedContent);
          fixed++;
          console.log(`[ExportMismatchFixer] Generated stub component '${missingSym}' in ${resolved}`);
        }
      }
    }
  }

  return fixed;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
