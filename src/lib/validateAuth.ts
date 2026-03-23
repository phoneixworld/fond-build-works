/**
 * Auth Conformance Validator — Ensures generated auth code follows canonical patterns.
 * 
 * Checks:
 * 1. Auth pages import from phoenix/auth (or canonical auth.client)
 * 2. ProtectedRoute is used for guarded routes
 * 3. Session is read via useSession hook (not custom logic)
 * 4. No forbidden auth patterns (localStorage tokens, custom JWT, bcrypt)
 * 5. supabase.auth.* is used for all auth operations
 */

export interface AuthValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
}

const REQUIRED_AUTH_PATTERNS = [
  { pattern: /supabase\.auth\./i, name: "supabase.auth usage" },
  { pattern: /signInWithPassword|signUp|signOut|getSession|onAuthStateChange/i, name: "Supabase auth methods" },
];

const FORBIDDEN_AUTH_PATTERNS = [
  { pattern: /localStorage\.setItem\s*\(\s*['"`](?:token|auth|session|jwt)/i, name: "localStorage token storage" },
  { pattern: /localStorage\.getItem\s*\(\s*['"`](?:token|auth|session|jwt)/i, name: "localStorage token retrieval" },
  { pattern: /bcrypt|bcryptjs/i, name: "client-side bcrypt (use Supabase Auth)" },
  { pattern: /jsonwebtoken|jwt\.sign|jwt\.verify/i, name: "custom JWT implementation" },
  { pattern: /crypto\.createHmac/i, name: "custom HMAC auth" },
  { pattern: /fakeUser|mockUser|hardcodedPassword/i, name: "fake/mock auth data" },
  { pattern: /password\s*===\s*['"`]/i, name: "hardcoded password comparison" },
  { pattern: /role\s*===?\s*['"`]admin['"`]\s*\|\|\s*email/i, name: "hardcoded admin check" },
];

const REQUIRED_AUTH_FILES = [
  { pattern: /auth\.client|authClient|supabaseClient/i, name: "Auth client module" },
  { pattern: /useSession|useAuth/i, name: "Session/Auth hook" },
  { pattern: /ProtectedRoute|AuthGuard|RequireAuth/i, name: "Route guard component" },
  { pattern: /LoginPage|SignIn|Login/i, name: "Login page" },
];

/**
 * Validate auth conformance across all generated files.
 */
export function validateAuthConformance(
  files: Record<string, string>,
  prompt: string
): AuthValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  const allContent = Object.values(files).join("\n");
  const hasAuthIntent = detectAuthIntent(prompt);

  if (!hasAuthIntent) {
    return { valid: true, errors: [], warnings: [], score: 100 };
  }

  // 1. Check required auth patterns exist
  for (const req of REQUIRED_AUTH_PATTERNS) {
    if (!req.pattern.test(allContent)) {
      errors.push(`Missing required auth pattern: ${req.name}`);
      score -= 15;
    }
  }

  // 2. Check for forbidden patterns
  for (const [filePath, content] of Object.entries(files)) {
    for (const forbidden of FORBIDDEN_AUTH_PATTERNS) {
      if (forbidden.pattern.test(content)) {
        errors.push(`Forbidden auth pattern in ${filePath}: ${forbidden.name}`);
        score -= 20;
      }
    }
  }

  // 3. Check required auth files exist
  const fileNames = Object.keys(files).join("\n");
  for (const req of REQUIRED_AUTH_FILES) {
    if (!req.pattern.test(fileNames) && !req.pattern.test(allContent)) {
      warnings.push(`Missing auth file/import: ${req.name}`);
      score -= 5;
    }
  }

  // 4. Check session handling
  if (allContent.includes("useState") && allContent.includes("user")) {
    if (!allContent.includes("onAuthStateChange") && !allContent.includes("getSession")) {
      warnings.push("Auth state managed without onAuthStateChange or getSession — may not persist across refreshes");
      score -= 10;
    }
  }

  // 5. Check ProtectedRoute usage
  const hasProtectedRoutes = /Route.*element.*Protected|ProtectedRoute|AuthGuard|RequireAuth/i.test(allContent);
  if (!hasProtectedRoutes) {
    warnings.push("No ProtectedRoute/AuthGuard found — authenticated routes may be unprotected");
    score -= 5;
  }

  // 6. Role-based checks
  if (prompt.toLowerCase().includes("role") || prompt.toLowerCase().includes("admin")) {
    if (!allContent.includes("user_roles") && !allContent.includes("has_role")) {
      warnings.push("Role-based intent detected but no user_roles table or has_role function found");
      score -= 10;
    }
  }

  score = Math.max(0, score);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score,
  };
}

/**
 * Detect if a prompt implies authentication needs.
 */
export function detectAuthIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const authKeywords = [
    "auth", "login", "signup", "sign in", "sign up", "register",
    "password", "session", "protected", "role", "admin", "permission",
    "user account", "user profile", "access control", "rbac",
    "logout", "sign out", "forgot password", "reset password",
  ];
  return authKeywords.some(kw => lower.includes(kw));
}
