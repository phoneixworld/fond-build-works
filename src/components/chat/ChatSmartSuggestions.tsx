/**
 * ChatSmartSuggestions — Context-aware action suggestions shown above the input.
 * Uses the v3 Smart Suggestion Engine with PSAL, FCD, ODE, UIP, GDS, EAS, CMS, SRE, SL.
 */
import { generateSmartSuggestionsV3 } from "@/lib/suggestions";

interface ChatSmartSuggestionsProps {
  codeForAnalysis: string;
  messages: { role: string; content: string }[];
  onSend: (prompt: string) => void;
  isLoading: boolean;
  hasFollowUp: boolean;
  hasInput: boolean;
}

export default function ChatSmartSuggestions({
  codeForAnalysis, messages, onSend, isLoading, hasFollowUp, hasInput,
}: ChatSmartSuggestionsProps) {
  if (isLoading || hasFollowUp || hasInput) return null;

  const suggestions = generateSmartSuggestionsV3(codeForAnalysis, messages, 3);
  if (suggestions.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1">
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSend(s.prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all group"
          >
            <span className="text-xs group-hover:scale-110 transition-transform">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
