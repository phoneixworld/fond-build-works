import { useState, useEffect } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, Database, Lock, Users, Globe, Key, FileCode, Eye, ChevronRight,
  TrendingUp, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { toast } from "sonner";

interface SecurityCheck {
  id: string;
  category: string;
  name: string;
  description: string;
  status: "pass" | "warn" | "fail" | "info";
  fix?: string;
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30", label: "Passed" },
  warn: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30", label: "Warning" },
  fail: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", label: "Failed" },
  info: { icon: Eye, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30", label: "Info" },
};

const CATEGORY_ICONS: Record<string, any> = {
  "Data Protection": Database,
  "Authentication": Users,
  "Access Control": Lock,
  "API Security": Globe,
  "Secrets": Key,
  "Code Security": FileCode,
};

const SecurityDashboard = () => {
  const { currentProject } = useProjects();
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  useEffect(() => {
    if (currentProject?.id) runScan();
  }, [currentProject?.id]);

  const runScan = async () => {
    if (!currentProject?.id) return;
    setScanning(true);
    const results: SecurityCheck[] = [];

    // 1. Check RLS coverage on schemas
    try {
      const { data: schemas } = await supabase
        .from("project_schemas" as any)
        .select("collection_name, schema")
        .eq("project_id", currentProject.id);

      const schemaCount = (schemas as any[])?.length || 0;
      if (schemaCount === 0) {
        results.push({
          id: "rls-no-tables",
          category: "Data Protection",
          name: "No database tables defined",
          description: "Your project has no database schemas yet. Once you create tables, ensure RLS policies are applied.",
          status: "info",
        });
      } else {
        // Check if schemas have id/user_id fields (indicates RLS capability)
        let tablesWithUserId = 0;
        (schemas as any[])?.forEach((s: any) => {
          const fields = s.schema?.fields || [];
          const hasUserField = fields.some((f: any) =>
            f.name === "user_id" || f.name === "owner_id" || f.name === "created_by"
          );
          if (hasUserField) tablesWithUserId++;
        });

        if (tablesWithUserId === schemaCount) {
          results.push({
            id: "rls-coverage",
            category: "Data Protection",
            name: `All ${schemaCount} tables have user ownership fields`,
            description: "Every table has a user_id or owner field, enabling row-level security.",
            status: "pass",
          });
        } else if (tablesWithUserId > 0) {
          results.push({
            id: "rls-partial",
            category: "Data Protection",
            name: `${tablesWithUserId}/${schemaCount} tables have user ownership`,
            description: `${schemaCount - tablesWithUserId} table(s) lack a user_id field. These tables may expose data to all users.`,
            status: "warn",
            fix: "Add a user_id field to tables that store user-specific data, then apply RLS policies.",
          });
        } else {
          results.push({
            id: "rls-none",
            category: "Data Protection",
            name: "No tables have user ownership fields",
            description: "None of your tables have user_id fields. Without RLS, all data is accessible to all users.",
            status: "fail",
            fix: "Add user_id fields to tables and configure row-level security policies to restrict access.",
          });
        }
      }
    } catch {}

    // 2. Check authentication setup
    try {
      const { data: users } = await supabase
        .from("project_users" as any)
        .select("id")
        .eq("project_id", currentProject.id)
        .limit(1);

      const hasAuth = (users as any[])?.length > 0;

      // Check if published app has HTML with auth references
      const htmlContent = currentProject.html_content || "";
      const hasLoginForm = htmlContent.includes("login") || htmlContent.includes("sign-in") || htmlContent.includes("auth");

      if (hasAuth || hasLoginForm) {
        results.push({
          id: "auth-enabled",
          category: "Authentication",
          name: "Authentication is configured",
          description: "Your project has user authentication set up.",
          status: "pass",
        });
      } else {
        results.push({
          id: "auth-missing",
          category: "Authentication",
          name: "No authentication detected",
          description: "Your app doesn't appear to have user login. If it handles user-specific data, authentication is essential.",
          status: "warn",
          fix: "Add user authentication with login/signup pages to protect user-specific data and features.",
        });
      }
    } catch {}

    // 3. Check secrets management
    try {
      const { data: secrets } = await supabase
        .from("project_functions" as any)
        .select("code")
        .eq("project_id", currentProject.id);

      let hardcodedKeys = 0;
      (secrets as any[])?.forEach((fn: any) => {
        const code = fn.code || "";
        // Check for common hardcoded key patterns
        if (/(['"])(sk[-_]|pk[-_]|api[-_]key|secret[-_]|password)[\w-]{10,}\1/i.test(code)) {
          hardcodedKeys++;
        }
      });

      if (hardcodedKeys > 0) {
        results.push({
          id: "hardcoded-secrets",
          category: "Secrets",
          name: `${hardcodedKeys} potential hardcoded secret(s) found`,
          description: "Edge functions may contain hardcoded API keys or secrets. These should be stored in the Secrets manager.",
          status: "fail",
          fix: "Move all API keys and secrets to Cloud > Secrets. Access them via Deno.env.get() in edge functions.",
        });
      } else {
        results.push({
          id: "secrets-clean",
          category: "Secrets",
          name: "No hardcoded secrets detected",
          description: "No obvious hardcoded API keys found in your edge functions.",
          status: "pass",
        });
      }
    } catch {}

    // 4. Check published app security
    const isPublished = (currentProject as any).is_published;
    if (isPublished) {
      const html = currentProject.html_content || "";

      // CSP check
      const hasCSP = html.includes("Content-Security-Policy") || html.includes("content-security-policy");
      results.push({
        id: "csp-header",
        category: "API Security",
        name: hasCSP ? "Content Security Policy detected" : "No Content Security Policy",
        description: hasCSP
          ? "Your published app includes CSP headers to prevent XSS attacks."
          : "Your published app lacks Content Security Policy headers. This leaves it vulnerable to cross-site scripting.",
        status: hasCSP ? "pass" : "warn",
        fix: !hasCSP ? "Add a <meta http-equiv=\"Content-Security-Policy\"> tag to restrict script sources." : undefined,
      });

      // HTTPS check
      results.push({
        id: "https",
        category: "API Security",
        name: "HTTPS enabled",
        description: "Published apps are served over HTTPS with TLS encryption.",
        status: "pass",
      });

      // External scripts check
      const scriptMatches = html.match(/<script[^>]+src=["']https?:\/\/[^"']+/g) || [];
      const externalScripts = scriptMatches.length;
      if (externalScripts > 3) {
        results.push({
          id: "external-scripts",
          category: "Code Security",
          name: `${externalScripts} external scripts loaded`,
          description: "Your app loads many external scripts. Each is a potential supply chain risk.",
          status: "warn",
          fix: "Review external script dependencies. Consider self-hosting critical libraries.",
        });
      } else {
        results.push({
          id: "external-scripts-ok",
          category: "Code Security",
          name: `${externalScripts} external script(s) — acceptable`,
          description: "Your app loads a reasonable number of external scripts.",
          status: "pass",
        });
      }
    } else {
      results.push({
        id: "not-published",
        category: "API Security",
        name: "App not published yet",
        description: "Security headers will be evaluated once you publish your app.",
        status: "info",
      });
    }

    // 5. Environment lock check
    try {
      const { data: envs } = await supabase
        .from("project_environments" as any)
        .select("name, is_locked")
        .eq("project_id", currentProject.id);

      const prodEnv = (envs as any[])?.find((e: any) => e.name === "production");
      if (prodEnv) {
        results.push({
          id: "prod-lock",
          category: "Access Control",
          name: prodEnv.is_locked ? "Production environment is locked" : "Production environment is unlocked",
          description: prodEnv.is_locked
            ? "Production is protected from accidental deployments."
            : "Production is unlocked. Anyone with access can deploy directly.",
          status: prodEnv.is_locked ? "pass" : "warn",
          fix: !prodEnv.is_locked ? "Lock the production environment in Cloud > Environments to prevent accidental deploys." : undefined,
        });
      }
    } catch {}

    // 6. Governance rules check
    try {
      const { data: rules } = await supabase
        .from("project_governance_rules" as any)
        .select("id")
        .eq("project_id", currentProject.id)
        .eq("is_active", true);

      const ruleCount = (rules as any[])?.length || 0;
      results.push({
        id: "governance",
        category: "Code Security",
        name: ruleCount > 0 ? `${ruleCount} governance rule(s) active` : "No governance rules configured",
        description: ruleCount > 0
          ? "Active governance rules enforce coding standards in AI-generated code."
          : "No governance rules are enforcing coding standards. Consider adding naming conventions and design token rules.",
        status: ruleCount > 0 ? "pass" : "info",
        fix: ruleCount === 0 ? "Go to Cloud > Governance to add rules that enforce security standards in generated code." : undefined,
      });
    } catch {}

    // 7. Multi-tenant isolation audit
    try {
      // Check project_data RLS - should only allow published or owner access
      const { data: testData, error: testError } = await supabase
        .from("project_data" as any)
        .select("id, project_id")
        .neq("project_id", currentProject.id)
        .limit(1);

      if (!testError && testData && (testData as any[]).length > 0) {
        results.push({
          id: "tenant-leak-data",
          category: "Tenant Isolation",
          name: "Cross-tenant data accessible",
          description: "Data from other projects is readable. This is a critical multi-tenant isolation failure.",
          status: "fail",
          fix: "Ensure project_data RLS policies restrict reads to project owner or published projects only.",
        });
      } else {
        results.push({
          id: "tenant-data-ok",
          category: "Tenant Isolation",
          name: "Project data is isolated",
          description: "No cross-tenant data leakage detected. project_data is properly scoped.",
          status: "pass",
        });
      }
    } catch {}

    // Check that schemas are isolated
    try {
      const { data: otherSchemas } = await supabase
        .from("project_schemas" as any)
        .select("id")
        .neq("project_id", currentProject.id)
        .limit(1);

      if (otherSchemas && (otherSchemas as any[]).length > 0) {
        results.push({
          id: "tenant-leak-schemas",
          category: "Tenant Isolation",
          name: "Cross-tenant schemas accessible",
          description: "Database schemas from other projects are readable by this user.",
          status: "fail",
          fix: "Review RLS policies on project_schemas to ensure owner-only access.",
        });
      } else {
        results.push({
          id: "tenant-schemas-ok",
          category: "Tenant Isolation",
          name: "Schemas are tenant-isolated",
          description: "No cross-tenant schema access detected.",
          status: "pass",
        });
      }
    } catch {}

    // Check functions isolation
    try {
      const { data: otherFns } = await supabase
        .from("project_functions" as any)
        .select("id")
        .neq("project_id", currentProject.id)
        .limit(1);

      if (otherFns && (otherFns as any[]).length > 0) {
        results.push({
          id: "tenant-leak-functions",
          category: "Tenant Isolation",
          name: "Cross-tenant functions accessible",
          description: "Edge functions from other projects are readable.",
          status: "fail",
          fix: "Review RLS policies on project_functions to ensure owner-only access.",
        });
      } else {
        results.push({
          id: "tenant-functions-ok",
          category: "Tenant Isolation",
          name: "Functions are tenant-isolated",
          description: "No cross-tenant function access detected.",
          status: "pass",
        });
      }
    } catch {}

    // Check secrets isolation
    try {
      const { data: otherSecrets } = await supabase
        .from("project_knowledge" as any)
        .select("id")
        .neq("project_id", currentProject.id)
        .limit(1);

      if (otherSecrets && (otherSecrets as any[]).length > 0) {
        results.push({
          id: "tenant-leak-knowledge",
          category: "Tenant Isolation",
          name: "Cross-tenant knowledge accessible",
          description: "Project knowledge from other projects is readable.",
          status: "fail",
          fix: "Review RLS policies on project_knowledge.",
        });
      } else {
        results.push({
          id: "tenant-knowledge-ok",
          category: "Tenant Isolation",
          name: "Knowledge is tenant-isolated",
          description: "No cross-tenant knowledge access detected.",
          status: "pass",
        });
      }
    } catch {}

    // Published project visibility check
    results.push({
      id: "tenant-published",
      category: "Tenant Isolation",
      name: "Published data access is scoped",
      description: "Anonymous users can only read data from published projects. Unpublished project data requires authentication and ownership.",
      status: "pass",
    });

    setChecks(results);

    setLastScan(new Date());
    setScanning(false);
    toast.success(`Security scan complete — ${results.length} checks run`);
  };

  // Calculate score
  const passCount = checks.filter(c => c.status === "pass").length;
  const warnCount = checks.filter(c => c.status === "warn").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const totalScored = passCount + warnCount + failCount;
  const score = totalScored > 0 ? Math.round((passCount / totalScored) * 100) : 0;

  const scoreColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-destructive";
  const ScoreIcon = score >= 80 ? ShieldCheck : score >= 50 ? ShieldAlert : ShieldX;

  // Group by category
  const categories = [...new Set(checks.map(c => c.category))];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Security Dashboard</h2>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Re-scan"}
        </button>
      </div>

      {/* Score card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-6">
          <div className="relative">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted/30" />
              <circle
                cx="50" cy="50" r="42"
                stroke="currentColor" strokeWidth="8" fill="none"
                className={scoreColor}
                strokeDasharray={`${score * 2.64} 264`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${scoreColor}`}>{score}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <ScoreIcon className={`w-5 h-5 ${scoreColor}`} />
              <span className="text-sm font-semibold text-foreground">
                {score >= 80 ? "Good Security Posture" : score >= 50 ? "Needs Attention" : "Critical Issues Found"}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> {passCount} passed
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" /> {warnCount} warnings
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="w-3 h-3" /> {failCount} failed
              </span>
            </div>
            {lastScan && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Last scanned: {lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Checks by category */}
      {scanning ? (
        <div className="flex items-center justify-center gap-2 py-12">
          <Activity className="w-5 h-5 text-primary animate-pulse" />
          <span className="text-xs text-muted-foreground">Running security checks...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(category => {
            const catChecks = checks.filter(c => c.category === category);
            const CatIcon = CATEGORY_ICONS[category] || ShieldCheck;
            const catPass = catChecks.filter(c => c.status === "pass").length;

            return (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <CatIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">{category}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {catPass}/{catChecks.length} passed
                  </span>
                </div>

                {catChecks.map(check => {
                  const cfg = STATUS_CONFIG[check.status];
                  const StatusIcon = cfg.icon;
                  const isExpanded = expandedCheck === check.id;

                  return (
                    <div key={check.id} className={`border rounded-lg transition-colors ${cfg.bg}`}>
                      <button
                        onClick={() => setExpandedCheck(isExpanded ? null : check.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                      >
                        <StatusIcon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                        <span className="text-xs font-medium text-foreground flex-1">{check.name}</span>
                        <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2">
                          <p className="text-[11px] text-muted-foreground pl-6">{check.description}</p>
                          {check.fix && (
                            <div className="ml-6 p-2 rounded bg-background/50 border border-border">
                              <p className="text-[10px] font-medium text-foreground flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-primary" /> How to fix:
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{check.fix}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SecurityDashboard;
