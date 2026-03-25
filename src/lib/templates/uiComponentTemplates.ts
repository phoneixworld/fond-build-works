/**
 * Shadcn-Compatible UI Component Templates for Phoenix Builder
 * 
 * Registry: 22 self-contained components (no Radix dependency)
 * All work in ESM/Sandpack preview without extra npm packages.
 * Each uses CSS variables for theming and includes proper
 * keyboard navigation, ARIA attributes, and transition animations.
 * 
 * Export signatures match the shadcn/ui API exactly so generated
 * code can import { Table, TableHeader, TableRow, ... } from "./ui/Table"
 */

// ─── 1. Utils (cn helper) ────────────────────────────────────────────────────

export const UTILS_COMPONENT = `export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
`;

// ─── 2. Button ───────────────────────────────────────────────────────────────

export const BUTTON_COMPONENT = `import React from "react";
import { cn } from "./utils";

const buttonVariants = {
  variant: {
    default: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-sm",
    destructive: "bg-[var(--color-danger)] text-white hover:opacity-90",
    outline: "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]",
    secondary: "bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-border)]/50",
    ghost: "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]",
    link: "text-[var(--color-primary)] underline-offset-4 hover:underline",
  },
  size: {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-9 px-3 text-xs",
    lg: "h-11 px-8 text-base",
    icon: "h-10 w-10",
  },
};

export { buttonVariants };

export default function Button({ children, onClick, variant = "default", size = "default", className = "", disabled = false, type = "button", ...props }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants.variant[variant] || buttonVariants.variant.default,
        buttonVariants.size[size] || buttonVariants.size.default,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { Button };
`;

// ─── 3. Card ─────────────────────────────────────────────────────────────────

export const CARD_COMPONENT = `import React from "react";
import { cn } from "./utils";

export function Card({ children, className = "", ...props }) {
  return <div className={cn("rounded-lg border border-[var(--color-border)] bg-white shadow-sm", className)} {...props}>{children}</div>;
}

export function CardHeader({ children, className = "", ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}>{children}</div>;
}

export function CardTitle({ children, className = "", ...props }) {
  return <h3 className={cn("text-2xl font-semibold leading-none tracking-tight text-[var(--color-text)]", className)} {...props}>{children}</h3>;
}

export function CardDescription({ children, className = "", ...props }) {
  return <p className={cn("text-sm text-[var(--color-text-muted)]", className)} {...props}>{children}</p>;
}

export function CardContent({ children, className = "", ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props}>{children}</div>;
}

export function CardFooter({ children, className = "", ...props }) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props}>{children}</div>;
}

export default Card;
`;

// ─── 4. Input ────────────────────────────────────────────────────────────────

export const INPUT_COMPONENT = `import React from "react";
import { cn } from "./utils";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export default Input;
export { Input };
`;

// ─── 5. Label ────────────────────────────────────────────────────────────────

export const LABEL_COMPONENT = `import React from "react";
import { cn } from "./utils";

export default function Label({ children, htmlFor, className = "", ...props }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-sm font-medium leading-none text-[var(--color-text)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
`;

// ─── 6. Badge ────────────────────────────────────────────────────────────────

export const BADGE_COMPONENT = `import React from "react";
import { cn } from "./utils";

const badgeVariants = {
  default: "bg-[var(--color-primary)] text-white border-transparent",
  secondary: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  destructive: "bg-red-50 text-red-700 border-red-200",
  outline: "text-[var(--color-text-secondary)] border-[var(--color-border)]",
};

export { badgeVariants };

export default function Badge({ children, variant = "default", className = "" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
      badgeVariants[variant] || badgeVariants.default,
      className
    )}>
      {children}
    </span>
  );
}

export { Badge };
`;

// ─── 7. Separator ────────────────────────────────────────────────────────────

export const SEPARATOR_COMPONENT = `import React from "react";
import { cn } from "./utils";

export default function Separator({ orientation = "horizontal", className = "", ...props }) {
  return (
    <div
      role="separator"
      className={cn(
        "shrink-0 bg-[var(--color-border)]",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
`;

// ─── 8. Skeleton ─────────────────────────────────────────────────────────────

export const SKELETON_COMPONENT = `import React from "react";
import { cn } from "./utils";

export default function Skeleton({ className = "", ...props }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-[var(--color-bg-secondary)]", className)} {...props} />
  );
}

export { Skeleton };
`;

