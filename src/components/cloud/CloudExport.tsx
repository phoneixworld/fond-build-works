import { useState } from "react";
import {
  Download,
  FileJson,
  Database,
  Server,
  Container,
  Lock,
  Loader2,
  CheckCircle2,
  FileCode2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

type ExportFormat = "json" | "sql-migrations" | "sql-dump" | "cloud-package" | "docker";

interface ExportOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileJson;
  tier: "free" | "pro" | "business" | "enterprise";
  available: boolean;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: "json",
    label: "JSON Export",
    description: "Export all collection data as structured JSON files. One file per collection.",
    icon: FileJson,
    tier: "pro",
    available: true,
  },
  {
    id: "sql-migrations",
    label: "SQL Migrations",
    description: "Generate CREATE TABLE migration files from your schema definitions.",
    icon: FileCode2,
    tier: "pro",
    available: true,
  },
  {
    id: "sql-dump",
    label: "Full SQL Dump",
    description: "Complete database dump with schema DDL + INSERT statements for all data.",
    icon: Database,
    tier: "business",
    available: true,
  },
  {
    id: "cloud-package",
    label: "Deploy to Own Cloud",
    description: "Ready-to-deploy package for Supabase, Railway, PlanetScale, or Render.",
    icon: Server,
    tier: "business",
    available: false,
  },
  {
    id: "docker",
    label: "Docker Compose Export",
    description: "Self-hostable Postgres + REST API setup with Docker Compose.",
    icon: Container,
    tier: "enterprise",
    available: false,
  },
];

const TIER_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary/10 text-primary",
  business: "bg-accent/10 text-accent-foreground",
  enterprise: "bg-secondary text-secondary-foreground",
};

