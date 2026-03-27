/**
 * useBackendCompletion — Hybrid backend migration executor.
 * 
 * After a build produces migration SQL files in the workspace,
 * this hook detects them, classifies safety, and:
 * - Auto-executes safe migrations (CREATE IF NOT EXISTS, RLS policies)
 * - Shows approval UI for destructive changes (DROP, ALTER COLUMN, TRUNCATE)
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MigrationFile {
  path: string;
  sql: string;
  isDestructive: boolean;
  destructiveReasons: string[];
  status: "pending" | "approved" | "executing" | "done" | "failed" | "skipped";
  error?: string;
}

export interface BackendCompletionState {
  migrations: MigrationFile[];
  isExecuting: boolean;
  pendingApproval: MigrationFile[];
  completedCount: number;
  totalCount: number;
}

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bDROP\s+(TABLE|INDEX|COLUMN|CONSTRAINT|POLICY|FUNCTION|TRIGGER|VIEW|SCHEMA)\b/i, reason: "DROP statement detected" },
  { pattern: /\bALTER\s+TABLE\s+\w+\s+(DROP|RENAME)\b/i, reason: "ALTER TABLE with DROP/RENAME" },
  { pattern: /\bTRUNCATE\b/i, reason: "TRUNCATE statement" },
  { pattern: /\bDELETE\s+FROM\b/i, reason: "DELETE FROM statement" },
  { pattern: /\bALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN\s+\w+\s+(TYPE|SET\s+NOT\s+NULL)\b/i, reason: "Column type change or NOT NULL constraint" },
];

function classifyMigration(path: string, sql: string): MigrationFile {
  const destructiveReasons: string[] = [];

  for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(sql)) {
      destructiveReasons.push(reason);
    }
  }

  return {
    path,
    sql,
    isDestructive: destructiveReasons.length > 0,
    destructiveReasons,
    status: "pending",
  };
}

/**
 * Extract migration files from a workspace file map.
 */
export function extractMigrations(workspace: Record<string, string>): MigrationFile[] {
  const migrations: MigrationFile[] = [];

  for (const [path, content] of Object.entries(workspace)) {
    const normalizedPath = path.replace(/^\/+/, "/");
    if (/^\/?(src\/)?migrations\/.*\.sql$/i.test(normalizedPath) && content.trim()) {
      migrations.push(classifyMigration(normalizedPath, content));
    }
  }

  // Sort: schema first, then RLS, then others
  return migrations.sort((a, b) => {
    const order = (p: string) => {
      if (p.includes("001") || p.includes("schema")) return 0;
      if (p.includes("002") || p.includes("rls")) return 1;
      if (p.includes("003") || p.includes("role")) return 2;
      return 3;
    };
    return order(a.path) - order(b.path);
  });
}

export function useBackendCompletion(projectId: string | undefined) {
  const [state, setState] = useState<BackendCompletionState>({
    migrations: [],
    isExecuting: false,
    pendingApproval: [],
    completedCount: 0,
    totalCount: 0,
  });
  const executingRef = useRef(false);

  /**
   * Scan workspace for migrations and begin hybrid execution.
   */
  const processMigrations = useCallback(async (workspace: Record<string, string>) => {
    if (!projectId || executingRef.current) return;

    const migrations = extractMigrations(workspace);
    if (migrations.length === 0) return;

    const safe = migrations.filter(m => !m.isDestructive);
    const destructive = migrations.filter(m => m.isDestructive);

    setState({
      migrations,
      isExecuting: true,
      pendingApproval: destructive,
      completedCount: 0,
      totalCount: migrations.length,
    });

    executingRef.current = true;

    // Auto-execute safe migrations
    for (const migration of safe) {
      try {
        migration.status = "executing";
        setState(prev => ({ ...prev, migrations: [...prev.migrations] }));

        const { error } = await supabase.rpc("exec_ddl", { ddl_sql: migration.sql });
        
        if (error) {
          // If table already exists, treat as success
          if (error.message?.includes("already exists")) {
            migration.status = "done";
          } else {
            migration.status = "failed";
            migration.error = error.message;
          }
        } else {
          migration.status = "done";
        }
      } catch (err: any) {
        migration.status = "failed";
        migration.error = err.message || String(err);
      }

      setState(prev => ({
        ...prev,
        migrations: [...prev.migrations],
        completedCount: prev.migrations.filter(m => m.status === "done" || m.status === "failed").length,
      }));
    }

    if (destructive.length === 0) {
      executingRef.current = false;
      setState(prev => ({ ...prev, isExecuting: false }));
    }
  }, [projectId]);

  /**
   * Approve and execute a destructive migration.
   */
  const approveMigration = useCallback(async (path: string) => {
    const migration = state.migrations.find(m => m.path === path);
    if (!migration) return;

    migration.status = "executing";
    setState(prev => ({ ...prev, migrations: [...prev.migrations] }));

    try {
      const { error } = await supabase.rpc("exec_ddl", { ddl_sql: migration.sql });
      if (error) {
        migration.status = "failed";
        migration.error = error.message;
      } else {
        migration.status = "done";
      }
    } catch (err: any) {
      migration.status = "failed";
      migration.error = err.message || String(err);
    }

    const updated = state.migrations.map(m => m.path === path ? migration : m);
    const stillPending = updated.filter(m => m.status === "pending" && m.isDestructive);

    setState({
      migrations: updated,
      isExecuting: stillPending.length > 0,
      pendingApproval: stillPending,
      completedCount: updated.filter(m => m.status === "done" || m.status === "failed").length,
      totalCount: updated.length,
    });

    if (stillPending.length === 0) {
      executingRef.current = false;
    }
  }, [state.migrations]);

  /**
   * Skip a destructive migration.
   */
  const skipMigration = useCallback((path: string) => {
    const updated = state.migrations.map(m =>
      m.path === path ? { ...m, status: "skipped" as const } : m
    );
    const stillPending = updated.filter(m => m.status === "pending" && m.isDestructive);

    setState({
      migrations: updated,
      isExecuting: stillPending.length > 0,
      pendingApproval: stillPending,
      completedCount: updated.filter(m => m.status === "done" || m.status === "failed" || m.status === "skipped").length,
      totalCount: updated.length,
    });

    if (stillPending.length === 0) {
      executingRef.current = false;
    }
  }, [state.migrations]);

  const reset = useCallback(() => {
    executingRef.current = false;
    setState({
      migrations: [],
      isExecuting: false,
      pendingApproval: [],
      completedCount: 0,
      totalCount: 0,
    });
  }, []);

  return {
    ...state,
    processMigrations,
    approveMigration,
    skipMigration,
    reset,
  };
}
