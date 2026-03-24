import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BuildRequest {
  project_id: string;
  files: Record<string, string>;
  dependencies: Record<string, string>;
  build_config?: {
    model?: string;
    theme?: string;
    template?: string;
  };
}

interface ValidationError {
  file: string;
  line?: number;
  message: string;
  severity: "error" | "warning";
}

function validateFile(path: string, content: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const ext = path.split(".").pop()?.toLowerCase() || "";

  if (!["jsx", "tsx", "js", "ts", "css", "json"].includes(ext)) return errors;

  if (ext === "json") {
    try {
      JSON.parse(content);
    } catch (e) {
      errors.push({ file: path, message: `Invalid JSON: ${(e as Error).message}`, severity: "error" });
    }
    return errors;
  }

  if (ext === "css") {
    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const opens = (stripped.match(/\{/g) || []).length;
    const closes = (stripped.match(/\}/g) || []).length;
    if (opens !== closes) {
      errors.push({
        file: path,
        message: `Unbalanced braces: ${opens} opens vs ${closes} closes`,
        severity: "warning",
      });
    }
    return errors;
  }

  const lines = content.split("\n");
  let inTemplate = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const backtickCount = (line.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) inTemplate = !inTemplate;
  }

  if (ext === "jsx" || ext === "tsx") {
    const jsxOpening = content.match(/<([A-Z]\w*|[a-z][\w.-]*)\b[^/>]*>/g) || [];
    const jsxClosing = content.match(/<\/([A-Z]\w*|[a-z][\w.-]*)\s*>/g) || [];
    if (Math.abs(jsxOpening.length - jsxClosing.length) > 3) {
      errors.push({
        file: path,
        message: `JSX tag imbalance: ${jsxOpening.length} opening vs ${jsxClosing.length} closing tags`,
        severity: "warning",
      });
    }
  }

  if ((ext === "jsx" || ext === "tsx") && !content.includes("export")) {
    errors.push({ file: path, message: "No export found — component won't be importable", severity: "warning" });
  }

  const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?["'](\.[^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.includes("..") && importPath.split("..").length > 5) {
      errors.push({ file: path, message: `Suspicious deep relative import: ${importPath}`, severity: "warning" });
    }
  }

  return errors;
}

function validateBuild(files: Record<string, string>) {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const fileResults: Record<string, { valid: boolean; errors: ValidationError[] }> = {};

  for (const [path, content] of Object.entries(files)) {
    const issues = validateFile(path, content);
    const errors = issues.filter((e) => e.severity === "error");
    const warnings = issues.filter((e) => e.severity === "warning");
    allErrors.push(...errors);
    allWarnings.push(...warnings);
    fileResults[path] = { valid: errors.length === 0, errors: issues };
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    fileResults,
  };
}

function generatePreviewHtml(files: Record<string, string>, deps: Record<string, string>): string {
  const entryFile = files["/App.jsx"] || files["/App.tsx"] || files["/App.js"] || files["App.jsx"] || files["App.tsx"];

  const cssFiles = Object.entries(files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, content]) => content)
    .join("\n\n");

  const componentCode = Object.entries(files)
    .filter(([p]) => p.match(/\.(jsx|tsx|js|ts)$/) && !p.includes("vite.config"))
    .sort(([a], [b]) => {
      if (a.includes("App.")) return 1;
      if (b.includes("App.")) return -1;
      return a.localeCompare(b);
    })
    .map(([path, code]) => {
      const cleaned = code
        .replace(/^import\s+.*$/gm, "// [import removed for preview]")
        .replace(/^export\s+default\s+/gm, "window.__default_export__ = ")
        .replace(/^export\s+/gm, "");
      return `// === ${path} ===\n${cleaned}`;
    })
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Build Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>${cssFiles}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${componentCode}
    const rootEl = document.getElementById('root');
    const AppComponent = typeof App !== 'undefined' ? App : (window.__default_export__ || (() => React.createElement('div', null, 'Preview')));
    ReactDOM.createRoot(rootEl).render(React.createElement(AppComponent));
  </script>
  <script>
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 500);
  </script>