// ─── 9. Checkbox ─────────────────────────────────────────────────────────────

export const CHECKBOX_COMPONENT = `import React from "react";
import { Check } from "lucide-react";
import { cn } from "./utils";

export default function Checkbox({ checked, onCheckedChange, className = "", disabled = false, id, ...props }) {
  return (
    <button
      role="checkbox"
      type="button"
      id={id}
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--color-primary)] text-white" : "bg-white",
        className
      )}
      {...props}
    >
      {checked && <Check className="h-3.5 w-3.5 mx-auto" />}
    </button>
  );
}

export { Checkbox };
`;

// ─── 10. Dialog ──────────────────────────────────────────────────────────────

export const DIALOG_COMPONENT = `import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "./utils";

export function Dialog({ open, onOpenChange, children }) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleEsc); document.body.style.overflow = ""; };
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-[var(--color-border)] animate-scaleIn">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ children, className = "" }) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}

export function DialogHeader({ children, className = "" }) {
  return <div className={cn("px-6 pt-6 pb-2", className)}>{children}</div>;
}

export function DialogTitle({ children, className = "" }) {
  return <h2 className={cn("text-lg font-semibold text-[var(--color-text)]", className)}>{children}</h2>;
}

export function DialogDescription({ children, className = "" }) {
  return <p className={cn("text-sm text-[var(--color-text-muted)] mt-1", className)}>{children}</p>;
}

export function DialogFooter({ children, className = "" }) {
  return <div className={cn("px-6 pb-6 pt-2 flex items-center justify-end gap-3", className)}>{children}</div>;
}

export default Dialog;
`;

// ─── 11. Table ───────────────────────────────────────────────────────────────

export const TABLE_COMPONENT = `import React from "react";
import { cn } from "./utils";

export function Table({ children, className = "", ...props }) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className = "", ...props }) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props}>{children}</thead>;
}

export function TableBody({ children, className = "", ...props }) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props}>{children}</tbody>;
}

export function TableFooter({ children, className = "", ...props }) {
  return <tfoot className={cn("border-t bg-[var(--color-bg-secondary)]/50 font-medium", className)} {...props}>{children}</tfoot>;
}

export function TableRow({ children, className = "", onClick, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={cn("border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-secondary)]/50", onClick ? "cursor-pointer" : "", className)}
      {...props}
    >{children}</tr>
  );
}

export function TableHead({ children, className = "", ...props }) {
  return <th className={cn("h-12 px-4 text-left align-middle font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider", className)} {...props}>{children}</th>;
}

export function TableCell({ children, className = "", ...props }) {
  return <td className={cn("p-4 align-middle text-[var(--color-text)]", className)} {...props}>{children}</td>;
}

export function TableCaption({ children, className = "", ...props }) {
  return <caption className={cn("mt-4 text-sm text-[var(--color-text-muted)]", className)} {...props}>{children}</caption>;
}

export default Table;
`;

// ─── 12. Textarea ────────────────────────────────────────────────────────────

export const TEXTAREA_COMPONENT = `import React from "react";
import { cn } from "./utils";

const Textarea = React.forwardRef(({ className = "", ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export default Textarea;
export { Textarea };
`;

// ─── 13. Select ──────────────────────────────────────────────────────────────

