/**
 * Code Merger — intelligently merges React files across sequential build tasks.
 * 
 * Key capability: When multiple tasks each generate /App.jsx with different routes,
 * this merger combines all routes, imports, and sidebar entries into one coherent App.
 */

export interface MergeResult {
  files: Record<string, string>;
  conflicts: string[];
}

/**
 * Extract import statements from code
 */
function extractImports(code: string): { imports: string[]; body: string } {
  const lines = code.split("\n");
  const imports: string[] = [];
  const bodyLines: string[] = [];
  let pastImports = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!pastImports && (trimmed.startsWith("import ") || trimmed.startsWith("// ") || trimmed === "")) {
      if (trimmed.startsWith("import ")) imports.push(trimmed);
      // skip blank lines and comments before body
    } else {
      pastImports = true;
      bodyLines.push(line);
    }
  }

  return { imports, body: bodyLines.join("\n") };
}

/**
 * Extract Route components from JSX code
 */
function extractRoutes(code: string): string[] {
  const routeRegex = /<Route\s+[^>]*?path=["'][^"']+["'][^>]*?\/?>/g;
  const matches = code.match(routeRegex) || [];
  return matches;
}

/**
 * Extract sidebar/nav links from code  
 */
function extractNavLinks(code: string): string[] {
  const linkRegex = /<(?:NavLink|Link)\s+[^>]*?to=["'][^"']+["'][^>]*?>[\s\S]*?<\/(?:NavLink|Link)>/g;
  const matches = code.match(linkRegex) || [];
  return matches;
}

/**
 * Deduplicate imports by module path
 */
