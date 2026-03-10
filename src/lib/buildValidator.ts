/**
 * Build Validator — file validation using real parsers (Sucrase + PostCSS).
 * Single source of truth for code validation in the build pipeline.
 * 
 * Extracted from buildEngine.ts to reduce monolith complexity.
 * 
 * Responsibilities:
 * - validateAllFiles: parse-only validation (no regex repair)
 * - findMissingFileImports: detect local imports referencing non-existent files
 * - autoCreateStubFiles: generate stubs for missing imports
 * - findUndefinedJSXReferences: detect PascalCase JSX tags that are neither imported nor defined
 * - enforceFileStructure: relocate misplaced files to correct folders
 * - stubBrokenFiles: replace broken files with safe fallback stubs
 */

import { transform } from "sucrase";
import postcss from "postcss";
import {
  isFileValidated, markFileValidated,
} from "@/lib/buildCache";

// ─── File Validation ──────────────────────────────────────────────────────

/**
 * Validate files using real parsers. Skips files already validated via cache.
 */
export function validateAllFiles(files: Record<string, string>): { file: string; error: string }[] {
  const errors: { file: string; error: string }[] = [];
  
  const availablePackages = new Set([
    "react", "react-dom", "lucide-react", "framer-motion", "date-fns",
    "recharts", "react-router-dom", "clsx", "tailwind-merge",
  ]);
  
  const definedComponents = new Set<string>(["React", "Fragment"]);
  for (const [, code] of Object.entries(files)) {
    const exportDefaultMatch = code.matchAll(/export\s+default\s+function\s+(\w+)/g);
    for (const m of exportDefaultMatch) definedComponents.add(m[1]);
    const exportNamedMatch = code.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g);
    for (const m of exportNamedMatch) definedComponents.add(m[1]);
    const fnMatch = code.matchAll(/^function\s+([A-Z]\w+)/gm);
    for (const m of fnMatch) definedComponents.add(m[1]);
    const constMatch = code.matchAll(/^(?:export\s+)?const\s+([A-Z]\w+)\s*=/gm);
    for (const m of constMatch) definedComponents.add(m[1]);
  }
  
  for (const [filePath, code] of Object.entries(files)) {
    if (isFileValidated(filePath, code)) continue;

    if (filePath.match(/\.(jsx?|tsx?)$/)) {
      try {
        transform(code, { transforms: ["jsx", "imports"], filePath });
      } catch (e: any) {
        errors.push({ file: filePath, error: (e.message || "JSX parse error").slice(0, 200) });
        continue;
      }
      
      const missingImports = findMissingFileImports(code, filePath, files);
      if (missingImports.length > 0) {
        const unresolvable = autoCreateStubFiles(missingImports, filePath, files);
        if (unresolvable.length > 0) {
          errors.push({
            file: filePath,
            error: `Missing local file imports: ${unresolvable.join(", ")}. Either create these files or remove the imports. Only import files that exist in your output.`
          });
          continue;
        }
        console.log(`[BuildValidator] Auto-created stubs for ${missingImports.length} missing imports from ${filePath}`);
      }
      
      const undefinedRefs = findUndefinedJSXReferences(code, filePath, files, definedComponents, availablePackages);
      if (undefinedRefs.length > 0) {
        errors.push({ 
          file: filePath, 
          error: `${undefinedRefs.join(", ")} ${undefinedRefs.length === 1 ? "is" : "are"} not defined. Either import ${undefinedRefs.length === 1 ? "it" : "them"} or remove ${undefinedRefs.length === 1 ? "it" : "them"}. Available packages: ${[...availablePackages].join(", ")}. Do NOT use react-hot-toast, sonner, or any toast library — implement a simple inline toast component instead.`
        });
        continue;
      }
      
      markFileValidated(filePath, code);
    } else if (filePath.match(/\.css$/)) {
      try {
        postcss.parse(code);
        markFileValidated(filePath, code);
      } catch (e: any) {
        errors.push({ file: filePath, error: (e.message || "CSS parse error").slice(0, 200) });
      }
    }
  }
  
  return errors;
}

