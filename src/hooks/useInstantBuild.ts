/**
 * useInstantBuild — Instant template detection and hydration.
 * Returns hydrated template files for immediate preview.
 * The compile() pipeline handles polish, verification, and repair.
 */

import { useCallback } from "react";
import type { PageTemplate } from "@/lib/pageTemplates";

export interface InstantBuildResult {
  files: Record<string, string>;
  deps: Record<string, string>;
  templateName: string;
}

export interface InstantBuildConfig {
  currentProject: any;
}

export function useInstantBuild(config: InstantBuildConfig) {
  const { currentProject } = config;

  const tryInstantBuild = useCallback(
    async (
      template: PageTemplate | null,
      userText: string,
    ): Promise<InstantBuildResult | null> => {
      // Guard: Don't use instant templates for long requirement documents
      if (userText.length > 3000) {
        console.log("[InstantBuild] Skipping instant path — input too long for template customization");
        return null;
      }

      if (!template) {
        console.log("[InstantBuild] No template matched — skipping instant path");
        return null;
      }

      try {
        const { findInstantTemplate, hydrateTemplate } = await import("@/lib/instantTemplates");
        const instantTemplate = findInstantTemplate(template.id);
        if (!instantTemplate) {
          console.log("[InstantBuild] No instant template variant found — falling back to full build");
          return null;
        }

        const promptDesc = userText.replace(/^\s*(build|create|make)\s+/i, "").trim();
        const projectName = currentProject.name || "My App";

        const hydrated = hydrateTemplate(
          instantTemplate,
          projectName,
          promptDesc || "Build applications at the speed of thought",
        );

        const files = { ...hydrated.files };

        const { getSharedUIComponents, getDomainComponents, getGlobalStyles, getUseApiHook } =
          await import("@/lib/templates/scaffoldTemplates");

        const uiComponents = getSharedUIComponents();
        const domainComponents = getDomainComponents();

        for (const [path, code] of Object.entries(uiComponents)) {
          if (!files[path]) files[path] = code;
        }
        for (const [path, code] of Object.entries(domainComponents)) {
          if (!files[path]) files[path] = code;
        }
        if (!files["/styles/globals.css"] || files["/styles/globals.css"].length < 500) {
          files["/styles/globals.css"] = getGlobalStyles();
        }
        if (!files["/hooks/useApi.js"]) {
          files["/hooks/useApi.js"] = getUseApiHook();
        }

        console.log(`[InstantBuild] ⚡ Template "${template.name}": ${Object.keys(files).length} files hydrated`);

        return {
          files,
          deps: hydrated.deps,
          templateName: template.name,
        };
      } catch (err) {
        console.error("[InstantBuild] Template hydration failed:", err);
        return null;
      }
    },
    [currentProject],
  );

  return { tryInstantBuild };
}
