/**
 * Build Engine — the core orchestrator for reliable code generation.
 * 
 * Pipeline: Classify → Plan → Execute Tasks → Merge → Validate → Assemble → Preview
 * 
 * Key design principles:
 * 1. Every task gets full accumulated code context (not truncated)
 * 2. Files are intelligently merged across tasks (routes, imports combined)
 * 3. A final assembly step ensures all modules are connected
 * 4. Failed tasks are retried with error context before moving on
 * 5. If no code is produced, the engine forces a retry with explicit instructions
 */

import { streamBuildAgent, validateReactCode, formatRetryContext, MAX_BUILD_RETRIES } from "@/lib/agentPipeline";
import { generatePlan, type BuildPlan, type PlanTask } from "@/lib/planningAgent";
import { topologicalSort } from "@/lib/taskExecutor";
import { mergeFiles, buildFullCodeContext, type MergeResult } from "@/lib/codeMerger";
import { supabase } from "@/integrations/supabase/client";

// ─── Auto-Schema Detection ────────────────────────────────────────────────

/**
 * Scan generated code for collection references (fetch calls to project-api)
 * and auto-create project_schemas entries so the database reflects what the app uses.
 */
async function autoDetectAndCreateSchemas(files: Record<string, string>, projectId: string): Promise<void> {
  try {
    const allCode = Object.values(files).join("\n");
    
    // Pattern 1: collection: "xxx" in fetch bodies
    const collectionMatches = allCode.matchAll(/collection:\s*["'](\w+)["']/g);
    const collections = new Set<string>();
    for (const match of collectionMatches) {
      collections.add(match[1]);
    }
    
    // Pattern 2: action: "create", collection: "xxx", data: { field1: ..., field2: ... }
    // Try to infer field names from create/update calls
    const fieldsByCollection: Record<string, Set<string>> = {};
    
    for (const collection of collections) {
      fieldsByCollection[collection] = new Set<string>();
      
      // Find data objects associated with this collection
      const dataPatterns = [
        // data: { key: value, key2: value2 }
        new RegExp(`collection:\\s*["']${collection}["'][^}]*data:\\s*\\{([^}]+)\\}`, 'g'),
        // Reverse order: data before collection
        new RegExp(`data:\\s*\\{([^}]+)\\}[^}]*collection:\\s*["']${collection}["']`, 'g'),
      ];
      
      for (const pattern of dataPatterns) {
        const matches = allCode.matchAll(pattern);
        for (const m of matches) {
          const dataBlock = m[1];
          // Extract key names from object literal: key: value or key: "string" etc.
          const keyMatches = dataBlock.matchAll(/(\w+)\s*:/g);
          for (const km of keyMatches) {
            const key = km[1];
            // Skip common non-field keys
            if (!['action', 'collection', 'project_id', 'id', 'filters'].includes(key)) {
              fieldsByCollection[collection].add(key);
            }
          }
        }
      }
    }
    
    if (collections.size === 0) return;
    
    console.log(`[AutoSchema] Detected ${collections.size} collections:`, [...collections]);
    
    // Fetch existing schemas for this project
    const { data: existing } = await supabase
      .from("project_schemas")
      .select("collection_name")
      .eq("project_id", projectId);
    
    const existingNames = new Set((existing || []).map((s: any) => s.collection_name));
    
    // Create schemas for new collections
    const newSchemas = [...collections]
      .filter(name => !existingNames.has(name))
      .map(name => {
        const fields = fieldsByCollection[name] || new Set();
        const schema = {
          fields: [...fields].map(f => ({
            name: f,
            type: inferFieldType(f),
            required: false,
          })),
        };
        return {
          project_id: projectId,
          collection_name: name,
          schema,
        };
      });
    
    if (newSchemas.length > 0) {
      const { error } = await supabase
        .from("project_schemas")
        .insert(newSchemas as any);
      
      if (error) {
        console.warn("[AutoSchema] Failed to create schemas:", error);
      } else {
        console.log(`[AutoSchema] ✅ Created ${newSchemas.length} schemas:`, newSchemas.map(s => s.collection_name));
      }
    }
  } catch (err) {
    console.warn("[AutoSchema] Error during schema detection:", err);
  }
}

/** Infer field type from field name patterns */
function inferFieldType(fieldName: string): string {
  const name = fieldName.toLowerCase();
  if (name.includes('email')) return 'email';
  if (name.includes('phone') || name.includes('mobile')) return 'phone';
  if (name.includes('date') || name.includes('_at') || name.includes('time')) return 'datetime';
  if (name.includes('price') || name.includes('amount') || name.includes('fee') || name.includes('cost') || name.includes('salary')) return 'number';
  if (name.includes('count') || name.includes('quantity') || name.includes('age') || name.includes('total') || name.includes('number')) return 'number';
  if (name.includes('is_') || name.includes('has_') || name.includes('active') || name.includes('done') || name.includes('completed') || name.includes('enabled')) return 'boolean';
  if (name.includes('description') || name.includes('content') || name.includes('notes') || name.includes('body') || name.includes('bio')) return 'textarea';
  if (name.includes('url') || name.includes('link') || name.includes('website')) return 'url';
  if (name.includes('image') || name.includes('avatar') || name.includes('photo') || name.includes('logo')) return 'url';
  return 'text';
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EngineConfig {
  projectId: string;
  techStack: string;
  schemas?: any[];
  model?: string;
  designTheme?: string;
  knowledge?: string[];
  snippetsContext?: string;
  existingFiles?: Record<string, string>;
  templateContext?: string;
  /** Previous chat messages for context (so short prompts like "same" or "build users next" make sense) */
  chatHistory?: Array<{ role: string; content: string }>;
}

export type EnginePhase = 
  | "planning" 
  | "executing" 
  | "merging" 
  | "validating" 
  | "assembling" 
  | "complete" 
  | "error";

export interface EngineProgress {
  phase: EnginePhase;
  message: string;
  taskIndex?: number;
  totalTasks?: number;
  currentTask?: string;
  plan?: BuildPlan;
}

export interface EngineCallbacks {
  onProgress: (progress: EngineProgress) => void;
  onDelta: (chunk: string) => void;
  onFilesReady: (files: Record<string, string>, deps: Record<string, string>) => void;
  onComplete: (result: EngineResult) => void;
  onError: (error: string) => void;
}

export interface EngineResult {
  files: Record<string, string>;
  deps: Record<string, string>;
  plan?: BuildPlan;
  chatText: string;
  mergeConflicts: string[];
}

// ─── JSX Auto-Repair ──────────────────────────────────────────────────────

/**
 * Auto-repair common JSX issues from AI-generated code.
 */
function autoRepairJSX(code: string): string {
  // Fix unclosed <Route ... element={<Comp />}> → self-close
  code = code.replace(
    /(<Route\s+[^>]*element=\{<[^>]+\/>\s*\})\s*>\s*$/gm,
    "$1 />"
  );
  code = code.replace(
    /(<Route\s+[^>]*element=\{<[^>]+\/>\s*\})\s*\n/gm,
    "$1 />\n"
  );

  // Remove duplicate Route entries (same path appearing twice)
  const routePaths = new Map<string, boolean>();
  const lines = code.split("\n");
  const cleanedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const routeMatch = lines[i].match(/<Route\s+path=["']([^"']+)["']/);
    if (routeMatch) {
      const path = routeMatch[1];
      if (routePaths.has(path)) continue;
      routePaths.set(path, true);
    }
    cleanedLines.push(lines[i]);
  }
  code = cleanedLines.join("\n");

  // Ensure balanced </Routes> before </HashRouter>
  const openRoutes = (code.match(/<Routes>/g) || []).length;
  const closeRoutes = (code.match(/<\/Routes>/g) || []).length;
  if (openRoutes > closeRoutes) {
    code = code.replace(/(<\/HashRouter>)/, "</Routes>\n    $1");
  }

  return code;
}

// ─── File Parser ───────────────────────────────────────────────────────────

/**
 * Parse react files from build-agent output.
 * Handles multiple fence formats and file separator styles.
 */
function parseReactFilesFromOutput(text: string): { 
  chatText: string; 
  files: Record<string, string> | null; 
  deps: Record<string, string>;
} {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};

  const fencePatterns = ["```react-preview", "```jsx-preview", "```react", "```jsx"];
  let fenceStart = -1;
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) break;
  }
  
  // Fallback: generic fence with --- /App.jsx
  if (fenceStart === -1) {
    const genericFence = text.match(/```\w*\n[\s\S]*?---\s+\/?(src\/)?App\.jsx?\s*-{0,3}/);
    if (genericFence) fenceStart = text.indexOf(genericFence[0]);
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
    if (afterFence >= text.length || /[\s\n\r]/.test(text[afterFence])) {
      fenceEnd = candidate;
      break;
    }
    searchFrom = candidate + 4;
  }
  
  const block = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  if (block.trim().length === 0) return { chatText: text, files: null, deps };

  // Parse file sections
  const separatorRegex = /^-{3}\s+(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;
  const depsRegex = /^-{3}\s+dependencies\s*-{0,3}\s*$/;
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
    const sepMatch = trimmed.match(separatorRegex);
    if (sepMatch) {
      flush();
      currentFile = sepMatch[1];
      continue;
    }
    if (depsRegex.test(trimmed)) {
      flush();
      inDeps = true;
      continue;
    }
    if (inDeps) depsLines.push(line);
    else if (currentFile) currentLines.push(line);
  }
  flush();

  // If no separators found, treat as single App.jsx
  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    files["/App.jsx"] = block.trim();
  }

  return {
    chatText,
    files: Object.keys(files).length > 0 ? files : null,
    deps,
  };
}

// ─── Single Task Executor ──────────────────────────────────────────────────

/**
 * Execute a single build task with retry logic.
 * Returns the generated files or empty object on failure.
 */
async function executeSingleTask(
  prompt: string,
  config: EngineConfig,
  accumulatedCode: string,
  onDelta: (chunk: string) => void,
  retryCount = 0,
  maxTokens?: number
): Promise<{ files: Record<string, string>; deps: Record<string, string>; chatText: string }> {
  return new Promise((resolve, reject) => {
    let fullText = "";
    
    streamBuildAgent({
      messages: [
        // Include chat history for context (so "same", "build users next" etc. work)
        ...(config.chatHistory || []).slice(-6).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: prompt },
      ],
      projectId: config.projectId,
      techStack: config.techStack,
      schemas: config.schemas,
      model: config.model,
      designTheme: config.designTheme,
      knowledge: config.knowledge,
      snippetsContext: config.snippetsContext,
      templateContext: config.templateContext,
      currentCode: accumulatedCode || undefined,
      maxTokens,
      onDelta: (chunk) => {
        fullText += chunk;
        onDelta(chunk);
      },
      onDone: (responseText) => {
        const parsed = parseReactFilesFromOutput(responseText);
        
        if (parsed.files && Object.keys(parsed.files).length > 0) {
          resolve({ files: parsed.files, deps: parsed.deps, chatText: parsed.chatText });
        } else if (retryCount < 2) {
          // No code produced — force retry
          console.warn(`[BuildEngine] No code in response, retrying (attempt ${retryCount + 1})`);
          executeSingleTask(
            prompt + "\n\nCRITICAL: Your previous response did not contain code. You MUST output React code inside ```react-preview fences with --- /App.jsx markers. Output the code NOW.",
            config,
            accumulatedCode,
            onDelta,
            retryCount + 1,
            maxTokens
          ).then(resolve).catch(reject);
        } else {
          // Give up — return empty
          console.error("[BuildEngine] No code after retries");
          resolve({ files: {}, deps: {}, chatText: responseText });
        }
      },
      onError: (err) => {
        if (retryCount < 1) {
          console.warn(`[BuildEngine] Task error, retrying: ${err}`);
          setTimeout(() => {
            executeSingleTask(prompt, config, accumulatedCode, onDelta, retryCount + 1, maxTokens)
              .then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(new Error(err));
        }
      },
    });
  });
}

