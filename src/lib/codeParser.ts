/**
 * Code Parser — parsing utilities for AI-generated code output.
 * Handles React multi-file fences, HTML extraction, import sanitization,
 * and HTML post-processing.
 */

import { validateAndFixHtml } from "@/lib/htmlValidator";

// ─── Types ────────────────────────────────────────────────────────────────

export type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export function getTextContent(content: MsgContent): string {
  if (typeof content === "string") return content;
  return content.filter((p): p is { type: "text"; text: string } => p.type === "text").map(p => p.text).join("\n");
}

export function getImageUrls(content: MsgContent): string[] {
  if (typeof content === "string") return [];
  return content.filter((p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url").map(p => p.image_url.url);
}

// ─── Allowed Packages ─────────────────────────────────────────────────────

const ALLOWED_PACKAGES = new Set([
  "react", "react-dom", "react/jsx-runtime",
  "lucide-react", "framer-motion", "date-fns", "recharts",
  "react-router-dom", "clsx", "tailwind-merge",
  "react-intersection-observer", "zustand", "zod", "axios",
  "@tanstack/react-query", "@tanstack/react-table",
  "@supabase/supabase-js",
  "react-hook-form", "sonner",
]);

export function isAllowedImport(pkg: string): boolean {
  if (pkg.startsWith(".") || pkg.startsWith("/")) return true;
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  if (base.startsWith("@radix-ui/")) return true;
  return ALLOWED_PACKAGES.has(base);
}

// ─── Import Sanitizer ─────────────────────────────────────────────────────

/**
 * Comprehensive import/require sanitizer.
 * Handles: single-line imports, multi-line imports, side-effect imports,
 * re-exports (export ... from), dynamic import(), and require().
 */
export function sanitizeImports(code: string): string {
  // 1. Strip multi-line and single-line: import ... from 'pkg'
  code = code.replace(
    /^\s*import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped import from: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 2. Strip side-effect imports: import 'pkg' or import "pkg"
  code = code.replace(
    /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped side-effect import: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 3. Strip re-exports: export { X } from 'pkg' or export * from 'pkg'
  code = code.replace(
    /^\s*export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped re-export from: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 4. Strip require() calls for unknown packages
  code = code.replace(
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped require: ${pkg}`);
        return `undefined /* STRIPPED: ${pkg} */`;
      }
      return match;
    }
  );

  // 5. Strip dynamic import() for unknown packages  
  code = code.replace(
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped dynamic import: ${pkg}`);
        return `Promise.resolve({}) /* STRIPPED: ${pkg} */`;
      }
      return match;
    }
  );

  // 6. Final pass: catch any remaining multi-line imports
  code = code.replace(
    /^\s*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped multi-line import: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 7. Fix invalid JSX: <array[index].prop /> → assign to variable first
  code = code.replace(
    /<(\w+)\[([^\]]+)\]\.(\w+)(\s[^>]*)?\s*\/>/g,
    (match, arr, idx, prop, attrs) => {
      const cleanAttrs = (attrs || '').trim();
      return `{(() => { const _DynComp = ${arr}[${idx}].${prop}; return <_DynComp ${cleanAttrs} />; })()}`;
    }
  );
  
  code = code.replace(
    /<(\w+)\[([^\]]+)\]\.(\w+)(\s[^>]*)?>([^]*?)<\/\1\[\2\]\.\3>/g,
    (match, arr, idx, prop, attrs, children) => {
      const cleanAttrs = (attrs || '').trim();
      return `{(() => { const _DynComp = ${arr}[${idx}].${prop}; return <_DynComp ${cleanAttrs}>${children}</_DynComp>; })()}`;
    }
  );

  return code;
}

// ─── HTML Response Parser ─────────────────────────────────────────────────

export function parseResponse(text: string): [string, string | null] {
  let fenceStart = text.indexOf("```html-preview");
  if (fenceStart === -1) fenceStart = text.indexOf("```html");
  if (fenceStart === -1) return [text, null];
  const chatPart = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  const fenceEnd = text.indexOf("```", codeStart);
  const htmlCode = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  return [chatPart, htmlCode.trim()];
}

// ─── React Multi-File Parser ──────────────────────────────────────────────

/** Parse file sections from a code block — simple line-by-line approach */
export function parseFileSections(block: string): { files: Record<string, string>; deps: Record<string, string>; fileCount: number } {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};
  
  const lines = block.split("\n");
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  let inDeps = false;
  let depsLines: string[] = [];
  
  // Accept filenames with spaces/symbols (e.g. /pages/News & Events.jsx)
  const separatorRegex = /^-{3}\s+(.+?\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;
  const bareFilenameRegex = /^\/?(.+?\.(?:jsx?|tsx?|css))\s*$/;
  const justDashes = /^-{3}\s*$/;
  
  function flushFile() {
    if (currentFile) {
      const code = currentLines.join("\n").trim();
      if (code.length > 0) {
        let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
        fname = fname.replace(/^\/src\//, "/");
        files[fname] = code;
      }
    }
    if (inDeps) {
      try { Object.assign(deps, JSON.parse(depsLines.join("\n").trim())); } catch {}
      inDeps = false;
      depsLines = [];
    }
    currentFile = null;
    currentLines = [];
  }
  
  let prevWasDashes = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    const sepMatch = trimmed.match(separatorRegex);
    if (sepMatch) {
      flushFile();
      currentFile = sepMatch[1];
      prevWasDashes = false;
      continue;
    }
    
    if (/^-{3}\s+\/?dependencies\s*-{0,3}\s*$/.test(trimmed)) {
      flushFile();
      inDeps = true;
      prevWasDashes = false;
      continue;
    }
    
    if (justDashes.test(trimmed)) {
      if (prevWasDashes) {
        prevWasDashes = false;
        continue;
      }
      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        const fnMatch = nextTrimmed.match(bareFilenameRegex);
        if (fnMatch) {
          flushFile();
          currentFile = fnMatch[0].startsWith("/") ? fnMatch[0].trim() : fnMatch[0].trim();
          i++;
          prevWasDashes = true;
          continue;
        }
        if (/^\/?dependencies$/.test(nextTrimmed)) {
          flushFile();
          inDeps = true;
          i++;
          prevWasDashes = true;
          continue;
        }
      }
      if (prevWasDashes) {
        prevWasDashes = false;
        continue;
      }
      if (currentFile) currentLines.push(line);
      if (inDeps) depsLines.push(line);
      prevWasDashes = false;
      continue;
    }
    
    prevWasDashes = false;
    
    if (inDeps) {
      depsLines.push(line);
    } else if (currentFile) {
      currentLines.push(line);
    }
  }
  
  flushFile();
  
  return { files, deps, fileCount: Object.keys(files).length };
}