</body>
</html>`;
}

/* ------------------------- MIGRATION BRIDGE ------------------------- */

async function applyMigrations(adminClient, project_id, files, buildLog) {
  const migrationPaths = Object.keys(files).filter((p) => p.startsWith("/migrations/") && p.endsWith(".sql"));

  if (migrationPaths.length === 0) {
    buildLog.push(`[${new Date().toISOString()}] No migrations found`);
    return;
  }

  buildLog.push(`[${new Date().toISOString()}] Applying ${migrationPaths.length} migrations...`);

  for (const path of migrationPaths) {
    const sql = files[path];

    const { error } = await adminClient.rpc("execute_sql", {
      project_id,
      sql,
    });

    if (error) {
      buildLog.push(`[${new Date().toISOString()}] ❌ Migration failed: ${path}`);
      throw new Error(`Migration failed for ${path}: ${error.message}`);
    }

    buildLog.push(`[${new Date().toISOString()}] ✅ Migration applied: ${path}`);
  }
}

/* ------------------------- MAIN HANDLER ------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body: BuildRequest = await req.json();
    const { project_id, files, dependencies, build_config } = body;

    if (!project_id || !files || Object.keys(files).length === 0) {
      return new Response(JSON.stringify({ error: "project_id and files are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project, error: projectError } = await userClient
      .from("projects")
      .select("id, user_id")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Project not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    const buildLog: string[] = [];

    buildLog.push(`[${new Date().toISOString()}] Build started`);
    buildLog.push(`[${new Date().toISOString()}] Files: ${Object.keys(files).length}`);

    const { data: buildJob, error: insertError } = await adminClient
      .from("build_jobs")
      .insert({
        project_id,
        user_id: userId,
        status: "building",
        source_files: files,
        dependencies: dependencies || {},
        build_config: build_config || {},
        file_count: Object.keys(files).length,
        total_size_bytes: Object.values(files).reduce((sum, c) => sum + new TextEncoder().encode(c).length, 0),
        started_at: new Date().toISOString(),
        build_log: buildLog,
      })
      .select()
      .single();

    if (insertError || !buildJob) {
      return new Response(JSON.stringify({ error: "Failed to create build job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buildId = buildJob.id;

    buildLog.push(`[${new Date().toISOString()}] Validating ${Object.keys(files).length} files...`);
    await adminClient.from("build_jobs").update({ status: "validating", build_log: buildLog }).eq("id", buildId);

    const validation = validateBuild(files);
    buildLog.push(
      `[${new Date().toISOString()}] Validation: ${validation.errors.length} errors, ${validation.warnings.length} warnings`,
    );

    if (!validation.valid) {
      const duration = Date.now() - startTime;
      await adminClient
        .from("build_jobs")
        .update({
          status: "failed",
          error: validation.errors.map((e) => `${e.file}: ${e.message}`).join("\n"),
          validation_results: validation,
          build_log: buildLog,
          build_duration_ms: duration,
          completed_at: new Date().toISOString(),
        })
        .eq("id", buildId);

      return new Response(
        JSON.stringify({
          build_id: buildId,
          status: "failed",
          errors: validation.errors,
          warnings: validation.warnings,
          duration_ms: duration,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ---------------- APPLY MIGRATIONS HERE ---------------- */
    await applyMigrations(adminClient, project_id, files, buildLog);

    buildLog.push(`[${new Date().toISOString()}] Storing build artifacts...`);
    await adminClient.from("build_jobs").update({ status: "storing", build_log: buildLog }).eq("id", buildId);

    const artifactBasePath = `${project_id}/${buildId}`;

    for (const [filePath, content] of Object.entries(files)) {
      const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      const storagePath = `${artifactBasePath}/src/${cleanPath}`;
      const blob = new Blob([content], { type: "text/plain" });

      await adminClient.storage
        .from("build-artifacts")
        .upload(storagePath, blob, { contentType: "text/plain", upsert: true });
    }

    buildLog.push(`[${new Date().toISOString()}] Generating preview HTML...`);
    const previewHtml = generatePreviewHtml(files, dependencies || {});
    const previewBlob = new Blob([previewHtml], { type: "text/html" });
    const previewPath = `${artifactBasePath}/preview/index.html`;

    await adminClient.storage
      .from("build-artifacts")
      .upload(previewPath, previewBlob, { contentType: "text/html", upsert: true });

    const { data: publicUrl } = adminClient.storage.from("build-artifacts").getPublicUrl(previewPath);

    const previewUrl = publicUrl?.publicUrl || null;

    const manifest = {
      build_id: buildId,
      project_id,
      files: Object.keys(files),
      dependencies: dependencies || {},
      validation: {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
      },
      preview_url: previewUrl,
      created_at: new Date().toISOString(),
    };

    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    await adminClient.storage.from("build-artifacts").upload(`${artifactBasePath}/manifest.json`, manifestBlob, {
      contentType: "application/json",
      upsert: true,
    });

    const duration = Date.now() - startTime;
    buildLog.push(`[${new Date().toISOString()}] Build complete in ${duration}ms`);

    const outputFiles: Record<string, string> = {};
    for (const filePath of Object.keys(files)) {
      const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      outputFiles[cleanPath] = `${artifactBasePath}/src/${cleanPath}`;
    }
    outputFiles["preview/index.html"] = previewPath;

    await adminClient
      .from("build_jobs")
      .update({
        status: "complete",
        output_files: outputFiles,
        validation_results: validation,
        build_log: buildLog,
        build_duration_ms: duration,
        artifact_path: artifactBasePath,
        preview_url: previewUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", buildId);

    return new Response(
      JSON.stringify({
        build_id: buildId,
        status: "complete",
        preview_url: previewUrl,
        artifact_path: artifactBasePath,
        file_count: Object.keys(files).length,
        total_size_bytes: Object.values(files).reduce((sum, c) => sum + new TextEncoder().encode(c).length, 0),
        validation: {
          errors: validation.errors.length,
          warnings: validation.warnings.length,
          details: validation.warnings,
        },
        duration_ms: duration,
        build_log: buildLog,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
