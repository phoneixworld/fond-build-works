import { useState } from "react";
import { Terminal, Play, Loader2 } from "lucide-react";

const CloudSqlEditor = () => {
  const [query, setQuery] = useState("SELECT * FROM project_data LIMIT 10;");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runQuery = async () => {
    setRunning(true);
    setResult(null);
    // Simulated — in a real app this would call an edge function
    setTimeout(() => {
      setResult("Query execution is available when connected to a live database.\nDefine your data models in the Database tab to get started.");
      setRunning(false);
    }, 800);
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
