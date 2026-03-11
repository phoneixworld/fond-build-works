/**
 * Phoneix Design System — semantic tokens, global CSS, and post-generation lint.
 * 
 * This module provides:
 * 1. `DESIGN_SYSTEM_CSS` — injected into every generated app's /styles/globals.css
 * 2. `DESIGN_SYSTEM_PROMPT` — appended to build-agent system prompt
 * 3. `lintDesignTokens()` — post-gen pass that replaces raw colors with semantic tokens
 */

// ─── Design System CSS ──────────────────────────────────────────────────────
// This gets injected into every generated app. Uses CSS custom properties
// so Tailwind's arbitrary value syntax `bg-[var(--color-primary)]` works,
// AND the Tailwind CDN's built-in colors are still available as fallback.

export const DESIGN_SYSTEM_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

/* ─── Phoneix Design System v1 ─────────────────────────────────────────── */

:root {
  /* Brand */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-light: #dbeafe;
  --color-primary-dark: #1d4ed8;

  /* Semantic */
  --color-success: #10b981;
  --color-success-light: #d1fae5;
  --color-warning: #f59e0b;
  --color-warning-light: #fef3c7;
  --color-danger: #ef4444;
  --color-danger-light: #fee2e2;
  --color-info: #6366f1;
  --color-info-light: #e0e7ff;

  /* Surfaces */
  --color-bg: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary: #f1f5f9;
  --color-bg-elevated: #ffffff;
  --color-bg-overlay: rgba(0, 0, 0, 0.5);

  /* Sidebar / Chrome */
  --color-sidebar: #0f172a;
  --color-sidebar-hover: #1e293b;
  --color-sidebar-active: #334155;
  --color-sidebar-text: #94a3b8;
  --color-sidebar-text-active: #ffffff;
  --color-sidebar-border: #1e293b;

  /* Text */
  --color-text: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-text-inverse: #ffffff;

  /* Borders */
  --color-border: #e2e8f0;
  --color-border-light: #f1f5f9;
  --color-border-focus: #3b82f6;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);

  /* Spacing scale (8px base) */
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */

  /* Radius */
  --radius-sm: 0.375rem;  /* 6px */
  --radius-md: 0.5rem;    /* 8px */
  --radius-lg: 0.75rem;   /* 12px */
  --radius-xl: 1rem;      /* 16px */
  --radius-2xl: 1.5rem;   /* 24px */
  --radius-full: 9999px;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ─── Global Reset ─────────────────────────────────────────────────────── */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-sans);
  color: var(--color-text);
  background-color: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.6;
}

/* ─── Utility Classes ──────────────────────────────────────────────────── */
.surface { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.surface-elevated { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
.surface-secondary { background: var(--color-bg-secondary); border-radius: var(--radius-lg); }

/* Cards */
.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-base), transform var(--transition-base);
}
.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-weight: 500;
  font-size: 0.875rem;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.btn-primary {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}
.btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.btn-secondary:hover { background: var(--color-bg-tertiary); }
.btn-danger { background: var(--color-danger); color: var(--color-text-inverse); }
.btn-danger:hover { background: #dc2626; }

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: var(--radius-full);
}
.badge-primary { background: var(--color-primary-light); color: var(--color-primary-dark); }
.badge-success { background: var(--color-success-light); color: #065f46; }
.badge-warning { background: var(--color-warning-light); color: #92400e; }
.badge-danger { background: var(--color-danger-light); color: #991b1b; }

/* Inputs */
.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  background: var(--color-bg);
  color: var(--color-text);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.input:focus {
  outline: none;
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Tables */
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}
.table td {
  padding: var(--space-3) var(--space-4);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border-light);
}
.table tr:hover td { background: var(--color-bg-secondary); }

/* Focus ring */
*:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }

/* Responsive container */
.container-app { max-width: 1280px; margin: 0 auto; padding: 0 var(--space-6); }

/* ─── Premium UI Components (from ui-kit) ─────────────────────────── */

/* Modal / Dialog Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-4);
  animation: fadeIn 0.2s ease;
}
.modal {
  background: var(--color-bg);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
  padding: var(--space-8);
  max-width: 480px;
  width: 100%;
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-header {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.modal-body { color: var(--color-text-secondary); font-size: 0.875rem; margin-bottom: var(--space-6); }
.modal-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

/* Toast Notifications */
.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  animation: slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-width: 300px;
}
.toast-success { border-left: 3px solid var(--color-success); }
.toast-error { border-left: 3px solid var(--color-danger); }
.toast-warning { border-left: 3px solid var(--color-warning); }
.toast-info { border-left: 3px solid var(--color-info); }

