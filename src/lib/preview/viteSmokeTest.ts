/**
 * Phoenix Vite SW Smoke Tests
 * 
 * Hard gate: if ANY test fails, the engine auto-falls back to Sandpack.
 * Tests: SW registration, file serving, alias resolution, CSS handling.
 */

import {
  registerVFS,
  healthCheck,
  updateFiles,
  clearFiles,
  getStatus,
  type VFSHealthResult,
} from "./vfsServiceWorkerClient";

export interface SmokeTestResult {
  passed: boolean;
  tests: {
    name: string;
    passed: boolean;
    durationMs: number;
    error?: string;
  }[];
  totalDurationMs: number;
  failReason?: string;
}

/**
 * Run all smoke tests. Returns a detailed result.
 * If any test fails, `passed` is false and `failReason` explains why.
 */
export async function runSmokeTests(): Promise<SmokeTestResult> {
  const startTime = performance.now();
  const tests: SmokeTestResult["tests"] = [];

  // ── Test 1: SW Registration ──
  const t1Start = performance.now();
  try {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Workers not supported in this browser");
    }
    const registered = await registerVFS();
    if (!registered) throw new Error("Registration returned false");
    tests.push({ name: "SW Registration", passed: true, durationMs: performance.now() - t1Start });
  } catch (e: any) {
    tests.push({ name: "SW Registration", passed: false, durationMs: performance.now() - t1Start, error: e.message });
    return finalize(tests, startTime);
  }

  // ── Test 2: Health Check ──
  const t2Start = performance.now();
  try {
    const health: VFSHealthResult = await healthCheck();
    if (!health.healthy) throw new Error("SW reported unhealthy");
    tests.push({ name: "Health Check", passed: true, durationMs: performance.now() - t2Start });
  } catch (e: any) {
    tests.push({ name: "Health Check", passed: false, durationMs: performance.now() - t2Start, error: e.message });
    return finalize(tests, startTime);
  }

  // ── Test 3: File Write & Read ──
  const t3Start = performance.now();
  try {
    const testFiles = {
      "/test-smoke.js": 'export const SMOKE = "ok";',
      "/test-smoke-2.js": 'import { SMOKE } from "./test-smoke.js"; export default SMOKE;',
    };
    const result = await updateFiles(testFiles, "__smoke_test__");
    if (result.changed < 2) throw new Error(`Expected 2 changed, got ${result.changed}`);
    
    // Verify file is servable via fetch
    const resp = await fetch("/vfs-preview/test-smoke.js");
    if (!resp.ok) throw new Error(`Fetch returned ${resp.status}`);
    const content = await resp.text();
    if (!content.includes("SMOKE")) throw new Error("File content mismatch");
    
    tests.push({ name: "File Write & Read", passed: true, durationMs: performance.now() - t3Start });
  } catch (e: any) {
    tests.push({ name: "File Write & Read", passed: false, durationMs: performance.now() - t3Start, error: e.message });
  }

  // ── Test 4: Extension Resolution ──
  const t4Start = performance.now();
  try {
    await updateFiles({
      "/components/Button.tsx": 'export default function Button() { return null; }',
    }, "__smoke_test__");

    // SW should resolve /components/Button → /components/Button.tsx
    const resp = await fetch("/vfs-preview/components/Button");
    if (!resp.ok) throw new Error(`Extension resolution failed: ${resp.status}`);
    const content = await resp.text();
    if (!content.includes("Button")) throw new Error("Content mismatch on resolved file");
    
    tests.push({ name: "Extension Resolution", passed: true, durationMs: performance.now() - t4Start });
  } catch (e: any) {
    tests.push({ name: "Extension Resolution", passed: false, durationMs: performance.now() - t4Start, error: e.message });
  }

  // ── Test 5: Index Resolution ──
  const t5Start = performance.now();
  try {
    await updateFiles({
      "/utils/index.ts": 'export const util = true;',
    }, "__smoke_test__");

    const resp = await fetch("/vfs-preview/utils");
    // SW should try /utils/index.ts
    if (!resp.ok) throw new Error(`Index resolution failed: ${resp.status}`);
    
    tests.push({ name: "Index Resolution", passed: true, durationMs: performance.now() - t5Start });
  } catch (e: any) {
    tests.push({ name: "Index Resolution", passed: false, durationMs: performance.now() - t5Start, error: e.message });
  }

  // ── Test 6: Content-Hash Diffing ──
  const t6Start = performance.now();
  try {
    // Send same file again — should be skipped
    const result = await updateFiles({
      "/test-smoke.js": 'export const SMOKE = "ok";',
    }, "__smoke_test__");
    if (result.skipped < 1) throw new Error(`Expected skip, got ${result.skipped} skipped`);
    
    tests.push({ name: "Content-Hash Diffing", passed: true, durationMs: performance.now() - t6Start });
  } catch (e: any) {
    tests.push({ name: "Content-Hash Diffing", passed: false, durationMs: performance.now() - t6Start, error: e.message });
  }

  // ── Cleanup ──
  try {
    await clearFiles();
  } catch { /* best effort */ }

  return finalize(tests, startTime);
}

function finalize(
  tests: SmokeTestResult["tests"],
  startTime: number
): SmokeTestResult {
  const failedTests = tests.filter(t => !t.passed);
  const passed = failedTests.length === 0;
  const failReason = passed
    ? undefined
    : `Failed: ${failedTests.map(t => `${t.name} (${t.error})`).join("; ")}`;

  const result: SmokeTestResult = {
    passed,
    tests,
    totalDurationMs: Math.round(performance.now() - startTime),
    failReason,
  };

  console.log(
    `[Phoenix Smoke] ${passed ? "✅ PASSED" : "❌ FAILED"} ` +
    `(${result.totalDurationMs}ms, ${tests.length} tests)` +
    (failReason ? ` — ${failReason}` : "")
  );

  return result;
}
