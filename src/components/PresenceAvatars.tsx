import { PresenceUser } from "@/hooks/useRealtimePresence";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PresenceAvatarsProps {
  onlineUsers: PresenceUser[];
  currentUserEmail?: string;
  myColor: string;
  onToggleChat: () => void;
  unreadCount?: number;
}

const PresenceAvatars = ({ onlineUsers, currentUserEmail, myColor, onToggleChat, unreadCount = 0 }: PresenceAvatarsProps) => {
  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();

  const totalOnline = onlineUsers.length + 1; // +1 for self

  return (
    <div className="flex items-center gap-1">
      {/* Online count badge */}
      <button
        onClick={onToggleChat}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-secondary transition-colors relative"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-success))] animate-pulse" />
        <span className="text-[10px] font-medium text-muted-foreground">
          {totalOnline} online
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[8px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Avatar stack */}
      <div className="flex items-center -space-x-1.5">
        {/* Current user - always first */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-[hsl(var(--ide-panel-header))] cursor-default"
              style={{ backgroundColor: myColor }}
            >
              {getInitials(currentUserEmail || "Me")}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">You ({currentUserEmail})</TooltipContent>
        </Tooltip>

        {/* Other online users */}
        {onlineUsers.slice(0, 4).map(u => (
          <Tooltip key={u.userId}>
            <TooltipTrigger asChild>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-[hsl(var(--ide-panel-header))] cursor-default relative"
                style={{ backgroundColor: u.color }}
              >
                {getInitials(u.email)}
                {u.isTyping && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[hsl(var(--ide-warning))] rounded-full border-2 border-[hsl(var(--ide-panel-header))] animate-pulse" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {u.email} — viewing {u.activePanel}
              {u.isTyping && " (typing...)"}
            </TooltipContent>
          </Tooltip>
        ))

        }

        {/* Overflow */}
        {onlineUsers.length > 4 && (
          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold text-muted-foreground ring-2 ring-[hsl(var(--ide-panel-header))]">
            +{onlineUsers.length - 4}
          </div>
        )}
      </div>
    </div>
  );
};

export default PresenceAvatars;