export const SELECT_COMPONENT = `import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "./utils";

const SelectContext = createContext({});

export function Select({ value, onValueChange, children, defaultValue }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(value || defaultValue || "");
  const ref = useRef(null);

  useEffect(() => {
    if (value !== undefined) setSelected(value);
  }, [value]);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (val) => {
    setSelected(val);
    onValueChange && onValueChange(val);
    setIsOpen(false);
  };

  return (
    <SelectContext.Provider value={{ isOpen, setIsOpen, selected, handleSelect }}>
      <div ref={ref} className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className = "" }) {
  const { isOpen, setIsOpen, selected } = useContext(SelectContext);
  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20",
        !selected ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]",
        className
      )}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 text-[var(--color-text-muted)] transition-transform", isOpen ? "rotate-180" : "")} />
    </button>
  );
}

export function SelectValue({ placeholder = "Select..." }) {
  const { selected } = useContext(SelectContext);
  return <span className="truncate">{selected || placeholder}</span>;
}

export function SelectContent({ children, className = "" }) {
  const { isOpen } = useContext(SelectContext);
  if (!isOpen) return null;
  return (
    <div className={cn("absolute z-50 mt-1 w-full bg-white border border-[var(--color-border)] rounded-lg shadow-lg py-1 max-h-60 overflow-auto animate-fadeIn", className)}>
      {children}
    </div>
  );
}

export function SelectItem({ value, children, className = "" }) {
  const { selected, handleSelect } = useContext(SelectContext);
  const isSelected = selected === value;
  return (
    <button
      onClick={() => handleSelect(value)}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[var(--color-bg-secondary)] transition-colors",
        isSelected ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text)]",
        className
      )}
    >
      <span>{children}</span>
      {isSelected && <Check className="h-4 w-4" />}
    </button>
  );
}

export function SelectGroup({ children, className = "" }) {
  return <div className={cn("py-1", className)}>{children}</div>;
}

export function SelectLabel({ children, className = "" }) {
  return <div className={cn("px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)]", className)}>{children}</div>;
}

export default Select;
`;

// ─── 14. Tabs ────────────────────────────────────────────────────────────────

export const TABS_COMPONENT = `import React, { useState, createContext, useContext } from "react";
import { cn } from "./utils";

const TabsContext = createContext({});

export function Tabs({ defaultValue, value, onValueChange, children, className = "" }) {
  const [activeTab, setActiveTab] = useState(value || defaultValue || "");

  const handleChange = (val) => {
    setActiveTab(val);
    onValueChange && onValueChange(val);
  };

  const current = value !== undefined ? value : activeTab;

  return (
    <TabsContext.Provider value={{ activeTab: current, setActiveTab: handleChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = "" }) {
  return (
    <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-bg-secondary)] p-1 text-[var(--color-text-muted)]", className)} role="tablist">
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className = "" }) {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  const isActive = activeTab === value;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
        isActive
          ? "bg-white text-[var(--color-text)] shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = "" }) {
  const { activeTab } = useContext(TabsContext);
  if (activeTab !== value) return null;
  return <div role="tabpanel" className={cn("mt-2", className)}>{children}</div>;
}

export default Tabs;
`;

// ─── 15. Alert ───────────────────────────────────────────────────────────────

export const ALERT_COMPONENT = `import React from "react";
import { cn } from "./utils";

const variants = {
  default: "bg-white border-[var(--color-border)] text-[var(--color-text)]",
  destructive: "bg-red-50 border-red-200 text-red-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};

export function Alert({ children, variant = "default", className = "" }) {
  return (
    <div role="alert" className={cn("relative w-full rounded-lg border p-4", variants[variant] || variants.default, className)}>
      {children}
    </div>
  );
}

export function AlertTitle({ children, className = "" }) {
  return <h5 className={cn("mb-1 font-medium leading-none tracking-tight", className)}>{children}</h5>;
}

export function AlertDescription({ children, className = "" }) {
  return <div className={cn("text-sm opacity-90", className)}>{children}</div>;
}

export default Alert;
`;

// ─── 16. Avatar ──────────────────────────────────────────────────────────────

export const AVATAR_COMPONENT = `import React, { useState } from "react";
import { cn } from "./utils";

export function Avatar({ children, className = "" }) {
  return (
    <span className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}>
      {children}
    </span>
  );
}

export function AvatarImage({ src, alt = "", className = "" }) {
  const [error, setError] = useState(false);
  if (error || !src) return null;
  return <img src={src} alt={alt} onError={() => setError(true)} className={cn("aspect-square h-full w-full object-cover", className)} />;
}

export function AvatarFallback({ children, className = "" }) {
  return (
    <span className={cn("flex h-full w-full items-center justify-center rounded-full bg-[var(--color-bg-secondary)] text-sm font-medium text-[var(--color-text-muted)]", className)}>
      {children}
    </span>
  );
}

export default Avatar;
`;

// ─── 17. Progress ────────────────────────────────────────────────────────────

export const PROGRESS_COMPONENT = `import React from "react";
import { cn } from "./utils";

export default function Progress({ value = 0, max = 100, className = "" }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("relative h-4 w-full overflow-hidden rounded-full bg-[var(--color-bg-secondary)]", className)}>
      <div
        className="h-full bg-[var(--color-primary)] transition-all duration-300"
        style={{ width: pct + "%" }}
      />
    </div>
  );
}

export { Progress };
`;

