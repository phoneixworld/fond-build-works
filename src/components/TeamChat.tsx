import { useState, useEffect, useRef, useCallback } from "react";
import { Send, MessageCircle, X, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/contexts/ProjectContext";
import { PresenceUser } from "@/hooks/useRealtimePresence";
import { motion, AnimatePresence } from "framer-motion";

interface TeamMessage {
  id: string;
  user_email: string;
  content: string;
  created_at: string;
  user_id: string;
}

interface TeamChatProps {
  onlineUsers: PresenceUser[];
  isOpen: boolean;
  onClose: () => void;
}

const TeamChat = ({ onlineUsers, isOpen, onClose }: TeamChatProps) => {
  const { user } = useAuth();
  const { currentProject } = useProjects();
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch existing messages
  useEffect(() => {
    if (!currentProject || !isOpen) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("team_messages" as any)
        .select("*")
        .eq("project_id", currentProject.id)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((data as any as TeamMessage[]) || []);
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    })();
  }, [currentProject, isOpen]);

  // Subscribe to new messages in realtime
  useEffect(() => {
    if (!currentProject || !isOpen) return;

    const channel = supabase
      .channel(`team-chat:${currentProject.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
          filter: `project_id=eq.${currentProject.id}`,
        },
        (payload) => {
          const msg = payload.new as TeamMessage;
          setMessages((prev) => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [currentProject, isOpen]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !user || !currentProject) return;
    setSending(true);
    const content = input.trim();
    setInput("");

    await supabase.from("team_messages" as any).insert({
      project_id: currentProject.id,
      user_id: user.id,
      user_email: user.email,
      content,
    } as any);

    setSending(false);
    inputRef.current?.focus();
  }, [input, user, currentProject]);

  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();
  const getUserColor = (userId: string) => {
    const online = onlineUsers.find(u => u.userId === userId);
    return online?.color || "#64748b";
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="absolute bottom-4 right-4 w-80 h-[420px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Team Chat</span>
          {onlineUsers.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--ide-success))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-success))] animate-pulse" />
              {onlineUsers.length + 1} online
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Online users strip */}
      {onlineUsers.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-secondary/30">
          <span className="text-[10px] text-muted-foreground mr-1">Online:</span>
          {/* Current user */}
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background"
            style={{ backgroundColor: "#3b82f6" }}
            title={user?.email || "You"}
          >
            {getInitials(user?.email || "Me")}
          </div>
          {onlineUsers.map(u => (
            <div
              key={u.userId}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background relative"
              style={{ backgroundColor: u.color }}
              title={`${u.email} — viewing ${u.activePanel}`}
            >
              {getInitials(u.email)}
              {u.isTyping && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[hsl(var(--ide-warning))] rounded-full border border-background animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Users className="w-8 h-8 mx-auto text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                  style={{ backgroundColor: isMe ? "#3b82f6" : getUserColor(msg.user_id) }}
                >
                  {getInitials(msg.user_email)}
                </div>
                <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <p className="text-[10px] text-muted-foreground mb-0.5 truncate">{msg.user_email}</p>
                  )}
                  <div className={`rounded-2xl px-3 py-1.5 text-xs leading-relaxed ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-tr-md"
                      : "bg-secondary text-foreground rounded-tl-md"
                  }`}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-white mt-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Message your team..."
            className="flex-1 bg-secondary text-foreground text-xs rounded-xl px-3 py-2 outline-none border border-border focus:border-primary transition-colors placeholder:text-muted-foreground/50"
            autoFocus
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-all shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default TeamChat;
