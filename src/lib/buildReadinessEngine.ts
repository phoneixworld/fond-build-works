/**
 * Build Readiness Engine — Compiler-style validation
 * 
 * Client-side complement to the server-side readiness compiler.
 * Provides instant feedback before server round-trip.
 * 
 * Not "user said build it" — real logic:
 * - Are all required IR fields present?
 * - Are there missing entities?
 * - Are workflows incomplete?
 * - Are roles unresolved?
 * - Are UI components underspecified?
 * - Are constraints missing?
 */

import type { IRState, IRRoute, IRDataModel, IRAuthConfig } from "./irTypes";

export interface ReadinessCheck {
  name: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  category: "routes" | "data" | "auth" | "ui" | "workflows" | "constraints";
}

export interface BuildReadinessResult {
  isReady: boolean;
  score: number;
  checks: ReadinessCheck[];
  missingFields: string[];
  incompleteWorkflows: string[];
  unresolvedRoles: string[];
  underspecifiedComponents: string[];
  missingConstraints: string[];
  recommendation: string;
}

/**
 * Compile build readiness from IR state + accumulated requirements
 */
export function compileBuildReadiness(
  irState: IRState | null,
  requirementPhases: Array<{ rawText: string; parsed?: any }>,
  mergedNormalized?: Record<string, any>
): BuildReadinessResult {
  const checks: ReadinessCheck[] = [];
  const missingFields: string[] = [];
  const incompleteWorkflows: string[] = [];
  const unresolvedRoles: string[] = [];
  const underspecifiedComponents: string[] = [];
  const missingConstraints: string[] = [];

  // ─── Check 1: Requirements exist ───
  checks.push({
    name: "requirements_exist",
    passed: requirementPhases.length > 0,
    severity: "error",
    message: requirementPhases.length > 0
      ? `${requirementPhases.length} requirement phase(s) captured`
      : "No requirements captured yet",
    category: "constraints",
  });

  // ─── Check 2: Routes defined ───
  const routes = irState?.routes || [];
  checks.push({
    name: "routes_defined",
    passed: routes.length > 0,
    severity: routes.length > 0 ? "info" : "warning",
    message: routes.length > 0
      ? `${routes.length} route(s) defined`
      : "No routes defined — will be auto-generated",
    category: "routes",
  });

  // ─── Check 3: Routes have components ───
  const routesWithoutComponents = routes.filter(r => !r.component && !r.description);
  if (routes.length > 0) {
    checks.push({
      name: "routes_specified",
      passed: routesWithoutComponents.length === 0,
      severity: "warning",
      message: routesWithoutComponents.length === 0
        ? "All routes have component or description"
        : `${routesWithoutComponents.length} route(s) need component specifications`,
      category: "routes",
    });
  }

  // ─── Check 4: Data models defined ───
  const models = irState?.dataModels || [];
  checks.push({
    name: "data_models_defined",
    passed: models.length > 0,
    severity: "warning",
    message: models.length > 0
      ? `${models.length} data model(s) defined`
      : "No data models — persistence will be auto-inferred",
    category: "data",
  });

  // ─── Check 5: Model fields complete ───
  for (const model of models) {
    if (model.fields.length < 2) {
      missingFields.push(`${model.collectionName}: only ${model.fields.length} field(s) — needs at least a name and one attribute`);
    }

    // Check for required field types
    const hasNameOrTitle = model.fields.some(f =>
      f.name === "name" || f.name === "title" || f.name === "label"
    );
    if (!hasNameOrTitle) {
      missingFields.push(`${model.collectionName}: missing a primary display field (name/title/label)`);
    }
  }
  if (models.length > 0) {
    checks.push({
      name: "model_fields_complete",
      passed: missingFields.length === 0,
      severity: "warning",
      message: missingFields.length === 0
        ? "All data models have sufficient fields"
        : `${missingFields.length} issue(s) with model field definitions`,
      category: "data",
    });
  }

  // ─── Check 6: Auth configuration ───
  const auth = irState?.auth;
  if (auth?.enabled) {
    checks.push({
      name: "auth_has_roles",
      passed: auth.roles.length > 0,
      severity: "warning",
      message: auth.roles.length > 0
        ? `${auth.roles.length} role(s) defined`
        : "Auth enabled but no roles defined",
      category: "auth",
    });

    // Check protected routes consistency
    const protectedRoutes = routes.filter(r => r.isProtected);
    const publicRoutes = auth.publicRoutes || [];
    checks.push({
      name: "auth_route_consistency",
      passed: protectedRoutes.length > 0 || publicRoutes.length > 0,
      severity: "warning",
      message: protectedRoutes.length > 0
        ? `${protectedRoutes.length} protected route(s) defined`
        : "Auth enabled but no routes marked as protected",
      category: "auth",
    });

    // Check permissions defined
    const hasPermissions = auth.permissions && auth.permissions.length > 0;
    checks.push({
      name: "auth_permissions",
      passed: !!hasPermissions,
      severity: "info",
      message: hasPermissions
        ? `${auth.permissions.length} permission rule(s) defined`
        : "No granular permissions — will use role-based defaults",
      category: "auth",
    });
  }

  // ─── Check 7: Cross-reference requirements with IR ───
  if (mergedNormalized) {
    const reqEntities = mergedNormalized.dataModels?.map((d: any) => d.name) || [];
    const irEntities = models.map(m => m.collectionName.toLowerCase());

    for (const entity of reqEntities) {
      if (!irEntities.includes(entity.toLowerCase())) {
        underspecifiedComponents.push(`Entity "${entity}" mentioned in requirements but not in IR data models`);
      }
    }

    const reqRoles = mergedNormalized.authConfig?.roles || [];
    const irRoles = auth?.roles?.map(r => r.name.toLowerCase()) || [];
    for (const role of reqRoles) {
      const roleName = typeof role === "string" ? role : role.name;
      if (!irRoles.includes(roleName.toLowerCase())) {
        unresolvedRoles.push(roleName);
      }
    }
  }

  if (underspecifiedComponents.length > 0) {
    checks.push({
      name: "ir_requirements_sync",
      passed: false,
      severity: "warning",
      message: `${underspecifiedComponents.length} requirement(s) not reflected in IR`,
      category: "data",
    });
  }

  if (unresolvedRoles.length > 0) {
    checks.push({
      name: "roles_resolved",
      passed: false,
      severity: "warning",
      message: `${unresolvedRoles.length} role(s) in requirements not in IR: ${unresolvedRoles.join(", ")}`,
      category: "auth",
    });
  }

  // ─── Score calculation ───
  const errorChecks = checks.filter(c => c.severity === "error");
  const warningChecks = checks.filter(c => c.severity === "warning");
  const passedErrors = errorChecks.filter(c => c.passed).length;
  const passedWarnings = warningChecks.filter(c => c.passed).length;
  const totalWeight = errorChecks.length * 3 + warningChecks.length * 1;
  const earnedWeight = passedErrors * 3 + passedWarnings * 1;
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  const isReady = errorChecks.every(c => c.passed) && score >= 40;

  let recommendation = "";
  if (isReady) {
    recommendation = score >= 80
      ? "All critical checks passed. Ready to build with high confidence."
      : score >= 60
        ? "Core requirements met. Some optional specs missing — smart defaults will be used."
        : "Minimum requirements met. Consider adding more detail for better results.";
  } else {
    const failedErrors = errorChecks.filter(c => !c.passed).map(c => c.message);
    recommendation = `Cannot build yet: ${failedErrors.join("; ")}`;
  }

  return {
    isReady, score, checks, missingFields, incompleteWorkflows,
    unresolvedRoles, underspecifiedComponents, missingConstraints, recommendation,
  };
}

/**
 * Quick readiness check — lightweight version for UI indicators
 */
export function quickReadinessCheck(
  hasRequirements: boolean,
  hasRoutes: boolean,
  hasModels: boolean,
  hasAuth: boolean
): { ready: boolean; score: number; label: string } {
  let score = 0;
  if (hasRequirements) score += 40;
  if (hasRoutes) score += 20;
  if (hasModels) score += 25;
  if (hasAuth) score += 15;

  return {
    ready: score >= 40,
    score,
    label: score >= 80 ? "Ready" : score >= 40 ? "Partial" : "Not Ready",
  };
}
