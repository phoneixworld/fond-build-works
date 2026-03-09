import { useState, useCallback, useRef } from "react";

export interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  html: string;
  sandpackFiles: Record<string, string> | null;
}

const MAX_CHECKPOINTS = 30;

export function useUndoRedo() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const idCounter = useRef(0);

  const createCheckpoint = useCallback((label: string, html: string, sandpackFiles: Record<string, string> | null) => {
    const checkpoint: Checkpoint = {
      id: `cp-${++idCounter.current}`,
      label,
      timestamp: Date.now(),
      html,
      sandpackFiles: sandpackFiles ? { ...sandpackFiles } : null,
    };

    setCheckpoints(prev => {
      // Remove any future checkpoints if we're in the middle of history
      const base = prev.slice(0, currentIndex + 1);
      const next = [...base, checkpoint].slice(-MAX_CHECKPOINTS);
      return next;
    });
    setCurrentIndex(prev => {
      const base = Math.min(prev + 1, MAX_CHECKPOINTS - 1);
      return base;
    });

    return checkpoint;
  }, [currentIndex]);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < checkpoints.length - 1;

  const undo = useCallback((): Checkpoint | null => {
    if (!canUndo) return null;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    return checkpoints[newIndex];
  }, [canUndo, currentIndex, checkpoints]);

  const redo = useCallback((): Checkpoint | null => {
    if (!canRedo) return null;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    return checkpoints[newIndex];
  }, [canRedo, currentIndex, checkpoints]);

  const clear = useCallback(() => {
    setCheckpoints([]);
    setCurrentIndex(-1);
  }, []);

  return {
    checkpoints,
    currentIndex,
    createCheckpoint,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  };
}
