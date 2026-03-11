/**
 * Shadcn-Quality UI Component Templates for Phoenix Builder
 * 
 * These generate self-contained, accessible, animated React components
 * that work in the ESM preview environment (no TypeScript, no build step).
 * Each component uses CSS variables for theming and includes proper
 * keyboard navigation, ARIA attributes, and transition animations.
 */

// ─── Dialog ──────────────────────────────────────────────────────────────────

export const DIALOG_COMPONENT = `import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({ open, onOpenChange, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-[var(--color-border)] animate-scaleIn">
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }) {
  return <div className="px-6 pt-6 pb-2">{children}</div>;
}

export function DialogTitle({ children }) {
  return <h2 className="text-lg font-semibold text-[var(--color-text)]">{children}</h2>;
}

export function DialogDescription({ children }) {
  return <p className="text-sm text-[var(--color-text-muted)] mt-1">{children}</p>;
}

export function DialogContent({ children }) {
  return <div className="px-6 py-4">{children}</div>;
}

export function DialogFooter({ children }) {
  return <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3">{children}</div>;
}

export function DialogClose({ onOpenChange, children }) {
  return (
    <button onClick={() => onOpenChange(false)} className="absolute top-4 right-4 p-1 rounded-md hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] transition-colors">
      {children || <X className="w-4 h-4" />}
    </button>
  );
}

export default Dialog;
`;

// ─── Sheet (Slide Panel) ─────────────────────────────────────────────────────

export const SHEET_COMPONENT = `import React, { useEffect } from "react";
import { X } from "lucide-react";

export function Sheet({ open, onOpenChange, side = "right", children }) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const sideStyles = {
    right: "right-0 top-0 h-full w-[400px] max-w-[85vw] animate-slideInRight",
    left: "left-0 top-0 h-full w-[400px] max-w-[85vw] animate-slideInLeft",
    top: "top-0 left-0 w-full h-auto max-h-[85vh] animate-slideInTop",
    bottom: "bottom-0 left-0 w-full h-auto max-h-[85vh] animate-slideInBottom",
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => onOpenChange(false)} />
      <div className={\`fixed bg-white shadow-2xl border border-[var(--color-border)] flex flex-col \${sideStyles[side] || sideStyles.right}\`}>
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div />
          <button onClick={() => onOpenChange(false)} className="p-1 rounded-md hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function SheetHeader({ children }) {
  return <div className="mb-4">{children}</div>;
}

export function SheetTitle({ children }) {
  return <h2 className="text-lg font-semibold text-[var(--color-text)]">{children}</h2>;
}

export function SheetDescription({ children }) {
  return <p className="text-sm text-[var(--color-text-muted)] mt-1">{children}</p>;
}

export default Sheet;
`;

// ─── Badge ───────────────────────────────────────────────────────────────────

export const BADGE_COMPONENT = `import React from "react";

const variants = {
  default: "bg-[var(--color-primary)] text-white",
  secondary: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border border-[var(--color-border)]",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  outline: "border border-[var(--color-border)] text-[var(--color-text-secondary)]",
};

export default function Badge({ children, variant = "default", className = "" }) {
  return (
    <span className={\`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium \${variants[variant] || variants.default} \${className}\`}>
      {children}
    </span>
  );
}

export { Badge };
`;

// ─── Tabs ────────────────────────────────────────────────────────────────────

export const TABS_COMPONENT = `import React, { useState } from "react";

export function Tabs({ defaultValue, children, className = "" }) {
  const [activeTab, setActiveTab] = useState(defaultValue);
  return (
    <div className={className} data-active-tab={activeTab}>
      {React.Children.map(children, (child) =>
        child ? React.cloneElement(child, { activeTab, setActiveTab }) : null
      )}
    </div>
  );
}

export function TabsList({ children, activeTab, setActiveTab, className = "" }) {
  return (
    <div className={\`flex gap-1 bg-[var(--color-bg-secondary)] p-1 rounded-lg \${className}\`} role="tablist">
      {React.Children.map(children, (child) =>
        child ? React.cloneElement(child, { activeTab, setActiveTab }) : null
      )}
    </div>
  );
}

export function TabsTrigger({ value, children, activeTab, setActiveTab, className = "" }) {
  const isActive = activeTab === value;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={\`px-3 py-1.5 text-sm font-medium rounded-md transition-all \${
        isActive
          ? "bg-white text-[var(--color-text)] shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      } \${className}\`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, activeTab, className = "" }) {
  if (activeTab !== value) return null;
  return <div role="tabpanel" className={\`mt-3 \${className}\`}>{children}</div>;
}

export default Tabs;
`;

// ─── Select ──────────────────────────────────────────────────────────────────

export const SELECT_COMPONENT = `import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function Select({ value, onValueChange, options = [], placeholder = "Select...", className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedOption = options.find((o) => (typeof o === "string" ? o : o.value) === value);
  const displayLabel = selectedOption ? (typeof selectedOption === "string" ? selectedOption : selectedOption.label) : placeholder;

  return (
    <div ref={ref} className={\`relative \${className}\`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={\`w-full flex items-center justify-between px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white hover:border-[var(--color-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-colors \${!value ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"}\`}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={\`w-4 h-4 text-[var(--color-text-muted)] transition-transform \${isOpen ? "rotate-180" : ""}\`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg py-1 max-h-60 overflow-auto animate-fadeIn">
          {options.map((opt) => {
            const optValue = typeof opt === "string" ? opt : opt.value;
            const optLabel = typeof opt === "string" ? opt : opt.label;
            const isSelected = optValue === value;
            return (
              <button
                key={optValue}
                onClick={() => { onValueChange(optValue); setIsOpen(false); }}
                className={\`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[var(--color-bg-secondary)] transition-colors \${isSelected ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text)]"}\`}
              >
                <span>{optLabel}</span>
                {isSelected && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { Select };
`;

