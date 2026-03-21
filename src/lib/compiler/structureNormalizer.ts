import type { Workspace } from "./workspace";

const CODE_FILE_RE = /\.(jsx?|tsx?)$/;

export function normalizeGeneratedStructure(workspace: Workspace): number {
  let fixed = 0;
  fixed += normalizeMirroredFiles(workspace);
  fixed += normalizeUtilityModules(workspace);
  fixed += normalizeHookDefaultImports(workspace);
  fixed += normalizeToastWiring(workspace);
  fixed += normalizeContextReferences(workspace);
  return fixed;
}

function normalizeMirroredFiles(workspace: Workspace): number {
  let fixed = 0;
  const mappings: Array<{ fromPrefix: string; toPrefix: string }> = [
    { fromPrefix: "/pages/components/", toPrefix: "/components/" },
    { fromPrefix: "/pages/contexts/", toPrefix: "/contexts/" },
  ];

  for (const duplicatePath of workspace.listFiles()) {
    const mapping = mappings.find((m) => duplicatePath.startsWith(m.fromPrefix));
    if (!mapping) continue;

    const suffix = duplicatePath.slice(mapping.fromPrefix.length);
    const canonicalPath = `${mapping.toPrefix}${suffix}`;

    if (!workspace.hasFile(canonicalPath)) continue;

    const duplicateContent = workspace.getFile(duplicatePath) || "";
    const canonicalContent = workspace.getFile(canonicalPath) || "";

    // Only collapse true mirrors, not legitimately divergent files
    if (duplicateContent.trim() !== canonicalContent.trim()) continue;

    fixed += rewriteImportsToCanonical(workspace, duplicatePath, canonicalPath);
    workspace.deleteFile(duplicatePath);
    fixed++;
    console.log(`[StructureNormalizer] Removed mirrored duplicate: ${duplicatePath} → ${canonicalPath}`);
  }

  return fixed;
}

function normalizeUtilityModules(workspace: Workspace): number {
  let fixed = 0;

  const libUtilVariants = workspace
    .listFiles()
    .filter((p) => /^\/lib\/utils\.(js|jsx|ts|tsx)$/.test(p));

  let canonicalLibUtil = "/lib/utils.js";
  if (!workspace.hasFile(canonicalLibUtil)) {
    canonicalLibUtil = libUtilVariants[0] || canonicalLibUtil;
  }

  if (canonicalLibUtil && workspace.hasFile(canonicalLibUtil)) {
    const normalized = buildCanonicalUtilsModule(workspace.getFile(canonicalLibUtil) || "");
    if (normalized !== (workspace.getFile(canonicalLibUtil) || "")) {
      workspace.updateFile(canonicalLibUtil, normalized);
      fixed++;
      console.log(`[StructureNormalizer] Normalized utility module: ${canonicalLibUtil}`);
    }

    for (const variant of libUtilVariants) {
      if (variant === canonicalLibUtil) continue;
      fixed += rewriteImportsToCanonical(workspace, variant, canonicalLibUtil);
      workspace.deleteFile(variant);
      fixed++;
      console.log(`[StructureNormalizer] Removed duplicate util variant: ${variant}`);
    }
  }

  const uiUtilsPath = "/components/ui/utils.js";
  if (workspace.hasFile(uiUtilsPath)) {
    const current = workspace.getFile(uiUtilsPath) || "";
    let normalized = current
      .replace(/^import\s+\{\s*cn\s*\}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
      .trim();

    if (!/export\s+function\s+cn\s*\(/.test(normalized)) {
      normalized = `export function cn(...inputs) {\n  return inputs.filter(Boolean).join(" ");\n}`;
    }

    if (normalized !== current) {
      workspace.updateFile(uiUtilsPath, `${normalized}\n`);
      fixed++;
      console.log(`[StructureNormalizer] Normalized UI utils module: ${uiUtilsPath}`);
    }
  }

  return fixed;
}

function normalizeHookDefaultImports(workspace: Workspace): number {
  let fixed = 0;

  for (const filePath of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(filePath)) continue;

    const original = workspace.getFile(filePath) || "";
    let updated = original;

    const importLineRegex = /^import\s+([A-Za-z_$][\w$]*)\s*(,\s*\{[^}]*\})?\s+from\s+["']([^"']*hooks[^"']*)["'];?$/gm;

    updated = updated.replace(importLineRegex, (full, defaultName: string, namedPart: string | undefined, fromPath: string) => {
      if (!defaultName.startsWith("use")) return full;

      const resolved = workspace.resolveImport(filePath, fromPath);
      if (!resolved || !workspace.hasFile(resolved)) return full;

      const target = workspace.getFile(resolved) || "";
      if (/export\s+default\s+/.test(target)) return full;

      const namedExports = extractNamedExports(target).filter((e) => e.startsWith("use"));
      if (namedExports.length === 0) return full;

      const selected = namedExports.includes(defaultName)
        ? defaultName
        : namedExports.length === 1
          ? namedExports[0]
          : "";

      if (!selected) return full;

      const existingNames = parseNamedImportPart(namedPart);
      const injected = selected === defaultName ? selected : `${selected} as ${defaultName}`;

      if (!existingNames.some((n) => n.replace(/\s+/g, " ").trim() === injected)) {
        existingNames.unshift(injected);
      }

      fixed++;
      console.log(`[StructureNormalizer] Rewrote hook default import in ${filePath}: ${defaultName} from ${fromPath}`);
      return `import { ${existingNames.join(", ")} } from "${fromPath}";`;
    });

    if (updated !== original) {
      workspace.updateFile(filePath, updated);
    }
  }

  return fixed;
}

