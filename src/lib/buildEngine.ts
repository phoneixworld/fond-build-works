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
 * 6. Validation is parse-only (Sucrase + PostCSS) — no regex repair
 * 
 * Performance optimizations:
 * 7. Independent tasks run in parallel (dependency-aware scheduling)
 * 8. Task outputs and validation results are cached
 * 9. Only changed files are sent to preview (file diffing)
 * 10. Structured observability for every pipeline stage
 */

import { streamBuildAgent, validateReactCode, formatRetryContext, MAX_BUILD_RETRIES } from "@/lib/agentPipeline";
import { validateBuildOutput, formatValidationRetryContext, detectBackendIntent } from "@/lib/validateOutput";
import { validateSchemaArtifacts, extractSchemaArtifacts, requiresSchemaValidation } from "@/lib/schemaValidator";
import { validateAuthConformance } from "@/lib/validateAuth";
import { generatePlan, type BuildPlan, type PlanTask } from "@/lib/planningAgent";
import { topologicalSort } from "@/lib/taskExecutor";
import { mergeFiles, buildFullCodeContext, isBackendProtected, type MergeResult } from "@/lib/codeMerger";
import { generateMockLayer } from "@/lib/mockLayerGenerator";
import { supabase } from "@/integrations/supabase/client";
import {
  getTaskCacheKey, getCachedTaskOutput, setCachedTaskOutput,
  clearValidationCache,
  computeFileDiff, isDiffEmpty,
} from "@/lib/buildCache";
import {
  startBuild, recordPlanningLatency, startTask, completeTask,
  finishBuild, timer, type TaskMetrics, type BuildMetrics,
} from "@/lib/buildObservability";
import { buildIncrementalContext, contextReductionRatio } from "@/lib/incrementalContext";
import { applyAdaptiveSplitting } from "@/lib/adaptiveTaskSplitter";
import { persistTaskOutput, getPersistedTaskOutput } from "@/lib/persistentCache";
import { DESIGN_SYSTEM_CSS, lintDesignTokens } from "@/lib/designSystem";
import { buildSmartChatHistory } from "@/lib/contextManager";
import { parseStructuredOutput } from "@/lib/structuredParser";
import { getPromptConfigKey, getCachedSystemPrompt, setCachedSystemPrompt } from "@/lib/promptCache";
import { detectTruncation } from "@/lib/truncationRecovery";
import { resolveImportedDependencies, getDependencyDiff } from "@/lib/dependencyResolver";

// ─── Templates (extracted to src/lib/templates/scaffoldTemplates.ts) ──────
import { getBaseTemplate, getSharedUIComponents, getUseApiHook, getGlobalStyles } from "@/lib/templates/scaffoldTemplates";
import { type DomainModel } from "@/lib/domainTemplates";

// ─── Validation (extracted to src/lib/buildValidator.ts) ──────────────────
import {
  validateAllFiles,
  enforceFileStructure,
  stubBrokenFiles,
} from "@/lib/buildValidator";

// ─── Shared Supabase env constants ────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ─── Auto-Schema Detection ────────────────────────────────────────────────