// ─── Assembly Step ─────────────────────────────────────────────────────────

/**
 * Final assembly: verify all components are imported and routes are connected.
 * If the App.jsx is missing imports or routes, trigger a targeted fix.
 */
async function assembleApp(
  files: Record<string, string>,
  config: EngineConfig,
  onDelta: (chunk: string) => void
): Promise<Record<string, string>> {
  const appFile = files["/App.jsx"] || files["/App.tsx"];
  if (!appFile) return files;
  
  // Check: are all component files imported and routed?
  const componentFiles = Object.keys(files).filter(p => 
    p.startsWith("/components/") && p.match(/\.(jsx?|tsx?)$/)
  );
  
  const missingImports: string[] = [];
  for (const compPath of componentFiles) {
    const compName = compPath.match(/\/([^/]+)\.(jsx?|tsx?)$/)?.[1];
    if (!compName) continue;
    if (!appFile.includes(compName)) {
      missingImports.push(compPath);
    }
  }
  
  if (missingImports.length === 0) return files;
  
  // Trigger an assembly fix
  console.log(`[BuildEngine:assemble] ${missingImports.length} components not connected, running assembly fix`);
  
  const assemblyPrompt = `## ASSEMBLY FIX — Connect missing modules

The app has these component files that are NOT imported or routed in App.jsx:
${missingImports.map(p => `- ${p}`).join("\n")}

Update ONLY /App.jsx to:
1. Import all the above components
2. Add Route entries for each 
3. Add sidebar/navigation links for each

Keep ALL existing routes and imports intact. Only ADD the missing ones.

## CURRENT APP CODE:
${buildFullCodeContext(files, 24000)}`;

  try {
    const result = await executeSingleTask(assemblyPrompt, config, buildFullCodeContext(files), onDelta, 0, 12000);
    if (result.files["/App.jsx"] || result.files["/App.tsx"]) {
      // Only take the App file from assembly — don't overwrite components
      const appKey = result.files["/App.jsx"] ? "/App.jsx" : "/App.tsx";
      return { ...files, [appKey]: result.files[appKey] };
    }
  } catch (err) {
    console.warn("[BuildEngine:assemble] Assembly fix failed:", err);
  }
  
  return files;
}

