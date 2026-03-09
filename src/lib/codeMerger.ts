/**
 * Code Merger — intelligently merges React files across sequential build tasks.
 *
 * Key capabilities:
 * 1. diff-match-patch for general files — preserves user edits, applies only changes
 * 2. AST-level merging for App.jsx — combines routes, imports, nav without conflicts
 * 3. Backend-protected paths — prevents frontend tasks from overwriting data/hooks
 * 4. CSS smart merge — overlap detection with @import deduplication
 */

import diff_match_patch from "diff-match-patch";

export interface MergeResult {
  files: Record<string, string>;
  conflicts: string[];
}

// ─── diff-match-patch instance ────────────────────────────────────────────

const dmp = new diff_match_patch();
// Increase match distance for better fuzzy matching in large files
dmp.Match_Distance = 2000;
dmp.Patch_DeleteThreshold = 0.6;

// ─── Import Utilities ─────────────────────────────────────────────────────

function extractImports(code: string): { imports: string[]; body: string } {
  const lines = code.split("\n");
  const imports: string[] = [];
  const bodyLines: string[] = [];
  let pastImports = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!pastImports && (trimmed.startsWith("import ") || trimmed.startsWith("// ") || trimmed === "")) {
      if (trimmed.startsWith("import ")) imports.push(trimmed);
    } else {
      pastImports = true;
      bodyLines.push(line);
    }
  }

  return { imports, body: bodyLines.join("\n") };
}

function extractRoutes(code: string): string[] {
  const routeRegex = /<Route\s+[^>]*?(?:path=["'][^"']+["']|index)[^>]*?\/?>/g;
  return code.match(routeRegex) || [];
}

function extractNavItems(code: string): string[] {
  // Match nav item object literals: { to: "...", icon: ..., label: "..." }
  const navRegex = /\{\s*to:\s*["'][^"']+["'],\s*icon:\s*\w+,\s*label:\s*["'][^"']+["']\s*\}/g;
  return code.match(navRegex) || [];
}

function deduplicateImports(imports: string[]): string[] {
  const seen = new Map<string, string>();
  const seenDefaultNames = new Map<string, string>();

  for (const imp of imports) {
    const fromMatch = imp.match(/from\s+["']([^"']+)["']/);
    if (!fromMatch) {
      seen.set(imp, imp);
      continue;
    }

    const modulePath = fromMatch[1];
    const defaultName = extractDefaultImport(imp);
    if (defaultName) {
      const existingPath = seenDefaultNames.get(defaultName);
      if (existingPath && existingPath !== modulePath) {
        if (modulePath.length > existingPath.length) {
          seen.delete(existingPath);
          seenDefaultNames.set(defaultName, modulePath);
        } else {
          continue;
        }
      } else {
        seenDefaultNames.set(defaultName, modulePath);
      }
    }

    const existing = seen.get(modulePath);
    if (!existing) {
      seen.set(modulePath, imp);
      continue;
    }

    // Merge named imports from same module
    const existingNames = extractNamedImports(existing);
    const newNames = extractNamedImports(imp);
    const existingDefault = extractDefaultImport(existing);
    const newDefault = extractDefaultImport(imp);

    const allNames = [...new Set([...existingNames, ...newNames])];
    const defaultImport = newDefault || existingDefault;

    let merged = "import ";
    if (defaultImport) {
      merged += defaultImport;
      if (allNames.length > 0) merged += ", ";
    }
    if (allNames.length > 0) {
      merged += `{ ${allNames.join(", ")} }`;
    }
    merged += ` from "${modulePath}";`;

    seen.set(modulePath, merged);
  }

  return Array.from(seen.values());
}

function extractNamedImports(imp: string): string[] {
  const match = imp.match(/\{([^}]+)\}/);
  if (!match) return [];
  return match[1].split(",").map(s => s.trim()).filter(Boolean);
}

