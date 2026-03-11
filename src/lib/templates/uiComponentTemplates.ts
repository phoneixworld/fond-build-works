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

// ─── Card ─────────────────────────────────────────────────────────────────

export const CARD_COMPONENT = `import React from "react";

export default function Card({ children, title, icon: Icon, value, trend, trendUp, className = "" }) {
  if (value !== undefined) {
    return (
      <div className={"bg-white rounded-xl border border-[var(--color-border)] p-5 hover:shadow-md transition-all " + className}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">{title}</span>
          {Icon && <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center"><Icon className="w-4 h-4 text-[var(--color-primary)]" /></div>}
        </div>
        <p className="text-2xl font-bold text-[var(--color-text)]">{value}</p>
        {trend && <p className="text-xs mt-1"><span className={"font-medium " + (trendUp ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")}>{trend}</span> <span className="text-[var(--color-text-muted)]">from last month</span></p>}
      </div>
    );
  }
  return (
    <div className={"bg-white rounded-xl border border-[var(--color-border)] p-6 hover:shadow-md transition-all " + className}>
      {title && <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h3>}
      {children}
    </div>
  );
}
export { Card };
`;

// ─── Button ──────────────────────────────────────────────────────────────────

export const BUTTON_COMPONENT = `import React from "react";

const variantStyles = {
  primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-sm",
  secondary: "bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-border)]/50",
  danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
  ghost: "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]",
  outline: "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]",
};
const sizeStyles = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  icon: "p-2",
};

export default function Button({ children, onClick, variant = "primary", size = "md", className = "", disabled = false, ...props }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={"inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 " + (variantStyles[variant] || variantStyles.primary) + " " + (sizeStyles[size] || sizeStyles.md) + " " + (disabled ? "opacity-50 cursor-not-allowed" : "") + " " + className}
      {...props}
    >
      {children}
    </button>
  );
}
export { Button };
`;

// ─── Modal ───────────────────────────────────────────────────────────────────

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

// ─── DataTable ───────────────────────────────────────────────────────────────

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
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={"text-left px-5 py-3 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider " + (col.sortable !== false ? "cursor-pointer hover:text-[var(--color-text)] select-none" : "")}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && <ArrowUpDown className="w-3 h-3" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-5 py-12 text-center text-[var(--color-text-muted)]">{emptyMessage}</td></tr>
            ) : paged.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onRowClick && onRowClick(row)}
                className={"border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors " + (onRowClick ? "cursor-pointer" : "")}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 text-[var(--color-text)]">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <span className="text-xs text-[var(--color-text-muted)]">{"Page " + (page + 1) + " of " + totalPages + " (" + sorted.length + " items)"}</span>
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

// ─── Toast ───────────────────────────────────────────────────────────────────

export const TOAST_COMPONENT = `import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

let toastHandler = null;

export function showToast(message, type = "success") {
  if (toastHandler) toastHandler({ message, type, id: Date.now() });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastHandler = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    return () => { toastHandler = null; };
  }, []);

  const icons = { success: CheckCircle, error: AlertCircle, info: Info };
  const colors = { success: "bg-emerald-500", error: "bg-red-500", info: "bg-blue-500" };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const IconComp = icons[toast.type] || icons.info;
        return (
          <div key={toast.id} className={"flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm shadow-lg animate-slideInRight " + (colors[toast.type] || colors.success)}>
            <IconComp className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))} className="p-0.5 hover:bg-white/20 rounded"><X className="w-3 h-3" /></button>
          </div>
        );
      })}
    </div>
  );
}
`;

// ─── Spinner ─────────────────────────────────────────────────────────────────

export const SPINNER_COMPONENT = `import React from "react";

const sizeMap = { sm: "w-4 h-4 border-2", md: "w-6 h-6 border-2", lg: "w-10 h-10 border-3" };

export default function Spinner({ size = "md", className = "" }) {
  return (
    <div className={(sizeMap[size] || sizeMap.md) + " border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin " + className} />
  );
}
`;

// ─── Aggregate Export ────────────────────────────────────────────────────────

export function getAllUIComponents(): Record<string, string> {
  return {
    "/components/ui/Card.jsx": CARD_COMPONENT,
    "/components/ui/Button.jsx": BUTTON_COMPONENT,
    "/components/ui/Modal.jsx": MODAL_COMPONENT,
    "/components/ui/DataTable.jsx": DATATABLE_COMPONENT,
    "/components/ui/Toast.jsx": TOAST_COMPONENT,
    "/components/ui/Spinner.jsx": SPINNER_COMPONENT,
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
