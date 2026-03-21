/**
 * Export Mismatch Fixer
 *
 * Detects and repairs default/named export mismatches that cause
 * "Element type is invalid" runtime errors.
 * 
 * Enhanced with:
 * - Better handling of re-exported barrel files
 * - Smarter stub generation for missing components
 * - Cross-file import chain resolution
 */

import type { Workspace } from "./workspace";

/**
 * Scan workspace for files imported with symbols that are not actually exported.
 * Repairs default and named mismatches deterministically.
 * Returns count of applied fixes.
 */
export function fixExportMismatches(workspace: Workspace): number {
  let totalFixed = 0;

  // Three passes: cascading fixes may create new requirements
  for (let pass = 0; pass < 3; pass++) {
    let passFixed = 0;
    const idx = workspace.index;

    for (const [importingFile, imports] of Object.entries(idx.imports)) {
      for (const imp of imports) {
        if (!imp.from.startsWith(".") && !imp.from.startsWith("/") && !imp.from.startsWith("@/")) continue;

        const resolved = workspace.resolveImport(importingFile, imp.from);
        if (!resolved || !workspace.hasFile(resolved)) {
          // File doesn't exist — generate a stub file
          if (imp.from.startsWith(".") || imp.from.startsWith("/")) {
            passFixed += generateMissingFile(workspace, importingFile, imp.from, imp.symbols, imp.isDefault);
          }
          continue;
        }

        const targetExports = idx.exports[resolved] || [];

        if (imp.isDefault) {
          passFixed += fixDefaultImportMismatch(workspace, importingFile, resolved, imp.from, imp.symbols[0], targetExports);
        }

        const namedSymbols = imp.isDefault ? imp.symbols.slice(1) : imp.symbols;
        if (namedSymbols.length > 0) {
          passFixed += fixNamedImportMismatches(workspace, importingFile, resolved, imp.from, namedSymbols, targetExports);
        }
      }
    }

    totalFixed += passFixed;
    if (passFixed === 0) break;
    
    // Re-index after fixes
    workspace.reindex();
  }

  return totalFixed;
}

function generateMissingFile(
  workspace: Workspace,
  importingFile: string,
  fromPath: string,
  symbols: string[],
  isDefault: boolean
): number {
  // Resolve to an actual file path
  const resolvedPath = resolveToFilePath(importingFile, fromPath);
  if (!resolvedPath || workspace.hasFile(resolvedPath)) return 0;

  const parts: string[] = ['import React from "react";', ""];

  // Generate stubs for each symbol
  const namedSymbols = isDefault ? symbols.slice(1) : symbols;
  const defaultSymbol = isDefault ? symbols[0] : null;

  for (const sym of namedSymbols) {
    if (/^[A-Z]/.test(sym)) {
      parts.push(`export function ${sym}({ children, ...props }) {`);
      parts.push(`  return <div {...props}>{children}</div>;`);
      parts.push(`}`);
      parts.push("");
    } else if (sym.startsWith("use")) {
      parts.push(`export function ${sym}() {`);
      parts.push(`  return {};`);
      parts.push(`}`);
      parts.push("");
    } else {
      parts.push(`export const ${sym} = null;`);
      parts.push("");
    }
  }

  if (defaultSymbol) {
    if (/^[A-Z]/.test(defaultSymbol)) {
      parts.push(`export default function ${defaultSymbol}({ children, ...props }) {`);
      parts.push(`  return <div {...props}>{children}</div>;`);
      parts.push(`}`);
    } else {
      parts.push(`const ${defaultSymbol} = {};`);
      parts.push(`export default ${defaultSymbol};`);
    }
  }

  workspace.updateFile(resolvedPath, parts.join("\n"));
  console.log(`[ExportMismatchFixer] Generated missing file ${resolvedPath} with stubs for: ${symbols.join(", ")}`);
  return 1;
}

function resolveToFilePath(importingFile: string, fromPath: string): string | null {
  if (fromPath.startsWith("@/")) {
    const base = fromPath.replace("@/", "/");
    return base.match(/\.\w+$/) ? base : `${base}.jsx`;
  }

  const importDir = importingFile.substring(0, importingFile.lastIndexOf("/"));
  let resolved = fromPath;

  if (fromPath.startsWith("./") || fromPath.startsWith("../")) {
    const parts = importDir.split("/").filter(Boolean);
    const relParts = fromPath.split("/");

    for (const part of relParts) {
      if (part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    resolved = "/" + parts.join("/");
  }

  return resolved.match(/\.\w+$/) ? resolved : `${resolved}.jsx`;
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

  // Strategy 1: Imported name matches a named export -> add default export
  if (targetExports.includes(defaultName)) {
    if (!new RegExp(`export\\s+default\\s+${escapeRegex(defaultName)}\\b`).test(content)) {
      workspace.updateFile(resolved, `${content}\nexport default ${defaultName};\n`);
      console.log(`[ExportMismatchFixer] Added 'export default ${defaultName}' to ${resolved}`);
      return 1;
    }
    return 0;
  }

  // Strategy 2: File has exactly one PascalCase named export -> use as default
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

  // Strategy 3: Convert default import to named import in importing file
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

  // Strategy 4: No exports at all — file might be empty or broken, generate a stub
  if (targetExports.length === 0 && defaultName && /^[A-Z]/.test(defaultName)) {
    const stub = `import React from "react";\n\nexport default function ${defaultName}({ children, ...props }) {\n  return <div {...props}>{children || "${defaultName}"}</div>;\n}\n`;
    workspace.updateFile(resolved, stub);
    console.log(`[ExportMismatchFixer] Generated stub for empty file ${resolved}: ${defaultName}`);
    return 1;
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
    // Symbol exists but is not exported
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

    // Case-only mismatch
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

    // Generate stub — components get React stubs, hooks get safe no-ops
    const latest = workspace.getFile(resolved) || "";
    const hasStub = new RegExp(`(?:export\\s+)?(?:function|const|class)\\s+${escapeRegex(missingSym)}\\b`).test(latest);
    if (!hasStub) {
      let stub: string;
      if (/^[A-Z]/.test(missingSym)) {
        stub = `\nexport function ${missingSym}({ children, ...props }) {\n  return <div {...props}>{children}</div>;\n}\n`;
      } else if (missingSym.startsWith("use")) {
        stub = `\nexport function ${missingSym}() {\n  return {};\n}\n`;
      } else {
        stub = `\nexport const ${missingSym} = null;\n`;
      }
      workspace.updateFile(resolved, `${latest}${stub}`);
      fixed++;
      console.log(`[ExportMismatchFixer] Generated stub '${missingSym}' in ${resolved}`);
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

    const replacement = `${toSym} as ${fromSym}`;
    const updatedClause = clause.replace(
      new RegExp(`\\b${escapeRegex(fromSym)}\\b(?!\\s+as\\s+\\w+)`, "g"),
      replacement
    );

    return updatedClause === clause ? full : full.replace(clause, updatedClause);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
