/**
 * Build Compiler v1.0 — Auto-Repair Loop
 * 
 * Self-heals instead of shipping broken builds.
 * Creates micro-tasks for each verification issue, runs them,
 * and re-verifies. Max 2-3 rounds.
 */

import type { VerificationResult, VerificationIssue, RepairAction, RepairActionType } from "./types";
import type { Workspace } from "./workspace";

export const MAX_REPAIR_ROUNDS = 2;

// ─── Issue → RepairAction Classification ──────────────────────────────────

export function classifyRepairActions(
  issues: VerificationIssue[],
  workspace: Workspace
): RepairAction[] {
  const actions: RepairAction[] = [];
  const seen = new Set<string>(); // Dedupe by file+category

  for (const issue of issues) {
    // Only repair errors, not warnings
    if (issue.severity !== "error") continue;

    const key = `${issue.file}:${issue.category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const action = issueToRepairAction(issue, workspace);
    if (action) actions.push(action);
  }

  return actions;
}

function issueToRepairAction(
  issue: VerificationIssue,
  workspace: Workspace
): RepairAction | null {
  switch (issue.category) {
    case "missing_file":
      return {
        type: "fix_missing_file",
        targetFile: issue.file,
        issue,
        prompt: buildMissingFilePrompt(issue, workspace),
      };

    case "broken_import": {
      // Extract the missing target path from the issue message
      const importMatch = issue.message.match(/Cannot resolve import '([^']+)'/);
      if (importMatch) {
        return {
          type: "generate_missing_module",
          targetFile: issue.file,
          issue,
          prompt: buildMissingFilePrompt(issue, workspace),
        };
      }
      return {
        type: "fix_import",
        targetFile: issue.file,
        issue,
        prompt: buildFixImportPrompt(issue, workspace),
      };
    }

    case "syntax_error":
      return {
        type: "fix_syntax",
        targetFile: issue.file,
        issue,
        prompt: buildFixSyntaxPrompt(issue, workspace),
      };

    case "missing_export":
      return {
        type: "fix_missing_export",
        targetFile: issue.file,
        issue,
        prompt: buildFixExportPrompt(issue, workspace),
      };

    case "invalid_import_syntax":
      return {
        type: "fix_import_syntax",
        targetFile: issue.file,
        issue,
        prompt: buildFixImportSyntaxPrompt(issue, workspace),
      };

    case "empty_stub":
      return {
        type: "remove_empty_stub",
        targetFile: issue.file,
        issue,
        prompt: buildFixStubPrompt(issue, workspace),
      };

    case "router_hook_violation":
      return {
        type: "fix_deterministic",
        targetFile: issue.file,
        issue,
        prompt: "", // No AI needed — handled deterministically
      };

    case "undefined_export":
      return {
        type: "fix_deterministic",
        targetFile: issue.file,
        issue,
        prompt: "", // No AI needed — handled deterministically
      };

    default:
      return null;
  }
}

// ─── Prompt Builders ──────────────────────────────────────────────────────

function buildMissingFilePrompt(issue: VerificationIssue, workspace: Workspace): string {
  // Find who imports this file to understand what it should export
  const importers = findImporters(issue.file, workspace);
  const importContext = importers.length > 0
    ? `\n\nThis file is imported by:\n${importers.map(i => `- ${i.file}: imports { ${i.symbols.join(", ")} }`).join("\n")}`
    : "";

  return `## REPAIR: Create missing file

Create the file: ${issue.file}

${issue.suggestedFix || ""}
${importContext}

RULES:
- Create ONLY this one file
- Export all symbols that importers expect
- Make it a complete, working implementation (not a stub)
- Use the project's design system and patterns`;
}

function buildFixImportPrompt(issue: VerificationIssue, workspace: Workspace): string {
  const fileContent = workspace.getFile(issue.file) || "";
  const availableFiles = workspace.listFiles().filter(f => /\.(jsx?|tsx?)$/.test(f));

  return `## REPAIR: Fix broken import in ${issue.file}

Error: ${issue.message}

Current file content:
\`\`\`
${fileContent}
\`\`\`

Available files in workspace:
${availableFiles.map(f => `- ${f}`).join("\n")}

RULES:
- Fix ONLY the broken import
- Update the import path to point to an existing file
- Or remove the import if it's not needed
- Do NOT refactor anything else`;
}

function buildFixSyntaxPrompt(issue: VerificationIssue, workspace: Workspace): string {
  const fileContent = workspace.getFile(issue.file) || "";

  return `## REPAIR: Fix syntax error in ${issue.file}

Error: ${issue.message}${issue.line ? ` (line ${issue.line})` : ""}

Current file content:
\`\`\`
${fileContent}
\`\`\`

RULES:
- Fix ONLY the syntax error
- Preserve all existing functionality
- Output the complete corrected file`;
}

function buildFixExportPrompt(issue: VerificationIssue, workspace: Workspace): string {
  const fileContent = workspace.getFile(issue.file) || "";

  return `## REPAIR: Fix missing export in ${issue.file}

Error: ${issue.message}

Current file content:
\`\`\`
${fileContent}
\`\`\`

RULES:
- Add the missing export
- Do NOT change existing code
- Ensure default export exists if needed`;
}

function buildFixStubPrompt(issue: VerificationIssue, workspace: Workspace): string {
  const importers = findImporters(issue.file, workspace);

  return `## REPAIR: Replace stub with real implementation

File: ${issue.file}
${issue.suggestedFix || ""}

This file is currently a placeholder stub.
${importers.length > 0 ? `\nImported by: ${importers.map(i => i.file).join(", ")}` : ""}

RULES:
- Create a complete, working implementation
- Export all symbols that importers expect
- Use the project's design patterns`;
}

function buildFixImportSyntaxPrompt(issue: VerificationIssue, workspace: Workspace): string {
  const fileContent = workspace.getFile(issue.file) || "";
  const availableFiles = workspace.listFiles().filter(f => /\.(jsx?|tsx?)$/.test(f));

  return `## REPAIR: Fix invalid import syntax in ${issue.file}

Error: ${issue.message}
${issue.line ? `Line: ${issue.line}` : ""}
Suggested fix: ${issue.suggestedFix || "Fix the import syntax"}

Current file content:
\`\`\`
${fileContent}
\`\`\`

Available files in workspace:
${availableFiles.map(f => `- ${f}`).join("\n")}

RULES:
- Fix ONLY the invalid import syntax
- Convert require() to ESM import if needed
- Merge duplicate imports from the same module
- Close any unclosed braces in destructured imports
- Do NOT refactor anything else
- Output the complete corrected file`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function findImporters(
  targetFile: string,
  workspace: Workspace
): { file: string; symbols: string[] }[] {
  const importers: { file: string; symbols: string[] }[] = [];
  const idx = workspace.index;

  for (const [file, imports] of Object.entries(idx.imports)) {
    for (const imp of imports) {
      const resolved = workspace.resolveImport(file, imp.from);
      if (resolved === targetFile || imp.from.includes(targetFile.replace(/\.\w+$/, ""))) {
        importers.push({ file, symbols: imp.symbols });
      }
    }
  }

  return importers;
}

// ─── Build Summary ────────────────────────────────────────────────────────

export function buildRepairSummary(
  rounds: number,
  totalActions: number,
  remainingIssues: VerificationIssue[]
): string {
  if (remainingIssues.length === 0) {
    return `✅ Auto-repair completed: ${totalActions} issues fixed in ${rounds} round(s)`;
  }

  const errors = remainingIssues.filter(i => i.severity === "error");
  const warnings = remainingIssues.filter(i => i.severity === "warning");

  return [
    `⚠️ Auto-repair ran ${rounds} round(s), fixed ${totalActions} issues.`,
    errors.length > 0 ? `${errors.length} errors remain:` : "",
    ...errors.map(e => `  ❌ ${e.file}: ${e.message}`),
    warnings.length > 0 ? `${warnings.length} warnings:` : "",
    ...warnings.map(w => `  ⚠️ ${w.file}: ${w.message}`),
  ].filter(Boolean).join("\n");
}
