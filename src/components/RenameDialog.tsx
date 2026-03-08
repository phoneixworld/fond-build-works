import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EMOJIS = ["🚀", "📱", "🎨", "💡", "🔧", "📊", "🛒", "💬", "🎮", "📝", "🏠", "💰", "🎵", "📸", "🍳", "✅", "🌐", "⚡", "🔒", "📈", "🎯", "❤️", "🤖", "🗂️"];
const PROJECT_NAME_MAX = 50;

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialEmoji: string;
  onRename: (fullName: string) => Promise<void>;
  validateName: (name: string) => string;
}

const RenameDialog = ({ open, onOpenChange, initialName, initialEmoji, onRename, validateName }: RenameDialogProps) => {
  const [value, setValue] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [error, setError] = useState("");

  // Sync when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setValue(initialName);
      setEmoji(initialEmoji);
      setError("");
    }
    onOpenChange(o);
  };

  const handleSubmit = async () => {
    const fullName = emoji ? `${emoji} ${value.trim()}` : value.trim();
    const err = validateName(fullName);
    if (err) { setError(err); return; }
    await onRename(fullName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex gap-2">
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-10 h-10 rounded-lg bg-secondary border border-border hover:border-primary/30 flex items-center justify-center text-lg transition-colors shrink-0"
              >
                {emoji || "🚀"}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-12 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 w-[200px]">
                  {EMOJIS.map(e => (
                    <button key={e} onClick={() => { setEmoji(e); setShowEmojiPicker(false); }} className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary transition-colors text-base">
                      {e}
                    </button>
                  ))}
                  <button onClick={() => { setEmoji(""); setShowEmojiPicker(false); }} className="col-span-6 text-[10px] text-muted-foreground hover:text-foreground py-1 mt-1 border-t border-border">
                    Remove emoji
                  </button>
                </div>
              )}
            </div>
            <input
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(validateName(e.target.value)); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Project name"
              maxLength={PROJECT_NAME_MAX}
              className={`flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border transition-colors ${error ? "border-destructive" : "border-border focus:border-primary"}`}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{value.length}/{PROJECT_NAME_MAX}</span>
            <div className="flex gap-2">
              <button onClick={() => onOpenChange(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={!value.trim() || !!error} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors">Rename</button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RenameDialog;
