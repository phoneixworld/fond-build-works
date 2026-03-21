/**
 * Edit Engine — Surgical file editing for iterative refinement.
 * 
 * Instead of regenerating the entire app, this module:
 * 1. Resolves which file(s) the user wants to modify
 * 2. Builds a focused edit prompt with the target file's full source
 * 3. Streams the AI response and parses the updated file
 * 4. Merges the result back into the workspace
 * 
 * This enables Lovable-style "make the table sortable" interactions
 * on top of Phoenix's generated apps.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import type { AIModelId } from "@/lib/aiModels";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EditRequest {
  /** The user's natural language edit instruction */
  instruction: string;
  /** Current workspace files (path → code) */
  workspace: Record<string, string>;
  /** Project ID for API calls */
  projectId: string;
  /** AI model to use */
  model: AIModelId;
  /** Design theme */
  designTheme?: string;
  /** Project knowledge docs */
  knowledge?: string[];
  /** Attached images */
  images?: string[];
}

export interface EditResult {
  /** Files that were modified (path → new code) */
  modifiedFiles: Record<string, string>;
  /** Dependencies returned by the AI (pkg → version) */
  dependencies: Record<string, string>;
  /** Which files were targeted */
  targetFiles: string[];
  /** AI's explanation of what changed */
  explanation: string;
}

export interface EditCallbacks {
  onResolving: (targetFiles: string[]) => void;
  onStreaming: (chunk: string) => void;
  onComplete: (result: EditResult) => void;
  onError: (error: string) => void;
}

// ─── File Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve which files the user likely wants to edit based on their instruction.
 * Uses keyword matching against file names, component names, and content.
 */
