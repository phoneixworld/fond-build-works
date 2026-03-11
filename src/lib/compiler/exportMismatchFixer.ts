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
      // Only check default imports of local files
      if (!imp.isDefault) continue;
      if (!imp.from.startsWith(".") && !imp.from.startsWith("/") && !imp.from.startsWith("@/")) continue;

      const resolved = workspace.resolveImport(importingFile, imp.from);
      if (!resolved || !workspace.hasFile(resolved)) continue;

      const targetExports = idx.exports[resolved];
      if (!targetExports) continue;

      // If the file has a default export, no mismatch
      if (targetExports.includes("default")) continue;

      // File is imported as default but has NO default export
      // Find the best named export to promote to default
      const defaultName = imp.symbols[0]; // The name used in the default import
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
        // Find and replace: import X from "./path" → import { X } from "./path"  
        // But only if X matches one of the exports
        const matchingExport = componentExports.find(e => e === defaultName) || componentExports[0];
        const importRegex = new RegExp(
          `import\\s+${escapeRegex(defaultName)}\\s+from\\s+(['"])${escapeRegex(imp.from)}\\1`
        );
        if (importRegex.test(importingContent)) {
          const newImport = importingContent.replace(
            importRegex,
            `import { ${matchingExport} } from $1${imp.from}$1`
          );
          // Also replace JSX usage if the name changed
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
    }
  }

  return fixed;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
