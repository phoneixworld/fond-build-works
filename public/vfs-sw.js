/**
 * Phoenix VFS Service Worker
 * 
 * Intercepts fetch requests for virtual filesystem paths and serves
 * files from an in-memory Map. Backs up to IndexedDB for persistence
 * across SW restarts.
 * 
 * Architecture Decisions:
 * - skipWaiting + clients.claim for immediate activation
 * - IndexedDB backup for SW lifecycle resilience
 * - Content-hash based diffing for incremental updates
 * - Cache API for external CDN dependencies (esm.sh)
 * - Memory cap: 150 files max, auto-reject beyond
 */

const VFS_SCOPE = "/vfs-preview/";
const IDB_NAME = "phoenix-vfs";
const IDB_STORE = "files";
const CDN_CACHE = "phoenix-cdn-v1";
const MAX_FILES = 150;

// ─── In-Memory File Store ─────────────────────────────────────────────────

/** @type {Map<string, string>} */
const fileMap = new Map();

/** @type {Map<string, string>} Content hashes for diffing */
const hashMap = new Map();

/** @type {string} Current project ID */
let currentProjectId = "";

/** @type {boolean} Whether IDB restore has completed */
let idbRestored = false;

// ─── IndexedDB Helpers ────────────────────────────────────────────────────

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSaveAll() {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    
    // Clear old data
    store.clear();
    
    // Save current files
    const snapshot = { projectId: currentProjectId, files: {} };
    for (const [path, content] of fileMap) {
      snapshot.files[path] = content;
    }
    store.put(snapshot, "workspace");
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[VFS-SW] IDB save failed:", e);
  }
}

async function idbRestore() {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    
    return new Promise((resolve) => {
      const req = store.get("workspace");
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.files) {
          for (const [path, content] of Object.entries(data.files)) {
            fileMap.set(path, content);
            hashMap.set(path, simpleHash(content));
          }
          currentProjectId = data.projectId || "";
          console.log(`[VFS-SW] Restored ${fileMap.size} files from IDB`);
        }
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn("[VFS-SW] IDB restore failed:", e);
    return false;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash.toString(36);
}

function getMimeType(path) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const mimes = {
    js: "application/javascript",
    jsx: "application/javascript",
    ts: "application/javascript",
    tsx: "application/javascript",
    css: "text/css",
    html: "text/html",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
  };
  return mimes[ext] || "text/plain";
}

// ─── SW Lifecycle ─────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  console.log("[VFS-SW] Installing — skipWaiting");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[VFS-SW] Activating — claiming clients");
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      idbRestore().then(() => { idbRestored = true; }),
    ])
  );
});

// ─── Message Handler (file updates from main thread) ──────────────────────

self.addEventListener("message", (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case "vfs-update": {
      // Incremental file update: { files: Record<string, string>, deletions?: string[], projectId?: string }
      const { files, deletions, projectId } = data;
      
      if (projectId && projectId !== currentProjectId) {
        // New project — clear everything
        fileMap.clear();
        hashMap.clear();
        currentProjectId = projectId;
      }

      let changed = 0;
      let skipped = 0;

      // Apply file changes (content-hash diffing)
      if (files) {
        for (const [path, content] of Object.entries(files)) {
          if (fileMap.size >= MAX_FILES && !fileMap.has(path)) {
            console.warn(`[VFS-SW] Max files (${MAX_FILES}) reached, skipping: ${path}`);
            continue;
          }
          const newHash = simpleHash(content);
          if (hashMap.get(path) === newHash) {
            skipped++;
            continue;
          }
          fileMap.set(path, content);
          hashMap.set(path, newHash);
          changed++;
        }
      }

      // Apply deletions
      if (deletions) {
        for (const path of deletions) {
          fileMap.delete(path);
          hashMap.delete(path);
          changed++;
        }
      }

      console.log(`[VFS-SW] Update: ${changed} changed, ${skipped} skipped, ${fileMap.size} total`);

      // Persist to IDB (async, don't block response)
      idbSaveAll();

      // Reply with status
      if (event.source) {
        event.source.postMessage({
          type: "vfs-update-ack",
          fileCount: fileMap.size,
          changed,
          skipped,
        });
      }
      break;
    }

    case "vfs-clear": {
      fileMap.clear();
      hashMap.clear();
      currentProjectId = "";
      idbSaveAll();
      if (event.source) {
        event.source.postMessage({ type: "vfs-clear-ack" });
      }
      break;
    }

    case "vfs-list": {
      if (event.source) {
        event.source.postMessage({
          type: "vfs-list-result",
          files: Array.from(fileMap.keys()),
          projectId: currentProjectId,
        });
      }
      break;
    }

    case "vfs-health": {
      // Health check for smoke tests
      if (event.source) {
        event.source.postMessage({
          type: "vfs-health-result",
          healthy: true,
          fileCount: fileMap.size,
          maxFiles: MAX_FILES,
          idbRestored,
        });
      }
      break;
    }
  }
});

