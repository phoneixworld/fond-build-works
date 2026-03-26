/**
 * WebContainer Engine — Pillar 1
 * 
 * Boots a WebContainer instance, mounts project files,
 * runs `bun install` + `bun run dev`, and exposes the dev server URL.
 * 
 * Only ONE WebContainer can exist per page — this module
 * manages a singleton and provides a clean API.
 */

import { WebContainer, type FileSystemTree } from "@webcontainer/api";

export type WebContainerStatus =
  | "idle"
  | "booting"
  | "mounting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export interface WebContainerCallbacks {
  onStatus?: (status: WebContainerStatus) => void;
  onLog?: (line: string) => void;
  onServerReady?: (url: string) => void;
  onError?: (error: string) => void;
}

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

/**
 * Get or boot the singleton WebContainer.
 */
export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (bootPromise) return bootPromise;

  bootPromise = WebContainer.boot().then((wc) => {
    instance = wc;
    bootPromise = null;
    return wc;
  });

  return bootPromise;
}

/**
 * Tear down the WebContainer instance.
 */
export function teardownWebContainer(): void {
  if (instance) {
    instance.teardown();
    instance = null;
  }
  bootPromise = null;
}

/**
 * Convert a flat Record<string, string> workspace into a WebContainer FileSystemTree.
 * Handles nested directories automatically.
 */
export function workspaceToFileTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const [path, content] of Object.entries(files)) {
    // Normalize: remove leading slash
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    const parts = normalized.split("/");

    let current: any = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!current[dir]) {
        current[dir] = { directory: {} };
      }
      current = current[dir].directory;
    }

    const filename = parts[parts.length - 1];
    current[filename] = {
      file: { contents: content },
    };
  }

  return tree;
}

/**
 * Create a minimal package.json for the mounted project.
 */
function createPackageJson(deps: Record<string, string> = {}): string {
  const pkg = {
    name: "lovable-preview",
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite --host 0.0.0.0",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      ...deps,
    },
    devDependencies: {
      vite: "^5.4.0",
      "@vitejs/plugin-react": "^4.3.0",
    },
  };
  return JSON.stringify(pkg, null, 2);
}

/**
 * Create a minimal vite.config.js for the preview project.
 */
function createViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3111,
    strictPort: false,
  },
});
`;
}

/**
 * Create a minimal index.html shell.
 */
function createIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;
}

/**
 * Mount workspace files and run the dev server.
 */
export async function mountAndRun(
  workspace: Record<string, string>,
  deps: Record<string, string> = {},
  callbacks: WebContainerCallbacks = {}
): Promise<string> {
  const { onStatus, onLog, onServerReady, onError } = callbacks;

  try {
    // 1. Boot
    onStatus?.("booting");
    onLog?.("⚡ Booting WebContainer...");
    const wc = await getWebContainer();

    // 2. Build file tree
    onStatus?.("mounting");
    onLog?.("📂 Mounting project files...");

    const fileTree = workspaceToFileTree(workspace);

    // Inject infrastructure files if not present
    if (!fileTree["package.json"]) {
      fileTree["package.json"] = {
        file: { contents: createPackageJson(deps) },
      };
    }
    if (!fileTree["vite.config.js"]) {
      fileTree["vite.config.js"] = {
        file: { contents: createViteConfig() },
      };
    }
    if (!fileTree["index.html"]) {
      fileTree["index.html"] = {
        file: { contents: createIndexHtml() },
      };
    }

    await wc.mount(fileTree);
    onLog?.(`📂 Mounted ${Object.keys(workspace).length} files`);

    // 3. Install dependencies
    onStatus?.("installing");
    onLog?.("📦 Installing dependencies...");

    const installProcess = await wc.spawn("npm", ["install", "--prefer-offline"]);

    // Stream install output
    installProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          onLog?.(data);
        },
      })
    );

    const installExitCode = await installProcess.exit;
    if (installExitCode !== 0) {
      const errMsg = `npm install failed with exit code ${installExitCode}`;
      onError?.(errMsg);
      onStatus?.("error");
      throw new Error(errMsg);
    }

    onLog?.("✅ Dependencies installed");

    // 4. Start dev server
    onStatus?.("starting");
    onLog?.("🚀 Starting dev server...");

    const devProcess = await wc.spawn("npm", ["run", "dev"]);

    devProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          onLog?.(data);
        },
      })
    );

    // 5. Wait for server-ready event
    return new Promise<string>((resolve) => {
      wc.on("server-ready", (_port: number, url: string) => {
        onLog?.(`✅ Dev server ready at ${url}`);
        onStatus?.("ready");
        onServerReady?.(url);
        resolve(url);
      });
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    onError?.(msg);
    onStatus?.("error");
    throw err;
  }
}

/**
 * Hot-update a single file in the running WebContainer.
 */
export async function updateFile(path: string, content: string): Promise<void> {
  const wc = await getWebContainer();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  await wc.fs.writeFile(normalized, content);
}

/**
 * Hot-update multiple files.
 */
export async function updateFiles(files: Record<string, string>): Promise<void> {
  const wc = await getWebContainer();
  for (const [path, content] of Object.entries(files)) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    // Ensure parent directories exist
    const dir = normalized.substring(0, normalized.lastIndexOf("/"));
    if (dir) {
      await wc.fs.mkdir(dir, { recursive: true });
    }
    await wc.fs.writeFile(normalized, content);
  }
}
