/**
 * Build Compiler v1.0 — Missing Module Generator
 * 
 * Deterministic (no AI) — scans workspace for broken imports,
 * resolves what the target path should be, and generates a valid
 * stub component so the build never fails on "module not found."
 * 
 * This runs BEFORE the AI-based repair loop.
 */

import type { Workspace } from "./workspace";
import { cloudLog } from "@/lib/cloudLogBus";

export interface MissingModuleIssue {
  type: "MissingModule";
  /** File containing the broken import */
  file: string;
  /** Raw import path as written: '../ui/Card' */
  importPath: string;
  /** Resolved workspace path: '/components/ui/Card.jsx' */
  resolvedPath: string;
  /** Symbols the importer expects */
  symbols: string[];
  /** Whether the importer uses a default import */
  isDefault: boolean;
}

// ─── Detect ───────────────────────────────────────────────────────────────

/**
 * Scan every file in the workspace for imports that reference
 * files that don't exist. Returns a deduplicated list.
 */
export function detectMissingModules(workspace: Workspace): MissingModuleIssue[] {
  const issues: MissingModuleIssue[] = [];
  const seen = new Set<string>();
  const idx = workspace.index;

  for (const [file, imports] of Object.entries(idx.imports)) {
    for (const imp of imports) {
      // Skip external packages
      if (!imp.from.startsWith(".") && !imp.from.startsWith("/") && !imp.from.startsWith("@/")) {
        continue;
      }

      const resolved = workspace.resolveImport(file, imp.from);
      if (resolved && workspace.hasFile(resolved)) continue; // exists, fine

      // Build the target path this import SHOULD point to
      const targetPath = resolveTargetPath(file, imp.from);
      const dedupeKey = targetPath;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      issues.push({
        type: "MissingModule",
        file,
        importPath: imp.from,
        resolvedPath: targetPath,
        symbols: imp.symbols,
        isDefault: imp.isDefault,
      });
    }
  }

  return issues;
}

// ─── Repair ───────────────────────────────────────────────────────────────

/**
 * For each missing module, generate a valid stub file and add it
 * to the workspace. Returns the number of modules created.
 */
export function repairMissingModules(workspace: Workspace): {
  created: string[];
  issues: MissingModuleIssue[];
} {
  const issues = detectMissingModules(workspace);
  if (issues.length === 0) return { created: [], issues: [] };

  const created: string[] = [];

  for (const issue of issues) {
    const componentName = extractComponentName(issue.resolvedPath);
    const stub = generateStubComponent(componentName, issue);

    workspace.addFile(issue.resolvedPath, stub);
    created.push(issue.resolvedPath);

    cloudLog.warn(
      `Generated stub for missing module: ${issue.resolvedPath} (imported by ${issue.file})`,
      "compiler"
    );
    console.log(
      `[MissingModuleGen] 📦 Created stub: ${issue.resolvedPath} ← imported by ${issue.file} as '${issue.importPath}'`
    );
  }

  return { created, issues };
}

// ─── Stub Generator ───────────────────────────────────────────────────────

function generateStubComponent(
  name: string,
  issue: MissingModuleIssue
): string {
  const path = issue.resolvedPath.toLowerCase();

  // Context files → generate a context + provider + hook
  if (path.includes("/contexts/") || name.endsWith("Context")) {
    return generateContextStub(name, issue);
  }

  // Hook files → generate a custom hook
  if (path.includes("/hooks/") || name.startsWith("use")) {
    return generateHookStub(name, issue);
  }

  // Service files → generate API service
  if (path.includes("/services/")) {
    return generateServiceStub(name, issue);
  }

  // CSS files
  if (path.endsWith(".css")) {
    return `/* ${name} styles — auto-generated stub */\n`;
  }

  // Default: React component
  return generateComponentStub(name, issue);
}

