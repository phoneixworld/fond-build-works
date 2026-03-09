/**
 * Semantic Code Search — AI-powered codebase understanding
 */

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AUTH_HEADER = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

export type SearchMode = "search" | "explain" | "dependencies" | "refactor";
export type MatchType = "component" | "function" | "hook" | "type" | "style" | "config" | "import";

export interface SearchResult {
  file: string;
  relevance: number;
  matchType: MatchType;
  name: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
  explanation: string;
}

export interface SearchResponse {
  summary: string;
  results: SearchResult[];
  relatedFiles?: string[];
  suggestedActions?: string[];
}

export async function semanticSearch(
  query: string,
  files: Record<string, string>,
  mode: SearchMode = "search"
): Promise<SearchResponse> {
  const resp = await fetch(`${BASE_URL}/functions/v1/semantic-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({ query, files, mode }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (resp.status === 402) throw new Error("Usage limit reached.");
    throw new Error("Semantic search failed");
  }

  return resp.json();
}

/**
 * Fast client-side regex search (no AI, instant results)
 */
export function quickSearch(query: string, files: Record<string, string>): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  for (const [path, code] of Object.entries(files)) {
    const lines = code.split("\n");
    
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(queryLower)) {
        // Determine match type
        let matchType: MatchType = "function";
        if (/^(export\s+)?(default\s+)?function\s+\w+/.test(line) || /^const\s+\w+\s*=.*=>/.test(line)) {
          if (/^(export|const)\s+.*use[A-Z]/.test(line)) matchType = "hook";
          else if (/^(export\s+)?(default\s+)?function\s+[A-Z]/.test(line) || /^const\s+[A-Z]\w+\s*=/.test(line)) matchType = "component";
          else matchType = "function";
        } else if (/^import\s/.test(line)) {
          matchType = "import";
        } else if (/^(interface|type)\s/.test(line)) {
          matchType = "type";
        } else if (/className|style|css/i.test(line)) {
          matchType = "style";
        }

        // Extract name
        const nameMatch = line.match(/(?:function|const|let|var|interface|type|class)\s+(\w+)/);
        const name = nameMatch?.[1] || line.trim().slice(0, 40);

        results.push({
          file: path,
          relevance: 0.8,
          matchType,
          name,
          lineStart: i + 1,
          snippet: line.trim(),
          explanation: `Match in ${path} at line ${i + 1}`,
        });
      }
    });
  }

  // Sort by relevance, deduplicate by file
  return results.slice(0, 20);
}

export function getMatchTypeIcon(type: MatchType): string {
  const icons: Record<MatchType, string> = {
    component: "🧩",
    function: "⚡",
    hook: "🪝",
    type: "📐",
    style: "🎨",
    config: "⚙️",
    import: "📦",
  };
  return icons[type] || "📄";
}
