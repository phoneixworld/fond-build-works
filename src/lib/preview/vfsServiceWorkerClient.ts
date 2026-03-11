/**
 * Phoenix VFS Service Worker Client
 * 
 * Manages Service Worker registration, lifecycle, and communication.
 * Provides typed API for sending files to the SW and receiving status.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VFSUpdateResult {
  fileCount: number;
  changed: number;
  skipped: number;
}

export interface VFSHealthResult {
  healthy: boolean;
  fileCount: number;
  maxFiles: number;
  idbRestored: boolean;
}

export type VFSStatus = "unregistered" | "installing" | "active" | "error";

// ─── SW Registration & Lifecycle ────────────────────────────────────────────

let swRegistration: ServiceWorkerRegistration | null = null;
let swStatus: VFSStatus = "unregistered";
let statusListeners: ((status: VFSStatus) => void)[] = [];

function setStatus(status: VFSStatus) {
  swStatus = status;
  statusListeners.forEach(fn => fn(status));
}

export function onStatusChange(fn: (status: VFSStatus) => void): () => void {
  statusListeners.push(fn);
  return () => {
    statusListeners = statusListeners.filter(l => l !== fn);
  };
}

export function getStatus(): VFSStatus {
  return swStatus;
}

/**
 * Register the VFS Service Worker.
 * Returns true if registration succeeds.
 */
export async function registerVFS(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[VFS Client] Service Workers not supported");
    setStatus("error");
    return false;
  }

  try {
    setStatus("installing");

    // Register with scope matching our preview path
    swRegistration = await navigator.serviceWorker.register("/vfs-sw.js", {
      scope: "/vfs-preview/",
    });

    // Wait for activation
    const sw = swRegistration.installing || swRegistration.waiting || swRegistration.active;
    
    if (sw && sw.state !== "activated") {
      await new Promise<void>((resolve) => {
        sw.addEventListener("statechange", function handler() {
          if (sw.state === "activated") {
            sw.removeEventListener("statechange", handler);
            resolve();
          }
        });
        // Safety timeout
        setTimeout(resolve, 5000);
      });
    }

    setStatus("active");
    console.log("[VFS Client] Service Worker registered and active");
    return true;
  } catch (e) {
    console.error("[VFS Client] Registration failed:", e);
    setStatus("error");
    return false;
  }
}

/**
 * Unregister the VFS Service Worker.
 */
export async function unregisterVFS(): Promise<void> {
  if (swRegistration) {
    await swRegistration.unregister();
    swRegistration = null;
    setStatus("unregistered");
  }
}

// ─── Communication ──────────────────────────────────────────────────────────

function getActiveSW(): ServiceWorker | null {
  return swRegistration?.active || navigator.serviceWorker?.controller || null;
}

/**
 * Send a message to the SW and wait for a typed response.
 */
function sendMessage<T>(
  type: string,
  data?: any,
  responseType?: string,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const sw = getActiveSW();
    if (!sw) {
      reject(new Error("No active Service Worker"));
      return;
    }

    const expectedResponse = responseType || `${type}-ack`;
    
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", handler);
      reject(new Error(`VFS message timeout: ${type}`));
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (event.data?.type === expectedResponse) {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(event.data as T);
      }
    }

    navigator.serviceWorker.addEventListener("message", handler);
    sw.postMessage({ type, data });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send files to the VFS Service Worker.
 * Uses content-hash diffing — only changed files are stored.
 */
export async function updateFiles(
  files: Record<string, string>,
  projectId: string,
  deletions?: string[]
): Promise<VFSUpdateResult> {
  return sendMessage<VFSUpdateResult>("vfs-update", {
    files,
    deletions,
    projectId,
  }, "vfs-update-ack");
}

/**
 * Clear all files from the VFS.
 */
export async function clearFiles(): Promise<void> {
  await sendMessage("vfs-clear", undefined, "vfs-clear-ack");
}

/**
 * List all files currently in the VFS.
 */
export async function listFiles(): Promise<{ files: string[]; projectId: string }> {
  return sendMessage("vfs-list", undefined, "vfs-list-result");
}

/**
 * Health check — verify SW is responsive and functional.
 */
export async function healthCheck(): Promise<VFSHealthResult> {
  try {
    return await sendMessage<VFSHealthResult>("vfs-health", undefined, "vfs-health-result", 3000);
  } catch {
    return { healthy: false, fileCount: 0, maxFiles: 150, idbRestored: false };
  }
}

/**
 * Get the preview URL for the VFS iframe.
 */
export function getPreviewUrl(): string {
  return "/vfs-preview/";
}

/**
 * Check if the SW is ready to serve files.
 */
export function isReady(): boolean {
  return swStatus === "active" && !!getActiveSW();
}