// ─── Missing Import Detection ─────────────────────────────────────────────

/**
 * Find import statements that reference local files (relative paths) not present in the file set.
 */
export function findMissingFileImports(
  code: string,
  filePath: string,
  allFiles: Record<string, string>
): string[] {
  const missing: string[] = [];
  const importPathRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?["'](\.[^"']+)["']/g;
  let m;
  while ((m = importPathRegex.exec(code)) !== null) {
    const importPath = m[1];
    const currentDir = filePath.substring(0, filePath.lastIndexOf("/")) || "";
    let resolved = importPath;
    if (importPath.startsWith("./")) {
      resolved = currentDir + importPath.substring(1);
    } else if (importPath.startsWith("../")) {
      const parts = currentDir.split("/").filter(Boolean);
      let relParts = importPath.split("/");
      while (relParts[0] === "..") {
        parts.pop();
        relParts.shift();
      }
      resolved = "/" + parts.concat(relParts).join("/");
    }
    if (!resolved.startsWith("/")) resolved = "/" + resolved;
    
    const extensions = ["", ".jsx", ".js", ".tsx", ".ts"];
    const found = extensions.some(ext => {
      const candidate = resolved + ext;
      return allFiles[candidate] !== undefined;
    });
    const indexFound = extensions.some(ext => {
      return allFiles[resolved + "/index" + ext] !== undefined;
    });
    
    if (!found && !indexFound) {
      missing.push(importPath);
    }
  }
  return missing;
}

// ─── Auto-Stub Creation ──────────────────────────────────────────────────

/**
 * Auto-create stub files for missing imports to prevent runtime errors.
 */
export function autoCreateStubFiles(
  missingImports: string[],
  importingFilePath: string,
  allFiles: Record<string, string>
): string[] {
  const unresolvable: string[] = [];
  const currentDir = importingFilePath.substring(0, importingFilePath.lastIndexOf("/")) || "";

  for (const importPath of missingImports) {
    let resolved = importPath;
    if (importPath.startsWith("./")) {
      resolved = currentDir + importPath.substring(1);
    } else if (importPath.startsWith("../")) {
      const parts = currentDir.split("/").filter(Boolean);
      let relParts = importPath.split("/");
      while (relParts[0] === "..") {
        parts.pop();
        relParts.shift();
      }
      resolved = "/" + parts.concat(relParts).join("/");
    }
    if (!resolved.startsWith("/")) resolved = "/" + resolved;

    const segments = resolved.split("/");
    const lastSegment = segments[segments.length - 1];
    const componentName = lastSegment.replace(/\.\w+$/, "");
    const filePath = resolved.match(/\.\w+$/) ? resolved : resolved + ".jsx";

    if (allFiles[filePath]) continue;

    if (/^[A-Z]/.test(componentName)) {
      allFiles[filePath] = `import React from "react";\n\nexport default function ${componentName}({ children }) {\n  return (\n    <div className="p-4">\n      {children || <p className="text-gray-400">${componentName} loading...</p>}\n    </div>\n  );\n}\n`;
    } else {
      allFiles[filePath] = `// Auto-generated stub for ${componentName}\nexport default {};\n`;
    }
    console.log("[BuildValidator] Auto-created stub: " + filePath);
  }

  return unresolvable;
}

// ─── Undefined JSX Reference Detection ────────────────────────────────────

/**
 * Find JSX component references (PascalCase) that are neither imported nor defined in the file.
 */