/**
 * Deduplicate a single file's content.
 * Detects when the AI concatenates the same file twice (imports reappear after exports).
 * This is the ROOT-CAUSE fix — runs before files reach any preview engine.
 */
function deduplicateFileContent(code: string, filePath: string): string {
  if (code.length < 120) return code;

  // Strategy 1: Detect import statements appearing after export/function/const code.
  // This is the #1 AI duplication pattern: the entire module is concatenated twice.
  const lines = code.split("\n");
  let lastImportLine = -1;
  let firstCodeLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    
    if (/^import\s/.test(trimmed)) {
      if (firstCodeLine === -1) {
        lastImportLine = i;
      } else if (i > lastImportLine + 5 && firstCodeLine !== -1) {
        // Found an import statement appearing AFTER real code — duplicate block starts here
        const before = lines.slice(0, i).join("\n").trim();
        // Verify the "before" section is a complete module (has exports)
        if (/export\s/.test(before) && before.length > 80) {
          console.warn(`[Dedup] Truncated duplicate block in ${filePath} at line ${i + 1} (${code.length} → ${before.length} chars)`);
          return before;
        }
      }
    } else if (firstCodeLine === -1 && lastImportLine >= 0) {
      firstCodeLine = i;
    }
  }

  // Strategy 2: Exact-half duplication (entire file repeated)
  const halfLen = Math.floor(code.length / 2);
  for (let offset = -15; offset <= 15; offset++) {
    const splitPoint = halfLen + offset;
    if (splitPoint < 50 || splitPoint >= code.length - 50) continue;
    const firstHalf = code.slice(0, splitPoint).trim();
    const secondHalf = code.slice(splitPoint).trim();
    if (firstHalf === secondHalf) {
      console.warn(`[Dedup] Removed exact-half duplication in ${filePath} (${code.length} → ${firstHalf.length} chars)`);
      return firstHalf;
    }
  }

  // Strategy 3: Duplicate export default
  const exportDefaultMatches = [...code.matchAll(/export\s+default\s+(?:function\s+)?(\w+)/g)];
  if (exportDefaultMatches.length >= 2) {
    const first = exportDefaultMatches[0];
    const second = exportDefaultMatches[1];
    if (first[1] && second[1] && first[1] === second[1]) {
      // Same component exported twice — find where the duplicate starts
      const secondPos = second.index!;
      // Look backward for the start of the duplicate's import block
      const beforeSecond = code.slice(0, secondPos);
      const lastImportIdx = beforeSecond.lastIndexOf("\nimport ");
      if (lastImportIdx > code.length * 0.3) {
        const lineStart = code.lastIndexOf("\n", lastImportIdx - 1) + 1;
        const truncated = code.slice(0, lineStart).trim();
        if (truncated.length > 100 && /export\s/.test(truncated)) {
          console.warn(`[Dedup] Removed duplicate ${first[1]} in ${filePath} (${code.length} → ${truncated.length} chars)`);
          return truncated;
        }
      }
    }
  }

  return code;
}

