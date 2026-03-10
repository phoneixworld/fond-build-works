import { useState, useCallback, useMemo } from "react";
import { PresenceUser } from "@/hooks/useRealtimePresence";
import type { PanelId } from "@/components/IDEHeader";

// Panels that are always viewable (read-only) by everyone
const ALWAYS_VIEWABLE: PanelId[] = ["preview"];

// Panels that can be exclusively locked
const LOCKABLE_PANELS: PanelId[] = ["code", "cloud"];

export interface PanelLock {
  panelId: PanelId;
  userId: string;
  email: string;
  color: string;
}

export function usePanelLocking(onlineUsers: PresenceUser[]) {
  // Derive locks from presence data — each user's activePanel is their "claimed" panel
  const panelLocks = useMemo<PanelLock[]>(() => {
    return onlineUsers
      .filter(u => LOCKABLE_PANELS.includes(u.activePanel as PanelId))
      .map(u => ({
        panelId: u.activePanel as PanelId,
        userId: u.userId,
        email: u.email,
        color: u.color,
      }));
  }, [onlineUsers]);

  const isLocked = useCallback((panelId: PanelId): boolean => {
    if (ALWAYS_VIEWABLE.includes(panelId)) return false;
    return panelLocks.some(lock => lock.panelId === panelId);
  }, [panelLocks]);

  const getLockOwner = useCallback((panelId: PanelId): PanelLock | null => {
    return panelLocks.find(lock => lock.panelId === panelId) || null;
  }, [panelLocks]);

  const isAlwaysViewable = useCallback((panelId: PanelId): boolean => {
    return ALWAYS_VIEWABLE.includes(panelId);
  }, []);

  return { panelLocks, isLocked, getLockOwner, isAlwaysViewable };
}
