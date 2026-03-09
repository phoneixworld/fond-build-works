/**
 * Smart Dependency Resolution — auto-detects npm packages from import
 * statements in generated code and adds them to the Sandpack dependency list.
 *
 * Handles:
 * - Known package mapping (lucide-react, framer-motion, recharts, etc.)
 * - Scoped packages (@radix-ui, @tanstack, etc.)
 * - Version pinning for stability
 * - Exclusion of local/relative imports
 */

// ─── Known Package Registry ──────────────────────────────────────────────

interface PackageInfo {
  version: string;
  description?: string;
}

const KNOWN_PACKAGES: Record<string, PackageInfo> = {
  // Core React ecosystem
  "react": { version: "^18.2.0" },
  "react-dom": { version: "^18.2.0" },
  "react-router-dom": { version: "^6.20.0" },

  // UI & Animation
  "lucide-react": { version: "^0.400.0" },
  "framer-motion": { version: "^11.0.0" },
  "clsx": { version: "^2.1.0" },
  "tailwind-merge": { version: "^2.2.0" },
  "class-variance-authority": { version: "^0.7.0" },

  // Data & Charts
  "recharts": { version: "^2.12.0" },
  "date-fns": { version: "^3.6.0" },
  "chart.js": { version: "^4.4.0" },
  "react-chartjs-2": { version: "^5.2.0" },

  // Forms & Validation
  "react-hook-form": { version: "^7.50.0" },
  "zod": { version: "^3.22.0" },
  "@hookform/resolvers": { version: "^3.3.0" },

  // State Management
  "zustand": { version: "^4.5.0" },
  "jotai": { version: "^2.6.0" },
  "@tanstack/react-query": { version: "^5.17.0" },
  "@tanstack/react-table": { version: "^8.11.0" },

  // Utilities
  "axios": { version: "^1.6.0" },
  "lodash": { version: "^4.17.21" },
  "uuid": { version: "^9.0.0" },
  "dayjs": { version: "^1.11.0" },
  "nanoid": { version: "^5.0.0" },
  "immer": { version: "^10.0.0" },

  // Radix UI primitives
  "@radix-ui/react-dialog": { version: "^1.0.5" },
  "@radix-ui/react-dropdown-menu": { version: "^2.0.6" },
  "@radix-ui/react-popover": { version: "^1.0.7" },
  "@radix-ui/react-select": { version: "^2.0.0" },
  "@radix-ui/react-tabs": { version: "^1.0.4" },
  "@radix-ui/react-tooltip": { version: "^1.0.7" },
  "@radix-ui/react-checkbox": { version: "^1.0.4" },
  "@radix-ui/react-switch": { version: "^1.0.3" },
  "@radix-ui/react-slot": { version: "^1.0.2" },
  "@radix-ui/react-label": { version: "^2.0.2" },
  "@radix-ui/react-separator": { version: "^1.0.3" },
  "@radix-ui/react-avatar": { version: "^1.0.4" },
  "@radix-ui/react-scroll-area": { version: "^1.0.5" },
  "@radix-ui/react-accordion": { version: "^1.1.2" },
  "@radix-ui/react-progress": { version: "^1.0.3" },
  "@radix-ui/react-slider": { version: "^1.1.2" },
  "@radix-ui/react-toggle": { version: "^1.0.3" },
  "@radix-ui/react-collapsible": { version: "^1.0.3" },

  // DnD
  "@dnd-kit/core": { version: "^6.1.0" },
  "@dnd-kit/sortable": { version: "^8.0.0" },
  "@dnd-kit/utilities": { version: "^3.2.0" },
  "react-beautiful-dnd": { version: "^13.1.1" },

  // Markdown
  "react-markdown": { version: "^9.0.0" },
  "remark-gfm": { version: "^4.0.0" },

  // Icons
  "react-icons": { version: "^5.0.0" },
  "@heroicons/react": { version: "^2.1.0" },

  // Misc
  "react-hot-toast": { version: "^2.4.0" },
  "sonner": { version: "^1.3.0" },
  "cmdk": { version: "^0.2.0" },
  "embla-carousel-react": { version: "^8.0.0" },
  "react-day-picker": { version: "^8.10.0" },
  "input-otp": { version: "^1.2.0" },
  "vaul": { version: "^0.9.0" },
  "next-themes": { version: "^0.3.0" },
};