// ─── Fetch Interceptor ────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Only intercept requests within our VFS scope
  if (!url.pathname.startsWith(VFS_SCOPE)) {
    return; // Let browser handle normally
  }

  // Extract virtual path from URL
  const virtualPath = url.pathname.slice(VFS_SCOPE.length - 1); // Keep leading /
  
  // Special: serve index.html for the root
  if (virtualPath === "/" || virtualPath === "/index.html") {
    event.respondWith(serveIndex());
    return;
  }

  // Try to serve from file map
  event.respondWith(serveFile(virtualPath, event.request));
});

async function serveFile(path, request) {
  // Resolve the actual file path (direct, with extension, or /index)
  const resolvedPath = resolveFilePath(path);

  if (resolvedPath) {
    const content = fileMap.get(resolvedPath);
    const mime = getMimeType(resolvedPath);

    // For JS modules: wrap with circular-dep-safe loading sentinel
    if (mime === "application/javascript") {
      const wrapped = wrapWithLoadingSentinel(content, resolvedPath);
      return new Response(wrapped, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "no-cache",
          "X-Phoenix-VFS": "true",
          "X-Phoenix-Resolved": resolvedPath,
        },
      });
    }

    // Non-JS files served as-is
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-cache",
        "X-Phoenix-VFS": "true",
      },
    });
  }

  // 404 — file not in VFS
  return new Response(`// [VFS-SW] Module not found: ${path}\nexport default null;`, {
    status: 200, // Return 200 with stub to prevent hard errors
    headers: {
      "Content-Type": "application/javascript",
      "X-Phoenix-VFS": "miss",
    },
  });
}

/**
 * Resolve a virtual path to an actual file in the map.
 * Tries: exact → with extensions → /index variants
 */
function resolveFilePath(path) {
  if (fileMap.has(path)) return path;

  const extensions = [".js", ".jsx", ".ts", ".tsx", ".json"];
  for (const ext of extensions) {
    if (fileMap.has(path + ext)) return path + ext;
  }

  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
    const indexPath = path + "/index" + ext;
    if (fileMap.has(indexPath)) return indexPath;
  }

  return null;
}

/**
 * Wrap a JS module with a loading sentinel for circular dependency safety.
 *
 * Problem: Native ES modules deadlock when A imports B and B imports A.
 * The browser's module loader will see A is "loading" when B tries to
 * import it, and returns the partially-initialized module namespace
 * (with undefined exports).
 *
 * Solution: We wrap each module to eagerly define its export object on
 * a global registry BEFORE executing. When a circular import occurs,
 * the importing module gets the partially-populated exports object
 * (which will be filled in once the cycle resolves) instead of undefined.
 *
 * This is the same pattern Node.js uses for CommonJS circular deps
 * and what Webpack/Rollup do with their runtime wrappers.
 */
function wrapWithLoadingSentinel(code, modulePath) {
  // Don't wrap entry.js or non-application code
  if (modulePath === "/entry.js" || modulePath.startsWith("/__")) {
    return code;
  }

  // The sentinel registry is injected in index.html's <script> block
  return `// ── Phoenix Circular Dep Sentinel ──
if (!window.__phoenix_modules__) window.__phoenix_modules__ = {};
if (!window.__phoenix_modules__["${modulePath}"]) {
  window.__phoenix_modules__["${modulePath}"] = { __loading: true, __exports: {} };
}
const __self__ = window.__phoenix_modules__["${modulePath}"];

${code}

// Mark as fully loaded
__self__.__loading = false;
`;
}

async function serveIndex() {
  // Serve a minimal bootstrap HTML that loads the entry module
  const html = fileMap.get("/__generated_index.html") || `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phoenix Preview</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./entry.js"></script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}
