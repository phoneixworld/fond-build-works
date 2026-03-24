/**
 * Interface Contracts — generates lightweight .d.ts-style summaries
 * of completed task outputs so later tasks only need contracts,
 * not full source code.
 * 
 * This dramatically reduces context window pressure for multi-task builds.
 */

/** A minimal contract describing what a file exports */
export interface FileContract {
  path: string;
  defaultExport?: string;
  namedExports: string[];
  /** Component prop names (for React components) */
  props?: string[];
  /** Import sources this file depends on */
  dependencies: string[];
}

/** Extract contracts from a set of files without parsing full AST */
export function extractFileContracts(files: Record<string, string>): FileContract[] {
  const contracts: FileContract[] = [];

  for (const [path, code] of Object.entries(files)) {
    if (!path.match(/\.(jsx?|tsx?)$/)) continue;

    const contract: FileContract = {
      path,
      namedExports: [],
      dependencies: [],
    };

    // Extract default export
    const defaultMatch = code.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    if (defaultMatch) {
      contract.defaultExport = defaultMatch[1];
    }

    // Extract named exports
    const namedRe = /export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = namedRe.exec(code)) !== null) {
      contract.namedExports.push(m[1]);
    }

    // Extract re-exports
    const reExportRe = /export\s+\{([^}]+)\}/g;
    while ((m = reExportRe.exec(code)) !== null) {
      const names = m[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
      contract.namedExports.push(...names);
    }

    // Extract component props (simple heuristic)
    const propsMatch = code.match(/(?:interface|type)\s+\w*Props\s*[={\s]([^}]+)/);
    if (propsMatch) {
      const propNames = propsMatch[1].match(/(\w+)\s*[?:]?/g);
      if (propNames) {
        contract.props = propNames.map(p => p.replace(/[?:]/g, "").trim()).filter(Boolean);
      }
    }

    // Extract import sources
    const importRe = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    while ((m = importRe.exec(code)) !== null) {
      if (m[1].startsWith(".") || m[1].startsWith("/")) {
        contract.dependencies.push(m[1]);
      }
    }

    contracts.push(contract);
  }

  return contracts;
}

/** 
 * Serialize contracts into a compact string for context injection.
 * Much smaller than full source code.
 */
export function serializeContracts(contracts: FileContract[]): string {
  if (contracts.length === 0) return "";

  const lines: string[] = ["## FILE CONTRACTS (import from these — do NOT recreate)"];

  for (const c of contracts) {
    const exports: string[] = [];
    if (c.defaultExport) exports.push(`default: ${c.defaultExport}`);
    if (c.namedExports.length > 0) exports.push(`named: { ${c.namedExports.join(", ")} }`);
    
    lines.push(`- ${c.path}: ${exports.join(", ")}`);
    if (c.props && c.props.length > 0) {
      lines.push(`  props: ${c.props.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Estimate the size reduction from using contracts vs full source.
 */
// In-memory snapshot for cross-module access
let _lastSnapshot: string | undefined;

/** Store a contracts snapshot for retrieval by other modules (e.g. chat agent) */
export function setInterfaceContractsSnapshot(snapshot: string): void {
  _lastSnapshot = snapshot;
}

/** Retrieve the last stored contracts snapshot */
export function getInterfaceContractsSnapshot(): string | undefined {
  return _lastSnapshot;
}

/**
 * Estimate the size reduction from using contracts vs full source.
 */
export function contractReductionStats(
  files: Record<string, string>,
  contracts: FileContract[]
): { fullSize: number; contractSize: number; reductionPercent: number } {
  const fullSize = Object.values(files).reduce((s, c) => s + c.length, 0);
  const contractSize = serializeContracts(contracts).length;
  const reductionPercent = fullSize > 0 ? Math.round((1 - contractSize / fullSize) * 100) : 0;
  return { fullSize, contractSize, reductionPercent };
}
