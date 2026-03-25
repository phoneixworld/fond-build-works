import type { Workspace } from "./workspace";
import { getDomainComponents } from "@/lib/templates/scaffoldTemplates";

const CODE_FILE_RE = /\.(jsx?|tsx?)$/;

export function normalizeGeneratedStructure(workspace: Workspace): number {
  let fixed = 0;
  fixed += normalizeFileExtensions(workspace);
  fixed += normalizeMirroredFiles(workspace);
  fixed += normalizeUtilityModules(workspace);
  fixed += normalizeDomainComponentPlacement(workspace);
  fixed += normalizeHookDefaultImports(workspace);
  fixed += normalizeToastWiring(workspace);
  fixed += normalizeDomainComponentSafety(workspace);
  fixed += normalizeContextReferences(workspace);
  fixed += normalizeExportDuplication(workspace);
  fixed += normalizeComponentExportConventions(workspace);
  fixed += normalizeBarrelExports(workspace);
  return fixed;
}

// ─── Rename .jsx/.js → .tsx/.ts ──────────────────────────────────────────

const DOMAIN_COMPONENT_NAMES = new Set([
  "ActivityFeed", "NotificationBell", "PageHeader",
  "QuickActions", "SearchFilterBar", "StatCard", "StatusBadge",
]);

function normalizeFileExtensions(workspace: Workspace): number {
  let fixed = 0;
  for (const filePath of workspace.listFiles()) {
    if (/\.(jsx)$/.test(filePath)) {
      const newPath = filePath.replace(/\.jsx$/, ".tsx");
      const content = workspace.getFile(filePath) || "";
      workspace.deleteFile(filePath);
      workspace.addFile(newPath, content);
      fixed += rewriteImportsToCanonical(workspace, filePath, newPath);
      fixed++;
      console.log(`[StructureNormalizer] Renamed ${filePath} → ${newPath}`);
    } else if (/(?<!\.)\.js$/.test(filePath) && !filePath.includes("/node_modules/") && !filePath.endsWith("package.json")) {
      // Only rename .js source files (not config)
      if (filePath.startsWith("/components/") || filePath.startsWith("/pages/") || filePath.startsWith("/hooks/") || filePath.startsWith("/contexts/") || filePath.startsWith("/layout/") || filePath.startsWith("/services/")) {
        const newPath = filePath.replace(/\.js$/, ".ts");
        const content = workspace.getFile(filePath) || "";
        workspace.deleteFile(filePath);
        workspace.addFile(newPath, content);
        fixed += rewriteImportsToCanonical(workspace, filePath, newPath);
        fixed++;
        console.log(`[StructureNormalizer] Renamed ${filePath} → ${newPath}`);
      }
    }
  }
  return fixed;
}

// ─── Move domain components out of /components/ui/ ───────────────────────

function normalizeDomainComponentPlacement(workspace: Workspace): number {
  let fixed = 0;

  for (const filePath of workspace.listFiles()) {
    if (!filePath.startsWith("/components/ui/")) continue;
    const fileName = filePath.split("/").pop() || "";
    const baseName = fileName.replace(/\.(tsx?|jsx?)$/, "");

    if (DOMAIN_COMPONENT_NAMES.has(baseName)) {
      const newPath = `/components/${fileName}`;
      if (!workspace.hasFile(newPath)) {
        const content = workspace.getFile(filePath) || "";
        workspace.addFile(newPath, content);
      }
      workspace.deleteFile(filePath);
      fixed += rewriteImportsToCanonical(workspace, filePath, newPath);
      fixed++;
      console.log(`[StructureNormalizer] Moved domain component: ${filePath} → ${newPath}`);
    }
  }

  return fixed;
}

// ─── Generate barrel exports ─────────────────────────────────────────────

