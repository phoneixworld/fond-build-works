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
  const modifiedFiles = parseEditOutput(fullText);

  if (!modifiedFiles || Object.keys(modifiedFiles).length === 0) {
    callbacks.onError("Could not parse the edit result. The AI may have returned an unexpected format.");
    return;
  }

  // 5. Extract explanation (any text before the code fence)
  const fenceStart = fullText.indexOf("```");
  const explanation = fenceStart > 0 
    ? fullText.slice(0, fenceStart).trim() 
    : "Files updated successfully.";

  callbacks.onComplete({
    modifiedFiles,
    targetFiles,
    explanation,
  });
}

// ─── Output Parser ───────────────────────────────────────────────────────────

/**
 * Parse the AI's edit response to extract modified files.
 * Expects the same --- separator format used by the build agent.
 */
function parseEditOutput(text: string): Record<string, string> | null {
  const files: Record<string, string> = {};
  const separatorRegex = /^-{3}\s+(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;

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

  function flush() {
    if (currentFile) {
      const code = currentLines.join("\n").trim();
      if (code.length > 0) {
        let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
        fname = fname.replace(/^\/src\//, "/");
        files[fname] = code;
      }
    }
    currentFile = null;
    currentLines = [];
  }

  for (const line of lines) {
    const match = line.trim().match(separatorRegex);
    if (match) {
      flush();
      currentFile = match[1];
      continue;
    }
    if (currentFile) currentLines.push(line);
  }
  flush();

  // If no separators found but there's code, it's probably a single file edit
  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    // We can't determine the file path without separators
    return null;
  }

  return Object.keys(files).length > 0 ? files : null;
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
  
  // Must have existing code AND a modification verb
  const editVerbs = /\b(change|update|fix|modify|replace|add|remove|make|move|rename|resize|restyle|improve|tweak|adjust|refactor|sort|filter|reorder|swap|hide|show|toggle|enable|disable|increase|decrease|align|center|wrap|unwrap)\b/i;
  
  // Must NOT be a full app/project build request
  const buildSignals = /\b(build|create|generate|scaffold|new app|new project|from scratch|entire|whole app|full app|complete app)\b/i;
  
  // Edit signal: references a specific component/feature
  const specificity = /\b(table|button|form|sidebar|nav|header|footer|modal|dialog|card|chart|page|column|row|field|input|label|title|heading|text|color|font|spacing|padding|margin|border|icon|image|logo|search|filter|sort|tab|badge|avatar|menu|dropdown|toast|alert|spinner|loading)\b/i;
  
  if (buildSignals.test(t)) return false;
  if (!editVerbs.test(t)) return false;
  if (!specificity.test(t)) return false;
  
  // Short messages with edit verbs are edits (not builds)
  if (t.length < 200) return true;
  
  return false;
}