export function findUndefinedJSXReferences(
  code: string,
  filePath: string,
  allFiles: Record<string, string>,
  definedComponents: Set<string>,
  availablePackages: Set<string>
): string[] {
  const localNames = new Set<string>();
  
  const importRegex = /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+["'][^"']+["']/g;
  let m;
  while ((m = importRegex.exec(code)) !== null) {
    if (m[1]) localNames.add(m[1]);
    if (m[2]) {
      m[2].split(",").forEach(n => {
        const name = n.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) localNames.add(name);
      });
    }
  }
  
  const localDeclRegex = /(?:function|const|let|var|class)\s+([A-Z]\w+)/g;
  while ((m = localDeclRegex.exec(code)) !== null) {
    localNames.add(m[1]);
  }
  
  const destructureRenameRegex = /\w+\s*:\s*([A-Z]\w+)/g;
  while ((m = destructureRenameRegex.exec(code)) !== null) {
    localNames.add(m[1]);
  }
  
  const paramRegex = /\(\s*\{([^}]+)\}\s*\)/g;
  while ((m = paramRegex.exec(code)) !== null) {
    m[1].split(",").forEach(p => {
      const name = p.trim().split(/\s*:\s*/).pop()?.trim();
      if (name && /^[A-Z]/.test(name)) localNames.add(name);
    });
  }
  
  const builtins = new Set(["React", "Fragment", "Suspense", "StrictMode"]);
  
  const jsxTagRegex = /<([A-Z]\w+)[\s/>]/g;
  const undefinedRefs = new Set<string>();
  while ((m = jsxTagRegex.exec(code)) !== null) {
    const name = m[1];
    if (builtins.has(name)) continue;
    if (localNames.has(name)) continue;
    if (definedComponents.has(name)) continue;
    undefinedRefs.add(name);
  }
  
  return [...undefinedRefs];
}

// ─── File Structure Enforcement ───────────────────────────────────────────

/**
 * Enforce mandatory folder structure by relocating misplaced files.
 */
