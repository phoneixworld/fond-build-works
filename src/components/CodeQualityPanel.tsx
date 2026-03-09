import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle2, Loader2, RefreshCw, ChevronRight, ChevronDown, FileCode, X, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { analyzeCodeQuality, quickStaticAnalysis, getScoreColor, getSeverityColor, getCategoryLabel, type QualityReport, type CodeIssue, type IssueCategory } from "@/lib/codeQuality";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";

interface CodeQualityPanelProps {
  onClose?: () => void;
  onFixIssue?: (issue: CodeIssue) => void;
}

const CodeQualityPanel = ({ onClose, onFixIssue }: CodeQualityPanelProps) => {
  const { currentProject } = useProjects();
  const { sandpackFiles, previewHtml } = usePreview();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [quickIssues, setQuickIssues] = useState<CodeIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "issues" | "metrics">("overview");
  const [expandedCategories, setExpandedCategories] = useState<Set<IssueCategory>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<"all" | "error" | "warning" | "info">("all");
  const [error, setError] = useState<string | null>(null);

  // Run quick static analysis when files change
  useEffect(() => {
    const files = sandpackFiles || (previewHtml ? { "/index.html": previewHtml } : {});
    if (Object.keys(files).length > 0) {
      const issues = quickStaticAnalysis(files);
      setQuickIssues(issues);
    }
  }, [sandpackFiles, previewHtml]);

  const runFullAnalysis = useCallback(async () => {
    const files = sandpackFiles || (previewHtml ? { "/index.html": previewHtml } : {});
    if (Object.keys(files).length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // Fetch governance rules
      let governanceRules: any[] = [];
      if (currentProject) {
        try {
          const { data } = await supabase
            .from("project_governance_rules" as any)
            .select("name, description, severity")
            .eq("project_id", currentProject.id)
            .eq("is_active", true);
          governanceRules = data || [];
        } catch {}
      }

      const result = await analyzeCodeQuality(
        files,
        currentProject?.tech_stack || "react",
        governanceRules
      );
      setReport(result);
      
      // Expand categories with errors
      const errorCategories = new Set(
        result.issues.filter(i => i.severity === "error").map(i => i.category)
      );
      setExpandedCategories(errorCategories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [sandpackFiles, previewHtml, currentProject]);

  const toggleCategory = (category: IssueCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const allIssues = report?.issues || quickIssues;
  const filteredIssues = filterSeverity === "all" 
    ? allIssues 
    : allIssues.filter(i => i.severity === filterSeverity);

  const groupedIssues = filteredIssues.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {} as Record<IssueCategory, CodeIssue[]>);

  const errorCount = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const infoCount = allIssues.filter(i => i.severity === "info").length;
  const score = report?.score ?? Math.max(0, 100 - errorCount * 15 - warningCount * 5 - infoCount);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error": return <AlertCircle className="w-4 h-4 text-destructive" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-[hsl(var(--ide-warning))]" />;
      case "info": return <Info className="w-4 h-4 text-muted-foreground" />;
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Code Quality</h2>
          <Badge 
            variant="outline" 
            className={`${getScoreColor(score)} border-current`}
          >
            {score}/100
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runFullAnalysis}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-1" />
                Deep Scan
              </>
            )}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Score banner */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div className={`text-4xl font-bold ${getScoreColor(score)}`}>
            {score}
          </div>
          <div className="flex-1 space-y-1">
            <Progress value={score} className="h-3" />
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                {errorCount} errors
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[hsl(var(--ide-warning))]" />
                {warningCount} warnings
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                {infoCount} info
              </span>
            </div>
          </div>
        </div>
        {report?.summary && (
          <p className="text-sm text-muted-foreground mt-2">{report.summary}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/30 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="issues">
            Issues ({filteredIssues.length})
          </TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Quick summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Architecture", icon: "🏗️", key: "architecture" },
                  { label: "Performance", icon: "⚡", key: "performance" },
                  { label: "Accessibility", icon: "♿", key: "accessibility" },
                  { label: "Security", icon: "🔐", key: "security" },
                  { label: "Maintainability", icon: "🔧", key: "maintainability" },
                  { label: "Best Practices", icon: "✨", key: "bestPractices" },
                ].map(({ label, icon, key }) => {
                  const issues = allIssues.filter(i => i.category === key);
                  const errors = issues.filter(i => i.severity === "error").length;
                  const warnings = issues.filter(i => i.severity === "warning").length;
                  const status = errors > 0 ? "error" : warnings > 0 ? "warning" : "good";
                  
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveTab("issues");
                        setExpandedCategories(new Set([key as IssueCategory]));
                      }}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        status === "error" 
                          ? "border-destructive/50 bg-destructive/10 hover:bg-destructive/20" 
                          : status === "warning"
                          ? "border-[hsl(var(--ide-warning))]/50 bg-[hsl(var(--ide-warning))]/10 hover:bg-[hsl(var(--ide-warning))]/20"
                          : "border-border bg-card hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg">{icon}</span>
                        {status === "good" ? (
                          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))]" />
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {errors + warnings}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-medium mt-1">{label}</p>
                    </button>
                  );
                })}
              </div>

              {/* Top issues */}
              {allIssues.filter(i => i.severity === "error").slice(0, 3).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    Critical Issues
                  </h3>
                  {allIssues.filter(i => i.severity === "error").slice(0, 3).map(issue => (
                    <div key={issue.id} className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-muted-foreground" />
                        <code className="text-xs">{issue.file}</code>
                        {issue.line && <span className="text-xs text-muted-foreground">:{issue.line}</span>}
                      </div>
                      <p className="mt-1">{issue.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="issues" className="flex-1 overflow-hidden m-0">
          {/* Filter bar */}
          <div className="px-4 py-2 border-b border-border flex gap-2">
            {(["all", "error", "warning", "info"] as const).map(sev => (
              <Button
                key={sev}
                variant={filterSeverity === sev ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterSeverity(sev)}
              >
                {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {sev === "all" ? allIssues.length : allIssues.filter(i => i.severity === sev).length}
                </Badge>
              </Button>
            ))}
          </div>

          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {Object.entries(groupedIssues).map(([category, issues]) => (
                <div key={category} className="rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category as IssueCategory)}
                    className="w-full p-3 flex items-center gap-2 bg-card hover:bg-accent/50 transition-colors"
                  >
                    {expandedCategories.has(category as IssueCategory) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="font-medium text-sm">{getCategoryLabel(category as IssueCategory)}</span>
                    <Badge variant="secondary">{issues.length}</Badge>
                  </button>

                  <AnimatePresence>
                    {expandedCategories.has(category as IssueCategory) && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border">
                          {issues.map(issue => (
                            <div
                              key={issue.id}
                              className="p-3 border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex items-start gap-2">
                                {getSeverityIcon(issue.severity)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <FileCode className="w-3 h-3" />
                                    <code>{issue.file}</code>
                                    {issue.line && <span>:{issue.line}</span>}
                                  </div>
                                  <p className="text-sm mt-1">{issue.message}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    💡 {issue.suggestion}
                                  </p>
                                </div>
                                {onFixIssue && issue.autoFixable && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onFixIssue(issue)}
                                  >
                                    Fix
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {filteredIssues.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-[hsl(var(--ide-success))]" />
                  <p>No issues found!</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="metrics" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {report?.metrics ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-lg bg-card border border-border">
                      <p className="text-2xl font-bold">{report.metrics.totalFiles}</p>
                      <p className="text-xs text-muted-foreground">Total Files</p>
                    </div>
                    <div className="p-4 rounded-lg bg-card border border-border">
                      <p className="text-2xl font-bold">{report.metrics.totalLines}</p>
                      <p className="text-xs text-muted-foreground">Lines of Code</p>
                    </div>
                    <div className="p-4 rounded-lg bg-card border border-border">
                      <p className="text-2xl font-bold">{report.metrics.componentCount}</p>
                      <p className="text-xs text-muted-foreground">Components</p>
                    </div>
                    <div className="p-4 rounded-lg bg-card border border-border">
                      <p className="text-2xl font-bold capitalize">{report.metrics.avgComplexity}</p>
                      <p className="text-xs text-muted-foreground">Avg Complexity</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Health Checks</h3>
                    {[
                      { label: "Error Boundary", value: report.metrics.hasErrorBoundary },
                      { label: "Accessibility", value: report.metrics.hasAccessibility },
                      { label: "Loading States", value: report.metrics.hasLoadingStates },
                      { label: "Error Handling", value: report.metrics.hasErrorHandling },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between p-2 rounded bg-card border border-border">
                        <span className="text-sm">{label}</span>
                        {value ? (
                          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))]" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[hsl(var(--ide-warning))]" />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Run a deep scan to see detailed metrics</p>
                  <Button onClick={runFullAnalysis} className="mt-4" disabled={isAnalyzing}>
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Analyze Code
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CodeQualityPanel;