function normalizeBarrelExports(workspace: Workspace): number {
  let fixed = 0;

  // components/ui/index.ts — named exports for UI primitives
  const uiFiles = workspace.listFiles().filter(
    f => f.startsWith("/components/ui/") && CODE_FILE_RE.test(f) && !f.endsWith("/index.ts")
  );
  if (uiFiles.length > 0) {
    const lines = uiFiles.map(f => {
      const name = f.split("/").pop()!.replace(/\.(tsx?|jsx?)$/, "");
      return `export * from "./${name}";`;
    });
    workspace.updateFile("/components/ui/index.ts", lines.join("\n") + "\n");
    fixed++;
  }

  // components/index.ts — default re-exports for domain components
  const domainFiles = workspace.listFiles().filter(
    f => /^\/components\/[^/]+\.(tsx?|jsx?)$/.test(f) && !f.endsWith("/index.ts")
  );
  if (domainFiles.length > 0) {
    const lines: string[] = [];
    for (const f of domainFiles) {
      const name = f.split("/").pop()!.replace(/\.(tsx?|jsx?)$/, "");
      const content = workspace.getFile(f) || "";
      // Only re-export default if the file actually has one
      if (/export\s+default\s/.test(content)) {
        lines.push(`export { default as ${name} } from "./${name}";`);
      } else {
        lines.push(`export * from "./${name}";`);
      }
    }
    workspace.updateFile("/components/index.ts", lines.join("\n") + "\n");
    fixed++;
  }

  // pages/index.ts
  const pageFiles = workspace.listFiles().filter(
    f => f.startsWith("/pages/") && CODE_FILE_RE.test(f) && !f.endsWith("/index.ts")
  );
  if (pageFiles.length > 0) {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const f of pageFiles) {
      const parts = f.split("/");
      const name = parts[parts.length - 1].replace(/\.(tsx?|jsx?)$/, "");
      if (seen.has(name)) continue;
      seen.add(name);
      const rel = f.replace(/^\/pages\//, "./").replace(/\.(tsx?|jsx?)$/, "");
      const content = workspace.getFile(f) || "";
      // Only re-export default if the file actually has one
      if (/export\s+default\s/.test(content)) {
        lines.push(`export { default as ${name} } from "${rel}";`);
      } else {
        lines.push(`export * from "${rel}";`);
      }
    }
    workspace.updateFile("/pages/index.ts", lines.join("\n") + "\n");
    fixed++;
  }

  return fixed;
}

/**
 * Removes duplicate exports: if a file has both `export { X }` and `export default X`,
 * strip the named re-export to prevent "already exported" runtime errors.
 */
function normalizeExportDuplication(workspace: Workspace): number {
  let fixed = 0;
  for (const path of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(path)) continue;
    const content = workspace.getFile(path)!;

    // Find default export name
    const defaultMatch = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    if (!defaultMatch) continue;
    const defaultName = defaultMatch[1];

    // Check for `export { defaultName }` or `export { defaultName, ... }`
    const namedExportRegex = new RegExp(
      `^export\\s*\\{([^}]*\\b${defaultName}\\b[^}]*)\\}\\s*;?\\s*$`,
      "m"
    );
    const namedMatch = content.match(namedExportRegex);
    if (!namedMatch) continue;

    const symbols = namedMatch[1].split(",").map(s => s.trim()).filter(Boolean);
    if (symbols.length === 1 && symbols[0] === defaultName) {
      // Only symbol — remove the entire export { X } line
      const newContent = content.replace(namedExportRegex, "").replace(/\n{3,}/g, "\n\n");
      workspace.updateFile(path, newContent);
      fixed++;
      console.log(`[StructureNormalizer] Removed duplicate export { ${defaultName} } from ${path}`);
    } else {
      // Multiple symbols — just remove the default name from the list
      const newSymbols = symbols.filter(s => s !== defaultName);
      const newContent = content.replace(namedExportRegex, `export { ${newSymbols.join(", ")} };`);
      workspace.updateFile(path, newContent);
      fixed++;
      console.log(`[StructureNormalizer] Removed '${defaultName}' from named exports in ${path}`);
    }
  }
  return fixed;
}

/**
 * Enforces the 5 component export convention rules:
 * 
 * 1. Every component file must have exactly ONE default export (the main component)
 * 2. Subcomponents must always be named exports
 * 3. Never generate both `export default function X` and `export function X` for same symbol
 * 4. Import style must match export style (handled by exportMismatchFixer, but we normalize the source)
 * 5. Normalize all component files to: function declarations + export default Main; export { SubA, SubB };
 */
