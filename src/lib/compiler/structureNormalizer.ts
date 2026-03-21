import type { Workspace } from "./workspace";

const CODE_FILE_RE = /\.(jsx?|tsx?)$/;

export function normalizeGeneratedStructure(workspace: Workspace): number {
  let fixed = 0;
  fixed += normalizeMirroredFiles(workspace);
  fixed += normalizeUtilityModules(workspace);
  fixed += normalizeHookDefaultImports(workspace);
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
