/**
 * Phoenix ESM Preview Engine
 * 
 * Implements the PreviewEngine contract for ESM-native previews.
 * Handles workspace compilation, entry point resolution, and HTML generation.
 */

import type {
  PreviewEngine,
  PreviewSession,
  WorkspaceSnapshot,
  PreviewBuildResult,
  PreviewDiagnostic,
  PreviewMetrics,
  ImportMapProvider,
} from "./types";
import { compileWorkspace, compileFile, rewriteToRegistry } from "./esmCompiler";
import { buildImportMap, CdnImportMapProvider } from "./importMapResolver";
import { generateHtmlShell, generateErrorPage } from "./htmlShellGenerator";

// ─── Entry Point Resolution ─────────────────────────────────────────────────

const ENTRY_CANDIDATES = [
  "/App.tsx", "/App.jsx", "/App.js", "/App.ts",
  "/src/App.tsx", "/src/App.jsx", "/src/App.js", "/src/App.ts",
];

function resolveEntryPoint(fileSet: Set<string>): string | null {
  // Check well-known paths
  for (const candidate of ENTRY_CANDIDATES) {
    if (fileSet.has(candidate)) return candidate;
  }
  // Fuzzy match
  return Array.from(fileSet).find(p => /\/App\.(tsx?|jsx?)$/.test(p)) || null;
}

function synthesizeAppEntry(
  fileSet: Set<string>,
  files: Record<string, string>
): { path: string; code: string } | null {
  const jsxFiles = Array.from(fileSet).filter(
    p => /\.(jsx?|tsx?)$/.test(p) && !p.includes("/ui/")
  );
  if (jsxFiles.length === 0) return null;

  const pageFiles = jsxFiles.filter(p => p.includes("/pages/"));
  const mainComponent = pageFiles[0] || jsxFiles[0];
  const compName = mainComponent.split("/").pop()!.replace(/\.\w+$/, "");
  const hasAuthCtx = Array.from(fileSet).some(p => p.includes("AuthContext"));

  let appCode = `import React from "react";\n`;
  appCode += `import ${compName} from ".${mainComponent.replace(/\.\w+$/, "")}";\n`;

  if (hasAuthCtx) {
    appCode += `import { AuthProvider } from "./contexts/AuthContext";\n`;
    appCode += `\nexport default function App() {\n  return (\n    <AuthProvider>\n      <${compName} />\n    </AuthProvider>\n  );\n}\n`;
  } else {
    appCode += `\nexport default function App() {\n  return <${compName} />;\n}\n`;
  }

  return { path: "/App.jsx", code: appCode };
}

// ─── ESM Preview Engine ─────────────────────────────────────────────────────

export class ESMPreviewEngine implements PreviewEngine {
  readonly name = "esm" as const;
  private importMapProvider: ImportMapProvider;

  constructor(cdnBase?: string) {
    this.importMapProvider = new CdnImportMapProvider(cdnBase);
  }

  canHandle(snapshot: WorkspaceSnapshot): boolean {
    // ESM can handle anything up to complexity 80
    return snapshot.complexityScore <= 80 && snapshot.fileCount <= 200;
  }