// Packages that should NOT be included (they're built into the environment)
const BUILTIN_PACKAGES = new Set([
  "react", "react-dom", "react/jsx-runtime",
]);

// ─── Import Scanner ───────────────────────────────────────────────────────

/**
 * Scan all generated files for import statements and resolve
 * them to npm package names with versions.
 *
 * @returns A map of package name → version string
 */
export function resolveImportedDependencies(
  files: Record<string, string>,
  existingDeps?: Record<string, string>
): Record<string, string> {
  const detectedPackages = new Set<string>();

  for (const code of Object.values(files)) {
    // Match: import ... from "package-name"
    // Match: import "package-name"
    const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?["']([^"'./][^"']*)["']/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];
      const packageName = resolvePackageName(importPath);
      if (packageName && !BUILTIN_PACKAGES.has(packageName)) {
        detectedPackages.add(packageName);
      }
    }

    // Also match dynamic imports: import("package-name")
    const dynamicRegex = /import\s*\(\s*["']([^"'./][^"']*)["']\s*\)/g;
    while ((match = dynamicRegex.exec(code)) !== null) {
      const packageName = resolvePackageName(match[1]);
      if (packageName && !BUILTIN_PACKAGES.has(packageName)) {
        detectedPackages.add(packageName);
      }
    }

    // Match require() for edge cases
    const requireRegex = /require\s*\(\s*["']([^"'./][^"']*)["']\s*\)/g;
    while ((match = requireRegex.exec(code)) !== null) {
      const packageName = resolvePackageName(match[1]);
      if (packageName && !BUILTIN_PACKAGES.has(packageName)) {
        detectedPackages.add(packageName);
      }
    }
  }

  // Build dependency map with version resolution
  const deps: Record<string, string> = { ...(existingDeps || {}) };

  for (const pkg of detectedPackages) {
    // Skip if already in existing deps
    if (deps[pkg]) continue;

    const known = KNOWN_PACKAGES[pkg];
    if (known) {
      deps[pkg] = known.version;
    } else {
      // Unknown package — use "latest" as fallback
      // Only add if it looks like a real package name
      if (isValidPackageName(pkg)) {
        deps[pkg] = "latest";
        console.log(`[DepResolver] Unknown package detected: ${pkg} — using "latest"`);
      }
    }
  }

  return deps;
}

/**
 * Resolve an import path to a package name.
 * Handles scoped packages (@scope/package) and subpath imports.
 */
function resolvePackageName(importPath: string): string | null {
  if (!importPath) return null;

  // Scoped package: @scope/package or @scope/package/subpath
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  // Regular package: package or package/subpath
  const parts = importPath.split("/");
  return parts[0];
}

/**
 * Basic validation that a string looks like an npm package name.
 */
function isValidPackageName(name: string): boolean {
  // Must start with letter, @, or underscore
  if (!/^[@a-zA-Z_]/.test(name)) return false;
  // No spaces or special chars (except / for scoped packages and -)
  if (/[^a-zA-Z0-9@/_\-.]/.test(name)) return false;
  // Not too short or too long
  if (name.length < 2 || name.length > 100) return false;
  // Common false positives
  const falsePositives = new Set([
    "components", "utils", "lib", "hooks", "pages", "styles",
    "contexts", "services", "types", "constants", "helpers",
    "config", "api", "data", "assets", "layout",
  ]);
  return !falsePositives.has(name);
}

/**
 * Get a summary of dependency changes for logging.
 */
export function getDependencyDiff(
  before: Record<string, string>,
  after: Record<string, string>
): { added: string[]; updated: string[] } {
  const added: string[] = [];
  const updated: string[] = [];

  for (const [pkg, version] of Object.entries(after)) {
    if (!before[pkg]) {
      added.push(`${pkg}@${version}`);
    } else if (before[pkg] !== version) {
      updated.push(`${pkg}: ${before[pkg]} → ${version}`);
    }
  }

  return { added, updated };
}