import { useState } from "react";
import { RotateCcw, Clock, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

export interface Version {
  id: string;
  timestamp: number;
  label: string; // first ~60 chars of user prompt
  html: string;
  messageIndex: number;
}

interface VersionHistoryProps {
  versions: Version[];
  onRevert: (version: Version) => void;
  onClose: () => void;
}

const VersionHistory = ({ versions, onRevert, onClose }: VersionHistoryProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Version History</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No versions yet</p>
            <p className="text-[10px] mt-1 text-muted-foreground/60">Versions are created after each AI response</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Version History</span>
          <span className="text-xs text-muted-foreground">({versions.length})</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {versions.map((version, i) => (
          <motion.div
            key={version.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            onMouseEnter={() => setHoveredId(version.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-secondary/50 cursor-pointer transition-all"
            onClick={() => onRevert(version)}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                i === 0 ? "border-primary bg-primary" : "border-border bg-transparent group-hover:border-primary/50"
              }`} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{version.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(version.timestamp), { addSuffix: true })}
              </p>
            </div>

            <AnimatePresence>
              {hoveredId === version.id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 text-[10px] text-primary font-medium shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  Revert
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default VersionHistory;
