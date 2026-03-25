// src/lib/preloadGenerator.ts

import type { IR } from "./ir";

/**
 * Generates predictive preloading, background warmers,
 * and optimistic navigation utilities.
 *
 * Requirements implemented:
 * 3. Predictive preloading (routes + data + components)
 * 5. Background warmers (auth, project, components, routes)
 * 6. Optimistic navigation (navigate instantly, skeleton, hydrate later)
 */
export function generatePreloadFiles(ir: IR): Record<string, string> {
  const files: Record<string, string> = {};

  // Preload registry
  files["/lib/preloadRegistry.jsx"] = generatePreloadRegistry(ir);

  // Background warmers
  files["/hooks/useBackgroundWarmers.ts"] = generateBackgroundWarmers(ir);

  // Enhanced sidebar with preloading
  files["/layout/PreloadingSidebar.tsx"] = generatePreloadingSidebar(ir);

  return files;
}

/* -------------------------------------------------------------------------- */
/*                         PRELOAD REGISTRY                                    */
/* -------------------------------------------------------------------------- */

function generatePreloadRegistry(ir: IR): string {
  const pageEntries = ir.pages.map(p => {
    const safeName = p.name.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || p.name;
    return `  "${p.path}": {
    component: () => import("../pages/${safeName}"),
    skeleton: () => import("../components/skeletons/${safeName}Skeleton"),
    data: ${p.entity ? `() => fetch("/api/${p.entity.toLowerCase()}s")` : "null"},
  }`;
  });

  return `
// Predictive preload registry — maps routes to lazy loaders.
// Sidebar/nav links trigger preloading on mouse enter.

const preloadCache = new Map();

const ROUTE_REGISTRY = {
${pageEntries.join(",\n")}
};

/**
 * Preload a route's component bundle + skeleton + data.
 * Safe to call multiple times — deduplicates via cache.
 */
function preloadRoute(path) {
  if (preloadCache.has(path)) return;

  const entry = ROUTE_REGISTRY[path];
  if (!entry) return;

  preloadCache.set(path, true);

  // A. Component preloading
  if (entry.component) {
    entry.component().catch(() => {});
  }

  // B. Skeleton preloading
  if (entry.skeleton) {
    entry.skeleton().catch(() => {});
  }

  // C. Data preloading (fire-and-forget)
  if (entry.data) {
    entry.data().catch(() => {});
  }
}

/**
 * Preload all routes in the background.
 * Called after initial render to warm the cache.
 */
function preloadAllRoutes() {
  // Stagger preloads to avoid blocking main thread
  const paths = Object.keys(ROUTE_REGISTRY);
  paths.forEach((path, index) => {
    setTimeout(() => preloadRoute(path), 200 * (index + 1));
  });
}

/**
 * Get onMouseEnter handler for a nav link.
 */
function getPreloadHandler(path) {
  return () => preloadRoute(path);
}

export { preloadRoute, preloadAllRoutes, getPreloadHandler, ROUTE_REGISTRY };
export default preloadRoute;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                       BACKGROUND WARMERS                                    */
/* -------------------------------------------------------------------------- */

function generateBackgroundWarmers(ir: IR): string {
  const contextWarmers = ir.contexts.map(c => {
    if (c.name === "AuthContext") {
      return `    warmAuth,`;
    }
    return `    // warm${c.name.replace("Context", "")},`;
  });

  return `
import { useEffect, useRef } from "react";
import { preloadAllRoutes } from "../lib/preloadRegistry";

/**
 * Background warmers — fire on app load to pre-populate:
 * - Auth context
 * - Project metadata
 * - Component registry (route lazy imports)
 * - Routing graph
 */
function useBackgroundWarmers() {
  const warmed = useRef(false);

  useEffect(() => {
    if (warmed.current) return;
    warmed.current = true;

    // Stagger warmers to avoid contention
    const warmers = [
      warmAuth,
      warmProjectMetadata,
      warmComponents,
      warmRoutes,
    ];

    warmers.forEach((fn, i) => {
      setTimeout(() => {
        try { fn(); } catch (e) { console.warn("[Warmer] Failed:", e); }
      }, 100 * (i + 1));
    });
  }, []);
}

function warmAuth() {
  // Touch auth state to trigger session refresh
  try {
    const stored = typeof localStorage !== "undefined"
      ? localStorage.getItem("auth_session")
      : null;
    if (stored) {
      JSON.parse(stored); // validate
    }
  } catch (e) {
    // no-op
  }
}

function warmProjectMetadata() {
  // Pre-fetch project metadata if API available
  if (typeof fetch !== "undefined") {
    fetch("/api/project/metadata").catch(() => {});
  }
}

function warmComponents() {
  // Trigger route preloading
  preloadAllRoutes();
}

function warmRoutes() {
  // Pre-resolve route graph (no-op if already cached by preloadAllRoutes)
  preloadAllRoutes();
}

export { useBackgroundWarmers };
export default useBackgroundWarmers;
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                       PRELOADING SIDEBAR                                    */
/* -------------------------------------------------------------------------- */

function generatePreloadingSidebar(ir: IR): string {
  return `
import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { getPreloadHandler } from "../lib/preloadRegistry";

/**
 * Enhanced sidebar with predictive preloading.
 * - onMouseEnter triggers component + data preloading
 * - onClick navigates optimistically (skeleton renders immediately)
 */
function PreloadingSidebar({ navigation }) {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const handleOptimisticNav = (path, e) => {
    // Optimistic navigation: navigate instantly
    // The route wrapper will show skeleton → stub → hydrated
    navigate(path);
  };

  return (
    <aside
      className={\`
        bg-card border-r border-border
        flex flex-col
        h-full
        transition-all duration-300
        \${open ? "w-64" : "w-16"}
      \`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <span className="font-bold text-lg truncate">
          {open ? "Nimbus App" : "N"}
        </span>
        <button
          className="md:hidden p-2 rounded hover:bg-accent"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Navigation with preloading */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navigation.map((item) => {
          const active = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onMouseEnter={getPreloadHandler(item.path)}
              onClick={(e) => handleOptimisticNav(item.path, e)}
              className={\`
                flex items-center gap-3 px-3 py-2 rounded-md
                text-sm font-medium transition-colors
                \${active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}
              \`}
            >
              {item.icon && (
                <span className="w-5 h-5 flex items-center justify-center">
                  {React.createElement(require("lucide-react")[item.icon] || require("lucide-react").Circle)}
                </span>
              )}
              {open && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border text-xs text-muted-foreground">
        {open && "© Nimbus"}
      </div>
    </aside>
  );
}

export default PreloadingSidebar;
`.trim();
}