/* Progress Bar */
.progress {
  width: 100%;
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width 500ms ease;
}

/* Tabs */
.tab-list {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--color-border-light);
}
.tab {
  padding: var(--space-2) var(--space-5);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  transition: all var(--transition-fast);
}
.tab:hover { color: var(--color-text-secondary); }
.tab-active {
  color: var(--color-primary);
}
.tab-active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-primary);
  border-radius: 1px 1px 0 0;
}

/* Toggle Switch */
.toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}
.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast);
}
.toggle-active { background: var(--color-primary); }
.toggle-active::after { transform: translateX(20px); }

/* Avatar */
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-sm { width: 32px; height: 32px; font-size: 0.75rem; }
.avatar-md { width: 40px; height: 40px; }
.avatar-lg { width: 48px; height: 48px; font-size: 1rem; }
.avatar-xl { width: 64px; height: 64px; font-size: 1.25rem; }

.avatar-group { display: flex; }
.avatar-group .avatar { margin-left: -8px; border: 2px solid var(--color-bg); }
.avatar-group .avatar:first-child { margin-left: 0; }

/* Tooltip */
.tooltip-wrapper { position: relative; display: inline-flex; }
.tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: var(--space-1) var(--space-3);
  font-size: 0.75rem;
  background: var(--color-sidebar);
  color: var(--color-text-inverse);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.tooltip-wrapper:hover .tooltip { opacity: 1; }

/* Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}
.spinner-lg { width: 32px; height: 32px; border-width: 3px; }

/* Skeleton Loader */
.skeleton {
  background: linear-gradient(90deg, var(--color-bg-tertiary) 25%, var(--color-bg-secondary) 50%, var(--color-bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
  text-align: center;
}
.empty-state-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
}
.empty-state-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-1);
}
.empty-state-text {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-5);
  max-width: 320px;
}

/* Stat Card */
.stat-card {
  text-align: center;
  padding: var(--space-6);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  transition: all var(--transition-base);
}
.stat-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.stat-value {
  font-size: 2.25rem;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.2;
}
.stat-label {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}
.stat-trend {
  font-size: 0.75rem;
  font-weight: 500;
  margin-top: var(--space-1);
}
.stat-trend-up { color: var(--color-success); }
.stat-trend-down { color: var(--color-danger); }

/* Divider */
.divider {
  height: 1px;
  background: var(--color-border-light);
  border: none;
  margin: var(--space-6) 0;
}
.divider-gradient {
  height: 1px;
  background: linear-gradient(to right, transparent, var(--color-border), transparent);
  border: none;
  margin: var(--space-6) 0;
}

/* Glassmorphism card variant */
.card-glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
}

/* Featured card variant */
.card-featured {
  border-color: rgba(59, 130, 246, 0.2);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.1), var(--shadow-md);
}

