/**
 * Workspace Summary — generates a compressed manifest of workspace files,
 * their exports, and route structure for context injection.
 */

import { extractFileContracts, serializeContracts } from "@/lib/codeMerger/interfaceContracts";

const MAX_SUMMARY_SIZE = 8192; // 8KB cap

export function buildWorkspaceSummary(files: Record<string, string>): string {
  const contracts = extractFileContracts(files);
  let summary = serializeContracts(contracts);

  // Cap to budget
  if (summary.length > MAX_SUMMARY_SIZE) {
    summary = summary.slice(0, MAX_SUMMARY_SIZE) + "\n... (truncated)";
  }

  return summary;
}
