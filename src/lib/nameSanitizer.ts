/**
 * Centralized name/filename/route sanitizer.
 * Prevents filenames with spaces, special characters, or invalid JS identifiers
 * from entering the build pipeline.
 */

/** Convert any raw name to a valid PascalCase JS identifier */
export function sanitizeName(raw: string): string {
  if (!raw) return "Untitled";
  return raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Convert a raw name to a safe filename (PascalCase + extension) */
export function sanitizeFilename(raw: string, ext = "jsx"): string {
  const base = sanitizeName(raw);
  return `${base}.${ext}`;
}

/** Convert a raw name to a kebab-case route path */
export function sanitizeRoute(raw: string): string {
  if (!raw) return "/";
  return (
    "/" +
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