// ─── 18. Switch ──────────────────────────────────────────────────────────────

export const SWITCH_COMPONENT = `import React from "react";
import { cn } from "./utils";

export default function Switch({ checked = false, onCheckedChange, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-bg-secondary)]",
        className
      )}
    >
      <span className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
        checked ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

export { Switch };
`;

// ─── 19. Tooltip ─────────────────────────────────────────────────────────────

export const TOOLTIP_COMPONENT = `import React, { useState, useRef, createContext, useContext } from "react";
import { cn } from "./utils";

const TooltipProviderCtx = createContext({});

export function TooltipProvider({ children, delayDuration = 200 }) {
  return <TooltipProviderCtx.Provider value={{ delayDuration }}>{children}</TooltipProviderCtx.Provider>;
}

const TooltipCtx = createContext({});

export function Tooltip({ children }) {
  const [open, setOpen] = useState(false);
  const timeout = useRef(null);
  const { delayDuration = 200 } = useContext(TooltipProviderCtx);

  const show = () => { timeout.current = setTimeout(() => setOpen(true), delayDuration); };
  const hide = () => { clearTimeout(timeout.current); setOpen(false); };

  return <TooltipCtx.Provider value={{ open, show, hide }}>{children}</TooltipCtx.Provider>;
}

export function TooltipTrigger({ children, asChild, className = "" }) {
  const { show, hide } = useContext(TooltipCtx);
  return (
    <span onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className={cn("inline-block", className)}>
      {children}
    </span>
  );
}

export function TooltipContent({ children, side = "top", className = "" }) {
  const { open } = useContext(TooltipCtx);
  if (!open) return null;

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className={cn(
      "absolute z-50 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-text)] px-3 py-1.5 text-xs text-white shadow-md animate-fadeIn",
      positions[side] || positions.top,
      className
    )}>
      {children}
    </div>
  );
}

export default Tooltip;
`;

// ─── 20. ScrollArea ──────────────────────────────────────────────────────────

export const SCROLLAREA_COMPONENT = `import React from "react";
import { cn } from "./utils";

export function ScrollArea({ children, className = "", style }) {
  return (
    <div className={cn("relative overflow-auto", className)} style={style}>
      {children}
    </div>
  );
}

export function ScrollBar({ orientation = "vertical", className = "" }) {
  // Pure CSS scrollbar — no JS needed for basic usage
  return null;
}

export default ScrollArea;
`;

// ─── 21. DropdownMenu ────────────────────────────────────────────────────────

export const DROPDOWN_COMPONENT = `import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { cn } from "./utils";

const DropdownCtx = createContext({});

export function DropdownMenu({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <DropdownCtx.Provider value={{ isOpen, setIsOpen }}>
      <div ref={ref} className="relative inline-block">{children}</div>
    </DropdownCtx.Provider>
  );
}

export function DropdownMenuTrigger({ children, asChild, className = "" }) {
  const { isOpen, setIsOpen } = useContext(DropdownCtx);
  return <div onClick={() => setIsOpen(!isOpen)} className={cn("cursor-pointer", className)}>{children}</div>;
}

export function DropdownMenuContent({ children, align = "end", className = "" }) {
  const { isOpen } = useContext(DropdownCtx);
  if (!isOpen) return null;
  return (
    <div className={cn(
      "absolute z-50 mt-1 min-w-[180px] bg-white border border-[var(--color-border)] rounded-lg shadow-lg py-1 animate-fadeIn",
      align === "end" ? "right-0" : "left-0",
      className
    )}>
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, onClick, className = "", disabled = false }) {
  const { setIsOpen } = useContext(DropdownCtx);
  return (
    <button
      onClick={() => { if (!disabled) { onClick?.(); setIsOpen(false); } }}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className = "" }) {
  return <div className={cn("my-1 border-t border-[var(--color-border)]", className)} />;
}

export function DropdownMenuLabel({ children, className = "" }) {
  return <div className={cn("px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)]", className)}>{children}</div>;
}

export default DropdownMenu;
`;

// ─── 22. Sheet ───────────────────────────────────────────────────────────────

