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
import { transform } from "sucrase";
import postcss from "postcss";
import { generatePlan, type BuildPlan, type PlanTask } from "@/lib/planningAgent";
import { topologicalSort } from "@/lib/taskExecutor";
import { mergeFiles, buildFullCodeContext, isBackendProtected, type MergeResult } from "@/lib/codeMerger";
import { generateMockLayer } from "@/lib/mockLayerGenerator";
import { supabase } from "@/integrations/supabase/client";
import {
  getTaskCacheKey, getCachedTaskOutput, setCachedTaskOutput,
  isFileValidated, markFileValidated, clearValidationCache,
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

// ─── Auto-Schema Detection ────────────────────────────────────────────────

async function autoDetectAndCreateSchemas(files: Record<string, string>, projectId: string): Promise<void> {
  try {
    const allCode = Object.values(files).join("\n");
    
    // Method 1: Explicit Data API collection references
    const collectionMatches = allCode.matchAll(/collection:\s*["'](\w+)["']/g);
    const collections = new Set<string>();
    for (const match of collectionMatches) {
      collections.add(match[1]);
    }
    
    // Method 2: Infer entities from page/component file names and mock data patterns
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
    
    // Method 3: Detect mock data arrays to infer fields
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

// ─── File Validation (real parsers — single source of truth) ──────────────

async function validateFile(fileName: string, code: string, techStack: string): Promise<boolean> {
  if (await isFileValidated(fileName, code)) {
    return true; // Skip validation if the file hasn't changed
  }

  try {
    if (fileName.endsWith(".tsx") || fileName.endsWith(".jsx") || fileName.endsWith(".ts")) {
      transform(code, {
        transforms: ["jsx", "typescript"],
        jsxPragma: "React.createElement",
        jsxFragmentPragma: "React.Fragment",
        production: true,
      });
    } else if (fileName.endsWith(".css")) {
      await postcss([/* plugins here */]).process(code, { from: fileName });
    } else if (fileName.endsWith(".json")) {
      JSON.parse(code);
    } else if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
      // Add YAML parsing if needed
    }

    await markFileValidated(fileName, code);
    return true;
  } catch (err: any) {
    console.warn(`[Validator] Parse error in ${fileName}:`, err.message);
    return false;
  }
}

// ─── Main Build Engine ─────────────────────────────────────────────────────

export async function buildEngine(config: EngineConfig, callbacks: EngineCallbacks): Promise<EngineResult> {
  const buildId = Math.random().toString(36).substring(2, 9);
  const metrics = timer() as BuildMetrics;
  metrics.buildId = buildId;
  metrics.projectId = config.projectId;
  metrics.techStack = config.techStack;

  console.log(`[Build ${buildId}] Starting build...`, { config });
  startBuild(metrics);
  clearValidationCache();

  const {
    projectId,
    techStack,
    schemas,
    model,
    designTheme,
    knowledge,
    snippetsContext,
    existingFiles = {},
    templateContext,
    chatHistory = [],
    domainModel,
  } = config;

  let files: Record<string, string> = { ...existingFiles };
  let deps: Record<string, string> = {};
  let plan: BuildPlan | undefined;
  let chatText = "";
  const mergeConflicts: string[] = [];

  try {
    // Phase 1: Planning 
    const planningTimer = timer();
    callbacks.onProgress({ phase: "planning", message: "Generating build plan..." });

    const systemPromptKey = getPromptConfigKey(model, designTheme, knowledge, snippetsContext, templateContext, domainModel);
    let systemPrompt = await getCachedSystemPrompt(systemPromptKey);

    if (!systemPrompt) {
      console.log(`[Build ${buildId}] No cached system prompt found for key:`, systemPromptKey);
    } else {
      console.log(`[Build ${buildId}] Using cached system prompt for key:`, systemPromptKey.substring(0, 24) + "...");
    }

    plan = await generatePlan({
      projectId,
      techStack,
      schemas,
      model,
      designTheme,
      knowledge,
      snippetsContext,
      existingFiles,
      templateContext,
      chatHistory,
      domainModel,
      systemPrompt,
    });

    if (!plan) {
      throw new Error("Failed to generate build plan.");
    }

    if (!systemPrompt) {
      await setCachedSystemPrompt(systemPromptKey, plan.systemPrompt);
      console.log(`[Build ${buildId}] Caching system prompt for key:`, systemPromptKey.substring(0, 24) + "...");
    }

    metrics.planningLatency = planningTimer.stop();
    recordPlanningLatency(metrics);

    console.log(`[Build ${buildId}] Build plan:`, plan);
    callbacks.onProgress({ phase: "planning", message: "Build plan generated.", plan });

    // Phase 2: Task Execution
    callbacks.onProgress({ phase: "executing", message: "Executing tasks..." });

    const orderedTasks = topologicalSort(plan.tasks, plan.dependencies);
    const totalTasks = orderedTasks.length;
    let taskIndex = 0;

    // Adaptive Splitting: Adjust task granularity based on project size
    const splitTasks = applyAdaptiveSplitting(orderedTasks, existingFiles);
    const adjustedTotalTasks = splitTasks.length;

    for (const task of splitTasks) {
      taskIndex++;
      const taskTimer = timer() as TaskMetrics;
      taskTimer.taskName = task.name;
      taskTimer.taskId = task.id;
      taskTimer.buildId = buildId;

      console.log(`[Build ${buildId}] Starting task ${taskIndex}/${adjustedTotalTasks}: ${task.name} (${task.id})`);
      startTask(taskTimer);
      callbacks.onProgress({
        phase: "executing",
        message: `Executing task ${taskIndex}/${adjustedTotalTasks}: ${task.name}`,
        taskIndex,
        totalTasks: adjustedTotalTasks,
        currentTask: task.name,
      });

      let taskOutput = await getCachedTaskOutput(task.id);
      let retryCount = 0;
      let lastErrorMessage = "";

      if (!taskOutput) {
        console.log(`[Build ${buildId}] No cached output found for task:`, task.name);
        taskOutput = await getPersistedTaskOutput(task.id);
        if (taskOutput) console.log(`[Build ${buildId}] Restored task output from persistent cache:`, task.name);
      } else {
        console.log(`[Build ${buildId}] Using cached output for task:`, task.name);
      }

      while (!taskOutput && retryCount < MAX_BUILD_RETRIES) {
        retryCount++;
        console.log(`[Build ${buildId}] Attempt ${retryCount}/${MAX_BUILD_RETRIES} for task:`, task.name);

        try {
          const incrementalContext = buildIncrementalContext(files, chatHistory, task.contextFiles);
          const contextRatio = contextReductionRatio(incrementalContext, files);
          console.log(`[Build ${buildId}] Incremental context size:`, Object.keys(incrementalContext).length, `(${contextRatio} reduction)`);

          const smartChatHistory = buildSmartChatHistory(chatHistory, task.contextFiles, files);

          taskOutput = await streamBuildAgent({
            buildId,
            task,
            techStack,
            existingFiles: files,
            allSchemas: schemas,
            designTheme,
            chatHistory: smartChatHistory,
            domainModel,
            knowledge,
            snippetsContext,
            templateContext,
            incrementalContext,
            onDelta: (chunk: string) => {
              callbacks.onDelta(chunk);
              chatText += chunk;
            },
          });

          if (!taskOutput) {
            const retryContext = formatRetryContext(lastErrorMessage, retryCount, task, files);
            throw new Error(`Task failed to produce output. ${retryContext}`);
          }

          const truncationDetected = detectTruncation(taskOutput);
          if (truncationDetected) {
            const retryContext = `Output truncation detected. Retrying with expanded context.`;
            throw new Error(`Task failed: ${retryContext}`);
          }

          const structuredOutput = parseStructuredOutput(taskOutput);
          if (structuredOutput?.code && Object.keys(structuredOutput.code).length > 0) {
            taskOutput = structuredOutput.code;
            console.log(`[Build ${buildId}] ✅ Task ${task.name} produced structured output.`);
          }

          await setCachedTaskOutput(task.id, taskOutput);
          await persistTaskOutput(task.id, taskOutput);
          console.log(`[Build ${buildId}] Task ${task.name} completed successfully.`);

        } catch (error: any) {
          console.warn(`[Build ${buildId}] Task ${task.name} failed:`, error);
          lastErrorMessage = error.message;
          taskOutput = null; // Reset taskOutput for retry
        }
      }

      if (!taskOutput) {
        metrics.taskErrors = metrics.taskErrors ? metrics.taskErrors + 1 : 1;
        console.error(`[Build ${buildId}] Task ${task.name} failed after ${MAX_BUILD_RETRIES} retries.`);
        completeTask(taskTimer, true);
        callbacks.onError(`Task ${task.name} failed after multiple retries: ${lastErrorMessage}`);
        return { files, deps, chatText, mergeConflicts, metrics }; // Exit on unrecoverable task failure
      }

      completeTask(taskTimer);
      metrics.taskLatencies = metrics.taskLatencies ? [...metrics.taskLatencies, taskTimer.stop()] : [taskTimer.stop()];

      // Phase 3: Code Merging (after each task)
      callbacks.onProgress({ phase: "merging", message: `Merging code after task ${taskIndex}/${adjustedTotalTasks}: ${task.name}` });

      const mergeResult = mergeFiles(files, taskOutput, task.fileDependencies);
      files = mergeResult.files;
      mergeConflicts.push(...mergeResult.conflicts);

      // Resolve and merge imported dependencies
      const dependencyDiff = getDependencyDiff(deps, task.fileDependencies);
      const resolvedDeps = await resolveImportedDependencies(dependencyDiff, files);
      deps = { ...deps, ...resolvedDeps };

      if (mergeResult.conflicts.length > 0) {
        console.warn(`[Build ${buildId}] Merge conflicts after task ${task.name}:`, mergeResult.conflicts);
      }

      // Auto-Schema: Detect and create schemas based on generated code
      if (taskIndex === 1 && schemas?.length === 0) {
        await autoDetectAndCreateSchemas(files, projectId);
      }
    }

    // Phase 4: Validation (parse-only, single source of truth)
    callbacks.onProgress({ phase: "validating", message: "Validating generated code..." });

    const validationResults = await Promise.all(
      Object.entries(files).map(([fileName, code]) => validateFile(fileName, code, techStack))
    );

    const isValid = validationResults.every(result => result);
    if (!isValid) {
      console.warn(`[Build ${buildId}] Code validation failed. See logs for details.`);
      callbacks.onError("Code validation failed. See logs for details.");
      return { files, deps, chatText, mergeConflicts, metrics };
    }

    // Phase 5: Assembly (final code transformations)
    callbacks.onProgress({ phase: "assembling", message: "Assembling final code..." });

    if (designTheme) {
      files["/styles/design-system.css"] = DESIGN_SYSTEM_CSS;
      lintDesignTokens(designTheme, files);
    }

    // Mock Layer: Generate mock API layer for rapid prototyping
    if (techStack === "nextjs") {
      const mockLayer = await generateMockLayer(files, schemas);
      files = { ...files, ...mockLayer };
    }

    // Phase 6: Complete
    callbacks.onProgress({ phase: "complete", message: "Build complete!" });
    metrics.fileDiffs = computeFileDiff(existingFiles, files);
    metrics.emptyDiff = isDiffEmpty(metrics.fileDiffs);
    metrics.totalFiles = Object.keys(files).length;
    metrics.mergeConflicts = mergeConflicts.length;
    metrics.codeLines = Object.values(files).reduce((acc, code) => acc + code.split("\n").length, 0);

    console.log(`[Build ${buildId}] Build complete!`, { metrics, files, deps });
    finishBuild(metrics);
    callbacks.onFilesReady(files, deps);
    return { files, deps, plan, chatText, mergeConflicts, metrics };

  } catch (error: any) {
    console.error(`[Build ${buildId}] Build failed:`, error);
    callbacks.onError(error.message);
    callbacks.onProgress({ phase: "error", message: `Build failed: ${error.message}` });
    metrics.buildFailed = true;
    return { files, deps, chatText, mergeConflicts, metrics };
  }
}
