import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ChevronDown, ChevronRight, FileCode, Plus, Minus, Eye } from "lucide-react";

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  isNew: boolean;
}

interface DiffPreviewProps {
  diffs: FileDiff[];
  onAccept: (acceptedPaths: string[]) => void;
  onReject: () => void;
  onAcceptAll: () => void;
}

function computeLineDiff(oldLines: string[], newLines: string[]): Array<{ type: "add" | "remove" | "same"; line: string; lineNum: number }> {
  const result: Array<{ type: "add" | "remove" | "same"; line: string; lineNum: number }> = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let lineNum = 0;

  // Simple line-by-line comparison (not a full diff algorithm, but effective for display)
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    lineNum++;
    if (oi < oldLines.length && ni < newLines.length) {
      if (oldLines[oi] === newLines[ni]) {
        result.push({ type: "same", line: newLines[ni], lineNum });
        oi++; ni++;
      } else {
        result.push({ type: "remove", line: oldLines[oi], lineNum });
        result.push({ type: "add", line: newLines[ni], lineNum });
        oi++; ni++;
      }
    } else if (oi < oldLines.length) {
      result.push({ type: "remove", line: oldLines[oi], lineNum });
      oi++;
    } else {
      result.push({ type: "add", line: newLines[ni], lineNum });
      ni++;
    }
  }
  return result;
}

const DiffPreview = ({ diffs, onAccept, onReject, onAcceptAll }: DiffPreviewProps) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(diffs.map(d => d.path)));
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(diffs.map(d => d.path)));

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const toggleSelect = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const addCount = diffs.reduce((sum, d) => {
    const newLines = d.newContent.split("\n");
    const oldLines = d.oldContent.split("\n");
    return sum + Math.max(0, newLines.length - oldLines.length);
  }, 0);

  const removeCount = diffs.reduce((sum, d) => {
    const newLines = d.newContent.split("\n");
    const oldLines = d.oldContent.split("\n");
    return sum + Math.max(0, oldLines.length - newLines.length);
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-border bg-card overflow-hidden shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <Eye className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Review Changes</span>
          <span className="text-[10px] text-muted-foreground">
            {diffs.length} file{diffs.length !== 1 ? "s" : ""} · 
            <span className="text-[hsl(var(--ide-success))] ml-1">+{addCount}</span>
            <span className="text-destructive ml-1">-{removeCount}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Reject All
          </button>
          <button
            onClick={() => onAccept(Array.from(selectedFiles))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Accept {selectedFiles.size === diffs.length ? "All" : `${selectedFiles.size}/${diffs.length}`}
          </button>
        </div>
      </div>

      {/* File diffs */}
      <div className="max-h-[400px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {diffs.map(diff => {
          const isExpanded = expandedFiles.has(diff.path);
          const isSelected = selectedFiles.has(diff.path);
          const oldLines = diff.oldContent.split("\n");
          const newLines = diff.newContent.split("\n");
          const lineDiff = isExpanded ? computeLineDiff(oldLines, newLines) : [];

          return (
            <div key={diff.path} className="border-b border-border last:border-b-0">
              <div
                className="flex items-center gap-2 px-4 py-2 hover:bg-secondary/40 cursor-pointer transition-colors"
                onClick={() => toggleFile(diff.path)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(diff.path); }}
                  className="w-3.5 h-3.5 rounded border-border accent-primary"
                />
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                <FileCode className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-xs font-medium text-foreground">{diff.path}</span>
                {diff.isNew && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--ide-success))]/15 text-[hsl(var(--ide-success))] font-bold uppercase">New</span>
                )}
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-[hsl(var(--ide-panel))] text-[11px] font-mono leading-5 overflow-x-auto">
                      {lineDiff.slice(0, 100).map((l, i) => (
                        <div
                          key={i}
                          className={`flex ${
                            l.type === "add" ? "bg-[hsl(var(--ide-success))]/8 text-[hsl(var(--ide-success))]" :
                            l.type === "remove" ? "bg-destructive/8 text-destructive line-through" :
                            "text-muted-foreground"
                          }`}
                        >
                          <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/40 select-none border-r border-border/30">
                            {l.type === "remove" ? "" : l.lineNum}
                          </span>
                          <span className="w-5 shrink-0 text-center select-none">
                            {l.type === "add" ? "+" : l.type === "remove" ? "-" : " "}
                          </span>
                          <span className="px-2 whitespace-pre">{l.line}</span>
                        </div>
                      ))}
                      {lineDiff.length > 100 && (
                        <div className="px-4 py-1 text-[10px] text-muted-foreground/50 text-center">
                          ... {lineDiff.length - 100} more lines
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default DiffPreview;