export const SHEET_COMPONENT = `import React, { useEffect, createContext, useContext, useState } from "react";
import { X } from "lucide-react";
import { cn } from "./utils";

const SheetCtx = createContext({});

export function Sheet({ open, onOpenChange, children }) {
  const [isOpen, setIsOpen] = useState(open || false);

  useEffect(() => {
    if (open !== undefined) setIsOpen(open);
  }, [open]);

  const handleChange = (val) => {
    setIsOpen(val);
    onOpenChange && onOpenChange(val);
  };

  return <SheetCtx.Provider value={{ isOpen, setIsOpen: handleChange }}>{children}</SheetCtx.Provider>;
}

export function SheetTrigger({ children, asChild, className = "" }) {
  const { setIsOpen } = useContext(SheetCtx);
  return <div onClick={() => setIsOpen(true)} className={cn("cursor-pointer inline-block", className)}>{children}</div>;
}

export function SheetContent({ children, side = "right", className = "" }) {
  const { isOpen, setIsOpen } = useContext(SheetCtx);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleEsc); document.body.style.overflow = ""; };
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  const sideStyles = {
    right: "right-0 top-0 h-full w-[400px] max-w-[85vw] animate-slideInRight",
    left: "left-0 top-0 h-full w-[400px] max-w-[85vw] animate-slideInLeft",
    top: "top-0 left-0 w-full h-auto max-h-[85vh] animate-slideInTop",
    bottom: "bottom-0 left-0 w-full h-auto max-h-[85vh] animate-slideInBottom",
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setIsOpen(false)} />
      <div className={cn("fixed bg-white shadow-2xl border border-[var(--color-border)] flex flex-col p-6", sideStyles[side] || sideStyles.right, className)}>
        <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 p-1 rounded-md hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] transition-colors">
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ children, className = "" }) {
  return <div className={cn("flex flex-col space-y-2 mb-4", className)}>{children}</div>;
}

export function SheetTitle({ children, className = "" }) {
  return <h2 className={cn("text-lg font-semibold text-[var(--color-text)]", className)}>{children}</h2>;
}

export function SheetDescription({ children, className = "" }) {
  return <p className={cn("text-sm text-[var(--color-text-muted)]", className)}>{children}</p>;
}

export function SheetClose({ children, className = "" }) {
  const { setIsOpen } = useContext(SheetCtx);
  return <div onClick={() => setIsOpen(false)} className={cn("cursor-pointer", className)}>{children}</div>;
}

export default Sheet;
`;

// ─── 23. Popover ─────────────────────────────────────────────────────────────

export const POPOVER_COMPONENT = `import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { cn } from "./utils";

const PopoverCtx = createContext({});

export function Popover({ children, open, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(open || false);
  const ref = useRef(null);

  useEffect(() => {
    if (open !== undefined) setIsOpen(open);
  }, [open]);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) { setIsOpen(false); onOpenChange && onOpenChange(false); } };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onOpenChange]);

  const handleChange = (val) => {
    setIsOpen(val);
    onOpenChange && onOpenChange(val);
  };

  return (
    <PopoverCtx.Provider value={{ isOpen, setIsOpen: handleChange }}>
      <div ref={ref} className="relative inline-block">{children}</div>
    </PopoverCtx.Provider>
  );
}

export function PopoverTrigger({ children, asChild, className = "" }) {
  const { isOpen, setIsOpen } = useContext(PopoverCtx);
  return <div onClick={() => setIsOpen(!isOpen)} className={cn("cursor-pointer", className)}>{children}</div>;
}

export function PopoverContent({ children, align = "center", className = "" }) {
  const { isOpen } = useContext(PopoverCtx);
  if (!isOpen) return null;
  return (
    <div className={cn(
      "absolute z-50 mt-2 w-72 rounded-md border border-[var(--color-border)] bg-white p-4 shadow-md animate-fadeIn",
      align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
      className
    )}>
      {children}
    </div>
  );
}

export default Popover;
`;

// ─── 24. Accordion ───────────────────────────────────────────────────────────