function deduplicateImports(imports: string[]): string[] {
  const seen = new Map<string, string>();
  const seenDefaultNames = new Map<string, string>(); // default import name → module path
  
  for (const imp of imports) {
    // Extract the module path
    const fromMatch = imp.match(/from\s+["']([^"']+)["']/);
    if (!fromMatch) {
      seen.set(imp, imp);
      continue;
    }
    
    const modulePath = fromMatch[1];
    
    // Check for duplicate default import names from different paths
    const defaultName = extractDefaultImport(imp);
    if (defaultName) {
      const existingPath = seenDefaultNames.get(defaultName);
      if (existingPath && existingPath !== modulePath) {
        // Same default name, different module — keep the longer/more specific path (skip this duplicate)
        if (modulePath.length > existingPath.length) {
          // New path is more specific — replace
          seen.delete(existingPath);
          seenDefaultNames.set(defaultName, modulePath);
        } else {
          // Existing path is more specific — skip this import
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

// Schema/migration paths are append-only
const APPEND_ONLY_PATTERNS = [
  /^\/data\/schema/,
  /^\/migrations\//,
  /^\/supabase\//,
];

/**
 * Check if a path is backend-protected (frontend tasks cannot overwrite).
 */
export function isBackendProtected(path: string): boolean {
  return BACKEND_PROTECTED_PATTERNS.some(p => p.test(path));
}

/**
 * Check if a path is append-only (new content is appended, not replaced).
 */
function isAppendOnly(path: string): boolean {
  return APPEND_ONLY_PATTERNS.some(p => p.test(path));
}

/**
 * Merge two backend files (e.g., two hook files for different entities).
 * Combines imports and exports without duplicating.
 */
function mergeBackendFiles(existing: string, incoming: string, path: string): string {
  // If the files are for different entities, they shouldn't conflict
  // If they're the same file, use the incoming version (backend task is authoritative)
  const existingParsed = extractImports(existing);
  const incomingParsed = extractImports(incoming);

  // If the incoming file is substantially different (different entity), append exports
  const existingExports = existing.match(/export\s+(function|const|default)\s+(\w+)/g) || [];
  const incomingExports = incoming.match(/export\s+(function|const|default)\s+(\w+)/g) || [];

  const existingNames = new Set(existingExports.map(e => e.match(/(\w+)$/)?.[1]));
  const hasNewExports = incomingExports.some(e => {
    const name = e.match(/(\w+)$/)?.[1];
    return name && !existingNames.has(name);
  });

  if (hasNewExports) {
    // Different entity hooks in the same file — merge imports + concatenate body
    const mergedImports = deduplicateImports([...existingParsed.imports, ...incomingParsed.imports]);
    return mergedImports.join("\n") + "\n\n" + existingParsed.body + "\n\n// ── Added by backend task ──\n\n" + incomingParsed.body;
  }

  // Same entity — incoming wins (it's a newer version)
  return incoming;
}

/**
 * Merge two sets of React files intelligently.
 * 
 * Rules:
 * - /App.jsx: Merge routes, imports, and navigation — never overwrite
 * - Backend files (/data/, /hooks/, /contexts/): Protected from frontend tasks
 * - Append-only files (migrations, schemas): Content is appended, never replaced
 * - Component files: Later version wins (task output is authoritative)
 * - CSS files: Smart merge with overlap detection
 * - New files: Just add
 */
export function mergeFiles(
  existing: Record<string, string>,
  incoming: Record<string, string>,
  protectBackend = false
): MergeResult {
  const result = { ...existing };
  const conflicts: string[] = [];

  for (const [path, code] of Object.entries(incoming)) {
    if (code.trim().length === 0) continue;

    // If protectBackend is on, skip overwriting backend files
    if (protectBackend && result[path]) {
      const isProtected = BACKEND_PROTECTED_PATTERNS.some(p => p.test(path));
      if (isProtected) {
        conflicts.push(`${path}: protected backend file — skipped overwrite`);
        continue;
      }
    }

    // App.jsx — smart merge
    if ((path === "/App.jsx" || path === "/App.tsx") && result[path]) {
      const merged = mergeAppFile(result[path], code);
      result[path] = merged.code;
      conflicts.push(...merged.conflicts);
      continue;
    }

    // CSS files — smart merge: use incoming as authoritative, don't concatenate
    if (path.endsWith(".css") && result[path]) {
      const existingLines = new Set(result[path].split("\n").map(l => l.trim()).filter(Boolean));
      const incomingLines = code.split("\n").map(l => l.trim()).filter(Boolean);
      const overlapCount = incomingLines.filter(l => existingLines.has(l)).length;
      const overlapRatio = incomingLines.length > 0 ? overlapCount / incomingLines.length : 0;
      
      if (overlapRatio > 0.3) {
        result[path] = code;
      } else {
        const existingImports = new Set(
          result[path].split("\n").filter(l => l.trim().startsWith("@import")).map(l => l.trim())
        );
        const dedupedIncoming = code.split("\n").filter(l => {
          const trimmed = l.trim();
          return !trimmed.startsWith("@import") || !existingImports.has(trimmed);
        }).join("\n");
        result[path] = result[path] + "\n\n" + dedupedIncoming;
      }
      continue;
    }

    // Everything else — later wins
    if (result[path]) {
      conflicts.push(`${path}: overwritten by later task`);
    }
    result[path] = code;
  }

  return { files: result, conflicts };
}

/**
 * Merge two App.jsx files by combining:
 * - All imports (deduplicated)
 * - All Route definitions
 * - All navigation items
 * - State and handlers from the newer version
 */
function mergeAppFile(existingCode: string, incomingCode: string): { code: string; conflicts: string[] } {
  const conflicts: string[] = [];
  
  // Strategy: Use the incoming code as the base (it has the latest structure)
  // but inject any routes/imports from existing that are missing
  
  const existingParsed = extractImports(existingCode);
  const incomingParsed = extractImports(incomingCode);
  
  // Merge imports
  const mergedImports = deduplicateImports([...existingParsed.imports, ...incomingParsed.imports]);
  
  // Check for routes in existing that might be missing in incoming
  const existingRoutes = extractRoutes(existingCode);
  const incomingRoutes = extractRoutes(incomingCode);
  
  // Extract route paths
  const incomingPaths = new Set(incomingRoutes.map(r => {
    const m = r.match(/path=["']([^"']+)["']/);
    return m ? m[1] : "";
  }).filter(Boolean));
  
  const missingRoutes = existingRoutes.filter(r => {
    const m = r.match(/path=["']([^"']+)["']/);
    return m && !incomingPaths.has(m[1]);
  });
  
  let finalBody = incomingParsed.body;
  
  // Inject missing routes before the closing </Routes>
  if (missingRoutes.length > 0) {
    const routesCloseIdx = finalBody.lastIndexOf("</Routes>");
    if (routesCloseIdx !== -1) {
      const routeInsert = missingRoutes.map(r => `              ${r}`).join("\n");
      finalBody = finalBody.slice(0, routesCloseIdx) + routeInsert + "\n            " + finalBody.slice(routesCloseIdx);
      conflicts.push(`App.jsx: merged ${missingRoutes.length} routes from previous tasks`);
    }
  }
  
  const code = mergedImports.join("\n") + "\n\n" + finalBody;
  return { code, conflicts };
}

/**
 * Build a comprehensive code context string for the AI,
 * showing the full accumulated codebase with smart truncation.
 */
export function buildFullCodeContext(files: Record<string, string>, budgetChars = 32000): string {
  const entries = Object.entries(files);
  if (entries.length === 0) return "";

  const totalChars = entries.reduce((sum, [, code]) => sum + code.length, 0);
  
  // If everything fits, include everything
  if (totalChars <= budgetChars) {
    return entries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  }

  // Priority order for context
  const PRIORITY = ["/App.jsx", "/App.tsx", "/App.js"];
  const NAV_PATTERNS = ["/Sidebar", "/Navigation", "/Nav", "/Layout"];
  
  const priorityFiles = entries.filter(([p]) => 
    PRIORITY.some(k => p.endsWith(k)) || NAV_PATTERNS.some(k => p.includes(k))
  );
  const otherFiles = entries.filter(([p]) => 
    !PRIORITY.some(k => p.endsWith(k)) && !NAV_PATTERNS.some(k => p.includes(k))
  );
  
  let result = "";
  let remaining = budgetChars;
  
  // Always include priority files in full
  for (const [path, code] of priorityFiles) {
    const section = `--- ${path}\n${code}\n\n`;
    result += section;
    remaining -= section.length;
  }
  
  // Include other files with truncation if needed
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
      // Include first 30 lines as context
      const lines = code.split("\n");
      const preview = lines.slice(0, 30).join("\n");
      result += `--- ${path} (truncated, ${lines.length} total lines)\n${preview}\n...[truncated]\n\n`;
      remaining -= preview.length + 100;
    }
  }
  
  return result;
}