function normalizeToastWiring(workspace: Workspace): number {
  let fixed = 0;

  const appEntryCandidates = ["/App.jsx", "/App.tsx", "/App.js", "/App.ts"];

  for (const appPath of appEntryCandidates) {
    if (!workspace.hasFile(appPath)) continue;

    const original = workspace.getFile(appPath) || "";
    let updated = original;

    const toastImportRegex = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([^"']*Toast[^"']*)["'];?/g;
    updated = updated.replace(toastImportRegex, (full, imports: string, fromPath: string) => {
      const names = imports
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!names.includes("ToastContainer") || !names.includes("ToastProvider")) {
        return full;
      }

      const next = names.filter((n) => n !== "ToastContainer");
      fixed++;
      console.log(`[StructureNormalizer] Removed unsafe ToastContainer import from ${appPath}`);
      return `import { ${next.join(", ")} } from "${fromPath}";`;
    });

    if (updated.includes("<ToastProvider")) {
      const before = updated;
      updated = updated
        .replace(/<ToastContainer\s*\/>/g, "")
        .replace(/<ToastContainer\s*><\/ToastContainer>/g, "");

      if (updated !== before) {
        fixed++;
        console.log(`[StructureNormalizer] Removed standalone <ToastContainer /> from ${appPath}`);
      }
    }

    if (updated !== original) {
      workspace.updateFile(appPath, updated);
    }
  }

  for (const toastPath of workspace.listFiles()) {
    if (!/\/Toast\.(jsx?|tsx?)$/.test(toastPath)) continue;

    const original = workspace.getFile(toastPath) || "";
    let updated = original;

    updated = updated
      .replace(
        /(export\s+function\s+ToastContainer\s*\(\s*\{\s*toasts\s*,\s*removeToast\s*\}\s*\))/g,
        "export function ToastContainer({ toasts = [], removeToast = () => {} })",
      )
      .replace(
        /(function\s+ToastContainer\s*\(\s*\{\s*toasts\s*,\s*removeToast\s*\}\s*\))/g,
        "function ToastContainer({ toasts = [], removeToast = () => {} })",
      )
      .replace(
        /(function\s+ToastContainer\s*\(\s*\{\s*toasts\s*,\s*config\s*,\s*removeToast\s*\}\s*\))/g,
        "function ToastContainer({ toasts = [], config, removeToast = () => {} })",
      )
      .replace(
        /(export\s+function\s+ToastContainer\s*\(\s*\{\s*toasts\s*,\s*config\s*,\s*removeToast\s*\}\s*\))/g,
        "export function ToastContainer({ toasts = [], config, removeToast = () => {} })",
      );

    // Safety net for generated toast components that still map over undefined `toasts`
    // (e.g. default-exported Toast components not named ToastContainer).
    updated = updated.replace(/\btoasts\.map\s*\(/g, "(Array.isArray(toasts) ? toasts : []).map(");

    if (updated !== original) {
      workspace.updateFile(toastPath, updated);
      fixed++;
      console.log(`[StructureNormalizer] Added ToastContainer safety defaults in ${toastPath}`);
    }
  }

  return fixed;
}

function rewriteImportsToCanonical(workspace: Workspace, duplicatePath: string, canonicalPath: string): number {
  let rewrites = 0;

  for (const importingFile of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(importingFile)) continue;

    const imports = workspace.index.imports[importingFile] || [];
    const original = workspace.getFile(importingFile) || "";
    let updated = original;

    for (const imp of imports) {
      const resolved = workspace.resolveImport(importingFile, imp.from);
      if (resolved !== duplicatePath) continue;

      const nextSpecifier = toImportSpecifier(importingFile, canonicalPath);
      updated = updated
        .replace(new RegExp(`(["'])${escapeRegex(imp.from)}\\1`, "g"), (m, quote) => `${quote}${nextSpecifier}${quote}`);
    }

    if (updated !== original) {
      workspace.updateFile(importingFile, updated);
      rewrites++;
    }
  }

  return rewrites;
}

