/**
 * Sandpack file-map normalizer — mirrors structureNormalizer logic
 * so the preview always receives a correct workspace layout.
 *
 * Called from sanitizeWorkspaceForPreview (build orchestrator) and
 * buildSandpackFiles (SandpackPreview) to guarantee every code path
 * delivers a normalized file map.
 */

const DOMAIN_COMPONENTS = new Set([
  "ActivityFeed", "NotificationBell", "PageHeader",
  "QuickActions", "SearchFilterBar", "StatCard", "StatusBadge",
]);

const ROUTING_COMPONENTS = new Set(["ProtectedRoute"]);

/**
 * Mutates `base` in-place:
 * 1. Moves domain/routing components out of /components/ui/ → /components/
 * 2. Deduplicates cn.ts / cn.tsx (prefers .ts)
 * 3. Ensures /utils/cn.ts exists
 * 4. Rewrites imports in all files to match moved paths
 */
export function normalizeSandpackFileMap(base: Record<string, string>): void {
  const moves: Array<[string, string]> = [];

  // 1) Identify files to move
  for (const path of Object.keys(base)) {
    if (!path.startsWith("/components/ui/")) continue;
    const fileName = path.split("/").pop() || "";
    const baseName = fileName.replace(/\.(tsx?|jsx?)$/, "");

    if (DOMAIN_COMPONENTS.has(baseName) || ROUTING_COMPONENTS.has(baseName)) {
      moves.push([path, `/components/${fileName}`]);
    }
  }

  // Execute moves
  for (const [from, to] of moves) {
    if (!base[to]) {
      base[to] = base[from];
    }
    delete base[from];
  }

  // 2) Remove any virtual /utils/cn.* — the real cn lives at /lib/utils.ts
  delete base["/utils/cn.ts"];
  delete base["/utils/cn.tsx"];

  // 3) Ensure /lib/utils.ts always exists with the real cn implementation
  if (!base["/lib/utils.ts"]) {
    base["/lib/utils.ts"] = `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: (string | undefined | null | false)[]) {\n  return twMerge(clsx(inputs));\n}\n`;
  }

  // 4) Rewrite imports for moved files and cn references
  const moveMap = new Map(moves.map(([from, to]) => [from, to]));

  for (const [filePath, content] of Object.entries(base)) {
    if (!/\.(jsx?|tsx?)$/.test(filePath)) continue;
    let updated = content;

    // Fix cn imports → always point to /lib/utils
    updated = updated.replace(
      /import\s+\{\s*cn\s*\}\s+from\s+["']([^"']+)["']/g,
      (_full, fromPath) => {
        if (/utils\/cn|lib\/utils|components\/ui\/utils/.test(fromPath)) {
          const correctRel = computeRelativePath(filePath, "/lib/utils.ts");
          return `import { cn } from "${correctRel}"`;
        }
        return `import { cn } from "${fromPath}"`;
      }
    );

    // Fix imports referencing moved files
    for (const [oldPath, newPath] of moveMap) {
      const oldBase = oldPath.replace(/\.\w+$/, "").split("/").pop() || "";
      if (!oldBase) continue;
      const newRel = computeRelativePath(filePath, newPath);
      const escaped = oldBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      updated = updated.replace(
        new RegExp(`(from\\s+["'])(\\.[^"']*\\/ui\\/${escaped})(["'])`, "g"),
        `$1${newRel}$3`
      );
    }

    if (updated !== content) base[filePath] = updated;
  }
}

function computeRelativePath(from: string, to: string): string {
  const fromParts = from.split("/").filter(Boolean).slice(0, -1);
  const toParts = to.split("/").filter(Boolean);
  const toNoExt = toParts.map((p, i) => i === toParts.length - 1 ? p.replace(/\.\w+$/, "") : p);
  let common = 0;
  while (common < fromParts.length && common < toNoExt.length && fromParts[common] === toNoExt[common]) common++;
  const ups = fromParts.length - common;
  return (ups === 0 ? "./" : "../".repeat(ups)) + toNoExt.slice(common).join("/");
}
