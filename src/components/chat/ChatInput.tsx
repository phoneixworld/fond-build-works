/**
 * ChatInput — input area with model/theme selectors, undo/redo, and send button.
 */
import { useRef } from "react";
import {
  Send, ImagePlus, ChevronDown, Sparkles, Palette, Square, Trash2,
  CheckCircle2, Undo2, Redo2
} from "lucide-react";
import VoiceInput from "@/components/VoiceInput";
import { AI_MODELS, DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TIER_COLORS: Record<string, string> = {
  fast: "text-[hsl(var(--ide-success))]",
  pro: "text-primary",
  premium: "text-[hsl(var(--ide-warning))]",
};
const TIER_LABELS: Record<string, string> = { fast: "Fast", pro: "Pro", premium: "Premium" };

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  selectedModel: AIModelId;
  onModelChange: (model: AIModelId) => void;
  selectedTheme: string;
  onThemeChange: (theme: string) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVoiceTranscript: (text: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  messageCount: number;
  attachedImages: string[];
}

const ChatInput = ({
  input, onInputChange, onSend, onKeyDown, isLoading, onStop,
  selectedModel, onModelChange, selectedTheme, onThemeChange,
  onFileSelect, onVoiceTranscript,
  canUndo, canRedo, onUndo, onRedo, onClear,
  messageCount, attachedImages,
}: ChatInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentModelInfo = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];
  const MAX_CHARS = 20000;
  const charCount = input.length;
  const isOverLimit = charCount > MAX_CHARS;
  const showCharWarning = charCount > MAX_CHARS * 0.8;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length > MAX_CHARS) {
      onInputChange(value.slice(0, MAX_CHARS));
    } else {
      onInputChange(value);
    }
    e.target.style.height = "60px";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  return (
    <div className="p-3">
      <div className={`flex items-end gap-2 bg-secondary/80 rounded-xl px-3 py-2.5 ring-1 transition-all ${
        input ? "ring-primary/30" : "ring-transparent"
      }`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors pb-0.5"
            >
             <ImagePlus className="w-4 h-4" />
           </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Attach file (image, PDF, Word) <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl+V</kbd>
          </TooltipContent>
        </Tooltip>
        <VoiceInput
          onTranscript={(text) => {
            onVoiceTranscript(text);
            if (inputRef.current) {
              inputRef.current.style.height = "auto";
              inputRef.current.style.height = inputRef.current.scrollHeight + "px";
            }
          }}
          disabled={isLoading}
        />
         <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={onFileSelect}
          className="hidden"
        />

        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={onKeyDown}
          placeholder={attachedImages.length > 0 ? "Describe what to build from this image..." : "Describe what you want to build..."}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none resize-none leading-[1.4]"
          style={{ minHeight: "60px", maxHeight: "160px" }}
          disabled={isLoading}
          rows={3}
          maxLength={MAX_CHARS}
        />
        {showCharWarning && (
          <span className={`text-[10px] font-mono whitespace-nowrap pb-0.5 ${isOverLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            {charCount.toLocaleString()}/{MAX_CHARS.toLocaleString()}
          </span>
        )}
        {isLoading ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onStop}
                className="flex items-center justify-center w-7 h-7 rounded-md bg-destructive/15 hover:bg-destructive/25 text-destructive transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Stop generating</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onSend}
                disabled={(!input.trim() && attachedImages.length === 0) || isOverLimit}
                className="text-primary hover:text-primary/80 disabled:text-muted-foreground/30 transition-colors pb-0.5"
              >
                <Send className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Send <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Model + Theme + Actions bar */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <Sparkles className={`w-3 h-3 ${TIER_COLORS[currentModelInfo.tier]}`} />
                <span>{currentModelInfo.label}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[240px]">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Model</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {AI_MODELS.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onModelChange(model.id)}
                  className={`flex items-center justify-between gap-3 ${selectedModel === model.id ? "text-primary font-medium" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-3 h-3 ${TIER_COLORS[model.tier]}`} />
                    <div>
                      <span className="text-xs">{model.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{model.description}</span>
                    </div>
                  </div>
                  <span className={`text-[9px] uppercase font-bold tracking-wider ${TIER_COLORS[model.tier]}`}>
                    {TIER_LABELS[model.tier]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-3 bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all border border-transparent hover:border-border">
                <Palette className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">{DESIGN_THEMES.find(t => t.id === selectedTheme)?.emoji} {DESIGN_THEMES.find(t => t.id === selectedTheme)?.label}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[280px] p-1.5">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">Design Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {DESIGN_THEMES.map((theme) => (
                <DropdownMenuItem
                  key={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${selectedTheme === theme.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary"}`}
                >
                  <span className="text-base">{theme.emoji}</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{theme.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{theme.description}</span>
                  </div>
                  {selectedTheme === theme.id && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-auto" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Undo/Redo */}
          {(canUndo || canRedo) && (
            <>
              <div className="w-px h-3 bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onUndo} disabled={!canUndo || isLoading} className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors">
                    <Undo2 className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Undo (⌘Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onRedo} disabled={!canRedo || isLoading} className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors">
                    <Redo2 className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Redo (⌘⇧Z)</TooltipContent>
              </Tooltip>
            </>
          )}

          {messageCount > 0 && (
            <>
              <div className="w-px h-3 bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onClear}
                    disabled={isLoading}
                    className="text-muted-foreground/50 hover:text-destructive disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Clear conversation</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {charCount > 0 && (
            <span className={`text-[10px] transition-colors ${charCount > 2000 ? "text-destructive" : "text-muted-foreground/40"}`}>
              {charCount.toLocaleString()}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/40">
            {messageCount} msg{messageCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
