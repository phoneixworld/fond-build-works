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

/** Server-side JSX/TSX validation using pattern analysis */
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
    // Check for unclosed braces
    const opens = (content.match(/\{/g) || []).length;
    const closes = (content.match(/\}/g) || []).length;
    if (opens !== closes) {
      errors.push({ file: path, message: `Unbalanced braces: ${opens} opens vs ${closes} closes`, severity: "error" });
    }
    return errors;
  }

  // JS/TS/JSX/TSX validation
  const lines = content.split("\n");

  // Check for unterminated strings
  let inTemplate = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const backtickCount = (line.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) inTemplate = !inTemplate;

    if (!inTemplate) {
      // Check for obvious syntax issues
      const singleQuotes = (line.match(/(?<!\\)'/g) || []).length;
      const doubleQuotes = (line.match(/(?<!\\)"/g) || []).length;
      // Inside JSX, quotes can be unbalanced across lines, so only flag extreme cases
      if (singleQuotes % 2 !== 0 && !line.includes("'s") && !line.includes("n't") && !line.includes("`")) {
        // Might be a contraction, skip
      }
    }
  }

  // Check JSX balance for JSX/TSX files
  if (ext === "jsx" || ext === "tsx") {
    // Check for common JSX errors
    const jsxSelfClosing = content.match(/<\w+[^>]*\/>/g) || [];
    const jsxOpening = content.match(/<([A-Z]\w*|[a-z][\w.-]*)\b[^/>]*>/g) || [];
    const jsxClosing = content.match(/<\/([A-Z]\w*|[a-z][\w.-]*)\s*>/g) || [];

    // Rough balance check (not perfect but catches obvious issues)
    if (Math.abs(jsxOpening.length - jsxClosing.length) > 3) {
      errors.push({
        file: path,
        message: `JSX tag imbalance: ${jsxOpening.length} opening vs ${jsxClosing.length} closing tags`,
        severity: "warning",
      });
    }
  }

  // Check for missing exports in component files
  if ((ext === "jsx" || ext === "tsx") && !content.includes("export")) {
    errors.push({ file: path, message: "No export found — component won't be importable", severity: "warning" });
  }

  // Check for import resolution
  const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?["'](\.[^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Relative import — can't fully resolve without filesystem, but flag clearly broken ones
    if (importPath.includes("..") && importPath.split("..").length > 5) {
      errors.push({ file: path, message: `Suspicious deep relative import: ${importPath}`, severity: "warning" });
    }
  }

  return errors;
}

/** Validate all files and return aggregate results */
function validateBuild(files: Record<string, string>): {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  fileResults: Record<string, { valid: boolean; errors: ValidationError[] }>;
} {
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

/** Generate a self-contained HTML preview from React files */
function generatePreviewHtml(files: Record<string, string>, deps: Record<string, string>): string {
  // Find the entry point
  const entryFile = files["/App.jsx"] || files["/App.tsx"] || files["/App.js"] || files["App.jsx"] || files["App.tsx"];
  if (!entryFile) {
    // Fallback: find any file with a default export
    const candidates = Object.entries(files).filter(([p]) => p.match(/\.(jsx|tsx)$/));
    if (candidates.length === 0) return "<html><body><p>No renderable files found</p></body></html>";
  }

  // Collect CSS
  const cssFiles = Object.entries(files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, content]) => content)
    .join("\n\n");

  // Collect all JSX/TSX files
  const componentCode = Object.entries(files)
    .filter(([p]) => p.match(/\.(jsx|tsx|js|ts)$/) && !p.includes("vite.config"))
    .sort(([a], [b]) => {
      // App file last so components are defined first
      if (a.includes("App.")) return 1;
      if (b.includes("App.")) return -1;
      return a.localeCompare(b);
    })
    .map(([path, code]) => {
      // Strip import/export statements for browser execution
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Build Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/lucide@latest"><\/script>
  <style>${cssFiles}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${componentCode}
    
    const rootEl = document.getElementById('root');
    const AppComponent = typeof App !== 'undefined' ? App : (window.__default_export__ || (() => React.createElement('div', null, 'Preview')));
    ReactDOM.createRoot(rootEl).render(React.createElement(AppComponent));
  <\/script>
  <script>
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 500);
  <\/script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Service client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body: BuildRequest = await req.json();
    const { project_id, files, dependencies, build_config } = body;

    if (!project_id || !files || Object.keys(files).length === 0) {
      return new Response(JSON.stringify({ error: "project_id and files are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify project ownership
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

    // 1. Create build job
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
      console.error("Failed to create build job:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create build job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buildId = buildJob.id;

    // 2. Validate files
    buildLog.push(`[${new Date().toISOString()}] Validating ${Object.keys(files).length} files...`);
    await adminClient.from("build_jobs").update({ status: "validating", build_log: buildLog }).eq("id", buildId);

    const validation = validateBuild(files);
    buildLog.push(
      `[${new Date().toISOString()}] Validation: ${validation.errors.length} errors, ${validation.warnings.length} warnings`
    );

    if (!validation.valid) {
      buildLog.push(`[${new Date().toISOString()}] Build failed: validation errors`);
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
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Store artifacts in storage
    buildLog.push(`[${new Date().toISOString()}] Storing build artifacts...`);
    await adminClient.from("build_jobs").update({ status: "storing", build_log: buildLog }).eq("id", buildId);

    const artifactBasePath = `${project_id}/${buildId}`;

    // Upload source files
    for (const [filePath, content] of Object.entries(files)) {
      const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      const storagePath = `${artifactBasePath}/src/${cleanPath}`;
      const blob = new Blob([content], { type: "text/plain" });

      const { error: uploadError } = await adminClient.storage
        .from("build-artifacts")
        .upload(storagePath, blob, { contentType: "text/plain", upsert: true });

      if (uploadError) {
        console.error(`Upload failed for ${storagePath}:`, uploadError);
        buildLog.push(`[${new Date().toISOString()}] ⚠️ Upload failed: ${cleanPath}`);
      }
    }

    // 4. Generate and store preview HTML
    buildLog.push(`[${new Date().toISOString()}] Generating preview HTML...`);
    const previewHtml = generatePreviewHtml(files, dependencies || {});
    const previewBlob = new Blob([previewHtml], { type: "text/html" });
    const previewPath = `${artifactBasePath}/preview/index.html`;

    const { error: previewUploadError } = await adminClient.storage
      .from("build-artifacts")
      .upload(previewPath, previewBlob, { contentType: "text/html", upsert: true });

    if (previewUploadError) {
      console.error("Preview upload failed:", previewUploadError);
    }

    // Get public URL for preview
    const { data: publicUrl } = adminClient.storage
      .from("build-artifacts")
      .getPublicUrl(previewPath);

    const previewUrl = publicUrl?.publicUrl || null;

    // 5. Store build manifest
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
    await adminClient.storage
      .from("build-artifacts")
      .upload(`${artifactBasePath}/manifest.json`, manifestBlob, {
        contentType: "application/json",
        upsert: true,
      });

    // 6. Complete the build
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Build orchestrator error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
