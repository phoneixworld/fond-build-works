/**
 * Path normalization utilities for consistent src/ root structure.
 *
 * Internal Sandpack files use bare "/" paths (e.g., /App.jsx, /components/Hero.jsx).
 * External surfaces (VirtualFS display, GitHub sync, Android/ZIP export) use "src/" prefix.
 *
 * This module provides mapping between the two conventions.
 */

/** Files that live at project root, NOT inside src/ */
const ROOT_FILES = new Set([
  "package.json",
  "vite.config.js",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.cjs",
  "README.md",
  "LICENSE",
  ".gitignore",
  ".eslintrc.js",
  ".eslintrc.cjs",
  "eslint.config.js",
  "index.html",
  "docker-compose.yml",
  "Dockerfile",
  ".env",
  ".env.local",
  ".env.example",
]);

/** Directories that stay at project root */
const ROOT_DIRS = ["public/", "server/", ".github/", "supabase/", "node_modules/"];

/**
 * Check if a path should remain at the project root (not inside src/).
 */
function isRootPath(path: string): boolean {
  const clean = path.replace(/^\/+/, "");
  if (ROOT_FILES.has(clean)) return true;
  return ROOT_DIRS.some(dir => clean.startsWith(dir));
}

/**
 * Convert a Sandpack bare path to a src/-prefixed export path.
 * e.g., "/App.jsx" → "src/App.jsx"
 *        "/components/Hero.jsx" → "src/components/Hero.jsx"
 *        "package.json" → "package.json" (root file, unchanged)
 */
export function toExportPath(sandpackPath: string): string {
  const clean = sandpackPath.replace(/^\/+/, "");
  if (!clean) return clean;
  if (clean.startsWith("src/")) return clean; // already prefixed
  if (isRootPath(clean)) return clean;
  return `src/${clean}`;
}

/**
 * Convert a src/-prefixed path back to Sandpack's bare path.
 * e.g., "src/App.jsx" → "/App.jsx"
 *        "src/components/Hero.jsx" → "/components/Hero.jsx"
 *        "package.json" → "/package.json"
 */
export function toSandpackPath(exportPath: string): string {
  const clean = exportPath.replace(/^\/+/, "");
  if (clean.startsWith("src/")) {
    return "/" + clean.slice(4);
  }
  return "/" + clean;
}

/**
 * Convert a full record of Sandpack files to export paths (for GitHub push, ZIP export, etc.)
 */
export function toExportFiles(sandpackFiles: Record<string, string>): Array<{ path: string; content: string }> {
  return Object.entries(sandpackFiles).map(([path, content]) => ({
    path: toExportPath(path),
    content,
  }));
}

/**
 * Convert imported files (from GitHub pull, etc.) to Sandpack-compatible paths.
 */
export function toSandpackFiles(importedFiles: Array<{ path: string; content: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of importedFiles) {
    result[toSandpackPath(file.path)] = file.content;
  }
  return result;
}

/**
 * Convert VirtualFS display files to export paths for display in the file tree.
 * This ensures the code editor shows src/ structure.
 */
export function toDisplayPath(internalPath: string): string {
  return toExportPath(internalPath);
}
