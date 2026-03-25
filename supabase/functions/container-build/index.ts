import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Azure Container Apps REST API helpers
const AZURE_API_VERSION = "2024-03-01";

interface AzureTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAzureToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://management.azure.com/.default",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Azure auth failed [${resp.status}]: ${text}`);
  }

  const data: AzureTokenResponse = await resp.json();
  return data.access_token;
}

function getAzureConfig() {
  const subscriptionId = Deno.env.get("AZURE_SUBSCRIPTION_ID");
  const resourceGroup = Deno.env.get("AZURE_RESOURCE_GROUP");
  const containerEnv = Deno.env.get("AZURE_CONTAINER_ENV");
  const registry = Deno.env.get("AZURE_REGISTRY"); // e.g. myregistry.azurecr.io

  if (!subscriptionId || !resourceGroup || !containerEnv || !registry) {
    throw new Error(
      "Azure config incomplete. Set AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_CONTAINER_ENV, AZURE_REGISTRY."
    );
  }

  return { subscriptionId, resourceGroup, containerEnv, registry };
}

interface BuildRequest {
  project_id: string;
  files: Record<string, string>;
  dependencies: Record<string, string>;
  build_config?: {
    model?: string;
    theme?: string;
    template?: string;
    node_version?: string;
  };
}

// Build task DAG definition
const BUILD_TASKS = [
  { type: "install", label: "Install dependencies", sort: 0, depends: [] },
  { type: "lint", label: "Lint source files", sort: 1, depends: ["install"] },
  { type: "typecheck", label: "TypeScript check", sort: 2, depends: ["install"] },
  { type: "test", label: "Run tests", sort: 3, depends: ["lint", "typecheck"] },
  { type: "build", label: "Vite production build", sort: 4, depends: ["test"] },
  { type: "publish", label: "Publish artifacts", sort: 5, depends: ["build"] },
] as const;