function buildCanonicalUtilsModule(content: string): string {
  let normalized = content
    .replace(/^import\s+\{\s*cn\s*\}\s+from\s+["']\.\/utils["'];?\s*$/gm, "")
    .trim();

  const hasCanonicalFn = /export\s+function\s+cn\s*\(/.test(normalized);
  const nullStub = /export\s+const\s+cn\s*=\s*null/.test(normalized);

  if (!hasCanonicalFn || nullStub) {
    return `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs) {\n  return twMerge(clsx(inputs));\n}\n`;
  }

  return `${normalized}\n`;
}

function parseNamedImportPart(namedPart: string | undefined): string[] {
  if (!namedPart) return [];
  const match = namedPart.match(/\{([^}]*)\}/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractNamedExports(code: string): string[] {
  const names = new Set<string>();

  for (const m of code.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)) {
    names.add(m[1]);
  }

  for (const m of code.matchAll(/export\s*\{([^}]+)\}/g)) {
    const parts = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const asParts = s.split(/\s+as\s+/i);
        return asParts.length > 1 ? asParts[asParts.length - 1].trim() : asParts[0].trim();
      });
    parts.forEach((p) => names.add(p));
  }

  return [...names];
}

function toImportSpecifier(fromFile: string, toFile: string): string {
  const fromParts = fromFile.split("/").slice(1, -1);
  const toParts = toFile.replace(/\.(jsx?|tsx?)$/, "").split("/").slice(1);

  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }

  const ups = fromParts.length - common;
  const down = toParts.slice(common).join("/");
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  return `${prefix}${down}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect useContext(X) calls where X is not imported/defined in the file,
 * then attempt to resolve to an actual context exported elsewhere in the workspace.
 */
function normalizeContextReferences(workspace: Workspace): number {
  let fixed = 0;

  // 1. Build a map of all exported contexts: contextName -> filePath
  const contextMap = new Map<string, string>();
  for (const filePath of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(filePath)) continue;
    const content = workspace.getFile(filePath) || "";
    // Match: export const FooContext = React.createContext / createContext
    const exportedContexts = content.matchAll(
      /export\s+(?:const|let|var)\s+(\w+Context)\s*=\s*(?:React\.)?createContext/g
    );
    for (const m of exportedContexts) {
      contextMap.set(m[1], filePath);
    }
    // Also match non-exported contexts in App files (commonly exported implicitly)
    if (/\/App\.(jsx?|tsx?)$/.test(filePath)) {
      const appContexts = content.matchAll(
        /(?:const|let|var)\s+(\w+Context)\s*=\s*(?:React\.)?createContext/g
      );
      for (const m of appContexts) {
        if (!contextMap.has(m[1])) {
          contextMap.set(m[1], filePath);
        }
      }
    }
  }

  if (contextMap.size === 0) return 0;

  // 2. Scan files for useContext(X) where X ends with "Context" but is not imported/defined
  for (const filePath of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(filePath)) continue;
    const content = workspace.getFile(filePath) || "";
    const contextUsages = [...content.matchAll(/useContext\(\s*(\w+Context)\s*\)/g)];
    if (contextUsages.length === 0) continue;

    let updated = content;
    for (const usage of contextUsages) {
      const usedName = usage[1];
      // Check if it's already imported or locally defined
      const isImported = new RegExp(
        `import\\s+.*\\b${usedName}\\b.*from\\s+["']`
      ).test(updated);
      const isLocallyDefined = new RegExp(
        `(?:const|let|var)\\s+${usedName}\\s*=`
      ).test(updated);
      const isKnownContext = contextMap.has(usedName);

      if (isLocallyDefined) continue;
      if (isImported && isKnownContext) continue;

      // Try to find the actual context in the workspace
      if (isKnownContext) {
        // Context exists but isn't imported – add the import
        const contextFile = contextMap.get(usedName)!;
        const importSpec = toImportSpecifier(filePath, contextFile);
        const importLine = `import { ${usedName} } from "${importSpec}";\n`;
        // Add import after the last existing import or at top
        const lastImportIdx = updated.lastIndexOf("\nimport ");
        if (lastImportIdx >= 0) {
          const endOfLine = updated.indexOf("\n", lastImportIdx + 1);
          updated = updated.slice(0, endOfLine + 1) + importLine + updated.slice(endOfLine + 1);
        } else {
          updated = importLine + updated;
        }
        console.log(`[StructureNormalizer] Added missing import for ${usedName} in ${filePath}`);
      } else {
        // Context doesn't exist anywhere – find closest match
        const allContextNames = [...contextMap.keys()];
        // Try simple heuristic: if file uses AppContext but workspace has CartContext from App, use that
        const fromApp = allContextNames.find(n => contextMap.get(n)?.match(/\/App\./));
        const replacement = fromApp || allContextNames[0];
        if (replacement) {
          // Remove obviously invalid imports for unknown context symbols (common bad pattern: default import AppContext)
          updated = updated.replace(
            new RegExp(`^\\s*import\\s+${escapeRegex(usedName)}\\s+from\\s+["'][^"']+["'];?\\s*\\n?`, "gm"),
            ""
          );
          updated = updated.replace(
            new RegExp(`^\\s*import\\s+\\{\\s*${escapeRegex(usedName)}\\s*\\}\\s+from\\s+["'][^"']+["'];?\\s*\\n?`, "gm"),
            ""
          );

          updated = updated.replace(
            new RegExp(`useContext\\(\\s*${escapeRegex(usedName)}\\s*\\)`, "g"),
            `useContext(${replacement})`
          );
          // Ensure import exists
          if (!new RegExp(`import\\s+.*\\b${replacement}\\b.*from\\s+["']`).test(updated)) {
            const contextFile = contextMap.get(replacement)!;
            const importSpec = toImportSpecifier(filePath, contextFile);
            const importLine = `import { ${replacement} } from "${importSpec}";\n`;
            const lastImportIdx = updated.lastIndexOf("\nimport ");
            if (lastImportIdx >= 0) {
              const endOfLine = updated.indexOf("\n", lastImportIdx + 1);
              updated = updated.slice(0, endOfLine + 1) + importLine + updated.slice(endOfLine + 1);
            } else {
              updated = importLine + updated;
            }
          }
          console.log(`[StructureNormalizer] Replaced undefined ${usedName} with ${replacement} in ${filePath}`);
        }
      }
    }

    if (updated !== content) {
      workspace.updateFile(filePath, updated);
      fixed++;
    }
  }

  return fixed;
}
