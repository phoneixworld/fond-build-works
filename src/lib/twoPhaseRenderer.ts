// src/lib/twoPhaseRenderer.ts

import type { IR, IRPage } from "./ir";

/**
 * Generates route wrappers for every page that implement:
 * 1. Instant skeleton rendering (0–50ms)
 * 2. Two-phase rendering (stub → hydrated)
 * 3. Global timeout → friendly "thinking" screen
 * 4. Optimistic navigation support
 */
export function generateRouteWrappers(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  // Generate individual page wrappers
  for (const page of ir.pages) {
    const safeName = page.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || page.name;
    files[`/routes/${safeName}Route.jsx`] = generateRouteWrapper(page, safeName);
  }

  // Generate stub data helper
  files["/lib/stubData.jsx"] = generateStubDataHelper();

  // Generate the useHydration hook
  files["/hooks/useHydration.jsx"] = generateHydrationHook();

  // Generate the useLoadingTimeout hook
  files["/hooks/useLoadingTimeout.jsx"] = generateLoadingTimeoutHook();

  return files;
}

/* -------------------------------------------------------------------------- */
/*                           ROUTE WRAPPER                                     */
/* -------------------------------------------------------------------------- */

function generateRouteWrapper(page: IRPage, safeName: string): string {
  const skeletonName = `${safeName}Skeleton`;
  const entityHook = page.entity ? `use${page.entity}s` : null;

  return `
import React, { Suspense } from "react";
import ${skeletonName} from "../components/skeletons/${skeletonName}";
import ThinkingScreen from "../components/skeletons/ThinkingScreen";
import { useHydration } from "../hooks/useHydration";
import { useLoadingTimeout } from "../hooks/useLoadingTimeout";
import ${safeName} from "../pages/${safeName}";

function ${safeName}Route() {
  const { data, isHydrated, isLoading } = useHydration("${safeName}"${entityHook ? `, "${page.entity}"` : ""});
  const showThinking = useLoadingTimeout(isLoading, 1500);

  // Phase 0: Skeleton (0–50ms)
  if (isLoading && !showThinking) {
    return <${skeletonName} />;
  }

  // Timeout: Friendly thinking screen (>1.5s)
  if (isLoading && showThinking) {
    return <ThinkingScreen />;
  }

  // Phase 1 (fast): Stub data, not hydrated
  // Phase 2 (slow): Real data, hydrated
  return <${safeName} data={data} isHydrated={isHydrated} />;
}

export default ${safeName}Route;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                          STUB DATA HELPER                                   */
/* -------------------------------------------------------------------------- */

function generateStubDataHelper(): string {
  return `
// Provides empty/stub data structures for two-phase rendering.
// Phase 1 renders with stubs, Phase 2 replaces with real data.

function createStubData(pageType) {
  switch (pageType) {
    case "dashboard":
      return {
        stats: [
          { label: "—", value: "—", trend: "" },
          { label: "—", value: "—", trend: "" },
          { label: "—", value: "—", trend: "" },
          { label: "—", value: "—", trend: "" },
        ],
        activities: [],
        charts: { labels: [], datasets: [] },
      };
    case "list":
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      };
    case "view":
      return {
        item: {},
        related: [],
      };
    case "create":
    case "edit":
      return {
        item: {},
        schema: {},
      };
    default:
      return {};
  }
}

function isStubData(data) {
  if (!data) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  if (typeof data === "object" && Object.keys(data).length === 0) return true;
  return false;
}

export { createStubData, isStubData };
export default createStubData;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                          HYDRATION HOOK                                      */
/* -------------------------------------------------------------------------- */

function generateHydrationHook(): string {
  return `
import { useState, useEffect, useCallback } from "react";
import { createStubData } from "../lib/stubData";

function useHydration(pageName, entityName) {
  const [data, setData] = useState(() => createStubData(pageName));
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Phase 1: Render with stub data immediately
    setIsLoading(true);
    setIsHydrated(false);
    setData(createStubData(pageName));

    // Simulate brief setup time, then mark as "stub ready"
    const stubTimer = setTimeout(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    }, 50);

    // Phase 2: Load real data
    const hydrateAsync = async () => {
      try {
        // Allow the page context/hook to provide data
        // This will be replaced by real data fetching in entity contexts
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!cancelled) {
          setIsHydrated(true);
        }
      } catch (err) {
        console.error("[Hydration] Error hydrating " + pageName, err);
        if (!cancelled) {
          setIsHydrated(true); // Mark as hydrated even on error to unblock UI
        }
      }
    };

    hydrateAsync();

    return () => {
      cancelled = true;
      clearTimeout(stubTimer);
    };
  }, [pageName, entityName]);

  return { data, isHydrated, isLoading };
}

export { useHydration };
export default useHydration;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                       LOADING TIMEOUT HOOK                                  */
/* -------------------------------------------------------------------------- */

function generateLoadingTimeoutHook(): string {
  return `
import { useState, useEffect } from "react";

/**
 * Returns true if isLoading has been true for longer than timeoutMs.
 * Used to show "Nimbus is preparing..." after 1.5s of loading.
 */
function useLoadingTimeout(isLoading, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 1500;
  const [showThinking, setShowThinking] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowThinking(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowThinking(true);
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  return showThinking;
}

export { useLoadingTimeout };
export default useLoadingTimeout;
`.trim();
}
