import { useState } from "react";
import { Database, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronRight, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MigrationFile } from "@/hooks/useBackendCompletion";

interface MigrationApprovalCardProps {
  migrations: MigrationFile[];
  pendingApproval: MigrationFile[];
  completedCount: number;
  totalCount: number;
  isExecuting: boolean;
  onApprove: (path: string) => void;
  onSkip: (path: string) => void;
}

function StatusIcon({ status }: { status: MigrationFile["status"] }) {
  switch (status) {
    case "done": return <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />;
    case "failed": return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case "executing": return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    case "skipped": return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
    default: return <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />;
  }
}

const MigrationApprovalCard = ({
  migrations,
  pendingApproval,
  completedCount,
  totalCount,
  isExecuting,
  onApprove,
  onSkip,
}: MigrationApprovalCardProps) => {
  const [expanded, setExpanded] = useState(true);
  const [showSql, setShowSql] = useState<string | null>(null);

  if (totalCount === 0) return null;

  const allDone = completedCount === totalCount;
  const hasFailed = migrations.some(m => m.status === "failed");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
      >
        <Database className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground flex-1 text-left">
          Backend Setup
        </span>
        <span className="text-[10px] text-muted-foreground">
          {completedCount}/{totalCount}
        </span>
        {allDone && !hasFailed && <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />}
        {hasFailed && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
        {isExecuting && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border overflow-hidden"
          >
            {/* Migration list */}
            <div className="divide-y divide-border">
              {migrations.map((m) => {
                const fileName = m.path.split("/").pop() || m.path;
                return (
                  <div key={m.path} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={m.status} />
                      <span className="text-[11px] font-medium text-foreground flex-1">{fileName}</span>
                      {m.isDestructive && m.status === "pending" && (
                        <Shield className="w-3 h-3 text-[hsl(var(--ide-warning))]" />
                      )}
                      <button
                        onClick={() => setShowSql(showSql === m.path ? null : m.path)}
                        className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSql === m.path ? "Hide SQL" : "View SQL"}
                      </button>
                    </div>

                    {/* Destructive warning + actions */}
                    {m.isDestructive && m.status === "pending" && (
                      <div className="flex items-center gap-2 pl-5.5">
                        <span className="text-[10px] text-[hsl(var(--ide-warning))]">
                          ⚠️ {m.destructiveReasons.join(", ")}
                        </span>
                        <div className="flex gap-1 ml-auto">
                          <button
                            onClick={() => onApprove(m.path)}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => onSkip(m.path)}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Error message */}
                    {m.status === "failed" && m.error && (
                      <p className="text-[10px] text-destructive pl-5.5 truncate">{m.error}</p>
                    )}

                    {/* SQL preview */}
                    {showSql === m.path && (
                      <pre className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2 mt-1 overflow-x-auto max-h-32 font-mono leading-relaxed">
                        {m.sql.trim()}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            {allDone && (
              <div className="px-3 py-2 bg-muted/20 text-[10px] text-muted-foreground">
                {hasFailed
                  ? "Some migrations failed. Check errors above."
                  : "✅ All database tables and policies are set up."}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default MigrationApprovalCard;