/** Parse react/jsx code fences into a file map for Sandpack */
export function parseReactFiles(text: string): { chatText: string; files: Record<string, string> | null; deps: Record<string, string> } {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};

  const fencePatterns = [
    "```react-preview",
    "```jsx-preview", 
    "```react",
    "```jsx",
  ];
  
  let fenceStart = -1;
  let matchedPattern = "";
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) {
      matchedPattern = pattern;
      break;
    }
  }
  
  if (fenceStart === -1) {
    const genericFence = text.match(/```\w*\n[\s\S]*?---\s+\/?(src\/)?App\.jsx?\s*-{0,3}/);
    if (genericFence) {
      fenceStart = text.indexOf(genericFence[0]);
      matchedPattern = "generic-with-app";
    }
  }
  
  if (fenceStart === -1) {
    return { chatText: text, files: null, deps };
  }

  const chatText = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  
  let fenceEnd = -1;
  let searchFrom = codeStart;
  while (searchFrom < text.length) {
    const candidate = text.indexOf("\n```", searchFrom);
    if (candidate === -1) break;
    const afterFence = candidate + 4;
    if (afterFence >= text.length || text[afterFence] === '\n' || text[afterFence] === '\r' || text[afterFence] === ' ') {
      fenceEnd = candidate;
      break;
    }
    searchFrom = candidate + 4;
  }
  
  const block = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  
  if (block.trim().length === 0) {
    return { chatText: text, files: null, deps };
  }
  
  const parsedFiles = parseFileSections(block);
  
  if (parsedFiles.fileCount === 0) {
    const hasSectionMarkers = /^\s*-{3}\s+/m.test(block);

    // If the model attempted multi-file output but we couldn't parse file sections,
    // DO NOT force it into /App.jsx (that can inject lines like `--- /pages/...` and crash preview).
    if (hasSectionMarkers) {
      console.warn("[parseReactFiles] Detected file-section markers but parsed 0 files; skipping unsafe App.jsx fallback");
      return { chatText, files: null, deps };
    }

    const cleaned = block.replace(/^---\s+.+?\.(?:jsx?|tsx?|css)\s*-{0,3}\s*\n/gm, "").trim();
    console.log(`[parseReactFiles] Single-file mode: treating block as /App.jsx (${cleaned.length} chars)`);
    files["/App.jsx"] = sanitizeImports(deduplicateFileContent(cleaned, "/App.jsx"));
    return { chatText, files, deps };
  }
  
  let dedupCount = 0;
  for (const [fname, code] of Object.entries(parsedFiles.files)) {
    const deduped = fname.match(/\.(jsx?|tsx?)$/) ? deduplicateFileContent(code, fname) : code;
    if (deduped !== code) dedupCount++;
    files[fname] = fname.match(/\.(jsx?|tsx?)$/) ? sanitizeImports(deduped) : deduped;
  }
  if (dedupCount > 0) {
    console.warn(`[parseReactFiles] Deduplicated ${dedupCount} file(s) with duplicate AI content`);
  }
  
  for (const [pkg, ver] of Object.entries(parsedFiles.deps)) {
    if (isAllowedImport(pkg)) deps[pkg] = ver;
  }

  return {
    chatText,
    files: Object.keys(files).length > 0 ? files : null,
    deps,
  };
}

