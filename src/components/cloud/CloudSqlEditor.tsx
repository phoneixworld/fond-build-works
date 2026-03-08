import { useState } from "react";
import { Terminal, Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";

const CloudSqlEditor = () => {
  const { currentProject } = useProjects();
  const [query, setQuery] = useState("SELECT * FROM project_data LIMIT 10;");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runQuery = async () => {
    if (!currentProject) return;
    setRunning(true);
    setResult(null);

    try {
      // Parse simple SELECT queries against project collections
      const match = query.trim().match(/^SELECT\s+\*\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+(\d+))?;?\s*$/i);
      
      if (!match) {
        // For any query, try to run it via the project-api as a collection list
        const collectionMatch = query.trim().match(/^SELECT\s+\*\s+FROM\s+(\w+)/i);
        if (collectionMatch) {
          const collection = collectionMatch[1];
          // Check if it's a known table
          if (["project_data", "project_schemas", "project_functions", "project_users"].includes(collection)) {
            const { data, error } = await supabase
              .from(collection as any)
              .select("*")
              .eq("project_id", currentProject.id)
              .limit(50);
            if (error) throw error;
            setResult(JSON.stringify(data, null, 2));
          } else {
            // Treat as collection name in project_data
            const { data, error } = await supabase
              .from("project_data")
              .select("*")
              .eq("project_id", currentProject.id)
              .eq("collection", collection)
              .limit(50);
            if (error) throw error;
            const rows = (data || []).map((r: any) => ({ id: r.id, ...r.data, _created_at: r.created_at }));
            setResult(JSON.stringify(rows, null, 2));
          }
        } else {
          setResult("⚠ Only SELECT queries are supported in this editor.\nExample: SELECT * FROM your_collection LIMIT 10;");
        }
      } else {
        const tableName = match[1];
        const limit = match[3] ? parseInt(match[3]) : 50;

        if (["project_data", "project_schemas", "project_functions", "project_users"].includes(tableName)) {
          const { data, error } = await supabase
            .from(tableName as any)
            .select("*")
            .eq("project_id", currentProject.id)
            .limit(limit);
          if (error) throw error;
          setResult(`-- ${(data || []).length} rows returned\n${JSON.stringify(data, null, 2)}`);
        } else {
          // collection-based query
          const { data, error } = await supabase
            .from("project_data")
            .select("*")
            .eq("project_id", currentProject.id)
            .eq("collection", tableName)
            .limit(limit);
          if (error) throw error;
          const rows = (data || []).map((r: any) => ({ id: r.id, ...r.data, _created_at: r.created_at }));
          setResult(`-- ${rows.length} rows returned from collection "${tableName}"\n${JSON.stringify(rows, null, 2)}`);
        }
      }
    } catch (e: any) {
      setResult(`ERROR: ${e.message}`);
    }
    setRunning(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">SQL Editor</span>
        </div>
        <button
          onClick={runQuery}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Run
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            className="w-full h-full resize-none bg-ide-panel text-xs text-foreground font-mono p-4 outline-none border-b border-border"
            placeholder="Write your SQL query here..."
          />
        </div>
        <div className="h-1/3 min-h-[120px] overflow-y-auto bg-secondary/30 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Results</p>
          {running ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Running query...
            </div>
          ) : result ? (
            <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{result}</pre>
          ) : (
            <p className="text-xs text-muted-foreground/50">Run a query to see results</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CloudSqlEditor;