// ─── Main Engine ───────────────────────────────────────────────────────────

/**
 * Run the full build engine pipeline.
 * 
 * For simple prompts: Direct build → validate → done
 * For complex prompts: Plan → execute tasks → merge → validate → assemble → done
 */
export async function runBuildEngine(
  userPrompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  const isComplex = userPrompt.length > 120 || 
    /\b(with|and|include|featuring|modules?|sections?)\b.*\b(with|and|include|featuring|modules?|sections?)\b/gi.test(userPrompt);
  
  const hasExistingCode = config.existingFiles && Object.keys(config.existingFiles).length > 0;
  
  try {
    if (isComplex && !hasExistingCode) {
      // ─── COMPLEX: Plan → Execute → Merge → Assemble ─────────────────
      await runPlannedBuild(userPrompt, config, callbacks);
    } else {
      // ─── SIMPLE: Direct build ─────────────────────────────────────────
      await runDirectBuild(userPrompt, config, callbacks);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown engine error";
    callbacks.onError(errMsg);
  }
}

/**
 * Direct build — single prompt, single response
 */
async function runDirectBuild(
  prompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  callbacks.onProgress({ phase: "executing", message: "Generating code..." });
  
  const existingCode = config.existingFiles 
    ? buildFullCodeContext(config.existingFiles) 
    : "";
  
  const result = await executeSingleTask(prompt, config, existingCode, callbacks.onDelta);
  
  if (Object.keys(result.files).length === 0) {
    callbacks.onError("The AI did not generate any code. Please try a more specific prompt like: \"Build a dashboard with sidebar navigation, user list, and settings page\"");
    return;
  }

  // Merge with existing if applicable
  let finalFiles = result.files;
  let conflicts: string[] = [];
  if (config.existingFiles && Object.keys(config.existingFiles).length > 0) {
    callbacks.onProgress({ phase: "merging", message: "Merging with existing code..." });
    const merged = mergeFiles(config.existingFiles, result.files);
    finalFiles = merged.files;
    conflicts = merged.conflicts;
  }
  
  // Validate
  callbacks.onProgress({ phase: "validating", message: "Validating code..." });
  const validation = validateReactCode(finalFiles);
  
  if (!validation.valid) {
    console.warn("[BuildEngine:direct] Validation issues:", validation.errors);
    // Try auto-fix
    const retryContext = formatRetryContext(validation.errors, 1, finalFiles);
    const fixPrompt = `${prompt}\n\n${retryContext}`;
    
    const fixResult = await executeSingleTask(fixPrompt, config, existingCode, callbacks.onDelta);
    if (Object.keys(fixResult.files).length > 0) {
      finalFiles = config.existingFiles 
        ? mergeFiles(config.existingFiles, fixResult.files).files 
        : fixResult.files;
    }
  }
  
  callbacks.onFilesReady(finalFiles, result.deps);
  
  // Auto-detect and create database schemas from generated code
  autoDetectAndCreateSchemas(finalFiles, config.projectId);
  
  callbacks.onProgress({ phase: "complete", message: "Build complete" });
  callbacks.onComplete({
    files: finalFiles,
    deps: result.deps,
    chatText: result.chatText || "✅ App generated successfully",
    mergeConflicts: conflicts,
  });
}

/**
 * Planned build — decompose into tasks, execute sequentially, merge, assemble
 */
async function runPlannedBuild(
  prompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  // Phase 1: Plan
  callbacks.onProgress({ phase: "planning", message: "Analyzing requirements and creating build plan..." });
  
  let plan: BuildPlan;
  try {
    plan = await generatePlan(
      prompt,
      config.existingFiles ? Object.keys(config.existingFiles) : undefined,
      config.techStack,
      config.schemas,
      config.knowledge
    );
    
    callbacks.onProgress({
      phase: "planning",
      message: `Plan: ${plan.tasks.length} tasks (${plan.overallComplexity})`,
      totalTasks: plan.tasks.length,
      plan,
    });
  } catch (err) {
    console.warn("[BuildEngine] Planning failed, falling back to direct build:", err);
    await runDirectBuild(prompt, config, callbacks);
    return;
  }

  // Phase 2: Execute tasks sequentially
  const sortedTasks = topologicalSort(plan.tasks);
  let accumulatedFiles: Record<string, string> = config.existingFiles ? { ...config.existingFiles } : {};
  let allDeps: Record<string, string> = {};
  let allConflicts: string[] = [];
  let lastChatText = "";

  for (let i = 0; i < sortedTasks.length; i++) {
    const task = sortedTasks[i];
    
    if (task.needsUserInput) {
      console.log(`[BuildEngine] Skipping task "${task.title}" — needs user input`);
      continue;
    }

    callbacks.onProgress({
      phase: "executing",
      message: `Building: ${task.title}`,
      taskIndex: i,
      totalTasks: sortedTasks.length,
      currentTask: task.title,
      plan,
    });

    // Build a focused prompt with FULL accumulated context
    const codeContext = buildFullCodeContext(accumulatedFiles);
    
    const taskPrompt = `## TASK ${i + 1}/${sortedTasks.length}: ${task.title}

${task.buildPrompt}

## FILES TO CREATE/MODIFY:
${task.filesAffected.map(f => `- ${f}`).join("\n")}

## IMPORTANT RULES:
- Generate ONLY the files listed above (plus /App.jsx if routes need updating)
- Make sure imports reference existing component files correctly
- If updating /App.jsx, KEEP ALL existing routes and imports — only ADD new ones
- Output complete, working code in \`\`\`react-preview fences
- NO descriptions, NO planning text — ONLY code`;

    try {
      const taskResult = await executeSingleTask(taskPrompt, config, codeContext, callbacks.onDelta, 0, 16000);
      
      if (Object.keys(taskResult.files).length > 0) {
        // Intelligent merge
        const merged = mergeFiles(accumulatedFiles, taskResult.files);
        accumulatedFiles = merged.files;
        allConflicts.push(...merged.conflicts);
        
        // Accumulate deps
        Object.assign(allDeps, taskResult.deps);
        
        // Push intermediate preview
        callbacks.onFilesReady(accumulatedFiles, allDeps);
        
        if (taskResult.chatText) lastChatText = taskResult.chatText;
        console.log(`[BuildEngine] Task ${i + 1} done: +${Object.keys(taskResult.files).length} files, total: ${Object.keys(accumulatedFiles).length}`);
      } else {
        console.warn(`[BuildEngine] Task "${task.title}" produced no files`);
      }
    } catch (err) {
      console.error(`[BuildEngine] Task "${task.title}" failed:`, err);
      // Continue with remaining tasks
    }
  }

  if (Object.keys(accumulatedFiles).length === 0) {
    callbacks.onError("No code was generated. Please try a simpler, more specific prompt.");
    return;
  }

  // Phase 3: Validate
  callbacks.onProgress({ phase: "validating", message: "Validating assembled app..." });
  const validation = validateReactCode(accumulatedFiles);
  if (!validation.valid) {
    console.warn("[BuildEngine:planned] Validation issues:", validation.errors);
  }

  // Phase 4: Assembly — ensure all modules are connected
  callbacks.onProgress({ phase: "assembling", message: "Connecting all modules..." });
  accumulatedFiles = await assembleApp(accumulatedFiles, config, callbacks.onDelta);
  
  // Final preview
  callbacks.onFilesReady(accumulatedFiles, allDeps);
  
  // Auto-detect and create database schemas from generated code
  autoDetectAndCreateSchemas(accumulatedFiles, config.projectId);
  
  // Build completion summary
  const taskSummary = sortedTasks.map((t, i) => `✅ ${i + 1}. ${t.title}`).join("\n");
  const chatText = `✅ **Build Complete** — ${sortedTasks.length} tasks\n\n${plan.summary}\n\n${taskSummary}`;

  callbacks.onProgress({ phase: "complete", message: "Build complete" });
  callbacks.onComplete({
    files: accumulatedFiles,
    deps: allDeps,
    plan,
    chatText,
    mergeConflicts: allConflicts,
  });
}