// ─── HTML Post-Processor ──────────────────────────────────────────────────

export function postProcessHtml(html: string): string {
  if (!html) return html;
  
  const validation = validateAndFixHtml(html);
  html = validation.html;
  
  if (validation.issues.length > 0) {
    console.log(`[HTML Validator] Score: ${validation.score}/100, Issues: ${validation.issues.length}`, 
      validation.issues.map(i => `${i.fixed ? '✅' : '⚠️'} [${i.category}] ${i.message}`));
  }
  
  const injections: string[] = [];
  if (!html.includes('scroll-behavior')) {
    injections.push('<style>html{scroll-behavior:smooth}*{-webkit-tap-highlight-color:transparent}::selection{background:rgba(99,102,241,0.2)}img{max-width:100%;height:auto}img.img-error{display:none!important}</style>');
  }
  if (!html.includes('__safeQuery')) {
    injections.push(`<script>
window.__safeQuery=function(s){try{return document.querySelector(s)}catch(e){return null}};
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('img').forEach(function(img){
    img.addEventListener('error',function(){this.style.display='none';this.classList.add('img-error')});
  });
  document.addEventListener('click',function(e){
    var link=e.target.closest('a[href^="#"]');
    if(!link)return;
    var hash=link.getAttribute('href');
    if(!hash||hash==='#')return;
    e.preventDefault();
    var target=document.querySelector(hash);
    if(target){
      target.scrollIntoView({behavior:'smooth',block:'start'});
      history.replaceState(null,null,hash);
    }
    var mobileMenu=document.querySelector('[data-mobile-menu],.mobile-menu,.nav-menu.open,.menu-open');
    if(mobileMenu){mobileMenu.classList.remove('open','active','show','menu-open');mobileMenu.style.display='none';}
  });
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    var hash=a.getAttribute('href');
    if(!hash||hash==='#')return;
    a.style.cursor='pointer';
  });
});
</script>`);
  }
  if (!html.includes('favicon') && !html.includes('rel="icon"')) {
    injections.push('<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'><rect width=\'32\' height=\'32\' rx=\'8\' fill=\'%236366f1\'/><text x=\'50%25\' y=\'55%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'18\' fill=\'white\'>⚡</text></svg>" type="image/svg+xml">');
  }
  if (html.includes('fonts.googleapis.com') && !html.includes('preconnect')) {
    injections.push('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  }
  if (!html.includes('theme-color')) {
    injections.push('<meta name="theme-color" content="#6366f1">');
  }
  if (injections.length === 0) return html;
  const headIdx = html.indexOf('<head>');
  if (headIdx !== -1) {
    const insertPos = headIdx + '<head>'.length;
    return html.slice(0, insertPos) + '\n  ' + injections.join('\n  ') + html.slice(insertPos);
  }
  return html;
}

// ─── Utility Helpers ──────────────────────────────────────────────────────

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function buildMessageContent(text: string, images: string[]): MsgContent {
  if (images.length === 0) return text;
  const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  parts.push({ type: "text", text });
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: img } });
  }
  return parts;
}