export function resolveTargetFiles(
  instruction: string,
  workspace: Record<string, string>
): string[] {
  const lower = instruction.toLowerCase();
  const files = Object.keys(workspace);
  const scored: Array<{ path: string; score: number }> = [];

  // 0. If user explicitly references file paths, honor those first.
  const explicitPaths = extractExplicitFilePaths(instruction, files);
  if (explicitPaths.length > 0) return explicitPaths;

  // 0.5. Generic "fix preview/runtime error" requests should target likely-broken files,
  // not arbitrary page files. This avoids expensive, low-signal edit prompts.
  const genericRuntimeFix = isGenericRuntimeFixInstruction(lower);
  if (genericRuntimeFix) {
    const likelyBroken = detectLikelyBrokenFiles(workspace);
    if (likelyBroken.length > 0) return likelyBroken.slice(0, 3);
  }

  for (const path of files) {
    let score = 0;
    const fileName = path.split("/").pop()?.replace(/\.\w+$/, "") || "";
    const fileNameLower = fileName.toLowerCase();
    const dirName = path.split("/").slice(-2, -1)[0]?.toLowerCase() || "";
    const content = workspace[path];

    // 1. Direct file/component name mention (strongest signal)
    if (lower.includes(fileNameLower) && fileNameLower.length > 2) {
      score += 50;
    }

    // 2. Directory name mention (e.g., "students" matches /pages/Students/)
    if (dirName && lower.includes(dirName) && dirName.length > 2) {
      score += 40;
    }

    // 3. Page/component keyword matching
    const pageKeywords = extractPageKeywords(path, content);
    for (const kw of pageKeywords) {
      if (lower.includes(kw.toLowerCase()) && kw.length > 2) {
        score += 30;
      }
    }

    // 4. Feature keyword matching (what the file does)
    if (/\btable\b/i.test(lower) && /\<table\b/i.test(content)) score += 25;
    if (/\bform\b/i.test(lower) && /\<form\b/i.test(content)) score += 25;
    if (/\bdashboard\b/i.test(lower) && /dashboard/i.test(path)) score += 35;
    if (/\bsidebar\b/i.test(lower) && /sidebar/i.test(path)) score += 35;
    if (/\bnav/i.test(lower) && /sidebar|nav/i.test(path)) score += 30;
    if (/\bmodal\b|\bdialog\b/i.test(lower) && /modal|dialog/i.test(content)) score += 20;
    if (/\bchart\b|\bgraph\b/i.test(lower) && /chart|graph|recharts/i.test(content)) score += 25;
    if (/\bauth\b|\blogin\b/i.test(lower) && /auth|login/i.test(path)) score += 35;
    if (/\blayout\b/i.test(lower) && /layout/i.test(path)) score += 30;
    if (/\broute\b|\brouting\b/i.test(lower) && /App\.jsx/i.test(path)) score += 30;

    // 5. Content-based matching: search for specific identifiers mentioned
    const identifiers = extractMentionedIdentifiers(lower);
    for (const id of identifiers) {
      if (content.includes(id)) score += 15;
    }

    // 6. Penalize utility/infra files (user rarely wants to edit these directly)
    if (/\/ui\//i.test(path)) score -= 10;
    if (/\/hooks\//i.test(path)) score -= 5;
    if (/\/contexts\//i.test(path)) score -= 5;
    if (/globals\.css/i.test(path)) score -= 15;
    if (/useApi/i.test(path)) score -= 20;

    // 7. Boost page files (most likely edit targets)
    if (/\/pages\//i.test(path)) score += 5;

    if (score > 0) {
      scored.push({ path, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top matches (usually 1-3 files)
  if (scored.length === 0) {
    if (genericRuntimeFix) {
      const appEntry = files.find(f => /\/App\.(jsx?|tsx?)$/i.test(f));
      const uiFiles = files.filter(f => /\/components\/ui\/.+\.(jsx?|tsx?)$/i.test(f)).slice(0, 2);
      return [appEntry, ...uiFiles].filter(Boolean) as string[];
    }
    // Fallback: if user mentions "all pages" or generic edit, target main pages
    return files.filter(f => /\/pages\//.test(f)).slice(0, 3);
  }

  const topScore = scored[0].score;
  // Include files within 60% of top score
  const threshold = topScore * 0.6;
  const results = scored.filter(s => s.score >= threshold).map(s => s.path);

  // Cap at 5 files max for a single edit
  return results.slice(0, 5);
}

function isGenericRuntimeFixInstruction(lowerInstruction: string): boolean {
  return /\b(fix|resolve|repair)\b/.test(lowerInstruction)
    && /\b(error|preview|runtime|crash|broken|issue|same error|something went wrong)\b/.test(lowerInstruction)
    && !/\/[\w/.-]+\.(?:jsx?|tsx?|css)/i.test(lowerInstruction);
}

function extractExplicitFilePaths(instruction: string, files: string[]): string[] {
  const matches = instruction.match(/\/[\w/.-]+\.(?:jsx?|tsx?|css)/g) || [];
  if (matches.length === 0) return [];

  const normalizedWorkspace = new Map<string, string>();
  for (const f of files) {
    normalizedWorkspace.set(f, f);
    normalizedWorkspace.set(f.replace(/^\//, ""), f);
    normalizedWorkspace.set(f.replace(/^\/(?:src\/)?/, ""), f);
  }

  const picked = new Set<string>();
  for (const m of matches) {
    const normalized = m.startsWith("/") ? m : `/${m}`;
    const hit = normalizedWorkspace.get(normalized)
      || normalizedWorkspace.get(normalized.replace(/^\//, ""))
      || normalizedWorkspace.get(normalized.replace(/^\/(?:src\/)?/, ""));
    if (hit) picked.add(hit);
  }

  return [...picked].slice(0, 5);
}

function detectLikelyBrokenFiles(workspace: Record<string, string>): string[] {
  const scored: Array<{ path: string; score: number }> = [];

  for (const [path, code] of Object.entries(workspace)) {
    if (!/\.(jsx?|tsx?)$/i.test(path)) continue;

    let score = 0;
    const base = path.split("/").pop()?.replace(/\.[^.]+$/, "") || "";

    // Duplicate export shape: export { X }; export default X;
    if (/export\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*;?[\s\S]*export\s+default\s+\1\b/m.test(code)) {
      score += 120;
    }
    if (/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?[\s\S]*export\s*\{\s*\1\s*\}\s*;/m.test(code)) {
      score += 120;
    }

    // Self import (e.g. /lib/utils.js imports ./utils)
    if (base && new RegExp(`from\\s+['\"](?:\\./|(?:\\.\\./)+)[^'\"]*${base}(?:\\.[jt]sx?)?['\"]`).test(code)) {
      score += 90;
    }

    // Known bad cn utility shape (component instead of className function)
    if (/\/lib\/utils\.(jsx?|tsx?)$/i.test(path) && /export\s+const\s+cn\s*=\s*\(\s*\{\s*children\b/.test(code)) {
      score += 100;
    }

    // UI files are high impact when already suspicious
    if (score > 0 && /\/components\/ui\//i.test(path)) score += 10;

    if (score > 0) scored.push({ path, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.path);
}

/** Extract meaningful keywords from a file path and its content */
function extractPageKeywords(path: string, content: string): string[] {
  const keywords: string[] = [];

  // From path: /pages/Students/StudentList.jsx → ["Students", "StudentList"]
  const parts = path.split("/").filter(p => p && !p.includes("."));
  for (const part of parts) {
    if (part !== "pages" && part !== "components" && part !== "ui" && part !== "hooks") {
      keywords.push(part);
      // Split PascalCase: "StudentList" → ["Student", "List"]
      const split = part.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
      keywords.push(...split);
    }
  }

  // From content: extract the component's title/heading text
  const headingMatch = content.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (headingMatch) {
    keywords.push(...headingMatch[1].split(/\s+/).filter(w => w.length > 2));
  }

  return [...new Set(keywords)];
}

/** Extract identifiers the user might be referencing */
function extractMentionedIdentifiers(text: string): string[] {
  const ids: string[] = [];
  // PascalCase words (component names)
  const pascal = text.match(/\b[A-Z][a-zA-Z]+\b/g);
  if (pascal) ids.push(...pascal);
  // Quoted strings
  const quoted = text.match(/"([^"]+)"|'([^']+)'/g);
  if (quoted) ids.push(...quoted.map(q => q.replace(/['"]/g, "")));
  return ids;
}

// ─── Edit Prompt Builder ─────────────────────────────────────────────────────

/**
 * Build a focused edit prompt that gives the AI the current file(s)
 * and a clear instruction on what to change.
 */
export function buildEditPrompt(
  instruction: string,
  targetFiles: string[],
  workspace: Record<string, string>
): string {
  const fileSections = targetFiles.map(path => {
    const code = workspace[path] || "";
    return `### File: ${path}\n\`\`\`jsx\n${code}\n\`\`\``;
  }).join("\n\n");

  // Include a manifest of other available files for import context
  const otherFiles = Object.keys(workspace)
    .filter(p => !targetFiles.includes(p))
    .map(p => `- ${p}`)
    .join("\n");

  return `## EDIT TASK

You are modifying existing code in a React application. Make ONLY the requested changes — preserve all other functionality, styling, and structure.

### User Request:
${instruction}

### Files to Modify:
${fileSections}

### Other Available Files (for import reference):
${otherFiles}

### RULES:
1. Return ONLY the modified file(s) — use the same \`--- /path/to/file.jsx\` separator format
2. Keep ALL existing imports, state, functions, and JSX that aren't part of the change
3. Do NOT rename the component or change its default export
4. Do NOT remove existing features unless explicitly asked
5. Use the same styling approach (CSS variables, Tailwind classes) as the existing code
6. If adding new imports, use correct relative paths based on the file's location
7. Available UI components: Card, Button, Modal, DataTable, Toast, Spinner, Dialog, Sheet, Badge, Tabs, Select, Avatar, Input, Dropdown, Alert (in /components/ui/)
8. Use lucide-react for any new icons
9. Output complete, working files — no placeholders or TODOs
10. Wrap output in a \`\`\`jsx code fence with --- separators for each file

### OUTPUT FORMAT:
\`\`\`jsx
--- /path/to/modified/file.jsx
// complete updated file content here
\`\`\``;
}

// ─── Edit Executor ───────────────────────────────────────────────────────────

/**
 * Execute an edit: resolve files, build prompt, stream AI response, parse result.
 */
export async function executeEdit(
  request: EditRequest,
  callbacks: EditCallbacks
): Promise<void> {
  // 1. Resolve target files
  const targetFiles = resolveTargetFiles(request.instruction, request.workspace);
  
  if (targetFiles.length === 0) {
    callbacks.onError("Could not determine which file to edit. Try mentioning a specific page or component name.");
    return;
  }

  callbacks.onResolving(targetFiles);

  // 2. Build edit prompt
  const prompt = buildEditPrompt(request.instruction, targetFiles, request.workspace);

  // 3. Stream AI response
  let fullText = "";
  
  try {
    await new Promise<void>((resolve, reject) => {
      streamBuildAgent({
        messages: [{ role: "user", content: prompt }],
        projectId: request.projectId,
        model: request.model,
        designTheme: request.designTheme,
        knowledge: request.knowledge,
        currentCode: undefined,
        onDelta: (chunk) => {
          fullText += chunk;
          callbacks.onStreaming(chunk);
        },
        onDone: (responseText) => {
          fullText = responseText;
          resolve();
        },
        onError: (err) => {
          reject(new Error(err));
        },
      });
    });
  } catch (err: any) {
    callbacks.onError(err.message || "Edit failed");
    return;
  }

  // 4. Parse modified files from response
  const parseResult = parseEditOutput(fullText);

  if (!parseResult || Object.keys(parseResult.files).length === 0) {
    callbacks.onError("Could not parse the edit result. The AI may have returned an unexpected format.");
    return;
  }

  // 5. Extract explanation (any text before the code fence)
  const fenceStart = fullText.indexOf("```");
  const explanation = fenceStart > 0 
    ? fullText.slice(0, fenceStart).trim() 
    : "Files updated successfully.";

  callbacks.onComplete({
    modifiedFiles: parseResult.files,
    dependencies: parseResult.deps,
    targetFiles,
    explanation,
  });
}

// ─── Output Parser ───────────────────────────────────────────────────────────

/**
 * Parse the AI's edit response to extract modified files.
 * Expects the same --- separator format used by the build agent.
 */
function parseEditOutput(text: string): { files: Record<string, string>; deps: Record<string, string> } | null {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};
  const separatorRegex = /^-{3}\s+(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;
  const depsSeparatorRegex = /^-{3}\s+\/?dependencies\s*-{0,3}\s*$/;

  // Find code fence
  const fencePatterns = ["```jsx", "```react", "```react-preview", "```jsx-preview", "```javascript"];
  let fenceStart = -1;
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) break;
  }
  if (fenceStart === -1) return null;

  const codeStart = text.indexOf("\n", fenceStart) + 1;
  
  // Find closing fence
  let fenceEnd = -1;
  let searchFrom = codeStart;
  while (searchFrom < text.length) {
    const candidate = text.indexOf("\n```", searchFrom);
    if (candidate === -1) break;
    const afterFence = candidate + 4;
    if (afterFence >= text.length || /[\s\n\r]/.test(text[afterFence])) {
      fenceEnd = candidate;
      break;
    }
    searchFrom = candidate + 4;
  }

  const block = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);

  // Parse file sections
  const lines = block.split("\n");
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  let inDeps = false;
  let depsLines: string[] = [];

  function flush() {
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

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for dependencies boundary FIRST (before file separator)
    if (depsSeparatorRegex.test(trimmed)) {
      flush();
      inDeps = true;
      continue;
    }

    const match = trimmed.match(separatorRegex);
    if (match) {
      flush();
      currentFile = match[1];
      continue;
    }

    if (inDeps) {
      depsLines.push(line);
    } else if (currentFile) {
      currentLines.push(line);
    }
  }
  flush();

  // If no separators found but there's code, it's probably a single file edit
  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    return null;
  }

  return Object.keys(files).length > 0 ? { files, deps } : null;
}

// ─── Intent Detection ────────────────────────────────────────────────────────

/**
 * Determine if a user message is an edit request (vs a full build).
 * Edit requests reference existing features/pages and ask for modifications.
 */
export function isEditIntent(
  text: string,
  hasExistingCode: boolean
): boolean {
  if (!hasExistingCode) return false;
  
  const t = text.toLowerCase().trim();
  
  // Must have existing code AND a modification verb or bug report
  const editVerbs = /\b(change|update|fix|modify|replace|add|remove|make|move|rename|resize|restyle|improve|tweak|adjust|refactor|sort|filter|reorder|swap|hide|show|toggle|enable|disable|increase|decrease|align|center|wrap|unwrap)\b/i;
  const bugReport = /\b(doesn['']?t work|does not work|not working|broken|bug|crash|error|fails?|failing|wrong|issue|problem|stuck|blank|empty|missing|disappeared|nothing shows|nothing loads|nothing happens|white screen|no content|not loading|not showing|not rendering|not displaying|can['']?t see|cannot see|shows nothing|displays nothing|is blank)\b/i;
  
  // Must NOT be a full app/project build request
  const buildSignals = /\b(build|create|generate|scaffold|new app|new project|from scratch|entire|whole app|full app|complete app)\b/i;
  
  // Edit signal: references a specific component/feature
  const specificity = /\b(table|button|form|sidebar|nav|header|footer|modal|dialog|card|chart|page|column|row|field|input|label|title|heading|text|color|font|spacing|padding|margin|border|icon|image|logo|search|filter|sort|tab|badge|avatar|menu|dropdown|toast|alert|spinner|loading|sign\s*up|signup|login|log\s*in|auth|register|registration|password|session|portal|screen|app|view|dashboard|layout|content|display|render)\b/i;
  
  if (buildSignals.test(t)) return false;
  if (!(editVerbs.test(t) || bugReport.test(t))) return false;
  // Bug reports don't require specificity — "it's blank" is enough with existing code
  if (!bugReport.test(t) && !specificity.test(t)) return false;
  
  // Short messages with edit verbs are edits (not builds)
  if (t.length < 200) return true;
  
  return false;
}
