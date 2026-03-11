/**
 * Export Mismatch Fixer
 *
 * Detects and repairs default/named export mismatches that cause
 * "Element type is invalid" runtime errors.
 */

import type { Workspace } from "./workspace";

/**
 * Scan workspace for files imported with symbols that are not actually exported.
 * Repairs default and named mismatches deterministically.
 * Returns count of applied fixes.
 */
export function fixExportMismatches(workspace: Workspace): number {
  let totalFixed = 0;

  // Two passes: first edits may introduce new exports/import expectations.
  for (let pass = 0; pass < 2; pass++) {
    let passFixed = 0;
    const idx = workspace.index;

    for (const [importingFile, imports] of Object.entries(idx.imports)) {
      for (const imp of imports) {
        // Only check local file imports
        if (!imp.from.startsWith(".") && !imp.from.startsWith("/") && !imp.from.startsWith("@/")) continue;

        const resolved = workspace.resolveImport(importingFile, imp.from);
        if (!resolved || !workspace.hasFile(resolved)) continue;

        const targetExports = idx.exports[resolved] || [];

        // Handle default import mismatch, but do NOT skip named checks in the same import.
        if (imp.isDefault) {
          passFixed += fixDefaultImportMismatch(workspace, importingFile, resolved, imp.from, imp.symbols[0], targetExports);
        }

        // Handle named import mismatches (for both named-only and default+named imports).
        const namedSymbols = imp.isDefault ? imp.symbols.slice(1) : imp.symbols;
        if (namedSymbols.length > 0) {
          passFixed += fixNamedImportMismatches(workspace, importingFile, resolved, imp.from, namedSymbols, targetExports);
        }
      }
    }

    totalFixed += passFixed;
    if (passFixed === 0) break;
  }

  return totalFixed;
}

function fixDefaultImportMismatch(
  workspace: Workspace,
  importingFile: string,
  resolved: string,
  fromPath: string,
  defaultName: string | undefined,
  targetExports: string[]
): number {
  if (!defaultName || targetExports.includes("default")) return 0;

  const content = workspace.getFile(resolved) || "";

  // Strategy 1: Imported name matches a named export -> add default export.
  if (targetExports.includes(defaultName)) {
    if (!new RegExp(`export\\s+default\\s+${escapeRegex(defaultName)}\\b`).test(content)) {
      workspace.updateFile(resolved, `${content}\nexport default ${defaultName};\n`);
      console.log(`[ExportMismatchFixer] Added 'export default ${defaultName}' to ${resolved}`);
      return 1;
    }
    return 0;
  }

  // Strategy 2: File has exactly one PascalCase named export -> use as default.
  const componentExports = targetExports.filter((e) => /^[A-Z]/.test(e));
  if (componentExports.length === 1) {
    const exportName = componentExports[0];
    if (!new RegExp(`export\\s+default\\s+${escapeRegex(exportName)}\\b`).test(content)) {
      workspace.updateFile(resolved, `${content}\nexport default ${exportName};\n`);
      console.log(`[ExportMismatchFixer] Added 'export default ${exportName}' to ${resolved} (single component export)`);
      return 1;
    }
    return 0;
  }

  // Strategy 3: Convert default import to named import in importing file.
  if (componentExports.length > 0) {
    const importingContent = workspace.getFile(importingFile) || "";
    const matchingExport = componentExports.find((e) => e === defaultName) || componentExports[0];
    const importRegex = new RegExp(
      `import\\s+${escapeRegex(defaultName)}\\s+from\\s+(['"])${escapeRegex(fromPath)}\\1`
    );

    if (importRegex.test(importingContent)) {
      let finalContent = importingContent.replace(
        importRegex,
        `import { ${matchingExport} } from $1${fromPath}$1`
      );

      if (matchingExport !== defaultName) {
        finalContent = finalContent
          .replace(new RegExp(`<${escapeRegex(defaultName)}(\\s|\\/)`, "g"), `<${matchingExport}$1`)
          .replace(new RegExp(`</${escapeRegex(defaultName)}>`, "g"), `</${matchingExport}>`);
      }

      workspace.updateFile(importingFile, finalContent);
      console.log(`[ExportMismatchFixer] Converted default import to named: ${defaultName} → { ${matchingExport} } in ${importingFile}`);
      return 1;
    }
  }

  return 0;
}

function fixNamedImportMismatches(
  workspace: Workspace,
  importingFile: string,
  resolved: string,
  fromPath: string,
  namedSymbols: string[],
  targetExports: string[]
): number {
  let fixed = 0;
  const content = workspace.getFile(resolved) || "";

  const missingSymbols = namedSymbols.filter((sym) => !targetExports.includes(sym));
  if (missingSymbols.length === 0) return 0;

  for (const missingSym of missingSymbols) {
    // Symbol exists but is not exported -> add named export.
    const declRegex = new RegExp(`(?:const|let|var|function|class)\\s+${escapeRegex(missingSym)}\\b`);
    if (declRegex.test(content)) {
      const latest = workspace.getFile(resolved) || "";
      const alreadyExported = new RegExp(`export\\s*\\{[^}]*\\b${escapeRegex(missingSym)}\\b[^}]*\\}`).test(latest);
      if (!alreadyExported) {
        workspace.updateFile(resolved, `${latest}\nexport { ${missingSym} };\n`);
        fixed++;
        console.log(`[ExportMismatchFixer] Added missing named export '${missingSym}' to ${resolved}`);
      }
      continue;
    }

    // Case-only mismatch -> update only the import statement for this module.
    const caseMatch = targetExports.find((e) => e.toLowerCase() === missingSym.toLowerCase());
    if (caseMatch) {
      const importingContent = workspace.getFile(importingFile) || "";
      const updated = replaceNamedImportSymbol(importingContent, fromPath, missingSym, caseMatch);
      if (updated !== importingContent) {
        workspace.updateFile(importingFile, updated);
        fixed++;
        console.log(`[ExportMismatchFixer] Fixed case mismatch: '${missingSym}' → '${caseMatch}' in ${importingFile}`);
      }
      continue;
    }

    // Last resort: create safe stub to prevent runtime crash.
    if (/^[A-Z]/.test(missingSym)) {
      const latest = workspace.getFile(resolved) || "";
      const hasStub = new RegExp(`(?:export\\s+)?(?:function|const|class)\\s+${escapeRegex(missingSym)}\\b`).test(latest);
      if (!hasStub) {
        const stub = `\nexport function ${missingSym}() {\n  return null;\n}\n`;
        workspace.updateFile(resolved, `${latest}${stub}`);
        fixed++;
        console.log(`[ExportMismatchFixer] Generated stub component '${missingSym}' in ${resolved}`);
      }
    }
  }

  return fixed;
}

function replaceNamedImportSymbol(content: string, fromPath: string, fromSym: string, toSym: string): string {
  const importRegex = new RegExp(
    `import\\s+([\\s\\S]*?)\\s+from\\s+(['"])${escapeRegex(fromPath)}\\2`,
    "g"
  );

  return content.replace(importRegex, (full, clause: string) => {
    if (!clause.includes("{")) return full;
    const updatedClause = clause.replace(new RegExp(`\\b${escapeRegex(fromSym)}\\b`, "g"), toSym);
    return updatedClause === clause ? full : full.replace(clause, updatedClause);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

