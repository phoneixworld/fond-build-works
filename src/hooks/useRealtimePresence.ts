import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/contexts/ProjectContext";

// Presence colors for up to 8 simultaneous users
const PRESENCE_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#ef4444", "#06b6d4", "#f97316",
];

export interface PresenceUser {
  userId: string;
  email: string;
  color: string;
  activePanel: string;
  lastSeen: number;
  isTyping?: boolean;
}

export function useRealtimePresence(activePanel: string) {
  const { user } = useAuth();
  const { currentProject } = useProjects();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const colorRef = useRef<string>("");

  // Assign a stable color per session
  useEffect(() => {
    if (!colorRef.current) {
      colorRef.current = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
    }
  }, []);

  useEffect(() => {
    if (!user || !currentProject) return;

    const channelName = `presence:${currentProject.id}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        Object.entries(state).forEach(([key, presences]) => {
          const p = (presences as any[])[0];
          if (p && key !== user.id) {
            users.push({
              userId: key,
              email: p.email || "Unknown",
              color: p.color || PRESENCE_COLORS[0],
              activePanel: p.activePanel || "preview",
              lastSeen: Date.now(),
              isTyping: p.isTyping || false,
            });
          }
        });
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            email: user.email,
            color: colorRef.current,
            activePanel,
            isTyping: false,
            joinedAt: Date.now(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user, currentProject]);

  // Update presence when active panel changes
  useEffect(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.track({
      email: user.email,
      color: colorRef.current,
      activePanel,
      isTyping: false,
      joinedAt: Date.now(),
    });
  }, [activePanel, user]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!channelRef.current || !user) return;
    channelRef.current.track({
      email: user.email,
      color: colorRef.current,
      activePanel,
      isTyping,
      joinedAt: Date.now(),
    });
  }, [activePanel, user]);

  return { onlineUsers, setTyping, myColor: colorRef.current };
}
