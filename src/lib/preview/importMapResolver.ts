/**
 * Phoenix Import Map Resolver
 * 
 * Pluggable import map resolution with version pinning,
 * CDN abstraction, and bare import scanning.
 */

import type { ImportMapProvider, BareImport } from "./types";

// ─── Version Registry ───────────────────────────────────────────────────────

const PINNED_VERSIONS: Record<string, string> = {
  "react":                       "18.2.0",
  "react-dom":                   "18.2.0",
  "react/jsx-runtime":           "18.2.0",
  "react/jsx-dev-runtime":       "18.2.0",
  "lucide-react":                "0.400.0",
  "framer-motion":               "11.0.0",
  "date-fns":                    "3.6.0",
  "recharts":                    "2.12.0",
  "react-router-dom":            "6.22.0",
  "clsx":                        "2.1.0",
  "tailwind-merge":              "2.2.0",
  "react-intersection-observer": "9.10.0",
  "zustand":                     "4.5.0",
  "zod":                         "3.22.0",
  "sonner":                      "1.7.0",
  "react-hook-form":             "7.50.0",
  "@tanstack/react-query":       "5.20.0",
  "@radix-ui/react-dialog":      "1.0.5",
  "@radix-ui/react-dropdown-menu":"2.0.6",
  "@radix-ui/react-popover":     "1.0.7",
  "@radix-ui/react-tabs":        "1.0.4",
  "@radix-ui/react-tooltip":     "1.0.7",
  "@radix-ui/react-slot":        "1.0.2",
};

/** Packages that must share the same React instance */
const REACT_EXTERNALS = ["react", "react-dom"];

// ─── CDN Import Map Provider ────────────────────────────────────────────────

export class CdnImportMapProvider implements ImportMapProvider {
  private cdnBase: string;
  private customVersions: Record<string, string>;

  constructor(cdnBase = "https://esm.sh", customVersions: Record<string, string> = {}) {
    this.cdnBase = cdnBase.replace(/\/$/, "");
    this.customVersions = customVersions;
  }

  resolve(specifier: string, version?: string): string {
    const base = this.getBase(specifier);
    const subpath = specifier.replace(base, "");
    const v = version
      || this.customVersions[specifier]
      || this.customVersions[base]
      || PINNED_VERSIONS[specifier]
      || PINNED_VERSIONS[base]
      || "latest";

    const externals = REACT_EXTERNALS.filter(e => e !== base);
    const externalParam = externals.length > 0 ? `?external=${externals.join(",")}` : "";

    return `${this.cdnBase}/${base}@${v}${subpath}${externalParam}`;
  }

  resolveAll(specifiers: BareImport[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const imp of specifiers) {
      const fullSpec = imp.subpath ? `${imp.specifier}/${imp.subpath}` : imp.specifier;
      map[fullSpec] = this.resolve(fullSpec, imp.version);
    }
    return map;
  }

  private getBase(specifier: string): string {
    if (specifier.startsWith("@")) {
      return specifier.split("/").slice(0, 2).join("/");
    }
    return specifier.split("/")[0];
  }
}

// ─── Bare Import Scanner ────────────────────────────────────────────────────

/**
 * Scan all modules for bare import specifiers (non-relative, non-absolute).
 * Returns deduplicated list of BareImports.
 */
export function scanBareImports(
  files: Record<string, string>,
  workspaceDeps?: Record<string, string>
): BareImport[] {
  const seen = new Set<string>();
  const result: BareImport[] = [];

  for (const code of Object.values(files)) {
    const matches = code.matchAll(/(?:import|from)\s+['"]([^./][^'"]*)['"]/g);
    for (const m of matches) {
      const specifier = m[1];
      if (!seen.has(specifier)) {
        seen.add(specifier);
        const base = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        const subpath = specifier.replace(base, "").replace(/^\//, "") || undefined;
        result.push({
          specifier: base,
          subpath,
          version: workspaceDeps?.[specifier] || workspaceDeps?.[base],
        });
      }
    }
  }

  // Always include React core
  const coreImports: BareImport[] = [
    { specifier: "react" },
    { specifier: "react-dom", subpath: "client" },
    { specifier: "react", subpath: "jsx-runtime" },
    { specifier: "react", subpath: "jsx-dev-runtime" },
  ];

  for (const core of coreImports) {
    const fullSpec = core.subpath ? `${core.specifier}/${core.subpath}` : core.specifier;
    if (!seen.has(fullSpec)) {
      seen.add(fullSpec);
      result.push(core);
    }
  }

  return result;
}

/**
 * Build a complete import map from workspace files and dependencies.
 */
export function buildImportMap(
  files: Record<string, string>,
  workspaceDeps?: Record<string, string>,
  provider?: ImportMapProvider
): Record<string, string> {
  const resolverProvider = provider || new CdnImportMapProvider();
  const bareImports = scanBareImports(files, workspaceDeps);
  return resolverProvider.resolveAll(bareImports);
}