export const ACCORDION_COMPONENT = `import React, { useState, createContext, useContext } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

const AccordionCtx = createContext({});

export function Accordion({ type = "single", collapsible = true, defaultValue, children, className = "" }) {
  const [openItems, setOpenItems] = useState(defaultValue ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue]) : []);

  const toggle = (value) => {
    setOpenItems((prev) => {
      if (prev.includes(value)) {
        return collapsible ? prev.filter((v) => v !== value) : prev;
      }
      return type === "single" ? [value] : [...prev, value];
    });
  };

  return (
    <AccordionCtx.Provider value={{ openItems, toggle }}>
      <div className={className}>{children}</div>
    </AccordionCtx.Provider>
  );
}

export function AccordionItem({ value, children, className = "" }) {
  return <div className={cn("border-b border-[var(--color-border)]", className)} data-value={value}>{React.Children.map(children, (child) => child ? React.cloneElement(child, { __value: value }) : null)}</div>;
}

export function AccordionTrigger({ children, __value, className = "" }) {
  const { openItems, toggle } = useContext(AccordionCtx);
  const isOpen = openItems.includes(__value);
  return (
    <button
      onClick={() => toggle(__value)}
      className={cn("flex w-full items-center justify-between py-4 font-medium text-sm text-[var(--color-text)] transition-all hover:underline", className)}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen ? "rotate-180" : "")} />
    </button>
  );
}

export function AccordionContent({ children, __value, className = "" }) {
  const { openItems } = useContext(AccordionCtx);
  if (!openItems.includes(__value)) return null;
  return <div className={cn("pb-4 pt-0 text-sm text-[var(--color-text-muted)]", className)}>{children}</div>;
}

export default Accordion;
`;

// ─── Phoenix-specific: Modal (convenience wrapper over Dialog) ────────────────

export const MODAL_COMPONENT = `import React, { useEffect } from "react";
import { X } from "lucide-react";

const sizeMap = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export default function Modal({ isOpen, onClose, title, children, size = "md" }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleEsc); document.body.style.overflow = ""; };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className={"relative bg-white rounded-xl shadow-2xl border border-[var(--color-border)] w-full mx-4 animate-scaleIn " + (sizeMap[size] || sizeMap.md)}>
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
`;

// ─── Phoenix-specific: DataTable (sortable, paginated table) ─────────────────

export const DATATABLE_COMPONENT = `import React, { useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export default function DataTable({ columns, data, onRowClick, pageSize = 10, emptyMessage = "No data found" }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);

  const handleSort = (key) => {
    if (sortKey === key) { setSortDir(sortDir === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir("asc"); }
  };

  let sorted = [...(data || [])];
  if (sortKey) {
    sorted.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === "number" ? va - vb : String(va || "").localeCompare(String(vb || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              {columns.map((col) => (
                <th key={col.key} onClick={() => col.sortable !== false && handleSort(col.key)} className={"text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider " + (col.sortable !== false ? "cursor-pointer hover:text-[var(--color-text)] select-none" : "")}>
                  <span className="flex items-center gap-1">{col.label}{col.sortable !== false && sortKey === col.key && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-5 py-12 text-center text-[var(--color-text-muted)]">{emptyMessage}</td></tr>
            ) : paged.map((row, i) => (
              <tr key={row.id || i} onClick={() => onRowClick && onRowClick(row)} className={"border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors " + (onRowClick ? "cursor-pointer" : "")}>
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 text-[var(--color-text)]">{col.render ? col.render(row[col.key], row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <span className="text-xs text-[var(--color-text-muted)]">{"Page " + (page + 1) + " of " + totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="p-1 rounded hover:bg-[var(--color-border)]/50 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-[var(--color-border)]/50 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
`;

// ─── Phoenix-specific: Toast ─────────────────────────────────────────────────

export const TOAST_COMPONENT = `import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

let toastHandler = null;

export function showToast(message, type = "success") {
  if (toastHandler) toastHandler({ message, type, id: Date.now() });
}

const ToastContext = createContext({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const t = typeof toast === "string" ? { message: toast, type: "success", id: Date.now() } : { ...toast, id: toast.id || Date.now() };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
  }, []);

  useEffect(() => {
    toastHandler = (t) => addToast(t);
    return () => { toastHandler = null; };
  }, [addToast]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const icons = { success: CheckCircle, error: AlertCircle, info: Info };
  const colors = { success: "bg-emerald-500", error: "bg-red-500", info: "bg-blue-500" };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => {
          const IconComp = icons[toast.type] || icons.info;
          return (
            <div key={toast.id} className={"flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm shadow-lg animate-slideInRight " + (colors[toast.type] || colors.success)}>
              <IconComp className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{toast.message}</span>
              <button onClick={() => removeToast(toast.id)} className="p-0.5 hover:bg-white/20 rounded"><X className="w-3 h-3" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default function ToastContainer() {
  return <ToastProvider>{null}</ToastProvider>;
}
`;

