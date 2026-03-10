/**
 * Cloud Log Event Bus
 * 
 * A simple pub/sub system for pushing real-time log entries from anywhere
 * in the IDE (build compiler, file changes, auth events, etc.) into the
 * CloudLogs panel without requiring DB round-trips.
 */

export interface CloudLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  source?: string;
}

type LogListener = (entry: CloudLogEntry) => void;

const listeners = new Set<LogListener>();
const buffer: CloudLogEntry[] = [];
const MAX_BUFFER = 200;

/** Subscribe to log events. Returns unsubscribe function. */
export function onCloudLog(listener: LogListener): () => void {
  listeners.add(listener);
  // Replay buffered entries
  buffer.forEach(entry => listener(entry));
  return () => listeners.delete(listener);
}

/** Push a log entry to all listeners. */
export function emitCloudLog(
  level: CloudLogEntry["level"],
  message: string,
  source?: string
) {
  const entry: CloudLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    source,
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  listeners.forEach(fn => fn(entry));
}

/** Convenience shortcuts */
export const cloudLog = {
  info: (msg: string, source?: string) => emitCloudLog("info", msg, source),
  warn: (msg: string, source?: string) => emitCloudLog("warn", msg, source),
  error: (msg: string, source?: string) => emitCloudLog("error", msg, source),
};

/** Clear the buffer (used when switching projects). */
export function clearCloudLogBuffer() {
  buffer.length = 0;
}