async function createContainerJob(
  azureToken: string,
  buildId: string,
  projectId: string,
  callbackUrl: string,
) {
  const config = getAzureConfig();
  const jobName = `build-${buildId.slice(0, 8)}`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const jobUrl =
    `https://management.azure.com/subscriptions/${config.subscriptionId}` +
    `/resourceGroups/${config.resourceGroup}` +
    `/providers/Microsoft.App/jobs/${jobName}` +
    `?api-version=${AZURE_API_VERSION}`;

  const jobBody = {
    location: Deno.env.get("AZURE_LOCATION") || "eastus",
    properties: {
      environmentId: `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.App/managedEnvironments/${config.containerEnv}`,
      configuration: {
        replicaTimeout: 1800, // 30 min max
        replicaRetryLimit: 1,
        triggerType: "Manual",
        manualTriggerConfig: {
          parallelism: 1,
          replicaCompletionCount: 1,
        },
      },
      template: {
        containers: [
          {
            name: "builder",
            image: `${config.registry}/phoenix-builder:latest`,
            resources: {
              cpu: 2,
              memory: "4Gi",
            },
            env: [
              { name: "BUILD_ID", value: buildId },
              { name: "PROJECT_ID", value: projectId },
              { name: "CALLBACK_URL", value: callbackUrl },
              { name: "SUPABASE_URL", value: supabaseUrl },
              { name: "SUPABASE_SERVICE_ROLE_KEY", value: serviceKey },
            ],
          },
        ],
      },
    },
  };

  // Create the job
  const createResp = await fetch(jobUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${azureToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jobBody),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Azure Container Job creation failed [${createResp.status}]: ${text}`);
  }

  // Start the job execution
  const startUrl =
    `https://management.azure.com/subscriptions/${config.subscriptionId}` +
    `/resourceGroups/${config.resourceGroup}` +
    `/providers/Microsoft.App/jobs/${jobName}/start` +
    `?api-version=${AZURE_API_VERSION}`;

  const startResp = await fetch(startUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${azureToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!startResp.ok) {
    const text = await startResp.text();
    throw new Error(`Azure Container Job start failed [${startResp.status}]: ${text}`);
  }

  const startData = await startResp.json();
  return {
    jobName,
    executionId: startData.id || startData.name || jobName,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const body: BuildRequest = await req.json();
    const { project_id, files, dependencies, build_config } = body;

    if (!project_id || !files || Object.keys(files).length === 0) {
      return new Response(JSON.stringify({ error: "project_id and files are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify project access
    const { data: project, error: projErr } = await userClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalSize = Object.values(files).reduce(
      (sum, c) => sum + new TextEncoder().encode(c).length,
      0
    );

    // Create container build record
    const { data: build, error: insertErr } = await adminClient
      .from("container_builds")
      .insert({
        project_id,
        user_id: user.id,
        status: "pending",
        source_files: files,
        dependencies: dependencies || {},
        build_config: build_config || {},
        file_count: Object.keys(files).length,
        total_size_bytes: totalSize,
        build_log: [`[${new Date().toISOString()}] Container build queued`],
      })
      .select()
      .single();

    if (insertErr || !build) {
      return new Response(JSON.stringify({ error: "Failed to create build" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buildId = build.id;

    // Create DAG tasks
    const taskInserts = BUILD_TASKS.map((t) => ({
      build_id: buildId,
      task_type: t.type,
      label: t.label,
      status: "pending",
      sort_order: t.sort,
    }));

    const { data: tasks, error: taskErr } = await adminClient
      .from("container_tasks")
      .insert(taskInserts)
      .select();

    if (taskErr) {
      console.error("Failed to create tasks:", taskErr);
    }

    // Resolve task dependencies (map type names → UUIDs)
    if (tasks && tasks.length > 0) {
      const typeToId = Object.fromEntries(tasks.map((t: any) => [t.task_type, t.id]));
      for (const taskDef of BUILD_TASKS) {
        if (taskDef.depends.length > 0) {
          const depIds = taskDef.depends.map((d) => typeToId[d]).filter(Boolean);
          await adminClient
            .from("container_tasks")
            .update({ depends_on: depIds })
            .eq("id", typeToId[taskDef.type]);
        }
      }
    }

    // Upload source files to storage for the container to fetch
    const artifactBase = `${project_id}/${buildId}`;
    const sourceBlob = new Blob([JSON.stringify({ files, dependencies })], {
      type: "application/json",
    });
    await adminClient.storage
      .from("build-artifacts")
      .upload(`${artifactBase}/source.json`, sourceBlob, {
        contentType: "application/json",
        upsert: true,
      });

    // Update status to provisioning
    await adminClient
      .from("container_builds")
      .update({
        status: "provisioning",
        started_at: new Date().toISOString(),
        build_log: [
          ...build.build_log,
          `[${new Date().toISOString()}] Provisioning Azure Container Apps job...`,
        ],
      })
      .eq("id", buildId);

    // Launch Azure Container Apps job
    const callbackUrl = `${supabaseUrl}/functions/v1/container-status`;
    const azureToken = await getAzureToken();
    const { jobName, executionId } = await createContainerJob(
      azureToken,
      buildId,
      project_id,
      callbackUrl
    );

    // Update with Azure metadata
    await adminClient
      .from("container_builds")
      .update({
        status: "building",
        azure_job_name: jobName,
        azure_execution_id: executionId,
        container_image: `${getAzureConfig().registry}/phoenix-builder:latest`,
        build_log: [
          ...build.build_log,
          `[${new Date().toISOString()}] Provisioning Azure Container Apps job...`,
          `[${new Date().toISOString()}] Container job started: ${jobName}`,
        ],
      })
      .eq("id", buildId);

    return new Response(
      JSON.stringify({
        build_id: buildId,
        status: "building",
        azure_job: jobName,
        task_count: BUILD_TASKS.length,
        file_count: Object.keys(files).length,
        total_size_bytes: totalSize,
        message: "Container build started. Subscribe to Realtime for live updates.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("container-build error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