export function enforceFileStructure(files: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  
  const CONCAT_FIXES: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /^\/components\/ui([A-Z]\w+)\.(jsx?|tsx?|css)$/, replacement: "/components/ui/$1.$2" },
    { pattern: /^\/components([A-Z]\w+)\.(jsx?|tsx?|css)$/, replacement: "/components/$1.$2" },
    { pattern: /^\/componentsui([A-Z]\w+)\.(jsx?|tsx?|css)$/, replacement: "/components/ui/$1.$2" },
    { pattern: /^\/styles(\w+)\.(css)$/, replacement: "/styles/$1.$2" },
    { pattern: /^\/layout([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/layout/$1.$2" },
    { pattern: /^\/hooks(use\w+)\.(jsx?|tsx?|js)$/, replacement: "/hooks/$1.$2" },
    { pattern: /^\/pages([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/pages/$1/$1.$2" },
    { pattern: /^\/pages([A-Z]\w+)([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/pages/$1/$2.$3" },
    { pattern: /^\/contexts([A-Z]\w+)\.(jsx?|tsx?)$/, replacement: "/contexts/$1.$2" },
  ];

  for (const [path, code] of Object.entries(files)) {
    let fixedPath = path;
    for (const { pattern, replacement } of CONCAT_FIXES) {
      if (pattern.test(fixedPath)) {
        fixedPath = fixedPath.replace(pattern, replacement);
        break;
      }
    }
    normalized[fixedPath] = code;
  }

  const result: Record<string, string> = {};
  
  const pagePatterns = /(?:Page|List|Detail|Details|Manager|View|Form|Editor|Settings|Profile|History)\.jsx?$/;
  
  for (const [path, code] of Object.entries(normalized)) {
    let newPath = path;
    
    const flatPageMatch = newPath.match(/^\/pages\/([A-Z]\w+)\.(jsx?|tsx?)$/);
    if (flatPageMatch) {
      newPath = `/pages/${flatPageMatch[1]}/${flatPageMatch[1]}.${flatPageMatch[2]}`;
    }
    
    const nestedPageFileMatch = newPath.match(/^\/pages\/([A-Z]\w+)\/([A-Z]\w+)\.(jsx?|tsx?)$/);
    if (nestedPageFileMatch) {
      const [, moduleName, fileName, ext] = nestedPageFileMatch;
      const isMainPage = fileName === moduleName || pagePatterns.test(`${fileName}.${ext}`);
      if (!isMainPage) {
        newPath = `/components/${fileName}.${ext}`;
      }
    }
    
    if (newPath.match(/\/contexts\/Toast/i) && code.includes("toast")) {
      newPath = `/components/ui/Toast.jsx`;
    }
    
    result[newPath] = code;
  }
  
  return fixRelocatedImports(files, result);
}

// ─── Import Path Fixing ──────────────────────────────────────────────────

/**
 * After relocating files, fix import paths in all files that referenced old paths.
 */
function fixRelocatedImports(
  originalFiles: Record<string, string>,
  relocatedFiles: Record<string, string>
): Record<string, string> {
  const pathMap = new Map<string, string>();
  const origPaths = Object.keys(originalFiles);
  const newPaths = Object.keys(relocatedFiles);
  
  for (let i = 0; i < origPaths.length; i++) {
    if (origPaths[i] !== newPaths[i]) {
      const oldImport = origPaths[i].replace(/\.(jsx?|tsx?)$/, "");
      const newImport = newPaths[i].replace(/\.(jsx?|tsx?)$/, "");
      pathMap.set(oldImport, newImport);
    }
  }
  
  if (pathMap.size === 0) return relocatedFiles;
  
  const result: Record<string, string> = {};
  for (const [path, code] of Object.entries(relocatedFiles)) {
    let fixedCode = code;
    for (const [oldImport, newImport] of pathMap) {
      const oldRelative = makeRelative(path, oldImport);
      const newRelative = makeRelative(path, newImport);
      fixedCode = fixedCode.replace(
        new RegExp(`(from\\s+["'])${escapeRegex(oldRelative)}(["'])`, "g"),
        `$1${newRelative}$2`
      );
      fixedCode = fixedCode.replace(
        new RegExp(`(from\\s+["'])\\.${escapeRegex(oldImport)}(["'])`, "g"),
        `$1.${newImport}$2`
      );
    }
    result[path] = fixedCode;
  }
  
  return result;
}

function makeRelative(fromPath: string, toPath: string): string {
  const fromParts = fromPath.split("/").slice(0, -1);
  const toParts = toPath.split("/");
  
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }
  
  const ups = fromParts.length - common;
  const rel = ups > 0 ? "../".repeat(ups) + toParts.slice(common).join("/") : "./" + toParts.slice(common).join("/");
  return rel;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Stub Generators ─────────────────────────────────────────────────────

export function makeStub(filePath: string): string {
  const componentName = filePath
    .replace(/.*\//, '')
    .replace(/\.(jsx?|tsx?)$/, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  const safeName = componentName.charAt(0).toUpperCase() + componentName.slice(1) || 'BrokenModule';
  return `import React from "react";\n\nexport default function ${safeName}() {\n  return (\n    <div className="p-8 text-center space-y-3">\n      <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 flex items-center justify-center"><span className="text-amber-600 text-xl">\u26A0</span></div>\n      <h2 className="text-lg font-semibold text-slate-800">${safeName}</h2>\n      <p className="text-sm text-slate-500">This module had a build error after retries. Send a follow-up message to fix it.</p>\n    </div>\n  );\n}\n`;
}

export function makeCSSSub(): string {
  return `/* CSS had parse errors after retries — using safe fallback */\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
}

export function stubBrokenFiles(files: Record<string, string>, errors: { file: string; error: string }[]): Record<string, string> {
  const result = { ...files };
  for (const { file, error } of errors) {
    console.warn(`[BuildValidator] Stubbing broken file "${file}": ${error}`);
    if (file.match(/\.css$/)) {
      result[file] = makeCSSSub();
    } else if (file.match(/\.(jsx?|tsx?)$/)) {
      result[file] = makeStub(file);
    }
  }
  return result;
}