// ─── Avatar ──────────────────────────────────────────────────────────────────

export const AVATAR_COMPONENT = `import React from "react";

const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base", xl: "w-16 h-16 text-lg" };

export default function Avatar({ src, alt, fallback, size = "md", className = "" }) {
  const initials = fallback || (alt ? alt.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?");
  const sizeClass = sizes[size] || sizes.md;

  if (src) {
    return (
      <img
        src={src}
        alt={alt || ""}
        className={\`\${sizeClass} rounded-full object-cover border-2 border-white shadow-sm \${className}\`}
        onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
      />
    );
  }

  return (
    <div className={\`\${sizeClass} rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold flex items-center justify-center border-2 border-white shadow-sm \${className}\`}>
      {initials}
    </div>
  );
}

export { Avatar };
`;

// ─── Input ───────────────────────────────────────────────────────────────────

export const INPUT_COMPONENT = `import React from "react";

export default function Input({ label, error, icon: Icon, className = "", ...props }) {
  return (
    <div className={\`space-y-1.5 \${className}\`}>
      {label && <label className="block text-sm font-medium text-[var(--color-text)]">{label}</label>}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          className={\`w-full px-3 py-2 text-sm border rounded-lg bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] \${Icon ? "pl-9" : ""} \${error ? "border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20" : "border-[var(--color-border)]"}\`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

export { Input };
`;

// ─── Dropdown Menu ───────────────────────────────────────────────────────────

export const DROPDOWN_COMPONENT = `import React, { useState, useRef, useEffect } from "react";

export function DropdownMenu({ trigger, children, align = "right" }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div className={\`absolute z-50 mt-1 min-w-[180px] bg-white border border-[var(--color-border)] rounded-lg shadow-lg py-1 animate-fadeIn \${align === "right" ? "right-0" : "left-0"}\`}>
          {React.Children.map(children, (child) =>
            child ? React.cloneElement(child, { closeMenu: () => setIsOpen(false) }) : null
          )}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, closeMenu, icon: Icon, variant = "default", disabled = false }) {
  const variants = {
    default: "text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]",
    danger: "text-[var(--color-danger)] hover:bg-red-50",
  };
  return (
    <button
      onClick={() => { if (!disabled) { onClick?.(); closeMenu?.(); } }}
      disabled={disabled}
      className={\`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors \${variants[variant] || variants.default} \${disabled ? "opacity-50 cursor-not-allowed" : ""}\`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 border-t border-[var(--color-border)]" />;
}

export default DropdownMenu;
`;

// ─── Alert ───────────────────────────────────────────────────────────────────

export const ALERT_COMPONENT = `import React from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

const variants = {
  info: { bg: "bg-blue-50 border-blue-200", icon: Info, iconColor: "text-blue-500", text: "text-blue-800" },
  success: { bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle, iconColor: "text-emerald-500", text: "text-emerald-800" },
  warning: { bg: "bg-amber-50 border-amber-200", icon: AlertTriangle, iconColor: "text-amber-500", text: "text-amber-800" },
  error: { bg: "bg-red-50 border-red-200", icon: AlertCircle, iconColor: "text-red-500", text: "text-red-800" },
};

export default function Alert({ title, children, variant = "info", onClose, className = "" }) {
  const v = variants[variant] || variants.info;
  const IconComp = v.icon;

  return (
    <div className={\`flex gap-3 p-4 rounded-lg border \${v.bg} \${className}\`} role="alert">
      <IconComp className={\`w-5 h-5 mt-0.5 flex-shrink-0 \${v.iconColor}\`} />
      <div className="flex-1 min-w-0">
        {title && <h4 className={\`text-sm font-semibold \${v.text}\`}>{title}</h4>}
        {children && <p className={\`text-sm mt-1 \${v.text} opacity-90\`}>{children}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className={\`flex-shrink-0 p-1 rounded hover:bg-black/5 \${v.text}\`}>
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export { Alert };
`;

// ─── Animations CSS (injected into globals.css) ──────────────────────────────

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

// ─── Aggregate Export ────────────────────────────────────────────────────────

export function getShadcnUIComponents(): Record<string, string> {
  return {
    "/components/ui/Dialog.jsx": DIALOG_COMPONENT,
    "/components/ui/Sheet.jsx": SHEET_COMPONENT,
    "/components/ui/Badge.jsx": BADGE_COMPONENT,
    "/components/ui/Tabs.jsx": TABS_COMPONENT,
    "/components/ui/Select.jsx": SELECT_COMPONENT,
    "/components/ui/Avatar.jsx": AVATAR_COMPONENT,
    "/components/ui/Input.jsx": INPUT_COMPONENT,
    "/components/ui/Dropdown.jsx": DROPDOWN_COMPONENT,
    "/components/ui/Alert.jsx": ALERT_COMPONENT,
  };
}
