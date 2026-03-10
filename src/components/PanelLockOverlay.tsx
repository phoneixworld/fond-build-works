import { Lock } from "lucide-react";
import { motion } from "framer-motion";
import type { PanelLock } from "@/hooks/usePanelLocking";

interface PanelLockOverlayProps {
  lock: PanelLock;
}

const PanelLockOverlay = ({ lock }: PanelLockOverlayProps) => {
  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-auto"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-background shadow-lg"
        style={{ backgroundColor: lock.color }}
      >
        {getInitials(lock.email)}
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Lock className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">
          {lock.email.split("@")[0]} is editing this panel
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/60 max-w-[200px] text-center">
        Switch to another panel or wait for them to finish
      </p>
    </motion.div>
  );
};

export default PanelLockOverlay;