function generateComponentStub(name: string, issue: MissingModuleIssue): string {
  const namedExports = issue.symbols.filter(s => s !== name && s !== "default");
  
  let code = `import React from 'react';\n\n`;

  // Named exports (e.g. useToast from Toast component)
  for (const sym of namedExports) {
    if (sym.startsWith("use")) {
      // Hook-like named export — NEVER throw, return safe no-op
      code += `export function ${sym}() {\n  return { show: () => {}, hide: () => {}, toast: () => {}, dismiss: () => {} };\n}\n\n`;
    } else {
      code += `export const ${sym} = ({ children, className, ...props }) => {\n  return <div className={className} {...props}>{children || '${sym}'}</div>;\n};\n\n`;
    }
  }

  // Default export component
  code += `export default function ${name}({ children, className, ...props }) {\n`;
  code += `  return (\n`;
  code += `    <div className={className || '${name.toLowerCase()}'} {...props}>\n`;
  code += `      {children}\n`;
  code += `    </div>\n`;
  code += `  );\n`;
  code += `}\n`;

  return code;
}

function generateContextStub(name: string, issue: MissingModuleIssue): string {
  const baseName = name.replace(/Context$/, "").replace(/Provider$/, "");
  const contextName = `${baseName}Context`;
  const providerName = `${baseName}Provider`;
  const hookName = `use${baseName}`;

  // Default value so useContext never returns null — stubs should NEVER throw
  const defaultValue = `{
  user: null,
  token: null,
  loading: false,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
}`;

  return `import React, { createContext, useContext, useState } from 'react';

const defaultCtx = ${defaultValue};

const ${contextName} = createContext(defaultCtx);

export function ${providerName}({ children }) {
  const [state, setState] = useState({});
  
  const value = { ...defaultCtx, ...state };

  return (
    <${contextName}.Provider value={value}>
      {children}
    </${contextName}.Provider>
  );
}

export function ${hookName}() {
  return useContext(${contextName});
}

export { ${contextName} };
export default ${contextName};
`;
}

function generateHookStub(name: string, issue: MissingModuleIssue): string {
  return `import { useState, useCallback } from 'react';

export default function ${name}() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    // stub — will be replaced by real implementation
    setLoading(false);
  }, []);

  return { data, loading, error, refresh };
}

export { ${name} };
`;
}

function generateServiceStub(name: string, issue: MissingModuleIssue): string {
  // Export each symbol as an async stub
  const namedExports = issue.symbols.filter(s => s !== "default" && s !== name);

  let code = `// ${name} service — auto-generated stub\n\n`;
  
  for (const sym of namedExports) {
    code += `export async function ${sym}(...args) {\n  console.warn('${sym} is a stub — implement real logic');\n  return null;\n}\n\n`;
  }

  if (namedExports.length === 0) {
    code += `export async function fetchData(...args) {\n  console.warn('${name}.fetchData is a stub');\n  return [];\n}\n`;
  }

  code += `\nexport default { ${namedExports.length > 0 ? namedExports.join(", ") : "fetchData"} };\n`;
  return code;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a PascalCase component name from a file path.
 * '/components/ui/Card.jsx' → 'Card'
 * '/contexts/AuthContext.jsx' → 'AuthContext'
 */
function extractComponentName(filePath: string): string {
  const basename = filePath.split("/").pop()!;
  const name = basename.replace(/\.(jsx?|tsx?|css)$/, "");
  // Ensure PascalCase
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Resolve what workspace path an import should target.
 * From '/pages/Auth/LoginPage.jsx' with import '../ui/Card',
 * resolve to '/pages/ui/Card.jsx' (then the importFixer can
 * correct this further if needed).
 */
function resolveTargetPath(fromFile: string, importPath: string): string {
  let resolved = importPath;
  
  // Handle @/ prefix
  if (resolved.startsWith("@/")) {
    resolved = "/" + resolved.slice(2);
  }

  // Resolve relative paths
  if (resolved.startsWith(".")) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const parts = [...fromDir.split("/"), ...resolved.split("/")].filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part !== ".") stack.push(part);
    }
    resolved = "/" + stack.join("/");
  }

  // Add .jsx extension if none present
  if (!/\.\w+$/.test(resolved)) {
    resolved += ".jsx";
  }

  return resolved;
}