function extractDefaultImport(imp: string): string | null {
  const match = imp.match(/import\s+(\w+)\s*[,{]/);
  if (match) return match[1];
  const match2 = imp.match(/import\s+(\w+)\s+from/);
  if (match2) return match2[1];
  return null;
}

// ─── Backend-protected path patterns ──────────────────────────────────────

const BACKEND_PROTECTED_PATTERNS = [
  /^\/data\//,
  /^\/hooks\/use\w+/,
  /^\/contexts\/\w+Context/,
  /^\/contexts\/DataContext/,
  /^\/contexts\/AuthContext/,
  /^\/api\//,
  /^\/lib\/api/,
];

const APPEND_ONLY_PATTERNS = [
  /^\/data\/schema/,
  /^\/migrations\//,
  /^\/supabase\//,
];

export function isBackendProtected(path: string): boolean {
  return BACKEND_PROTECTED_PATTERNS.some(p => p.test(path));
}

function isAppendOnly(path: string): boolean {
  return APPEND_ONLY_PATTERNS.some(p => p.test(path));
}

// ─── Diff-Based Merge (general files) ─────────────────────────────────────

/**
 * Merge a file using diff-match-patch: compute patches from base→incoming,
 * then apply those patches to the user's current version.
 *
 * This preserves user edits in areas the AI didn't change.
 *
 * @param base    - The original version (before user edits, before AI changes)
 * @param current - The user's current version (may have manual edits)
 * @param incoming - The AI's new version
 * @returns merged code and whether any hunks failed
 */
function diffMergeFile(
  base: string,
  current: string,
  incoming: string
): { code: string; clean: boolean; failedHunks: number } {
  // If base and current are identical, no user edits — just use incoming
  if (base === current) {
    return { code: incoming, clean: true, failedHunks: 0 };
  }

  // If base and incoming are identical, no AI changes — keep current
  if (base === incoming) {
    return { code: current, clean: true, failedHunks: 0 };
  }

  // Compute patches: what did the AI change from base → incoming?
  const patches = dmp.patch_make(base, incoming);

  if (patches.length === 0) {
    return { code: current, clean: true, failedHunks: 0 };
  }

  // Apply those patches to the user's current version
  const [merged, results] = dmp.patch_apply(patches, current);
  const failedHunks = results.filter(r => !r).length;

  return {
    code: merged,
    clean: failedHunks === 0,
    failedHunks,
  };
}

// ─── AST-Level App.jsx Merge ──────────────────────────────────────────────

/**
 * Merge two App.jsx files at the structural level:
 * - Combine all imports (deduplicated)
 * - Combine all <Route> definitions (by path, no duplicates)
 * - Preserve the incoming file's structure/wrapper as authoritative
 */
function mergeAppFile(
  existingCode: string,
  incomingCode: string
): { code: string; conflicts: string[] } {
  const conflicts: string[] = [];

  const existingParsed = extractImports(existingCode);
  const incomingParsed = extractImports(incomingCode);

  // 1. Merge imports
  const mergedImports = deduplicateImports([
    ...existingParsed.imports,
    ...incomingParsed.imports,
  ]);

  // 2. Extract and merge routes
  const existingRoutes = extractRoutes(existingCode);
  const incomingRoutes = extractRoutes(incomingCode);

  const incomingPaths = new Set<string>();
  for (const r of incomingRoutes) {
    const m = r.match(/path=["']([^"']+)["']/);
    if (m) incomingPaths.add(m[1]);
    if (r.includes("index")) incomingPaths.add("__index__");
  }

  const missingRoutes = existingRoutes.filter(r => {
    const m = r.match(/path=["']([^"']+)["']/);
    if (m) return !incomingPaths.has(m[1]);
    if (r.includes("index")) return !incomingPaths.has("__index__");
    return false;
  });

  let finalBody = incomingParsed.body;

  if (missingRoutes.length > 0) {
    const routesCloseIdx = finalBody.lastIndexOf("</Routes>");
    if (routesCloseIdx !== -1) {
      const routeInsert = missingRoutes
        .map(r => `              ${r}`)
        .join("\n");
      finalBody =
        finalBody.slice(0, routesCloseIdx) +
        routeInsert +
        "\n            " +
        finalBody.slice(routesCloseIdx);
      conflicts.push(
        `App.jsx: merged ${missingRoutes.length} route(s) from previous tasks`
      );
    }
  }

  const code = mergedImports.join("\n") + "\n\n" + finalBody;
  return { code, conflicts };
}

/**
 * Merge Sidebar.jsx: combine nav items from both versions without duplicates.
 */
function mergeSidebarFile(
  existing: string,
  incoming: string
): { code: string; conflicts: string[] } {
  const conflicts: string[] = [];

  const existingNavItems = extractNavItems(existing);
  const incomingNavItems = extractNavItems(incoming);

  // Extract 'to' paths from incoming
  const incomingPaths = new Set<string>();
  for (const item of incomingNavItems) {
    const m = item.match(/to:\s*["']([^"']+)["']/);
    if (m) incomingPaths.add(m[1]);
  }

  // Find nav items in existing that aren't in incoming
  const missingItems = existingNavItems.filter(item => {
    const m = item.match(/to:\s*["']([^"']+)["']/);
    return m && !incomingPaths.has(m[1]);
  });

  if (missingItems.length === 0) {
    return { code: incoming, conflicts };
  }

  // Inject missing items into the incoming navItems array
  const navArrayEnd = incoming.lastIndexOf("];");
  if (navArrayEnd !== -1) {
    // Find the navItems array specifically
    const navItemsStart = incoming.indexOf("const navItems");
    if (navItemsStart !== -1) {
      const arrayEnd = incoming.indexOf("];", navItemsStart);
      if (arrayEnd !== -1) {
        const insertStr = missingItems.map(item => `  ${item},`).join("\n");
        const merged =
          incoming.slice(0, arrayEnd) +
          "\n" +
          insertStr +
          "\n" +
          incoming.slice(arrayEnd);
        conflicts.push(
          `Sidebar: merged ${missingItems.length} nav item(s) from previous tasks`
        );

        // Also merge imports for icons
        const existingParsed = extractImports(existing);
        const incomingParsed = extractImports(incoming);
        const mergedImports = deduplicateImports([
          ...existingParsed.imports,
          ...incomingParsed.imports,
        ]);

        const firstImportLine = merged.indexOf("import ");
        const lastImportEnd = merged.lastIndexOf(
          "\n",
          merged.indexOf("\n\n", firstImportLine)
        );
        if (firstImportLine !== -1 && lastImportEnd !== -1) {
          const bodyAfterImports = extractImports(merged).body;
          return {
            code: mergedImports.join("\n") + "\n\n" + bodyAfterImports,
            conflicts,
          };
        }

        return { code: merged, conflicts };
      }
    }
  }

  return { code: incoming, conflicts };
}

// ─── Backend File Merge ───────────────────────────────────────────────────

function mergeBackendFiles(
  existing: string,
  incoming: string,
  _path: string
): string {
  const existingParsed = extractImports(existing);
  const incomingParsed = extractImports(incoming);

  const existingExports =
    existing.match(/export\s+(function|const|default)\s+(\w+)/g) || [];
  const incomingExports =
    incoming.match(/export\s+(function|const|default)\s+(\w+)/g) || [];

  const existingNames = new Set(
    existingExports.map(e => e.match(/(\w+)$/)?.[1])
  );
  const hasNewExports = incomingExports.some(e => {
    const name = e.match(/(\w+)$/)?.[1];
    return name && !existingNames.has(name);
  });

  if (hasNewExports) {
    const mergedImports = deduplicateImports([
      ...existingParsed.imports,
      ...incomingParsed.imports,
    ]);
    return (
      mergedImports.join("\n") +
      "\n\n" +
      existingParsed.body +
      "\n\n// ── Added by backend task ──\n\n" +
      incomingParsed.body
    );
  }

  return incoming;
}

// ─── Main Merge ───────────────────────────────────────────────────────────

/**
 * Merge two sets of React files intelligently.
 *
 * @param existing - Current file state (user's version)
 * @param incoming - AI-generated new/updated files
 * @param protectBackend - If true, frontend tasks can't overwrite backend files
 * @param base - Optional base version for 3-way diff merge
 */
export function mergeFiles(
  existing: Record<string, string>,
  incoming: Record<string, string>,
  protectBackend = false,
  base?: Record<string, string>
): MergeResult {
  const result = { ...existing };
  const conflicts: string[] = [];

  for (const [path, code] of Object.entries(incoming)) {
    if (code.trim().length === 0) continue;

    // New file — just add it
    if (!result[path]) {
      result[path] = code;
      continue;
    }

    // Protected backend files
    if (protectBackend && isBackendProtected(path)) {
      conflicts.push(`${path}: protected — skipped frontend overwrite`);
      continue;
    }

    // Append-only files
    if (isAppendOnly(path)) {
      if (!result[path].includes(code.trim())) {
        result[path] = result[path] + "\n\n" + code;
        conflicts.push(`${path}: append-only — content appended`);
      }
      continue;
    }

    // Backend-to-backend merge
    if (!protectBackend && isBackendProtected(path)) {
      result[path] = mergeBackendFiles(result[path], code, path);
      conflicts.push(`${path}: backend files merged`);
      continue;
    }

    // App.jsx — AST-level route/import merge
    if (path === "/App.jsx" || path === "/App.tsx") {
      const merged = mergeAppFile(result[path], code);
      result[path] = merged.code;
      conflicts.push(...merged.conflicts);
      continue;
    }

    // Sidebar — nav item merge
    if (path.includes("Sidebar") && path.match(/\.(jsx?|tsx?)$/)) {
      const merged = mergeSidebarFile(result[path], code);
      result[path] = merged.code;
      conflicts.push(...merged.conflicts);
      continue;
    }

    // CSS files — overlap-aware merge
    if (path.endsWith(".css")) {
      const existingLines = new Set(
        result[path]
          .split("\n")
          .map(l => l.trim())
          .filter(Boolean)
      );
      const incomingLines = code
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);
      const overlapCount = incomingLines.filter(l =>
        existingLines.has(l)
      ).length;
      const overlapRatio =
        incomingLines.length > 0 ? overlapCount / incomingLines.length : 0;

      if (overlapRatio > 0.3) {
        result[path] = code;
      } else {
        const existingImports = new Set(
          result[path]
            .split("\n")
            .filter(l => l.trim().startsWith("@import"))
            .map(l => l.trim())
        );
        const dedupedIncoming = code
          .split("\n")
          .filter(l => {
            const trimmed = l.trim();
            return !trimmed.startsWith("@import") || !existingImports.has(trimmed);
          })
          .join("\n");
        result[path] = result[path] + "\n\n" + dedupedIncoming;
      }
      continue;
    }

    // General JS/JSX/TS/TSX files — use diff-match-patch if we have a base
    if (base && base[path] && path.match(/\.(jsx?|tsx?)$/)) {
      const { code: merged, clean, failedHunks } = diffMergeFile(
        base[path],
        result[path],
        code
      );
      result[path] = merged;
      if (!clean) {
        conflicts.push(
          `${path}: diff merge had ${failedHunks} failed hunk(s) — some changes may be lost`
        );
      } else if (base[path] !== code) {
        conflicts.push(`${path}: diff-merged (user edits preserved)`);
      }
      continue;
    }

    // Fallback: later wins, but try import deduplication for JS files
    if (path.match(/\.(jsx?|tsx?)$/) && result[path]) {
      const existingParsed = extractImports(result[path]);
      const incomingParsed = extractImports(code);

      // If both files have the same structure, use incoming
      // but deduplicate imports to avoid breaking
      const mergedImports = deduplicateImports([
        ...existingParsed.imports,
        ...incomingParsed.imports,
      ]);

      // Use incoming body (authoritative) with merged imports
      result[path] = mergedImports.join("\n") + "\n\n" + incomingParsed.body;
      conflicts.push(`${path}: overwritten with import dedup`);
      continue;
    }

    // Non-JS files — later wins
    conflicts.push(`${path}: overwritten by later task`);
    result[path] = code;
  }

  return { files: result, conflicts };
}