async function autoDetectAndCreateSchemas(files: Record<string, string>, projectId: string): Promise<void> {
  try {
    const allCode = Object.values(files).join("\n");
    
    const collectionMatches = allCode.matchAll(/collection:\s*["'](\w+)["']/g);
    const collections = new Set<string>();
    for (const match of collectionMatches) {
      collections.add(match[1]);
    }
    
    const fileNames = Object.keys(files);
    const entityInferenceMap: Record<string, string[]> = {};
    
    for (const filePath of fileNames) {
      const pageMatch = filePath.match(/\/pages\/(\w+)\//);
      if (pageMatch) {
        const entity = pageMatch[1].toLowerCase();
        if (!['dashboard', 'home', 'settings', 'profile', 'login', 'signup', 'auth'].includes(entity)) {
          collections.add(entity);
          entityInferenceMap[entity] = entityInferenceMap[entity] || [];
        }
      }
    }
    
    for (const [filePath, code] of Object.entries(files)) {
      const pageEntity = filePath.match(/\/pages\/(\w+)\//)?.[1]?.toLowerCase();
      if (!pageEntity || ['dashboard', 'home', 'settings'].includes(pageEntity)) continue;
      
      const arrayPatterns = code.matchAll(/(?:const|let)\s+\w+\s*=\s*\[[\s\S]*?\{([^}]{10,300})\}/g);
      for (const m of arrayPatterns) {
        const objBlock = m[1];
        const keyMatches = objBlock.matchAll(/(\w+)\s*:/g);
        if (!entityInferenceMap[pageEntity]) entityInferenceMap[pageEntity] = [];
        for (const km of keyMatches) {
          const key = km[1];
          if (!['id', 'key', 'icon', 'color', 'className', 'style', 'onClick', 'children'].includes(key)) {
            entityInferenceMap[pageEntity].push(key);
          }
        }
      }
    }
    
    const fieldsByCollection: Record<string, Set<string>> = {};
    
    for (const collection of collections) {
      fieldsByCollection[collection] = new Set<string>(entityInferenceMap[collection] || []);
      
      const dataPatterns = [
        new RegExp(`collection:\\s*["']${collection}["'][^}]*data:\\s*\\{([^}]+)\\}`, 'g'),
        new RegExp(`data:\\s*\\{([^}]+)\\}[^}]*collection:\\s*["']${collection}["']`, 'g'),
      ];
      
      for (const pattern of dataPatterns) {
        const matches = allCode.matchAll(pattern);
        for (const m of matches) {
          const dataBlock = m[1];
          const keyMatches = dataBlock.matchAll(/(\w+)\s*:/g);
          for (const km of keyMatches) {
            const key = km[1];
            if (!['action', 'collection', 'project_id', 'id', 'filters'].includes(key)) {
              fieldsByCollection[collection].add(key);
            }
          }
        }
      }
    }
    
    if (collections.size === 0) {
      console.log("[AutoSchema] No collections detected in generated code");
      return;
    }
    
    console.log(`[AutoSchema] Detected ${collections.size} collections:`, [...collections]);
    
    const { data: existing } = await supabase
      .from("project_schemas")
      .select("collection_name")
      .eq("project_id", projectId);
    
    const existingNames = new Set((existing || []).map((s: any) => s.collection_name));
    
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

    const usesAuth = allCode.includes("project-auth") || allCode.includes("useAuth") || allCode.includes("AuthProvider") || allCode.includes("AuthContext");
    const usesDataApi = allCode.includes("project-api") || collections.size > 0;
    const usesCustomFunctions = allCode.includes("project-exec");

    const backendSummary = {
      collections: [...collections],
      usesAuth,
      usesDataApi,
      usesCustomFunctions,
      totalSchemas: collections.size + (existingNames?.size || 0),
    };
    console.log("[AutoSchema] Backend summary:", backendSummary);

    await supabase
      .from("project_data")
      .upsert(
        {
          project_id: projectId,
          collection: "backend_capabilities",
          data: backendSummary as any,
        },
        { onConflict: "project_id,collection" }
      )
      .then(({ error }) => {
        if (error) console.warn("[AutoSchema] Failed to save backend summary:", error);
      });

  } catch (err) {
    console.warn("[AutoSchema] Error during schema detection:", err);
  }
}

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
  chatHistory?: Array<{ role: string; content: string }>;
  domainModel?: any;
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
  metrics?: BuildMetrics;
}

// ─── Prompt Echo Detection ─────────────────────────────────────────────────

/**
 * Detects when the AI generates code that just renders the user's prompt text
 * as page content instead of building the actual functional app.
 */
function detectPromptEcho(files: Record<string, string>, userPrompt: string): boolean {
  if (userPrompt.length < 80) return false;

  const words = userPrompt.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 10) return false;

  const codeContent = Object.values(files).join("\n");
  const codeLines = codeContent.split("\n").filter(l => 
    !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("import")
  ).join("\n");

  let echoScore = 0;
  const chunkSize = 8;
  for (let i = 0; i <= words.length - chunkSize; i += 3) {
    const phrase = words.slice(i, i + chunkSize).join(" ").toLowerCase();
    if (codeLines.toLowerCase().includes(phrase)) {
      echoScore++;
    }
  }

  if (echoScore >= 3) {
    console.warn(`[BuildEngine] ⚠️ Prompt echo detected (score: ${echoScore}) — AI is rendering requirements as content`);
    return true;
  }
  return false;
}

function formatBackendValidationFailure(input: {
  schemaErrors: string[];
  forbidden: Array<{ file: string; line: number; pattern: string }>;
  missing: string[];
  authErrors: string[];
}): string {
  const parts: string[] = ["Backend validation failed after retry."];

  if (input.schemaErrors.length > 0) {
    parts.push(`Schema issues:\n- ${input.schemaErrors.join("\n- ")}`);
  }

  if (input.forbidden.length > 0) {
    const forbidden = input.forbidden.map((v) => `${v.file}:${v.line} (${v.pattern})`).join("\n- ");
    parts.push(`Forbidden patterns:\n- ${forbidden}`);
  }

  if (input.missing.length > 0) {
    parts.push(`Missing artifacts:\n- ${input.missing.join("\n- ")}`);
  }

  if (input.authErrors.length > 0) {
    parts.push(`Auth conformance errors:\n- ${input.authErrors.join("\n- ")}`);
  }

  parts.push("Build blocked. Re-run with a more explicit backend request or fix prompts/templates.");
  return parts.join("\n\n");
}

// ─── File Parser (delegates to structured parser) ─────────────────────────

function parseReactFilesFromOutput(text: string): { 
  chatText: string; 
  files: Record<string, string> | null; 
  deps: Record<string, string>;
} {
  const result = parseStructuredOutput(text);
  
  if (result.parseStrategy !== "none") {
    console.log(`[BuildEngine:parser] Strategy: ${result.parseStrategy}, files: ${result.files ? Object.keys(result.files).length : 0}`);
  }
  
  if (result.files && Object.keys(result.files).length > 0) {
    const structuredFiles = enforceFileStructure(result.files);
    return {
      chatText: result.chatText,
      files: Object.keys(structuredFiles).length > 0 ? structuredFiles : null,
      deps: result.deps,
    };
  }

  return {
    chatText: result.chatText,
    files: null,
    deps: result.deps,
  };
}

// ─── Single Task Executor (with caching) ──────────────────────────────────

async function executeSingleTask(
  prompt: string,
  config: EngineConfig,
  accumulatedCode: string,
  onDelta: (chunk: string) => void,
  retryCount = 0,
  maxTokens?: number,
  taskType?: string,
  originalUserPrompt?: string
): Promise<{ files: Record<string, string>; deps: Record<string, string>; chatText: string; modelMs: number; cached: boolean }> {
  const cacheKey = getTaskCacheKey(prompt, accumulatedCode);
  const cached = getCachedTaskOutput(cacheKey);
  if (cached && retryCount === 0) {
    console.log("[BuildEngine] Memory cache hit — skipping model call");
    return { ...cached, modelMs: 0, cached: true };
  }
  if (retryCount === 0) {
    const persisted = await getPersistedTaskOutput(cacheKey);
    if (persisted) {
      console.log("[BuildEngine] IndexedDB cache hit — skipping model call");
      setCachedTaskOutput(cacheKey, { ...persisted, timestamp: Date.now() });
      return { ...persisted, modelMs: 0, cached: true };
    }
  }

  const modelTimer = timer();

  return new Promise((resolve, reject) => {
    let fullText = "";
    
    const historyMessages = buildSmartChatHistory(config.chatHistory || [], 3).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const lastHistoryMsg = historyMessages[historyMessages.length - 1];
    const promptAlreadyInHistory = lastHistoryMsg && lastHistoryMsg.role === "user" && lastHistoryMsg.content === prompt;
    const buildMessages = promptAlreadyInHistory
      ? historyMessages
      : [...historyMessages, { role: "user" as const, content: prompt }];
    
    streamBuildAgent({
      messages: buildMessages,
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
      taskType,
      onDelta: (chunk) => {
        fullText += chunk;
        onDelta(chunk);
      },
      onDone: (responseText) => {
        const modelMs = modelTimer.elapsed();
        const parsed = parseReactFilesFromOutput(responseText);
        
        if (parsed.files && Object.keys(parsed.files).length > 0) {
          const truncation = detectTruncation(responseText, parsed.files);
          if (truncation.isTruncated && retryCount < 2) {
            console.warn(`[BuildEngine] Truncation detected: ${truncation.reason}`);
            onDelta(`\n[Truncation detected — auto-continuing generation...]\n`);
            executeSingleTask(
              truncation.continuationPrompt,
              config,
              accumulatedCode,
              onDelta,
              retryCount + 1,
              maxTokens,
              taskType,
              originalUserPrompt
            ).then(continuationResult => {
              const mergedFiles = { ...parsed.files!, ...continuationResult.files };
              const mergedDeps = { ...parsed.deps, ...continuationResult.deps };
              resolve({ files: mergedFiles, deps: mergedDeps, chatText: parsed.chatText, modelMs: modelMs + continuationResult.modelMs, cached: false });
            }).catch(reject);
            return;
          }

          const echoCheckText = originalUserPrompt || prompt;
          if (detectPromptEcho(parsed.files, echoCheckText) && retryCount < 2) {
            console.warn(`[BuildEngine] Prompt echo detected — AI rendered requirements as content. Retrying...`);
            onDelta(`\n[Detected prompt echo — regenerating actual functional UI...]\n`);
            executeSingleTask(
              prompt + "\n\n🚨 CRITICAL ERROR: Your previous output rendered the user's requirements/prompt text as visible page content (hero text, paragraphs, etc). This is WRONG. You must BUILD THE ACTUAL WORKING APPLICATION with functional UI components, forms, data tables, navigation — NOT display the requirements as text on the page. Generate the real app NOW.",
              config,
              accumulatedCode,
              onDelta,
              retryCount + 1,
              maxTokens,
              taskType,
              originalUserPrompt || prompt
            ).then(resolve).catch(reject);
            return;
          }

          const validationErrors = validateAllFiles(parsed.files);
          
          if (validationErrors.length > 0 && retryCount < 2) {
            const errorSummary = validationErrors.map(e => `${e.file}: ${e.error}`).join('\n');
            console.warn(`[BuildEngine] Validation errors, retrying (attempt ${retryCount + 1}):\n${errorSummary}`);
            onDelta(`\n[Auto-fixing ${validationErrors.length} syntax error(s), attempt ${retryCount + 1}/2...]\n`);
            executeSingleTask(
              prompt + `\n\n⚠️ SYNTAX ERRORS IN YOUR OUTPUT — FIX THESE:\n${errorSummary}\n\nRegenerate ONLY the broken files with correct syntax.`,
              config,
              accumulatedCode,
              onDelta,
              retryCount + 1,
              maxTokens,
              taskType,
              originalUserPrompt
            ).then(resolve).catch(reject);
          } else {
            let finalFiles = parsed.files;
            if (validationErrors.length > 0) {
              console.warn(`[BuildEngine] Max retries reached, stubbing ${validationErrors.length} broken file(s)`);
              finalFiles = stubBrokenFiles(parsed.files, validationErrors);
            }

            const resolvedDeps = resolveImportedDependencies(finalFiles, parsed.deps);
            const depDiff = getDependencyDiff(parsed.deps, resolvedDeps);
            if (depDiff.added.length > 0) {
              console.log(`[BuildEngine] Auto-resolved ${depDiff.added.length} dependencies: ${depDiff.added.join(", ")}`);
            }

            const output = { files: finalFiles, deps: resolvedDeps, chatText: parsed.chatText };
            setCachedTaskOutput(cacheKey, { ...output, timestamp: Date.now() });
            persistTaskOutput(cacheKey, output).catch(() => {});
            resolve({ ...output, modelMs, cached: false });
          }
        } else if (retryCount < 2) {
          const truncation = detectTruncation(responseText, null);
          if (truncation.isTruncated) {
            console.warn(`[BuildEngine] Response truncated with no parseable files: ${truncation.reason}`);
            onDelta(`\n[Response truncated — requesting continuation...]\n`);
            executeSingleTask(
              truncation.continuationPrompt,
              config,
              accumulatedCode,
              onDelta,
              retryCount + 1,
              maxTokens,
              taskType,
              originalUserPrompt
            ).then(resolve).catch(reject);
            return;
          }

          const promptLower = prompt.toLowerCase();
          const isConversationalPrompt = /\b(phase by phase|step by step|i'll give you|ill give you|these are|here are|here is|let me explain|before you start|i'll share|ill share)\b/i.test(promptLower);
          
          if (isConversationalPrompt && responseText.trim().length > 20) {
            console.log(`[BuildEngine] Prompt is conversational/phased — returning chat text without forcing code retry`);
            resolve({ files: {}, deps: {}, chatText: responseText, modelMs, cached: false });
            return;
          }

          console.warn(`[BuildEngine] No code in response (${responseText.length} chars), retrying (attempt ${retryCount + 1}). First 300 chars: ${responseText.slice(0, 300)}`);
          if (responseText.includes("[AI Error:")) {
            console.error(`[BuildEngine] AI gateway error detected in response`);
          }
          executeSingleTask(
            prompt + "\n\nCRITICAL: Your previous response did not contain code. You MUST output React code inside ```react-preview fences with --- /App.jsx markers. Output the code NOW.",
            config,
            accumulatedCode,
            onDelta,
            retryCount + 1,
            maxTokens,
            taskType,
            originalUserPrompt
          ).then(resolve).catch(reject);
        } else {
          console.error("[BuildEngine] No code after retries");
          resolve({ files: {}, deps: {}, chatText: responseText, modelMs, cached: false });
        }
      },
      onError: (err) => {
        const isQuotaError = err.includes("Usage limit") || err.includes("Rate limited");
        if (isQuotaError) {
          reject(new Error("⚠️ AI usage limit reached. Please add credits in Settings → Workspace → Usage, then try again."));
          return;
        }
        if (retryCount < 1) {
          console.warn(`[BuildEngine] Task error, retrying: ${err}`);
          setTimeout(() => {
            executeSingleTask(prompt, config, accumulatedCode, onDelta, retryCount + 1, maxTokens, taskType, originalUserPrompt)
              .then(resolve).catch(reject);
          }, 1000);
        } else {
          reject(new Error(err));
        }
      },
    });
  });
}

// ─── Parallel Task Scheduler ──────────────────────────────────────────────

function buildParallelGroups(sortedTasks: PlanTask[]): PlanTask[][] {
  const groups: PlanTask[][] = [];
  const completed = new Set<string>();

  let remaining = [...sortedTasks];

  while (remaining.length > 0) {
    const group: PlanTask[] = [];
    const groupFiles = new Set<string>();
    const nextRemaining: PlanTask[] = [];

    for (const task of remaining) {
      const depsReady = task.dependsOn.every(dep => completed.has(dep));
      const hasFileConflict = task.filesAffected.some(f => groupFiles.has(f));
      const touchesApp = task.filesAffected.some(f => /App\.(jsx?|tsx?)$/.test(f));
      const groupTouchesApp = group.some(g => g.filesAffected.some(f => /App\.(jsx?|tsx?)$/.test(f)));

      if (depsReady && !hasFileConflict && !(touchesApp && groupTouchesApp)) {
        group.push(task);
        task.filesAffected.forEach(f => groupFiles.add(f));
      } else {
        nextRemaining.push(task);
      }
    }

    if (group.length === 0) {
      const forced = nextRemaining.shift()!;
      group.push(forced);
    }

    for (const t of group) completed.add(t.id);
    groups.push(group);
    remaining = nextRemaining;
  }

  return groups;
}

// ─── Assembly Step ─────────────────────────────────────────────────────────

async function assembleApp(
  files: Record<string, string>,
  config: EngineConfig,
  onDelta: (chunk: string) => void
): Promise<Record<string, string>> {
  const appFile = files["/App.jsx"] || files["/App.tsx"];
  if (!appFile) return files;
  
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
    const result = await executeSingleTask(assemblyPrompt, config, buildFullCodeContext(files), onDelta, 0, 12000, "frontend", assemblyPrompt);
    if (result.files["/App.jsx"] || result.files["/App.tsx"]) {
      const appKey = result.files["/App.jsx"] ? "/App.jsx" : "/App.tsx";
      return { ...files, [appKey]: result.files[appKey] };
    }
  } catch (err) {
    console.warn("[BuildEngine:assemble] Assembly fix failed:", err);
  }
  
  return files;
}

// ─── Backend Task Executor ────────────────────────────────────────────────

async function executeBackendTask(
  task: PlanTask,
  config: EngineConfig,
  onDelta: (chunk: string) => void
): Promise<{ files: Record<string, string>; deps: Record<string, string>; chatText: string; modelMs: number }> {
  const modelT = timer();
  const taskType = (task as any).taskType || "backend";
  
  onDelta(`\n[Backend Agent] Generating ${taskType} layer...\n`);

  try {
    const BASE_URL = SUPABASE_URL;
    const AUTH_HEADER = `Bearer ${SUPABASE_KEY}`;

    const resp = await fetch(`${BASE_URL}/functions/v1/backend-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH_HEADER },
      body: JSON.stringify({
        task,
        domainModel: config.domainModel,
        projectId: config.projectId,
        techStack: config.techStack,
        existingFiles: config.existingFiles ? Object.keys(config.existingFiles) : [],
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      const generatedFiles: Record<string, string> = json.files || {};
      const chatText: string = json.chatText || `✅ ${taskType} layer generated`;
      const modelMs = modelT.elapsed();
      onDelta(`\n[Backend Agent] Generated ${Object.keys(generatedFiles).length} files\n`);
      return { files: generatedFiles, deps: {}, chatText, modelMs };
    }
    throw new Error(`Backend agent returned ${resp.status}`);
  } catch (err) {
    console.warn(`[BuildEngine] Backend Agent failed, using local generator:`, err);
    if (config.domainModel) {
      const apiBase = `${SUPABASE_URL}/functions/v1`;
      const anonKey = SUPABASE_KEY;
      const generatedFiles = generateMockLayer(config.domainModel, config.projectId, apiBase, anonKey);
      const modelMs = modelT.elapsed();
      onDelta(`\n[Local Generator] Generated ${Object.keys(generatedFiles).length} mock layer files\n`);
      return { files: generatedFiles, deps: {}, chatText: `✅ ${taskType} layer generated locally`, modelMs };
    }
    throw err;
  }
}

// ─── Finalizer Helper ─────────────────────────────────────────────────────

interface FinalizeOptions {
  files: Record<string, string>;
  deps: Record<string, string>;
  projectId: string;
  callbacks: EngineCallbacks;
  metrics?: BuildMetrics | null;
  mergeConflicts: string[];
  chatText: string;
  plan?: BuildPlan;
}

async function finalizeBuildResult(opts: FinalizeOptions): Promise<void> {
  const { files, deps, projectId, callbacks, metrics, mergeConflicts, chatText, plan } = opts;

  const lintResult = lintDesignTokens(files);
  let finalFiles = lintResult.files;
  if (lintResult.replacements > 0) {
    console.log(`[BuildEngine:finalize] Design lint: ${lintResult.replacements} raw color(s) → semantic tokens`);
  }

  await autoDetectAndCreateSchemas(finalFiles, projectId);

  callbacks.onProgress({ phase: "complete", message: "Build complete" });
  const finalMetrics = finishBuild();

  callbacks.onComplete({
    files: finalFiles,
    deps,
    plan,
    chatText,
    mergeConflicts,
    metrics: finalMetrics || metrics || undefined,
  });
}

// ─── Main Engine ───────────────────────────────────────────────────────────

export async function runBuildEngine(
  userPrompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  const promptLength = userPrompt.length;
  const hasMultiplePhases = /Phase \d+/gi.test(userPrompt) && (userPrompt.match(/Phase \d+/gi) || []).length >= 2;
  const hasModulePlan = /MODULE PLAN|BUILD CHECKLIST|BUILD ORDER|AI-EXTRACTED/i.test(userPrompt);
  const hasChatContext = /APPLICATION REQUIREMENTS.*from conversation/i.test(userPrompt);
  const hasExistingCode = config.existingFiles && Object.keys(config.existingFiles).length > 0;
  
  const isFixIteration = hasExistingCode && (
    /\b(fix|error|bug|broken|crash|blank|not working|doesn't work|issue|problem)\b/i.test(userPrompt) ||
    /Something went wrong|SyntaxError|TypeError|ReferenceError|is not a function|has already been declared|has already been exported/i.test(userPrompt)
  );
  
  // Single-shot threshold: prompts under 3000 chars without explicit multi-phase
  // markers get direct build (like Lovable does) to avoid multi-task merge failures
  const isSingleShotCandidate = !isFixIteration && !hasMultiplePhases && !hasModulePlan && promptLength < 3000;
  
  const isComplex = !isFixIteration && !isSingleShotCandidate && (
    promptLength > 5000 || hasMultiplePhases || hasModulePlan || (hasChatContext && promptLength > 2000)
  );
  
  if (isSingleShotCandidate) {
    console.log(`[BuildEngine] Single-shot build: prompt is ${promptLength} chars with no multi-phase markers — using direct build for reliability`);
  }
  if (isComplex) {
    console.log(`[BuildEngine] Complex build detected: length=${promptLength}, phases=${hasMultiplePhases}, modulePlan=${hasModulePlan}, chatContext=${hasChatContext}, existingFiles=${hasExistingCode}`);
  }
  if (isFixIteration) {
    console.log(`[BuildEngine] Fix/iteration detected with existing code — using direct build for speed`);
  }
  
  clearValidationCache();
  
  try {
    if (isComplex) {
      await runPlannedBuild(userPrompt, config, callbacks);
    } else {
      await runDirectBuild(userPrompt, config, callbacks);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown engine error";
    callbacks.onError(errMsg);
  }
}

// ─── Direct Build Path ────────────────────────────────────────────────────

async function runDirectBuild(
  prompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  const metrics = startBuild(1);
  const taskMetrics = startTask("direct", "Direct build");

  callbacks.onProgress({ phase: "executing", message: "Generating code..." });
  
  const existingCode = config.existingFiles 
    ? buildFullCodeContext(config.existingFiles) 
    : buildFullCodeContext(getBaseTemplate(config.domainModel));
  
  const result = await executeSingleTask(prompt, config, existingCode, callbacks.onDelta, 0, undefined, undefined, prompt);
  
  if (Object.keys(result.files).length === 0) {
    completeTask(taskMetrics, { fileCount: 0, totalFileSize: 0, modelLatencyMs: result.modelMs, validationLatencyMs: 0, mergeLatencyMs: 0, retryCount: 0, cached: result.cached, status: "failed" });
    finishBuild();
    callbacks.onError("The AI did not generate any code. Please try a more specific prompt like: \"Build a dashboard with sidebar navigation, user list, and settings page\"");
    return;
  }

  let finalFiles = result.files;
  let conflicts: string[] = [];
  const mergeTimer = timer();
  const baseOrExisting = config.existingFiles && Object.keys(config.existingFiles).length > 0
    ? config.existingFiles
    : getBaseTemplate(config.domainModel);
  
  callbacks.onProgress({ phase: "merging", message: "Diff-merging with base..." });
  const merged = mergeFiles(baseOrExisting, result.files, false, config.existingFiles ? baseOrExisting : undefined);
  finalFiles = merged.files;
  conflicts = merged.conflicts;
  const mergeMs = mergeTimer.elapsed();
  
  callbacks.onProgress({ phase: "validating", message: "Validating code..." });
  const valTimer = timer();
  const postMergeErrors = validateAllFiles(finalFiles);
  if (postMergeErrors.length > 0) {
    console.warn("[BuildEngine:direct] Post-merge validation issues — stubbing:", postMergeErrors);
    finalFiles = stubBrokenFiles(finalFiles, postMergeErrors);
  }

  const hasBackendIntent = detectBackendIntent(finalFiles, prompt);
  
  if (hasBackendIntent) {
    let retryAttempt = 0;
    const MAX_VALIDATION_RETRIES = 1;

    while (retryAttempt <= MAX_VALIDATION_RETRIES) {
      let schemaErrors: string[] = [];

      if (requiresSchemaValidation(finalFiles)) {
        const schemaArtifacts = extractSchemaArtifacts(finalFiles);
        const schemaValidation = validateSchemaArtifacts(schemaArtifacts);
        if (!schemaValidation.valid) {
          schemaErrors = schemaValidation.errors;
          console.error(`[BuildEngine:direct] SCHEMA VALIDATION FAILED:`, schemaValidation.errors);
        } else {
          console.log(`[BuildEngine:direct] Schema validated: ${schemaValidation.tables.length} tables ✅`);
        }
      }

      const backendValidation = validateBuildOutput(finalFiles, prompt);
      const authValidation = validateAuthConformance(finalFiles, prompt);

      const hasForbidden = backendValidation.forbiddenViolations.length > 0;
      const hasMissing = backendValidation.missingRequirements.length > 0;
      const hasAuthIssues = !authValidation.valid;
      const hasSchemaIssues = schemaErrors.length > 0;

      if (!hasForbidden && !hasMissing && !hasAuthIssues && !hasSchemaIssues) {
        console.log(`[BuildEngine:direct] ✅ Backend validation passed (score: ${backendValidation.score}/100)`);
        break;
      }

      if (retryAttempt >= MAX_VALIDATION_RETRIES) {
        const failMessage = formatBackendValidationFailure({
          schemaErrors,
          forbidden: backendValidation.forbiddenViolations,
          missing: backendValidation.missingRequirements,
          authErrors: authValidation.errors,
        });
        console.error(`[BuildEngine:direct] ❌ ${failMessage}`);

        const valMsNow = valTimer.elapsed();
        const totalSizeNow = Object.values(finalFiles).reduce((s, c) => s + c.length, 0);
        completeTask(taskMetrics, {
          fileCount: Object.keys(finalFiles).length,
          totalFileSize: totalSizeNow,
          modelLatencyMs: result.modelMs,
          validationLatencyMs: valMsNow,
          mergeLatencyMs: mergeMs,
          retryCount: retryAttempt,
          cached: result.cached,
          status: "failed",
        });
        finishBuild();
        callbacks.onError(failMessage);
        return;
      }

      console.warn(`[BuildEngine:direct] 🔄 Backend validation failed (score: ${backendValidation.score}/100) — retrying with fix context...`);
      callbacks.onProgress({ phase: "validating", message: "Fixing backend violations..." });

      const retryContext = formatValidationRetryContext(backendValidation);
      const authContext = hasAuthIssues 
        ? `\n\n## AUTH CONFORMANCE FAILURES:\n${authValidation.errors.join("\n")}\n\nFix: Use supabase.auth.* methods, never localStorage for auth.`
        : "";
      const schemaContext = hasSchemaIssues
        ? `\n\n## SCHEMA VALIDATION FAILURES:\n${schemaErrors.join("\n")}\n\nFix: ensure valid table/column names, idempotent migrations, and RLS for every table.`
        : "";
      
      const retryPrompt = `${prompt}\n\n--- VALIDATION FAILURE (must fix) ---\n${retryContext}${authContext}${schemaContext}\n\nRe-generate the code fixing ALL violations above. Use real Supabase client for persistence, proper auth patterns, and include SQL migrations with RLS policies.`;

      try {
        const retryResult = await executeSingleTask(retryPrompt, config, existingCode, callbacks.onDelta, 0, undefined, undefined, prompt);
        if (Object.keys(retryResult.files).length > 0) {
          const retryMerged = mergeFiles(baseOrExisting, retryResult.files, false, config.existingFiles ? baseOrExisting : undefined);
          finalFiles = retryMerged.files;
          conflicts = retryMerged.conflicts;
          
          const retryErrors = validateAllFiles(finalFiles);
          if (retryErrors.length > 0) {
            finalFiles = stubBrokenFiles(finalFiles, retryErrors);
          }
        }
      } catch (retryErr) {
        console.error("[BuildEngine:direct] Validation retry failed:", retryErr);
      }

      retryAttempt++;
    }
  } else {
    if (requiresSchemaValidation(finalFiles)) {
      const schemaArtifacts = extractSchemaArtifacts(finalFiles);
      const schemaValidation = validateSchemaArtifacts(schemaArtifacts);
      if (!schemaValidation.valid) {
        console.error(`[BuildEngine:direct] SCHEMA VALIDATION FAILED:`, schemaValidation.errors);
      } else {
        console.log(`[BuildEngine:direct] Schema validated: ${schemaValidation.tables.length} tables ✅`);
      }
    }
  }

  const valMs = valTimer.elapsed();

  const totalSize = Object.values(finalFiles).reduce((s, c) => s + c.length, 0);
  completeTask(taskMetrics, {
    fileCount: Object.keys(finalFiles).length,
    totalFileSize: totalSize,
    modelLatencyMs: result.modelMs,
    validationLatencyMs: valMs,
    mergeLatencyMs: mergeMs,
    retryCount: 0,
    cached: result.cached,
    status: postMergeErrors.length > 0 ? "stubbed" : "success",
  });

  callbacks.onFilesReady(finalFiles, result.deps);

  await finalizeBuildResult({
    files: finalFiles,
    deps: result.deps,
    projectId: config.projectId,
    callbacks,
    metrics,
    mergeConflicts: conflicts,
    chatText: result.chatText || "✅ App generated successfully",
  });
}

// ─── Planned Build Path ───────────────────────────────────────────────────

async function runPlannedBuild(
  prompt: string,
  config: EngineConfig,
  callbacks: EngineCallbacks
): Promise<void> {
  console.log(`[BuildEngine] ▶ runPlannedBuild activated (prompt: ${prompt.length} chars, existingFiles: ${config.existingFiles ? Object.keys(config.existingFiles).length : 0})`);
  callbacks.onProgress({ phase: "planning", message: "Analyzing requirements and creating build plan..." });
  
  const planTimer = timer();
  let plan: BuildPlan;
  try {
    plan = await generatePlan(
      prompt,
      config.existingFiles ? Object.keys(config.existingFiles) : undefined,
      config.techStack,
      config.schemas,
      config.knowledge,
      config.domainModel
    );
    
    recordPlanningLatency(planTimer.elapsed());
    
    callbacks.onProgress({
      phase: "planning",
      message: `Plan: ${plan.tasks.length} tasks (${plan.overallComplexity})`,
      totalTasks: plan.tasks.length,
      plan,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Usage limit") || errMsg.includes("Rate limited")) {
      throw new Error("⚠️ AI usage limit reached. Please add credits in Settings → Workspace → Usage, then try again.");
    }
    console.warn("[BuildEngine] Planning failed, falling back to direct build:", err);
    await runDirectBuild(prompt, config, callbacks);
    return;
  }

  const splitResult = applyAdaptiveSplitting(plan.tasks);
  if (splitResult.splitCount > 0) {
    console.log(`[BuildEngine] Split ${splitResult.splitCount} oversized tasks: ${splitResult.originalCount} → ${splitResult.totalAfterSplit}`);
    plan = { ...plan, tasks: splitResult.tasks };
  }

  const sortedTasks = topologicalSort(plan.tasks);
  const executableTasks = sortedTasks.filter(t => !t.needsUserInput);
  
  const isEnterpriseBuild = plan.tasks.length >= 6 || plan.overallComplexity === "complex";
  const parallelGroups = isEnterpriseBuild 
    ? executableTasks.map(t => [t])
    : buildParallelGroups(executableTasks);
  
  const metrics = startBuild(executableTasks.length);
  metrics.parallelGroups = parallelGroups.length;
  
  console.log(`[BuildEngine] ${executableTasks.length} tasks in ${parallelGroups.length} ${isEnterpriseBuild ? "sequential" : "parallel"} groups: ${parallelGroups.map(g => `[${g.map(t => t.title).join(", ")}]`).join(" → ")}`);

  const baseTemplate = getBaseTemplate(config.domainModel);
  let accumulatedFiles: Record<string, string> = config.existingFiles ? { ...config.existingFiles } : { ...baseTemplate };
  let previousFiles: Record<string, string> | null = config.existingFiles ? { ...config.existingFiles } : { ...baseTemplate };
  let allDeps: Record<string, string> = {};
  let allConflicts: string[] = [];
  let lastChatText = "";
  let globalTaskIndex = 0;

  for (const group of parallelGroups) {
    const taskPromises = group.map(async (task, groupIdx) => {
      const taskIdx = globalTaskIndex + groupIdx;
      const taskMet = startTask(task.id, task.title);

      callbacks.onProgress({
        phase: "executing",
        message: group.length > 1
          ? `Building (parallel): ${group.map(t => t.title).join(", ")}`
          : `Building: ${task.title}`,
        taskIndex: taskIdx,
        totalTasks: executableTasks.length,
        currentTask: task.title,
        plan,
      });
      
      const domainContext = config.domainModel 
        ? `\n\n## DOMAIN MODEL\n${JSON.stringify(config.domainModel, null, 2).slice(0, 4000)}` 
        : "";
      
      const taskType = (task as any).taskType || "frontend";

      if ((taskType === "schema" || taskType === "backend") && config.domainModel) {
        try {
          const backendResult = await executeBackendTask(task, config, callbacks.onDelta);
          const totalSize = Object.values(backendResult.files).reduce((s, c) => s + c.length, 0);
          completeTask(taskMet, {
            fileCount: Object.keys(backendResult.files).length,
            totalFileSize: totalSize,
            modelLatencyMs: backendResult.modelMs,
            validationLatencyMs: 0,
            mergeLatencyMs: 0,
            retryCount: 0,
            cached: false,
            status: Object.keys(backendResult.files).length > 0 ? "success" : "failed",
          });
          return { task, result: backendResult };
        } catch (err) {
          console.error(`[BuildEngine] Backend task "${task.title}" failed, falling back to build agent:`, err);
        }
      }

      const existingFileList = Object.keys(accumulatedFiles).join("\n");
      const taskPrompt = `## TASK: ${task.title}
## TASK TYPE: ${taskType}

${task.buildPrompt}
${domainContext}

## FILES TO CREATE/MODIFY:
${task.filesAffected.map(f => `- ${f}`).join("\n")}

## EXISTING WORKSPACE FILES (import from these — do NOT recreate):
${existingFileList}

## IMPORTANT RULES:
- Generate ONLY the files listed above (plus /App.jsx if routes need updating)
- IMPORT from existing workspace files above — they are already built
- Make sure imports reference existing component files correctly
- If updating /App.jsx, KEEP ALL existing routes and imports — only ADD new ones
- Output complete, working code in \`\`\`react-preview fences
- NO descriptions, NO planning text — ONLY code
- For frontend tasks: Import data from /data/ and hooks from /hooks/ — do NOT hardcode mock data in pages
- If /hooks/use<Entity>.js exists, IMPORT from it. Do NOT recreate data hooks in pages.
- If /data/<collection>.js exists, do NOT create inline mock arrays.
- Reference entities, types, and constants from prior modules — do NOT redefine them.
- CRITICAL: Build the ACTUAL functional UI — NOT a landing page or marketing page about the app
- NEVER render the requirements text as page content — IMPLEMENT the features instead`;

      try {
        const codeContext = buildIncrementalContext(task, accumulatedFiles);
        const { reductionPercent } = contextReductionRatio(task, accumulatedFiles);
        if (reductionPercent > 0) console.log(`[BuildEngine] Task "${task.title}" context reduced by ${reductionPercent}% (budget: 48KB)`);
        const taskMaxTokens = taskType === "frontend" ? 24000 : 16000;
        const taskResult = await executeSingleTask(taskPrompt, config, codeContext, callbacks.onDelta, 0, taskMaxTokens, taskType, prompt);
        
        const totalSize = Object.values(taskResult.files).reduce((s, c) => s + c.length, 0);
        completeTask(taskMet, {
          fileCount: Object.keys(taskResult.files).length,
          totalFileSize: totalSize,
          modelLatencyMs: taskResult.modelMs,
          validationLatencyMs: 0,
          mergeLatencyMs: 0,
          retryCount: 0,
          cached: taskResult.cached,
          status: taskResult.files && Object.keys(taskResult.files).length > 0 ? "success" : "failed",
        });

        return { task, result: taskResult };
      } catch (err) {
        console.error(`[BuildEngine] Task "${task.title}" failed:`, err);
        completeTask(taskMet, {
          fileCount: 0, totalFileSize: 0, modelLatencyMs: 0,
          validationLatencyMs: 0, mergeLatencyMs: 0, retryCount: 0,
          cached: false, status: "failed",
        });
        return { task, result: null };
      }
    });

    const results = await Promise.all(taskPromises);
    globalTaskIndex += group.length;

    const mergeT = timer();
    for (const { task, result } of results) {
      if (!result || Object.keys(result.files).length === 0) {
        console.warn(`[BuildEngine] Task "${task.title}" produced no files`);
        continue;
      }

      const isFrontendTask = (task as any).taskType === "frontend";
      const merged = mergeFiles(accumulatedFiles, result.files, isFrontendTask, previousFiles || undefined);
      accumulatedFiles = merged.files;
      allConflicts.push(...merged.conflicts);
      Object.assign(allDeps, result.deps);
      if (result.chatText) lastChatText = result.chatText;

      console.log(`[BuildEngine] Task "${task.title}" done: +${Object.keys(result.files).length} files, total: ${Object.keys(accumulatedFiles).length}`);
    }

    const diff = computeFileDiff(previousFiles, accumulatedFiles);
    if (!isDiffEmpty(diff)) {
      callbacks.onFilesReady(accumulatedFiles, allDeps);
      previousFiles = { ...accumulatedFiles };
    }
  }

  if (Object.keys(accumulatedFiles).length === 0) {
    finishBuild();
    callbacks.onError("No code was generated. Please try a simpler, more specific prompt.");
    return;
  }

  callbacks.onProgress({ phase: "validating", message: "Validating assembled app..." });
  const finalErrors = validateAllFiles(accumulatedFiles);
  if (finalErrors.length > 0) {
    console.warn("[BuildEngine:planned] Stubbing broken files post-assembly:", finalErrors);
    accumulatedFiles = stubBrokenFiles(accumulatedFiles, finalErrors);
  }

  const hasBackendIntent = detectBackendIntent(accumulatedFiles, prompt);
  
  if (hasBackendIntent) {
    let retryAttempt = 0;
    const MAX_VALIDATION_RETRIES = 1;

    while (retryAttempt <= MAX_VALIDATION_RETRIES) {
      let schemaErrors: string[] = [];

      if (requiresSchemaValidation(accumulatedFiles)) {
        const schemaArtifacts = extractSchemaArtifacts(accumulatedFiles);
        const schemaValidation = validateSchemaArtifacts(schemaArtifacts);
        if (!schemaValidation.valid) {
          schemaErrors = schemaValidation.errors;
          console.error(`[BuildEngine:planned] SCHEMA VALIDATION FAILED:`, schemaValidation.errors);
        } else {
          console.log(`[BuildEngine:planned] Schema validated: ${schemaValidation.tables.length} tables ✅`);
        }
      }

      const backendValidation = validateBuildOutput(accumulatedFiles, prompt);
      const authValidation = validateAuthConformance(accumulatedFiles, prompt);

      const hasForbidden = backendValidation.forbiddenViolations.length > 0;
      const hasMissing = backendValidation.missingRequirements.length > 0;
      const hasAuthIssues = !authValidation.valid;
      const hasSchemaIssues = schemaErrors.length > 0;

      if (!hasForbidden && !hasMissing && !hasAuthIssues && !hasSchemaIssues) {
        console.log(`[BuildEngine:planned] ✅ Backend validation passed (score: ${backendValidation.score}/100)`);
        break;
      }

      if (retryAttempt >= MAX_VALIDATION_RETRIES) {
        const failMessage = formatBackendValidationFailure({
          schemaErrors,
          forbidden: backendValidation.forbiddenViolations,
          missing: backendValidation.missingRequirements,
          authErrors: authValidation.errors,
        });
        console.error(`[BuildEngine:planned] ❌ ${failMessage}`);
        finishBuild();
        callbacks.onError(failMessage);
        return;
      }

      console.warn(`[BuildEngine:planned] 🔄 Backend validation failed (score: ${backendValidation.score}/100) — running fix-up task...`);
      callbacks.onProgress({ phase: "validating", message: "Fixing backend violations..." });

      const retryContext = formatValidationRetryContext(backendValidation);
      const authContext = hasAuthIssues 
        ? `\n\n## AUTH CONFORMANCE FAILURES:\n${authValidation.errors.join("\n")}\n\nFix: Use supabase.auth.* methods, never localStorage for auth.`
        : "";
      const schemaContext = hasSchemaIssues
        ? `\n\n## SCHEMA VALIDATION FAILURES:\n${schemaErrors.join("\n")}\n\nFix: ensure valid table/column names, idempotent migrations, and RLS for every table.`
        : "";
      
      const fixPrompt = `Fix the following validation failures in the existing code:\n\n${retryContext}${authContext}${schemaContext}\n\nRe-generate ONLY the files that need fixing. Use real Supabase client for persistence, proper auth patterns, and include SQL migrations with RLS policies.`;

      try {
        const existingCode = buildFullCodeContext(accumulatedFiles);
        const fixResult = await executeSingleTask(fixPrompt, config, existingCode, callbacks.onDelta, 0, undefined, "backend", prompt);
        if (Object.keys(fixResult.files).length > 0) {
          const fixMerged = mergeFiles(accumulatedFiles, fixResult.files, false);
          accumulatedFiles = fixMerged.files;
          
          const fixErrors = validateAllFiles(accumulatedFiles);
          if (fixErrors.length > 0) {
            accumulatedFiles = stubBrokenFiles(accumulatedFiles, fixErrors);
          }
        }
      } catch (retryErr) {
        console.error("[BuildEngine:planned] Validation retry failed:", retryErr);
      }

      retryAttempt++;
    }
  } else {
    if (requiresSchemaValidation(accumulatedFiles)) {
      const schemaArtifacts = extractSchemaArtifacts(accumulatedFiles);
      const schemaValidation = validateSchemaArtifacts(schemaArtifacts);
      if (!schemaValidation.valid) {
        console.error(`[BuildEngine:planned] SCHEMA VALIDATION FAILED:`, schemaValidation.errors);
      } else {
        console.log(`[BuildEngine:planned] Schema validated: ${schemaValidation.tables.length} tables ✅`);
      }
    }
  }

  const lintResult = lintDesignTokens(accumulatedFiles);
  accumulatedFiles = lintResult.files;
  if (lintResult.replacements > 0) {
    console.log(`[BuildEngine:planned] Design lint: ${lintResult.replacements} raw color(s) → semantic tokens`);
  }

  callbacks.onProgress({ phase: "assembling", message: "Connecting all modules..." });
  const asmTimer = timer();
  accumulatedFiles = await assembleApp(accumulatedFiles, config, callbacks.onDelta);
  if (metrics) metrics.assemblyLatencyMs = asmTimer.elapsed();
  
  const finalDiff = computeFileDiff(previousFiles, accumulatedFiles);
  if (!isDiffEmpty(finalDiff)) {
    callbacks.onFilesReady(accumulatedFiles, allDeps);
  }
  
  const taskSummary = executableTasks.map((t, i) => `✅ ${i + 1}. ${t.title}`).join("\n");
  const chatText = `✅ **Build Complete** — ${executableTasks.length} tasks in ${parallelGroups.length} parallel groups\n\n${plan.summary}\n\n${taskSummary}`;

  await finalizeBuildResult({
    files: accumulatedFiles,
    deps: allDeps,
    projectId: config.projectId,
    callbacks,
    metrics,
    mergeConflicts: allConflicts,
    chatText,
    plan,
  });
}
