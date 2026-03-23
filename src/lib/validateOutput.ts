/**
 * Output Validation — static pattern scanner for build output quality.
 * 
 * Scans generated files for forbidden patterns (mock data, localStorage auth)
 * and required patterns (Supabase calls, migrations, RLS policies).
 * 
 * Used post-build to reject code that doesn't meet backend quality standards.
 */

export interface ValidationResult {
  valid: boolean;
  forbiddenViolations: ForbiddenViolation[];
  missingRequirements: string[];
  score: number; // 0-100, 100 = perfect
}

export interface ForbiddenViolation {
  file: string;
  pattern: string;
  line: number;
  context: string;
}

// ─── Forbidden Patterns ────────────────────────────────────────────────────
// These patterns indicate the build agent generated mock/fake backend code

const FORBIDDEN_PATTERNS: Array<{ regex: RegExp; label: string; fileFilter?: RegExp }> = [
  {
    regex: /localStorage\.(?:set|get)Item\s*\(\s*["'](?:token|auth|session|user|jwt)/i,
    label: "localStorage used for auth/session persistence",
    fileFilter: /\.(jsx?|tsx?)$/,
  },
  {
    regex: /const\s+(?:mock|fake|dummy|sample|seed|initial)(?:Data|Users?|Items?|Records?|Contacts?|Tasks?|Orders?|Products?)\s*=\s*\[/i,
    label: "Mock/fake/sample data array as primary data source",
    fileFilter: /\.(jsx?|tsx?)$/,
  },
  {
    regex: /const\s+SAMPLE_DATA\s*=\s*\[/,
    label: "SAMPLE_DATA inline array (must use Data API instead)",
    fileFilter: /\.(jsx?|tsx?)$/,
  },
  {
    regex: /(?:const|let|var)\s+\w*[Dd]ata\s*=\s*\[\s*\{[^}]*id\s*:\s*["']\d+["']/,
    label: "Hardcoded data array with string IDs (mock persistence)",
    fileFilter: /(?:\/pages\/|\/hooks\/).*\.(jsx?|tsx?)$/,
  },
  {
    regex: /uuidv4\(\)\s*(?:,|\})/,
    label: "uuidv4() used as primary persistence key (not backed by DB)",
    fileFilter: /\/hooks\/.*\.(jsx?|tsx?)$/,
  },
  {
    regex: /(?:const|let)\s+\[.*,\s*set\w+\]\s*=\s*useState\s*\(\s*\[[\s\S]{20,200}\{[\s\S]{10,100}id\s*:/,
    label: "useState with inline data array (in-memory persistence)",
    fileFilter: /(?:\/pages\/|\/hooks\/).*\.(jsx?|tsx?)$/,
  },
  {
    regex: /setData\(\s*(?:SAMPLE_DATA|sampleData|mockData|fakeData|initialData)\s*\)/,
    label: "Fallback to inline data array instead of real API",
    fileFilter: /\.(jsx?|tsx?)$/,
  },
];

// ─── Required Patterns ─────────────────────────────────────────────────────
// These patterns MUST be present when backend intent is detected

const REQUIRED_PATTERNS: Array<{ regex: RegExp; label: string; fileFilter?: RegExp }> = [
  {
    regex: /(?:from|supabase)\s*\(\s*["'][a-z_]+["']\s*\)|project-api|project-auth|\/functions\/v1\//,
    label: "Supabase/Data API call (supabase.from() or project-api)",
  },
  {
    regex: /CREATE\s+TABLE|create\s+table/,
    label: "SQL CREATE TABLE statement",
    fileFilter: /\.sql$/,
  },
  {
    regex: /CREATE\s+POLICY|create\s+policy|ROW\s+LEVEL\s+SECURITY|row\s+level\s+security/i,
    label: "RLS policy definition",
    fileFilter: /\.sql$/,
  },
];

// ─── Detection ─────────────────────────────────────────────────────────────

/**
 * Detects if the generated output has backend intent
 * (i.e., the user asked for CRUD, auth, data persistence)
 */
export function detectBackendIntent(files: Record<string, string>, userPrompt: string): boolean {
  const promptLower = userPrompt.toLowerCase();
  const backendKeywords = [
    "crud", "database", "auth", "login", "signup", "sign up",
    "persist", "save", "store", "backend", "api", "table",
    "users", "admin", "dashboard with data", "manage",
    "create, read, update, delete", "add and edit",
    "file upload", "upload", "comments", "relations",
    "role", "access control", "rbac", "permission",
    "real-time", "realtime", "notification", "websocket",
    "crm", "contact", "contacts", "customer", "customers",
    "lead", "leads", "pipeline", "opportunity", "opportunities",
    "invoice", "invoices", "orders", "inventory", "kanban",
  ];

  if (backendKeywords.some(kw => promptLower.includes(kw))) return true;

  const hasEntityCrudIntent = /(contact|customer|lead|invoice|order|task)s?/.test(promptLower)
    && /(add|create|edit|update|manage|dashboard|list|track)/.test(promptLower);
  if (hasEntityCrudIntent) return true;

  // Check if generated code references data operations
  const allCode = Object.values(files).join("\n");
  if (/project-api|project-auth|supabase\.from|CREATE TABLE/i.test(allCode)) return true;

  // Check for entity hooks
  const hasHooks = Object.keys(files).some(f => /\/hooks\/use\w+\.(js|ts)x?$/.test(f));
  if (hasHooks) return true;

  return false;
}

// ─── Main Validator ────────────────────────────────────────────────────────

/**
 * Validates build output against forbidden and required patterns.
 * Returns a result with violations and missing requirements.
 */
export function validateBuildOutput(
  files: Record<string, string>,
  userPrompt: string
): ValidationResult {
  const forbiddenViolations: ForbiddenViolation[] = [];
  const hasBackendIntent = detectBackendIntent(files, userPrompt);

  // Scan for forbidden patterns
  for (const [filePath, code] of Object.entries(files)) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.fileFilter && !pattern.fileFilter.test(filePath)) continue;

      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (pattern.regex.test(lines[i])) {
          forbiddenViolations.push({
            file: filePath,
            pattern: pattern.label,
            line: i + 1,
            context: lines[i].trim().slice(0, 120),
          });
        }
      }
    }
  }

  // Check required patterns only if backend intent is detected
  const missingRequirements: string[] = [];
  if (hasBackendIntent) {
    const allCode = Object.values(files).join("\n");
    const allFilePaths = Object.keys(files);

    for (const req of REQUIRED_PATTERNS) {
      if (req.fileFilter) {
        // Check only matching files
        const matchingFiles = allFilePaths.filter(f => req.fileFilter!.test(f));
        const found = matchingFiles.some(f => req.regex.test(files[f]));
        if (!found && matchingFiles.length === 0) {
          // No matching files exist at all
          missingRequirements.push(`${req.label} — no matching files found`);
        } else if (!found) {
          missingRequirements.push(req.label);
        }
      } else {
        if (!req.regex.test(allCode)) {
          missingRequirements.push(req.label);
        }
      }
    }

    // Check for migration files
    const hasMigration = allFilePaths.some(f => /migration|\.sql$/i.test(f));
    if (!hasMigration) {
      missingRequirements.push("Migration SQL file (migrations/*.sql)");
    }

    // Check for schema.json
    const hasSchema = allFilePaths.some(f => /schema\.json$/i.test(f));
    if (!hasSchema) {
      missingRequirements.push("Schema definition file (schema.json)");
    }
  }

  // Calculate score
  const forbiddenPenalty = forbiddenViolations.length * 15;
  const missingPenalty = missingRequirements.length * 20;
  const score = Math.max(0, 100 - forbiddenPenalty - missingPenalty);

  return {
    valid: forbiddenViolations.length === 0 && missingRequirements.length === 0,
    forbiddenViolations,
    missingRequirements,
    score,
  };
}

/**
 * Format validation result as retry context for the build agent
 */
export function formatValidationRetryContext(result: ValidationResult): string {
  let context = `🔴 BUILD OUTPUT VALIDATION FAILED (Score: ${result.score}/100)\n\n`;

  if (result.forbiddenViolations.length > 0) {
    context += `## FORBIDDEN PATTERN VIOLATIONS:\n`;
    for (const v of result.forbiddenViolations) {
      context += `- ${v.file}:${v.line} — ${v.pattern}\n  Code: \`${v.context}\`\n`;
    }
    context += `\n`;
  }

  if (result.missingRequirements.length > 0) {
    context += `## MISSING REQUIRED ARTIFACTS:\n`;
    for (const r of result.missingRequirements) {
      context += `- ❌ ${r}\n`;
    }
    context += `\n`;
  }

  context += `## FIX INSTRUCTIONS:\n`;
  context += `1. Replace ALL localStorage auth with project-auth API calls\n`;
  context += `2. Replace ALL mock data arrays with Data API hooks (project-api)\n`;
  context += `3. Add SQL migration files (CREATE TABLE + RLS policies)\n`;
  context += `4. Add schema.json describing the data model\n`;
  context += `5. Ensure every hook calls the real backend, with sample data ONLY as fallback\n`;

  return context;
}