// ─── Phoenix-specific: Spinner ───────────────────────────────────────────────

export const SPINNER_COMPONENT = `import React from "react";

const sizeMap = { sm: "w-4 h-4 border-2", md: "w-6 h-6 border-2", lg: "w-10 h-10 border-3" };

export default function Spinner({ size = "md", className = "" }) {
  return (
    <div className={(sizeMap[size] || sizeMap.md) + " border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin " + className} />
  );
}
`;

// ─── Animations CSS ──────────────────────────────────────────────────────────

export const UI_ANIMATIONS_CSS = `
/* Phoenix UI Animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes slideInLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes slideInTop {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
@keyframes slideInBottom {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-fadeIn { animation: fadeIn 0.15s ease-out; }
.animate-scaleIn { animation: scaleIn 0.2s ease-out; }
.animate-slideInRight { animation: slideInRight 0.3s ease-out; }
.animate-slideInLeft { animation: slideInLeft 0.3s ease-out; }
.animate-slideInTop { animation: slideInTop 0.3s ease-out; }
.animate-slideInBottom { animation: slideInBottom 0.3s ease-out; }
`;

// ─── Aggregate Export: Full 22-Component Registry ────────────────────────────

export function getAllUIComponents(): Record<string, string> {
  return {
    // Core utils
    "/components/ui/utils.ts": UTILS_COMPONENT,
    // 22 shadcn-compatible components
    "/components/ui/Button.tsx": BUTTON_COMPONENT,
    "/components/ui/Card.tsx": CARD_COMPONENT,
    "/components/ui/Input.tsx": INPUT_COMPONENT,
    "/components/ui/Label.tsx": LABEL_COMPONENT,
    "/components/ui/Badge.tsx": BADGE_COMPONENT,
    "/components/ui/Separator.tsx": SEPARATOR_COMPONENT,
    "/components/ui/Skeleton.tsx": SKELETON_COMPONENT,
    "/components/ui/Checkbox.tsx": CHECKBOX_COMPONENT,
    "/components/ui/Dialog.tsx": DIALOG_COMPONENT,
    "/components/ui/Table.tsx": TABLE_COMPONENT,
    "/components/ui/Textarea.tsx": TEXTAREA_COMPONENT,
    "/components/ui/Select.tsx": SELECT_COMPONENT,
    "/components/ui/Tabs.tsx": TABS_COMPONENT,
    "/components/ui/Alert.tsx": ALERT_COMPONENT,
    "/components/ui/Avatar.tsx": AVATAR_COMPONENT,
    "/components/ui/Progress.tsx": PROGRESS_COMPONENT,
    "/components/ui/Switch.tsx": SWITCH_COMPONENT,
    "/components/ui/Tooltip.tsx": TOOLTIP_COMPONENT,
    "/components/ui/ScrollArea.tsx": SCROLLAREA_COMPONENT,
    "/components/ui/Dropdown.tsx": DROPDOWN_COMPONENT,
    "/components/ui/Sheet.tsx": SHEET_COMPONENT,
    "/components/ui/Popover.tsx": POPOVER_COMPONENT,
    "/components/ui/Accordion.tsx": ACCORDION_COMPONENT,
    // Phoenix-specific higher-level components
    "/components/ui/Modal.tsx": MODAL_COMPONENT,
    "/components/ui/DataTable.tsx": DATATABLE_COMPONENT,
    "/components/ui/Toast.tsx": TOAST_COMPONENT,
    "/components/ui/Spinner.tsx": SPINNER_COMPONENT,
  };
}

export function getShadcnUIComponents(): Record<string, string> {
  const all = getAllUIComponents();
  // Exclude Phoenix-specific components
  const { "/components/ui/Modal.tsx": _m, "/components/ui/DataTable.tsx": _d, "/components/ui/Toast.tsx": _t, "/components/ui/Spinner.tsx": _s, ...shadcn } = all;
  return shadcn;
}