const CloudExport = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [lastExported, setLastExported] = useState<ExportFormat | null>(null);

  const downloadFile = (content: string, filename: string, type = "application/json") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportJSON = async () => {
    if (!currentProject) return;
    setExporting("json");

    try {
      // Fetch all schemas for this project
      const { data: schemas } = await supabase
        .from("project_schemas")
        .select("*")
        .eq("project_id", currentProject.id);

      // Fetch all data for this project
      const { data: allData } = await supabase
        .from("project_data")
        .select("*")
        .eq("project_id", currentProject.id);

      // Group data by collection
      const collections: Record<string, any[]> = {};
      (allData || []).forEach((row: any) => {
        if (!collections[row.collection]) collections[row.collection] = [];
        collections[row.collection].push({
          id: row.id,
          ...row.data,
          _created_at: row.created_at,
          _updated_at: row.updated_at,
        });
      });

      const exportPayload = {
        _meta: {
          project_id: currentProject.id,
          project_name: currentProject.name,
          exported_at: new Date().toISOString(),
          format: "json",
          version: "1.0",
        },
        schemas: (schemas || []).map((s: any) => ({
          collection: s.collection_name,
          schema: s.schema,
        })),
        collections,
      };

      downloadFile(
        JSON.stringify(exportPayload, null, 2),
        `${currentProject.name.replace(/\s+/g, "-").toLowerCase()}-export.json`
      );

      setLastExported("json");
      toast({ title: "Export complete", description: "JSON export downloaded successfully." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
    setExporting(null);
  };

  const exportSQLMigrations = async () => {
    if (!currentProject) return;
    setExporting("sql-migrations");

    try {
      const { data: schemas } = await supabase
        .from("project_schemas")
        .select("*")
        .eq("project_id", currentProject.id);

      if (!schemas || schemas.length === 0) {
        toast({ title: "No schemas", description: "No collections defined to generate migrations.", variant: "destructive" });
        setExporting(null);
        return;
      }

      let sql = `-- Auto-generated SQL Migrations\n-- Project: ${currentProject.name}\n-- Date: ${new Date().toISOString()}\n\n`;

      (schemas || []).forEach((s: any) => {
        const tableName = s.collection_name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const fields = s.schema?.fields || s.schema || [];

        sql += `-- Collection: ${s.collection_name}\n`;
        sql += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
        sql += `  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;

        if (Array.isArray(fields)) {
          fields.forEach((field: any) => {
            const colName = (field.name || field.key || "unknown").replace(/[^a-zA-Z0-9_]/g, "_");
            const colType = mapFieldType(field.type || "text");
            const nullable = field.required ? " NOT NULL" : "";
            const defaultVal = field.default !== undefined ? ` DEFAULT '${field.default}'` : "";
            sql += `  "${colName}" ${colType}${nullable}${defaultVal},\n`;
          });
        }

        sql += `  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),\n`;
        sql += `  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()\n`;
        sql += `);\n\n`;

        // Add RLS
        sql += `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;\n\n`;
      });

      downloadFile(
        sql,
        `${currentProject.name.replace(/\s+/g, "-").toLowerCase()}-migrations.sql`,
        "text/sql"
      );

      setLastExported("sql-migrations");
      toast({ title: "Export complete", description: "SQL migrations downloaded successfully." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
    setExporting(null);
  };

  const exportSQLDump = async () => {
    if (!currentProject) return;
    setExporting("sql-dump");

    try {
      const { data: schemas } = await supabase
        .from("project_schemas")
        .select("*")
        .eq("project_id", currentProject.id);

      const { data: allData } = await supabase
        .from("project_data")
        .select("*")
        .eq("project_id", currentProject.id);

      let sql = `-- Full SQL Dump\n-- Project: ${currentProject.name}\n-- Date: ${new Date().toISOString()}\n\nBEGIN;\n\n`;

      // Schema DDL
      const tableMap: Record<string, string> = {};
      (schemas || []).forEach((s: any) => {
        const tableName = s.collection_name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        tableMap[s.collection_name] = tableName;
        const fields = s.schema?.fields || s.schema || [];

        sql += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
        sql += `  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;

        if (Array.isArray(fields)) {
          fields.forEach((field: any) => {
            const colName = (field.name || field.key || "unknown").replace(/[^a-zA-Z0-9_]/g, "_");
            const colType = mapFieldType(field.type || "text");
            const nullable = field.required ? " NOT NULL" : "";
            sql += `  "${colName}" ${colType}${nullable},\n`;
          });
        }

        sql += `  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),\n`;
        sql += `  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()\n`;
        sql += `);\n\n`;
      });

      // Data INSERT statements
      const grouped: Record<string, any[]> = {};
      (allData || []).forEach((row: any) => {
        if (!grouped[row.collection]) grouped[row.collection] = [];
        grouped[row.collection].push(row);
      });

      Object.entries(grouped).forEach(([collection, rows]) => {
        const tableName = tableMap[collection] || collection.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        sql += `-- Data for ${collection}\n`;

        rows.forEach((row: any) => {
          const data = row.data || {};
          const columns = ["id", ...Object.keys(data), "created_at", "updated_at"];
          const values = [
            `'${row.id}'`,
            ...Object.values(data).map((v) => `'${String(v).replace(/'/g, "''")}'`),
            `'${row.created_at}'`,
            `'${row.updated_at}'`,
          ];
          sql += `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});\n`;
        });
        sql += "\n";
      });

      sql += "COMMIT;\n";

      downloadFile(
        sql,
        `${currentProject.name.replace(/\s+/g, "-").toLowerCase()}-dump.sql`,
        "text/sql"
      );

      setLastExported("sql-dump");
      toast({ title: "Export complete", description: "Full SQL dump downloaded successfully." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
    setExporting(null);
  };

  const handleExport = (option: ExportOption) => {
    if (!option.available) {
      toast({ title: "Coming Soon", description: `${option.label} will be available in a future update.` });
      return;
    }

    switch (option.id) {
      case "json":
        return exportJSON();
      case "sql-migrations":
        return exportSQLMigrations();
      case "sql-dump":
        return exportSQLDump();
      default:
        toast({ title: "Coming Soon", description: `${option.label} is not yet available.` });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Export &amp; Migrate</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Export your database for self-hosting or migration to your own cloud.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {EXPORT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isExporting = exporting === option.id;
          const wasExported = lastExported === option.id;

          return (
            <button
              key={option.id}
              onClick={() => handleExport(option)}
              disabled={!!exporting}
              className={`w-full text-left rounded-lg border transition-all p-4 group ${
                option.available
                  ? "border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                  : "border-border/50 opacity-60 cursor-not-allowed"
              } ${isExporting ? "border-primary/40 bg-primary/5" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : wasExported ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${TIER_COLORS[option.tier]}`}>
                      {option.tier}
                    </span>
                    {!option.available && <Lock className="w-3 h-3 text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}

        <div className="mt-6 p-4 rounded-lg bg-secondary/30 border border-border/50">
          <p className="text-xs font-medium text-foreground mb-1">💡 Migration Tips</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>JSON export is ideal for importing into any NoSQL or document database.</li>
            <li>SQL migrations generate standard Postgres-compatible DDL.</li>
            <li>Full SQL dump includes both schema and data — ready for <code className="text-primary/80 bg-primary/5 px-1 rounded">psql</code> import.</li>
            <li>Cloud packages and Docker exports coming soon with guided deployment.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

function mapFieldType(type: string): string {
  switch (type.toLowerCase()) {
    case "string":
    case "text":
    case "email":
    case "url":
      return "TEXT";
    case "number":
    case "integer":
    case "int":
      return "INTEGER";
    case "float":
    case "decimal":
      return "NUMERIC";
    case "boolean":
    case "bool":
      return "BOOLEAN";
    case "date":
    case "datetime":
    case "timestamp":
      return "TIMESTAMPTZ";
    case "json":
    case "object":
    case "array":
      return "JSONB";
    case "uuid":
      return "UUID";
    default:
      return "TEXT";
  }
}

export default CloudExport;