  build(session: PreviewSession, snapshot: WorkspaceSnapshot): PreviewBuildResult {
    const buildStart = performance.now();
    const diagnostics: PreviewDiagnostic[] = [];

    // 1. Normalize paths
    const normalized: Record<string, string> = {};
    for (const [path, code] of Object.entries(snapshot.files)) {
      const p = path.startsWith("/") ? path : `/${path}`;
      normalized[p] = code;
    }

    const fileSet = new Set(Object.keys(normalized));

    // 2. Resolve entry point
    let entryPath = resolveEntryPoint(fileSet);

    if (!entryPath) {
      const synthesized = synthesizeAppEntry(fileSet, normalized);
      if (synthesized) {
        entryPath = synthesized.path;
        normalized[entryPath] = synthesized.code;
        fileSet.add(entryPath);
        diagnostics.push({
          severity: "info",
          category: "entrypoint-missing",
          message: `Auto-synthesized ${entryPath}`,
          timestamp: Date.now(),
        });
      } else {
        const buildEnd = performance.now();
        return {
          htmlShell: generateErrorPage("No App entry point found"),
          importMap: {},
          modules: {},
          assets: {},
          entryFile: "",
          diagnostics: [{
            severity: "error",
            category: "entrypoint-missing",
            message: "No App entry point found. Files: " + Array.from(fileSet).join(", "),
            timestamp: Date.now(),
          }],
          metrics: this.buildMetrics(buildStart, buildEnd, 0, 0, 0, 0),
        };
      }
    }

    // 3. Collect asset files (images, json, svg) as data URIs
    const assetMap: Record<string, string> = {};
    const ASSET_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|ico|json|woff2?|ttf|eot)$/i;
    for (const [path, content] of Object.entries(normalized)) {
      if (ASSET_EXTENSIONS.test(path)) {
        const ext = path.split(".").pop()!.toLowerCase();
        const mimeMap: Record<string, string> = {
          png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
          gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
          ico: "image/x-icon", json: "application/json",
          woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", eot: "application/vnd.ms-fontobject",
        };
        const mime = mimeMap[ext] || "application/octet-stream";
        if (ext === "svg" || ext === "json") {
          assetMap[path] = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
        } else {
          // Binary files would need base64 encoding; for now use placeholder
          assetMap[path] = `https://placehold.co/400x300?text=${encodeURIComponent(path.split("/").pop() || ext)}`;
        }
      }
    }

    // 4. Compile all source files
    const { modules, css, diagnostics: compileDiags } = compileWorkspace(normalized, fileSet);
    diagnostics.push(...compileDiags);

    // If entry was synthesized, compile it too
    if (!modules.some(m => m.path === entryPath)) {
      const compiled = compileFile(normalized[entryPath!], entryPath!);
      const rewritten = rewriteToRegistry(compiled.code, entryPath!, fileSet);
      modules.push({
        path: entryPath!,
        originalPath: entryPath!,
        code: rewritten.code,
        imports: rewritten.imports,
        exports: [],
        hasDefaultExport: true,
        sizeBytes: new Blob([rewritten.code]).size,
      });
    }

    // 5. Build import map
    const importMap = buildImportMap(normalized, snapshot.dependencies, this.importMapProvider);

    // 6. Generate HTML shell with asset map
    const htmlShell = generateHtmlShell({
      importMap,
      modules,
      cssContents: css,
      entryPath: entryPath!,
      projectId: snapshot.projectId,
      assetMap,
      supabaseUrl: session.entryUrl ? undefined : undefined,
    });

    // 6. Build module map
    const moduleMap: Record<string, string> = {};
    for (const m of modules) {
      moduleMap[m.path] = m.code;
    }

    const buildEnd = performance.now();

    console.log(
      `[Phoenix ESM] Built: ${modules.length} modules, entry: ${entryPath}, ` +
      `${Object.keys(importMap).length} deps, ${Math.round(buildEnd - buildStart)}ms`
    );

    return {
      htmlShell,
      importMap,
      modules: moduleMap,
      assets: {},
      entryFile: entryPath!,
      diagnostics,
      metrics: this.buildMetrics(
        buildStart,
        buildEnd,
        modules.length,
        Object.keys(importMap).length,
        modules.reduce((sum, m) => sum + m.sizeBytes, 0),
        diagnostics.filter(d => d.severity === "error").length
      ),
    };
  }

  getEntryHtml(result: PreviewBuildResult): string {
    return result.htmlShell;
  }

  private buildMetrics(
    startMs: number,
    endMs: number,
    moduleCount: number,
    depCount: number,
    totalSize: number,
    errorCount: number
  ): PreviewMetrics {
    return {
      buildStartMs: startMs,
      buildEndMs: endMs,
      buildDurationMs: Math.round(endMs - startMs),
      fileCount: moduleCount,
      moduleCount,
      dependencyCount: depCount,
      totalSizeBytes: totalSize,
      errorCount,
      warningCount: 0,
    };
  }
}
