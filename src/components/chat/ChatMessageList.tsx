/**
 * ChatMessageList — Renders the scrollable message list with edit/regenerate support.
 * Extracted from ChatPanel.tsx for maintainability.
 */
import { forwardRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User } from "lucide-react";
import ChatMessage from "./ChatMessage";
import { type MsgContent, getTextContent } from "@/lib/codeParser";

type MsgMeta = { tokens?: number; durationMs?: number; model?: string };
type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number; meta?: MsgMeta };

interface ChatMessageListProps {
  messages: Msg[];
  isLoading: boolean;
  onSmartSend: (text: string) => void;
  onEditMessage: (index: number) => void;
  onRegenerate: (index: number) => void;
  editingIndex: number | null;
  editText: string;
  onEditTextChange: (text: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
}

const ChatMessageList = forwardRef<HTMLDivElement, ChatMessageListProps>(({
  messages, isLoading, onSmartSend,
  onEditMessage, onRegenerate,
  editingIndex, editText, onEditTextChange, onSubmitEdit, onCancelEdit,
}, ref) => {
  return (
    <AnimatePresence initial={false}>
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        const isEditing = editingIndex === i;

        if (isEditing) {
          return (
            <motion.div
              key={`edit-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => onEditTextChange(e.target.value)}
                  className="w-full bg-secondary rounded-xl px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-primary/30 resize-none leading-[1.7]"
                  rows={Math.min(editText.split("\n").length + 1, 6)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmitEdit(); }
                    if (e.key === "Escape") onCancelEdit();
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={onSubmitEdit}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Save & Regenerate
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          );
        }

        return (
          <ChatMessage
            key={i}
            content={msg.content}
            role={msg.role}
            timestamp={msg.timestamp}
            meta={msg.meta}
            isLoading={isLoading}
            onEdit={isUser ? () => onEditMessage(i) : undefined}
            onRegenerate={!isUser ? () => onRegenerate(i) : undefined}
            showActions={!isLoading}
            onSuggestionClick={!isUser ? (text) => onSmartSend(text) : undefined}
          />
        );
      })}
    </AnimatePresence>
  );
});

ChatMessageList.displayName = "ChatMessageList";
export default ChatMessageList;
