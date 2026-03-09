import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileCode, Loader2, X, Sparkles, ChevronRight, ExternalLink, Lightbulb, Code2, GitFork, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { semanticSearch, quickSearch, getMatchTypeIcon, type SearchMode, type SearchResult, type SearchResponse } from "@/lib/semanticSearch";
import { usePreview } from "@/contexts/PreviewContext";

interface SemanticSearchPanelProps {
  onClose?: () => void;
  onNavigateToFile?: (file: string, line?: number) => void;
}

const SemanticSearchPanel = ({ onClose, onNavigateToFile }: SemanticSearchPanelProps) => {
  const { sandpackFiles, previewHtml } = usePreview();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("search");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [quickResults, setQuickResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const files = sandpackFiles || (previewHtml ? { "/index.html": previewHtml } : {});

  const handleQuickSearch = useCallback((q: string) => {
    if (!q.trim() || Object.keys(files).length === 0) {
      setQuickResults([]);
      return;
    }
    const results = quickSearch(q, files);
    setQuickResults(results);
  }, [files]);

  const handleSemanticSearch = useCallback(async () => {
    if (!query.trim() || Object.keys(files).length === 0) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await semanticSearch(query, files, mode);
      setResults(response);
      setQuickResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [query, files, mode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    handleQuickSearch(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSemanticSearch();
    }
  };

  const modeConfig: Record<SearchMode, { icon: React.ReactNode; label: string; description: string }> = {
    search: { icon: <Search className="w-4 h-4" />, label: "Search", description: "Find code by meaning" },
    explain: { icon: <Lightbulb className="w-4 h-4" />, label: "Explain", description: "Understand how code works" },
    dependencies: { icon: <GitFork className="w-4 h-4" />, label: "Dependencies", description: "Trace imports & usage" },
    refactor: { icon: <Wrench className="w-4 h-4" />, label: "Refactor", description: "Find improvement opportunities" },
  };

  const displayResults = results?.results || quickResults;
  const hasAIResults = !!results;

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Code Search</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Search input */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search code semantically..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults(null); setQuickResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mode selector */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as SearchMode)}>
          <TabsList className="w-full">
            {Object.entries(modeConfig).map(([key, { icon, label }]) => (
              <TabsTrigger key={key} value={key} className="flex-1 gap-1">
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleSemanticSearch}
            disabled={!query.trim() || isSearching}
            className="flex-1"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {modeConfig[mode].description}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/30 flex items-center gap-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Summary */}
      {results?.summary && (
        <div className="p-4 border-b border-border bg-primary/5">
          <p className="text-sm">{results.summary}</p>
          {results.suggestedActions && results.suggestedActions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {results.suggestedActions.map((action, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => { setQuery(action); handleQuickSearch(action); }}
                >
                  {action}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {displayResults.length === 0 && query && !isSearching && (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No results found</p>
              <p className="text-xs mt-1">Try a different search term or use AI search</p>
            </div>
          )}

          {displayResults.length === 0 && !query && (
            <div className="py-12 text-center text-muted-foreground">
              <Code2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Search your codebase</p>
              <p className="text-xs mt-1">Type to start searching, Enter for AI-powered results</p>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {displayResults.map((result, i) => (
              <motion.div
                key={`${result.file}-${result.name}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.02 }}
              >
                <button
                  onClick={() => onNavigateToFile?.(result.file, result.lineStart)}
                  className="w-full p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getMatchTypeIcon(result.matchType)}</span>
                    <span className="font-medium text-sm truncate">{result.name}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {result.matchType}
                    </Badge>
                    {hasAIResults && (
                      <div className="flex items-center gap-1">
                        <div 
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${result.relevance * 40}px` }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(result.relevance * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <FileCode className="w-3 h-3" />
                    <code>{result.file}</code>
                    {result.lineStart && <span>:{result.lineStart}</span>}
                    {result.lineEnd && result.lineEnd !== result.lineStart && (
                      <span>-{result.lineEnd}</span>
                    )}
                  </div>

                  {result.snippet && (
                    <pre className="mt-2 p-2 rounded bg-muted/50 text-xs overflow-x-auto font-mono">
                      <code>{result.snippet}</code>
                    </pre>
                  )}

                  {hasAIResults && result.explanation && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {result.explanation}
                    </p>
                  )}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Related files */}
        {results?.relatedFiles && results.relatedFiles.length > 0 && (
          <div className="p-4 border-t border-border">
            <h3 className="text-sm font-medium mb-2">Related Files</h3>
            <div className="flex flex-wrap gap-2">
              {results.relatedFiles.map((file) => (
                <Badge
                  key={file}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => onNavigateToFile?.(file)}
                >
                  <FileCode className="w-3 h-3 mr-1" />
                  {file}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default SemanticSearchPanel;
