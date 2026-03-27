/**
 * Hybrid Gap-Fill Pass
 * 
 * Phase 2 core: After template hydration, diff user request against
 * template capabilities and only invoke AI for the delta.
 * 
 * Template structure (layout, routing, navigation) is NEVER regenerated.
 * AI only fills: custom fields, renamed entities, domain-specific logic,
 * business rules not covered by the template.
 */

import type { SchemaEntity } from "./projectIdentity";

export interface GapAnalysis {
  /** Template covers the request fully — no AI needed */
  fullyCovered: boolean;
  /** Specific gaps the AI must fill */
  gaps: GapItem[];
  /** Template files that should NOT be touched by AI */
  protectedFiles: string[];
  /** Prompt fragment for AI with only the gap context */
  gapPrompt: string;
}

export interface GapItem {
  type: "custom_entity" | "custom_field" | "custom_route" | "business_logic" | "styling" | "integration";
  description: string;
  /** Which template file to extend (if applicable) */
  targetFile?: string;
}

// Entity names commonly found in CRM-type templates
const CRM_ENTITIES = new Set(["contacts", "deals", "activities", "accounts", "leads", "pipeline", "tasks"]);
const DASHBOARD_ENTITIES = new Set(["metrics", "charts", "widgets", "reports", "analytics"]);
const ECOMMERCE_ENTITIES = new Set(["products", "orders", "customers", "cart", "inventory", "categories"]);

// Patterns that indicate custom requirements beyond template
const CUSTOM_FIELD_PATTERN = /\b(?:add|include|with)\s+(?:a\s+)?(?:custom\s+)?(?:field|column|property|attribute)\s+(?:called|named|for)\s+["']?(\w+)["']?/gi;
const CUSTOM_ENTITY_PATTERN = /\b(?:add|include|with)\s+(?:a\s+)?(\w+)\s+(?:table|entity|module|section|page)\b/gi;
const INTEGRATION_PATTERN = /\b(?:integrate|connect|sync)\s+(?:with\s+)?(\w+)/gi;
const STYLING_PATTERN = /\b(?:dark\s+theme|light\s+theme|blue|green|red|purple|orange|minimalist|modern|corporate|playful)\b/gi;

/**
 * Analyze the gap between what the template provides and what the user wants.
 */
export function analyzeGaps(
  userText: string,
  templateEntities: SchemaEntity[],
  templateFiles: Record<string, string>,
): GapAnalysis {
  const gaps: GapItem[] = [];
  const protectedFiles: string[] = [];

  const templateEntityNames = new Set(templateEntities.map(e => e.name.toLowerCase()));
  const lowerText = userText.toLowerCase();

  // 1. Check for custom entities not in template
  let match;
  CUSTOM_ENTITY_PATTERN.lastIndex = 0;
  while ((match = CUSTOM_ENTITY_PATTERN.exec(lowerText)) !== null) {
    const entityName = match[1].toLowerCase();
    if (!templateEntityNames.has(entityName) && !isCommonWord(entityName)) {
      gaps.push({
        type: "custom_entity",
        description: `Add "${entityName}" entity not present in template`,
      });
    }
  }

  // 2. Check for custom fields
  CUSTOM_FIELD_PATTERN.lastIndex = 0;
  while ((match = CUSTOM_FIELD_PATTERN.exec(lowerText)) !== null) {
    gaps.push({
      type: "custom_field",
      description: `Add custom field "${match[1]}"`,
    });
  }

  // 3. Check for integrations
  INTEGRATION_PATTERN.lastIndex = 0;
  while ((match = INTEGRATION_PATTERN.exec(lowerText)) !== null) {
    gaps.push({
      type: "integration",
      description: `Integration with ${match[1]}`,
    });
  }

  // 4. Check for styling requests
  STYLING_PATTERN.lastIndex = 0;
  while ((match = STYLING_PATTERN.exec(lowerText)) !== null) {
    gaps.push({
      type: "styling",
      description: `Apply styling: ${match[0]}`,
    });
  }

  // 5. Check for business logic keywords
  const businessLogicPatterns = [
    /\b(?:when|if|rule|workflow|automate|trigger|notify|email|sms|webhook)\b/gi,
    /\b(?:discount|tax|shipping|payment|subscription|recurring)\b/gi,
    /\b(?:approval|review|escalate|assign|delegate)\b/gi,
  ];
  for (const pattern of businessLogicPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(lowerText)) {
      gaps.push({
        type: "business_logic",
        description: `Custom business logic detected in request`,
      });
      break;
    }
  }

  // Protected files: layout, navigation, routing — never regenerated
  for (const filePath of Object.keys(templateFiles)) {
    const lower = filePath.toLowerCase();
    if (
      lower.includes("sidebar") ||
      lower.includes("header") ||
      lower.includes("layout") ||
      lower.includes("app.jsx") ||
      lower.includes("app.tsx") ||
      lower.includes("globals.css") ||
      lower.includes("/styles/") ||
      lower.includes("/hooks/useapi")
    ) {
      protectedFiles.push(filePath);
    }
  }

  const fullyCovered = gaps.length === 0;

  // Build gap prompt
  let gapPrompt = "";
  if (!fullyCovered) {
    const gapList = gaps.map(g => `- [${g.type}] ${g.description}`).join("\n");
    gapPrompt = `## GAP-FILL INSTRUCTIONS

The template already provides the core structure. You MUST NOT regenerate:
${protectedFiles.map(f => `- ${f}`).join("\n")}

Only implement these specific gaps:
${gapList}

RULES:
1. Do NOT modify layout, sidebar, header, or navigation structure
2. Do NOT change the CSS theme or global styles unless a styling gap is listed
3. Add new components as separate files
4. Extend existing data hooks — do not replace them
5. Preserve all template entity schemas — only add new fields/entities
`;
  }

  return { fullyCovered, gaps, protectedFiles, gapPrompt };
}

const COMMON_WORDS = new Set([
  "a", "an", "the", "my", "new", "custom", "simple", "basic", "full",
  "good", "nice", "cool", "great", "beautiful", "modern", "clean",
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase());
}

/**
 * Merge gap-fill AI output with template files.
 * Template files take precedence for protected paths.
 */
export function mergeGapFillResult(
  templateFiles: Record<string, string>,
  aiFiles: Record<string, string>,
  protectedFiles: string[],
): Record<string, string> {
  const merged = { ...templateFiles };
  const protectedSet = new Set(protectedFiles.map(f => f.toLowerCase()));

  for (const [path, content] of Object.entries(aiFiles)) {
    if (protectedSet.has(path.toLowerCase())) {
      console.log(`[GapFill] Skipping protected file: ${path}`);
      continue;
    }
    merged[path] = content;
  }

  return merged;
}