function normalizeComponentExportConventions(workspace: Workspace): number {
  let fixed = 0;

  for (const path of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(path)) continue;
    // Skip utility files, hooks-only files, pure type files, and UI primitives
    if (path.includes("/lib/") && !path.includes("/components/")) continue;
    if (path.includes("/hooks/") || path.includes("/contexts/")) continue;
    if (path.includes("/components/ui/") || path.includes("/ui/")) continue;

    let content = workspace.getFile(path)!;
    let changed = false;

    // --- Rule 3: Never have both `export default function X` AND `export function X` ---
    const exportDefaultFnMatch = content.match(/export\s+default\s+function\s+(\w+)/);
    if (exportDefaultFnMatch) {
      const mainName = exportDefaultFnMatch[1];
      // Check if there's also `export function MainName` (non-default) elsewhere
      const dupeRegex = new RegExp(
        `^export\\s+function\\s+${escapeRegex(mainName)}\\s*\\(`,
        "gm"
      );
      const allMatches = [...content.matchAll(dupeRegex)];
      if (allMatches.length > 1) {
        // Keep only the first occurrence (the export default one), remove others
        let count = 0;
        content = content.replace(dupeRegex, (match) => {
          count++;
          if (count === 1) return match; // keep first
          return match.replace("export function", "function"); // strip export from duplicate
        });
        changed = true;
        console.log(`[ExportConventions] Removed duplicate export function ${mainName} in ${path}`);
      }
    }

    // --- Rule 1 & 5: Ensure exactly one default export, normalize structure ---
    // Count all default exports
    const defaultExports = [...content.matchAll(/export\s+default\s+/g)];
    
    if (defaultExports.length === 0 && path.match(/\/(components|pages)\//)) {
      // No default export in a component/page file — find the first PascalCase function and make it default
      const componentFnMatch = content.match(/^export\s+function\s+([A-Z]\w*)\s*\(/m);
      const componentConstMatch = content.match(/^export\s+const\s+([A-Z]\w*)\s*[:=]/m);
      const mainComponent = componentFnMatch?.[1] || componentConstMatch?.[1];

      if (mainComponent) {
        // Convert `export function Main(` → `function Main(`
        content = content.replace(
          new RegExp(`^export\\s+function\\s+(${escapeRegex(mainComponent)})\\s*\\(`, "m"),
          `function ${mainComponent}(`
        );
        content = content.replace(
          new RegExp(`^export\\s+const\\s+(${escapeRegex(mainComponent)})\\s*=`, "m"),
          `const ${mainComponent} =`
        );

        // Add export default at the end
        content = content.trimEnd() + `\n\nexport default ${mainComponent};\n`;
        changed = true;
        console.log(`[ExportConventions] Added default export for ${mainComponent} in ${path}`);
      }
    } else if (defaultExports.length > 1) {
      // Multiple default exports — keep only the first
      let count = 0;
      content = content.replace(/export\s+default\s+/g, (match) => {
        count++;
        if (count === 1) return match;
        return ""; // strip subsequent defaults
      });
      changed = true;
      console.log(`[ExportConventions] Removed ${defaultExports.length - 1} extra default exports in ${path}`);
    }

    // --- Rule 5: Convert inline `export function Sub()` to declaration + trailing named export ---
    // Find the default-exported component name
    const defaultName = content.match(/export\s+default\s+(?:function\s+)?(\w+)/)?.[1];
    if (defaultName) {
      // Find all `export function X` that are NOT the default
      const inlineExportFns = [...content.matchAll(/^export\s+function\s+([A-Z]\w*)\s*\(/gm)];
      const subComponents = inlineExportFns
        .map(m => m[1])
        .filter(name => name !== defaultName);

      if (subComponents.length > 0) {
        // Strip `export` from inline subcomponent declarations
        for (const sub of subComponents) {
          content = content.replace(
            new RegExp(`^export\\s+function\\s+(${escapeRegex(sub)})\\s*\\(`, "m"),
            `function ${sub}(`
          );
        }

        // Check if there's already an export { ... } block we can merge into
        const existingNamedExport = content.match(/^export\s*\{([^}]*)\}\s*;?\s*$/m);
        if (existingNamedExport) {
          const existingSymbols = existingNamedExport[1].split(",").map(s => s.trim()).filter(Boolean);
          const allSymbols = [...new Set([...existingSymbols, ...subComponents])];
          content = content.replace(
            /^export\s*\{[^}]*\}\s*;?\s*$/m,
            `export { ${allSymbols.join(", ")} };`
          );
        } else {
          // Add trailing export block
          content = content.trimEnd() + `\nexport { ${subComponents.join(", ")} };\n`;
        }
        changed = true;
        console.log(`[ExportConventions] Normalized ${subComponents.length} subcomponent exports in ${path}`);
      }
    }

    // --- Rule 5: Convert `export default function X()` to `function X()` + `export default X;` ---
    const inlineDefaultMatch = content.match(/^export\s+default\s+function\s+(\w+)\s*\(/m);
    if (inlineDefaultMatch) {
      const fnName = inlineDefaultMatch[1];
      content = content.replace(
        /^export\s+default\s+function\s+(\w+)\s*\(/m,
        `function ${fnName}(`
      );
      // Add trailing export default
      content = content.trimEnd() + `\n\nexport default ${fnName};\n`;
      changed = true;
      console.log(`[ExportConventions] Normalized inline default export to trailing for ${fnName} in ${path}`);
    }

    if (changed) {
      // Clean up any triple+ newlines
      content = content.replace(/\n{3,}/g, "\n\n");
      workspace.updateFile(path, content);
      fixed++;
    }
  }

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

  // DELETE all lib/utils.* variants — these must never exist
  const libUtilVariants = workspace
    .listFiles()
    .filter((p) => /^\/lib\/utils\.(js|jsx|ts|tsx)$/.test(p));

  for (const variant of libUtilVariants) {
    // Rewrite imports away from this file before deleting
    fixed += rewriteImportsToCanonical(workspace, variant, "/utils/cn");
    workspace.deleteFile(variant);
    fixed++;
    console.log(`[StructureNormalizer] Deleted banned file: ${variant}`);
  }

  // Migrate /components/ui/utils.* → /utils/cn.ts
  const legacyUiUtilsPaths = ["/components/ui/utils.js", "/components/ui/utils.ts", "/components/ui/utils.jsx", "/components/ui/utils.tsx"];
  for (const legacyPath of legacyUiUtilsPaths) {
    if (workspace.hasFile(legacyPath)) {
      workspace.deleteFile(legacyPath);
      fixed += rewriteImportsToCanonical(workspace, legacyPath, "/utils/cn");
      fixed++;
      console.log(`[StructureNormalizer] Removed legacy util: ${legacyPath}`);
    }
  }

  // Ensure /utils/cn.ts exists with correct content
  if (!workspace.hasFile("/utils/cn.ts")) {
    workspace.updateFile("/utils/cn.ts", `export function cn(...inputs) {\n  return inputs.filter(Boolean).join(" ");\n}\n`);
    fixed++;
    console.log(`[StructureNormalizer] Created missing /utils/cn.ts`);
  }

  // Fix all cn imports to point to /utils/cn
  for (const filePath of workspace.listFiles()) {
    if (!CODE_FILE_RE.test(filePath)) continue;
    const content = workspace.getFile(filePath) || "";
    // Match imports of cn from wrong paths (lib/utils, ./utils, ../utils, components/ui/utils, etc.)
    const badCnImport = /^(import\s+\{\s*cn\s*\}\s+from\s+["'])([^"']+)(["'];?\s*)$/gm;
    let updated = content;
    updated = updated.replace(badCnImport, (full, pre, fromPath, post) => {
      // If already pointing to utils/cn, skip
      if (/\/utils\/cn$/.test(fromPath)) return full;
      // Compute correct relative path to /utils/cn
      const newSpec = toImportSpecifier(filePath, "/utils/cn.ts");
      return `${pre}${newSpec}${post}`;
    });
    if (updated !== content) {
      workspace.updateFile(filePath, updated);
      fixed++;
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

function normalizeDomainComponentSafety(workspace: Workspace): number {
  let fixed = 0;
  const fallbackComponents = getDomainComponents();

  for (const [filePath, fallbackSource] of Object.entries(fallbackComponents)) {
    // Also check for legacy .jsx/.js variant of the same file
    const legacyPath = filePath.replace(/\.tsx$/, ".jsx").replace(/\.ts$/, ".js");
    const current = workspace.getFile(filePath);
    const legacyCurrent = filePath !== legacyPath ? workspace.getFile(legacyPath) : undefined;

    // If legacy variant exists and is malformed, replace it with the .tsx fallback
    if (legacyCurrent && !isRenderableComponent(legacyCurrent)) {
      workspace.deleteFile(legacyPath);
      workspace.addFile(filePath, fallbackSource);
      fixed++;
      console.log(`[StructureNormalizer] Replaced malformed ${legacyPath} with fallback: ${filePath}`);
      continue;
    }

    if (!current) {
      workspace.addFile(filePath, fallbackSource);
      fixed++;
      console.log(`[StructureNormalizer] Added missing domain component fallback: ${filePath}`);
      continue;
    }

    if (!isRenderableComponent(current)) {
      workspace.updateFile(filePath, fallbackSource);
      fixed++;
      console.log(`[StructureNormalizer] Replaced malformed domain component with fallback: ${filePath}`);
    }
  }

  return fixed;
}

function isRenderableComponent(content: string): boolean {
  if (!/export\s+default\s+/.test(content)) return false;
  const unresolved = findUndefinedJsxComponents(content);
  return unresolved.length === 0;
}

function findUndefinedJsxComponents(content: string): string[] {
  const identifiers = new Set<string>([
    ...extractImportedIdentifiers(content),
    ...extractDeclaredIdentifiers(content),
    ...extractDestructuredIdentifiers(content),
  ]);

  const unresolved = new Set<string>();
  for (const match of content.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
    const componentName = match[1];
    if (componentName === "Fragment") continue;
    if (!identifiers.has(componentName)) {
      unresolved.add(componentName);
    }
  }

  return [...unresolved];
}

function extractImportedIdentifiers(content: string): string[] {
  const names = new Set<string>();

  for (const m of content.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+["'][^"']+["'];?$/gm)) {
    names.add(m[1]);
  }

  for (const m of content.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["'];?/g)) {
    names.add(m[1]);
  }

  for (const m of content.matchAll(/import\s+\{([^}]+)\}\s+from\s+["'][^"']+["'];?/g)) {
    for (const raw of m[1].split(",")) {
      const token = raw.trim();
      if (!token) continue;
      const aliasParts = token.split(/\s+as\s+/i).map((p) => p.trim()).filter(Boolean);
      const finalName = aliasParts.length > 1 ? aliasParts[aliasParts.length - 1] : aliasParts[0];
      if (finalName) names.add(finalName);
    }
  }

  return [...names];
}

function extractDeclaredIdentifiers(content: string): string[] {
  const names = new Set<string>();

  for (const m of content.matchAll(/\b(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }

  return [...names];
}

function extractDestructuredIdentifiers(content: string): string[] {
  const names = new Set<string>();
  const destructuringBlocks = [
    ...content.matchAll(/\{\s*([^}]*)\s*\}\s*=\s*[^;\n]+/g),
    ...content.matchAll(/function\s+[A-Za-z_$][\w$]*\s*\(\s*\{([^}]*)\}/g),
    ...content.matchAll(/\(\s*\{([^}]*)\}\s*\)\s*=>/g),
  ];

  for (const block of destructuringBlocks) {
    const raw = block[1] || "";
    for (const part of raw.split(",")) {
      const token = part.trim().replace(/^\.\.\./, "");
      if (!token) continue;
      const clean = token
        .split("=")[0]
        .split(":")[1] || token.split("=")[0].split(":")[0];
      const id = clean.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) {
        names.add(id);
      }
    }
  }

  return [...names];
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