/* Gradient text */
.text-gradient {
  background: linear-gradient(135deg, var(--color-primary), var(--color-info));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Stagger children animations */
.stagger > * { animation: fadeIn 0.4s ease both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 60ms; }
.stagger > *:nth-child(3) { animation-delay: 80ms; }
.stagger > *:nth-child(4) { animation-delay: 120ms; }
.stagger > *:nth-child(5) { animation-delay: 160ms; }
.stagger > *:nth-child(6) { animation-delay: 200ms; }

/* ─── Animation Keyframes ─────────────────────────────────────────── */
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
.animate-slide-in { animation: slideIn 0.3s ease-out; }
.animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.animate-bounce-in { animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* Responsive */
@media (max-width: 768px) {
  .modal { padding: var(--space-6); margin: var(--space-4); }
  .toast-container { left: var(--space-4); right: var(--space-4); bottom: var(--space-4); }
  .toast { min-width: auto; }
}
`;

// ─── AI Prompt Section ──────────────────────────────────────────────────────
// Appended to build-agent system prompt to enforce token usage.

export const DESIGN_SYSTEM_PROMPT = `## PHONEIX DESIGN SYSTEM (MANDATORY)
The app includes a design system via /styles/globals.css with CSS custom properties.
You MUST use these tokens instead of hardcoded values:

### Colors — use Tailwind arbitrary values:
- Primary: bg-[var(--color-primary)], text-[var(--color-primary)], border-[var(--color-primary)]
- Surfaces: bg-[var(--color-bg)], bg-[var(--color-bg-secondary)], bg-[var(--color-bg-tertiary)]
- Sidebar: bg-[var(--color-sidebar)], text-[var(--color-sidebar-text)]
- Text: text-[var(--color-text)], text-[var(--color-text-secondary)], text-[var(--color-text-muted)]
- Borders: border-[var(--color-border)], border-[var(--color-border-light)]
- Status: text-[var(--color-success)], text-[var(--color-warning)], text-[var(--color-danger)]
- Badges: Use .badge-primary, .badge-success, .badge-warning, .badge-danger classes

### Components — use the provided utility classes:
- Cards: className="card" (includes hover effect)
- Buttons: className="btn btn-primary", "btn btn-secondary", "btn btn-danger"
- Inputs: className="input"
- Tables: className="table" with th/td
- Surfaces: className="surface", "surface-elevated", "surface-secondary"

### Spacing — use Tailwind's default scale (p-4, gap-6, mb-8, etc.)
### Radius — use rounded-lg (default), rounded-xl (cards), rounded-full (avatars/badges)
### Shadows — use shadow-sm, shadow-md, shadow-lg via Tailwind OR var(--shadow-*)

### Sidebar must use:
- bg-[var(--color-sidebar)] for background
- text-[var(--color-sidebar-text)] for inactive links
- text-[var(--color-sidebar-text-active)] with bg-[var(--color-sidebar-active)] for active
- border-[var(--color-sidebar-border)] for dividers

### NEVER use these raw colors directly:
- ❌ bg-gray-50, bg-gray-900, text-gray-400, text-gray-800, border-gray-200
- ❌ bg-blue-500, bg-red-500, bg-green-500, bg-yellow-500
- ✅ Use the semantic token equivalents above instead

### Typography:
- Font is Inter (loaded via CSS). Use font-sans in Tailwind.
- Headings: text-2xl font-bold text-[var(--color-text)]
- Subheadings: text-lg font-semibold text-[var(--color-text)]
- Body: text-sm text-[var(--color-text-secondary)]
- Muted: text-xs text-[var(--color-text-muted)]
`;

// ─── Post-Generation Lint Pass ──────────────────────────────────────────────
// Replaces common raw Tailwind colors with semantic tokens.

const COLOR_REPLACEMENTS: [RegExp, string][] = [
  // Background surfaces
  [/\bbg-white\b/g, "bg-[var(--color-bg)]"],
  [/\bbg-gray-50\b/g, "bg-[var(--color-bg-secondary)]"],
  [/\bbg-gray-100\b/g, "bg-[var(--color-bg-tertiary)]"],
  [/\bbg-slate-50\b/g, "bg-[var(--color-bg-secondary)]"],
  [/\bbg-slate-100\b/g, "bg-[var(--color-bg-tertiary)]"],
  
  // Sidebar
  [/\bbg-gray-900\b/g, "bg-[var(--color-sidebar)]"],
  [/\bbg-gray-800\b(?!\/)/g, "bg-[var(--color-sidebar-hover)]"],
  [/\bbg-slate-900\b/g, "bg-[var(--color-sidebar)]"],
  [/\bbg-slate-800\b(?!\/)/g, "bg-[var(--color-sidebar-hover)]"],
  
  // Primary
  [/\bbg-blue-500\b/g, "bg-[var(--color-primary)]"],
  [/\bbg-blue-600\b/g, "bg-[var(--color-primary-hover)]"],
  [/\bbg-blue-700\b/g, "bg-[var(--color-primary-dark)]"],
  [/\bbg-blue-50\b/g, "bg-[var(--color-primary-light)]"],
  [/\bbg-blue-100\b/g, "bg-[var(--color-primary-light)]"],
  [/\bbg-indigo-500\b/g, "bg-[var(--color-info)]"],
  [/\bbg-indigo-600\b/g, "bg-[var(--color-info)]"],
  
  // Status backgrounds
  [/\bbg-green-500\b/g, "bg-[var(--color-success)]"],
  [/\bbg-green-50\b/g, "bg-[var(--color-success-light)]"],
  [/\bbg-green-100\b/g, "bg-[var(--color-success-light)]"],
  [/\bbg-emerald-500\b/g, "bg-[var(--color-success)]"],
  [/\bbg-red-500\b/g, "bg-[var(--color-danger)]"],
  [/\bbg-red-50\b/g, "bg-[var(--color-danger-light)]"],
  [/\bbg-red-100\b/g, "bg-[var(--color-danger-light)]"],
  [/\bbg-yellow-500\b/g, "bg-[var(--color-warning)]"],
  [/\bbg-yellow-50\b/g, "bg-[var(--color-warning-light)]"],
  [/\bbg-amber-500\b/g, "bg-[var(--color-warning)]"],
  
  // Text colors
  [/\btext-gray-900\b/g, "text-[var(--color-text)]"],
  [/\btext-gray-800\b/g, "text-[var(--color-text)]"],
  [/\btext-gray-700\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-gray-600\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-gray-500\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-gray-400\b/g, "text-[var(--color-text-muted)]"],
  [/\btext-gray-300\b/g, "text-[var(--color-text-muted)]"],
  [/\btext-slate-900\b/g, "text-[var(--color-text)]"],
  [/\btext-slate-800\b/g, "text-[var(--color-text)]"],
  [/\btext-slate-700\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-slate-600\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-slate-500\b/g, "text-[var(--color-text-secondary)]"],
  [/\btext-slate-400\b/g, "text-[var(--color-text-muted)]"],
  [/\btext-white\b/g, "text-[var(--color-text-inverse)]"],
  [/\btext-blue-500\b/g, "text-[var(--color-primary)]"],
  [/\btext-blue-600\b/g, "text-[var(--color-primary)]"],
  [/\btext-green-500\b/g, "text-[var(--color-success)]"],
  [/\btext-green-600\b/g, "text-[var(--color-success)]"],
  [/\btext-red-500\b/g, "text-[var(--color-danger)]"],
  [/\btext-red-600\b/g, "text-[var(--color-danger)]"],
  [/\btext-yellow-500\b/g, "text-[var(--color-warning)]"],
  [/\btext-amber-500\b/g, "text-[var(--color-warning)]"],
  
  // Border colors
  [/\bborder-gray-200\b/g, "border-[var(--color-border)]"],
  [/\bborder-gray-100\b/g, "border-[var(--color-border-light)]"],
  [/\bborder-gray-300\b/g, "border-[var(--color-border)]"],
  [/\bborder-slate-200\b/g, "border-[var(--color-border)]"],
  [/\bborder-slate-100\b/g, "border-[var(--color-border-light)]"],
  [/\bborder-gray-800\b/g, "border-[var(--color-sidebar-border)]"],
  [/\bborder-blue-500\b/g, "border-[var(--color-border-focus)]"],
  
  // Divide colors
  [/\bdivide-gray-200\b/g, "divide-[var(--color-border)]"],
  [/\bdivide-gray-100\b/g, "divide-[var(--color-border-light)]"],
  
  // Ring colors
  [/\bring-blue-500\b/g, "ring-[var(--color-primary)]"],
  [/\bring-blue-400\b/g, "ring-[var(--color-primary)]"],
];

/**
 * Post-generation lint pass: replaces raw Tailwind colors with semantic design tokens.
 * Only processes JSX/JS/TSX files. CSS files are left untouched.
 * Returns the modified files + a count of replacements made.
 */
export function lintDesignTokens(files: Record<string, string>): { files: Record<string, string>; replacements: number } {
  let totalReplacements = 0;
  const result: Record<string, string> = {};

  for (const [path, code] of Object.entries(files)) {
    // Only lint JSX/JS/TS files, skip CSS and data files
    if (!path.match(/\.(jsx?|tsx?)$/)) {
      result[path] = code;
      continue;
    }

    let linted = code;
    for (const [pattern, replacement] of COLOR_REPLACEMENTS) {
      const before = linted;
      linted = linted.replace(pattern, replacement);
      // Count replacements
      const diff = (before.match(pattern) || []).length;
      totalReplacements += diff;
    }
    result[path] = linted;
  }

  if (totalReplacements > 0) {
    console.log(`[DesignLint] Replaced ${totalReplacements} raw color(s) with semantic tokens`);
  }

  return { files: result, replacements: totalReplacements };
}