// ─── Code Context Builder ─────────────────────────────────────────────────

export function buildFullCodeContext(
  files: Record<string, string>,
  budgetChars = 32000
): string {
  const entries = Object.entries(files);
  if (entries.length === 0) return "";

  const totalChars = entries.reduce((sum, [, code]) => sum + code.length, 0);

  if (totalChars <= budgetChars) {
    return entries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  }

  const PRIORITY = ["/App.jsx", "/App.tsx", "/App.js"];
  const NAV_PATTERNS = ["/Sidebar", "/Navigation", "/Nav", "/Layout"];

  const priorityFiles = entries.filter(
    ([p]) =>
      PRIORITY.some(k => p.endsWith(k)) || NAV_PATTERNS.some(k => p.includes(k))
  );
  const otherFiles = entries.filter(
    ([p]) =>
      !PRIORITY.some(k => p.endsWith(k)) &&
      !NAV_PATTERNS.some(k => p.includes(k))
  );

  let result = "";
  let remaining = budgetChars;

  for (const [path, code] of priorityFiles) {
    const section = `--- ${path}\n${code}\n\n`;
    result += section;
    remaining -= section.length;
  }

  for (const [path, code] of otherFiles) {
    if (remaining <= 200) {
      result += `--- ${path} (${code.length} chars — omitted)\n`;
      continue;
    }
    if (code.length <= remaining) {
      const section = `--- ${path}\n${code}\n\n`;
      result += section;
      remaining -= section.length;
    } else {
      const lines = code.split("\n");
      const preview = lines.slice(0, 30).join("\n");
      result += `--- ${path} (truncated, ${lines.length} total lines)\n${preview}\n...[truncated]\n\n`;
      remaining -= preview.length + 100;
    }
  }

  return result;
}
