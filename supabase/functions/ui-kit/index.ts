import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "text/css; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

const COMPONENT_CSS = `
/* ============================================
   UI Kit — Pre-built component library
   Include via: <link rel="stylesheet" href="...">
   ============================================ */

/* === Base Reset & Typography === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --ui-font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --ui-font-display: 'Plus Jakarta Sans', 'Inter', sans-serif;
  --ui-font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --ui-primary: #6366f1;
  --ui-primary-light: #818cf8;
  --ui-primary-dark: #4f46e5;
  --ui-primary-50: #eef2ff;
  --ui-primary-100: #e0e7ff;
  --ui-primary-500: #6366f1;
  --ui-primary-600: #4f46e5;
  --ui-primary-700: #4338ca;
  --ui-primary-rgb: 99, 102, 241;

  --ui-gray-50: #f9fafb;
  --ui-gray-100: #f3f4f6;
  --ui-gray-200: #e5e7eb;
  --ui-gray-300: #d1d5db;
  --ui-gray-400: #9ca3af;
  --ui-gray-500: #6b7280;
  --ui-gray-600: #4b5563;
  --ui-gray-700: #374151;
  --ui-gray-800: #1f2937;
  --ui-gray-900: #111827;
  --ui-gray-950: #030712;

  --ui-success: #10b981;
  --ui-warning: #f59e0b;
  --ui-error: #ef4444;
  --ui-info: #3b82f6;

  --ui-radius-sm: 8px;
  --ui-radius-md: 12px;
  --ui-radius-lg: 16px;
  --ui-radius-xl: 24px;
  --ui-radius-full: 9999px;

  --ui-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --ui-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --ui-shadow-lg: 0 10px 25px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04);
  --ui-shadow-xl: 0 20px 40px -8px rgb(0 0 0 / 0.1), 0 8px 16px -6px rgb(0 0 0 / 0.05);
  --ui-shadow-primary: 0 8px 24px -4px rgba(var(--ui-primary-rgb), 0.3);

  --ui-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --ui-transition-bounce: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

body {
  font-family: var(--ui-font-sans);
  color: var(--ui-gray-800);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* === Buttons === */
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--ui-font-sans);
  line-height: 1.4;
  border-radius: var(--ui-radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--ui-transition);
  text-decoration: none;
  white-space: nowrap;
  user-select: none;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
.ui-btn:active { transform: scale(0.97); }

.ui-btn-primary {
  background: var(--ui-primary);
  color: white;
  box-shadow: var(--ui-shadow-primary);
}
.ui-btn-primary:hover {
  background: var(--ui-primary-dark);
  transform: translateY(-1px);
  box-shadow: 0 12px 28px -4px rgba(var(--ui-primary-rgb), 0.4);
}

.ui-btn-secondary {
  background: white;
  color: var(--ui-gray-700);
  border: 1px solid var(--ui-gray-200);
  box-shadow: var(--ui-shadow-sm);
}
.ui-btn-secondary:hover {
  background: var(--ui-gray-50);
  border-color: var(--ui-gray-300);
  transform: translateY(-1px);
}

.ui-btn-ghost {
  background: transparent;
  color: var(--ui-gray-600);
  padding: 8px 16px;
}
.ui-btn-ghost:hover {
  background: var(--ui-gray-100);
  color: var(--ui-gray-900);
}

.ui-btn-danger {
  background: var(--ui-error);
  color: white;
  box-shadow: 0 8px 24px -4px rgba(239, 68, 68, 0.3);
}
.ui-btn-danger:hover { background: #dc2626; transform: translateY(-1px); }

.ui-btn-lg { padding: 14px 28px; font-size: 16px; border-radius: var(--ui-radius-lg); }
.ui-btn-sm { padding: 6px 14px; font-size: 13px; border-radius: var(--ui-radius-sm); }
.ui-btn-icon { padding: 10px; }
.ui-btn-icon.ui-btn-lg { padding: 14px; }
.ui-btn-icon.ui-btn-sm { padding: 6px; }

.ui-btn-group { display: flex; gap: 8px; }

/* === Cards === */
.ui-card {
  background: white;
  border: 1px solid var(--ui-gray-100);
  border-radius: var(--ui-radius-lg);
  padding: 24px;
  transition: all var(--ui-transition);
}
.ui-card-hover:hover {
  box-shadow: var(--ui-shadow-lg);
  transform: translateY(-2px);
  border-color: var(--ui-gray-200);
}
.ui-card-featured {
  border-color: rgba(var(--ui-primary-rgb), 0.2);
  box-shadow: 0 0 0 1px rgba(var(--ui-primary-rgb), 0.1), var(--ui-shadow-md);
}
.ui-card-image {
  padding: 0;
  overflow: hidden;
}
.ui-card-image img {
  width: 100%;
  height: 200px;
  object-fit: cover;
}
.ui-card-image .ui-card-body { padding: 20px; }
.ui-card-glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* === Inputs === */
.ui-input {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  font-family: var(--ui-font-sans);
  color: var(--ui-gray-900);
  background: white;
  border: 1px solid var(--ui-gray-200);
  border-radius: var(--ui-radius-md);
  transition: all var(--ui-transition);
  outline: none;
}
.ui-input::placeholder { color: var(--ui-gray-400); }
.ui-input:focus {
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 3px rgba(var(--ui-primary-rgb), 0.1);
}
.ui-input-error {
  border-color: var(--ui-error);
}
.ui-input-error:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.ui-textarea {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-family: var(--ui-font-sans);
  color: var(--ui-gray-900);
  background: white;
  border: 1px solid var(--ui-gray-200);
  border-radius: var(--ui-radius-md);
  transition: all var(--ui-transition);
  outline: none;
  resize: vertical;
  min-height: 100px;
}
.ui-textarea:focus {
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 3px rgba(var(--ui-primary-rgb), 0.1);
}

.ui-select {
  width: 100%;
  padding: 10px 40px 10px 16px;
  font-size: 14px;
  font-family: var(--ui-font-sans);
  color: var(--ui-gray-900);
  background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%236b7280' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 6l3.5 4 3.5-4z'/%3E%3C/svg%3E") no-repeat right 12px center;
  border: 1px solid var(--ui-gray-200);
  border-radius: var(--ui-radius-md);
  transition: all var(--ui-transition);
  outline: none;
  appearance: none;
  cursor: pointer;
}
.ui-select:focus {
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 3px rgba(var(--ui-primary-rgb), 0.1);
}

.ui-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-gray-700);
  margin-bottom: 6px;
}
.ui-form-group { margin-bottom: 20px; }
.ui-form-hint { font-size: 13px; color: var(--ui-gray-500); margin-top: 4px; }
.ui-form-error { font-size: 13px; color: var(--ui-error); margin-top: 4px; }

.ui-checkbox, .ui-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ui-gray-700);
  cursor: pointer;
}
.ui-checkbox input, .ui-radio input {
  width: 18px;
  height: 18px;
  accent-color: var(--ui-primary);
  cursor: pointer;
}

/* === Badge === */
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--ui-radius-full);
  line-height: 1.4;
}
.ui-badge-primary { background: var(--ui-primary-50); color: var(--ui-primary-700); }
.ui-badge-success { background: #ecfdf5; color: #047857; }
.ui-badge-warning { background: #fffbeb; color: #b45309; }
.ui-badge-error { background: #fef2f2; color: #b91c1c; }
.ui-badge-gray { background: var(--ui-gray-100); color: var(--ui-gray-600); }

/* === Avatar === */
.ui-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--ui-primary-100);
  color: var(--ui-primary-700);
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}
.ui-avatar img { width: 100%; height: 100%; object-fit: cover; }
.ui-avatar-sm { width: 32px; height: 32px; font-size: 12px; }
.ui-avatar-md { width: 40px; height: 40px; font-size: 14px; }
.ui-avatar-lg { width: 48px; height: 48px; font-size: 16px; }
.ui-avatar-xl { width: 64px; height: 64px; font-size: 20px; }

.ui-avatar-group { display: flex; }
.ui-avatar-group .ui-avatar { margin-left: -8px; border: 2px solid white; }
.ui-avatar-group .ui-avatar:first-child { margin-left: 0; }

/* === Navbar === */
.ui-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--ui-gray-100);
}
.ui-navbar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-gray-900);
  text-decoration: none;
  font-family: var(--ui-font-display);
}
.ui-navbar-links {
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
}
.ui-navbar-link {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-gray-600);
  text-decoration: none;
  border-radius: var(--ui-radius-sm);
  transition: all var(--ui-transition);
}
.ui-navbar-link:hover { color: var(--ui-gray-900); background: var(--ui-gray-50); }
.ui-navbar-link-active { color: var(--ui-primary); background: var(--ui-primary-50); }
.ui-navbar-actions { display: flex; align-items: center; gap: 12px; }

/* === Section === */
.ui-section {
  padding: 80px 24px;
}
.ui-section-sm { padding: 48px 24px; }
.ui-section-lg { padding: 120px 24px; }
.ui-container {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
.ui-container-sm { max-width: 640px; }
.ui-container-md { max-width: 768px; }
.ui-container-lg { max-width: 1024px; }

/* === Hero === */
.ui-hero {
  text-align: center;
  padding: 100px 24px 80px;
}
.ui-hero-title {
  font-size: 56px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--ui-gray-900);
  font-family: var(--ui-font-display);
  margin-bottom: 20px;
}
.ui-hero-subtitle {
  font-size: 20px;
  color: var(--ui-gray-500);
  max-width: 600px;
  margin: 0 auto 32px;
  line-height: 1.6;
}
.ui-hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

/* Gradient text */
.ui-text-gradient {
  background: linear-gradient(135deg, var(--ui-primary), #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* === Table === */
.ui-table-wrapper { overflow-x: auto; border-radius: var(--ui-radius-lg); border: 1px solid var(--ui-gray-100); }
.ui-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ui-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-gray-500);
  background: var(--ui-gray-50);
  border-bottom: 1px solid var(--ui-gray-100);
}
.ui-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-gray-50);
  color: var(--ui-gray-700);
}
.ui-table tbody tr { transition: background var(--ui-transition); }
.ui-table tbody tr:hover { background: var(--ui-gray-50); }

/* === Modal === */
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  animation: ui-fade-in 200ms ease;
}
.ui-modal {
  background: white;
  border-radius: var(--ui-radius-xl);
  box-shadow: var(--ui-shadow-xl);
  padding: 32px;
  max-width: 480px;
  width: 100%;
  animation: ui-slide-up 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ui-modal-header {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-gray-900);
  margin-bottom: 8px;
  font-family: var(--ui-font-display);
}
.ui-modal-body { color: var(--ui-gray-600); font-size: 14px; margin-bottom: 24px; }
.ui-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* === Toast === */
.ui-toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ui-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: white;
  border: 1px solid var(--ui-gray-100);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-lg);
  font-size: 14px;
  color: var(--ui-gray-700);
  animation: ui-slide-in-right 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
  min-width: 300px;
}
.ui-toast-success { border-left: 3px solid var(--ui-success); }
.ui-toast-error { border-left: 3px solid var(--ui-error); }
.ui-toast-warning { border-left: 3px solid var(--ui-warning); }
.ui-toast-info { border-left: 3px solid var(--ui-info); }

/* === Stats === */
.ui-stat { text-align: center; }
.ui-stat-value {
  font-size: 36px;
  font-weight: 800;
  color: var(--ui-gray-900);
  font-family: var(--ui-font-display);
  line-height: 1.2;
}
.ui-stat-label {
  font-size: 14px;
  color: var(--ui-gray-500);
  margin-top: 4px;
}

/* === Divider === */
.ui-divider {
  height: 1px;
  background: var(--ui-gray-100);
  border: none;
  margin: 24px 0;
}
.ui-divider-gradient {
  height: 1px;
  background: linear-gradient(to right, transparent, var(--ui-gray-200), transparent);
  border: none;
  margin: 24px 0;
}

/* === Loading === */
.ui-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--ui-gray-200);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: ui-spin 600ms linear infinite;
}
.ui-spinner-lg { width: 32px; height: 32px; border-width: 3px; }

.ui-skeleton {
  background: linear-gradient(90deg, var(--ui-gray-100) 25%, var(--ui-gray-50) 50%, var(--ui-gray-100) 75%);
  background-size: 200% 100%;
  animation: ui-shimmer 1.5s infinite;
  border-radius: var(--ui-radius-sm);
}

/* === Progress === */
.ui-progress {
  width: 100%;
  height: 8px;
  background: var(--ui-gray-100);
  border-radius: var(--ui-radius-full);
  overflow: hidden;
}
.ui-progress-bar {
  height: 100%;
  background: var(--ui-primary);
  border-radius: var(--ui-radius-full);
  transition: width 500ms ease;
}

/* === Tabs === */
.ui-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--ui-gray-100);
}
.ui-tab {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-gray-500);
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  transition: all var(--ui-transition);
}
.ui-tab:hover { color: var(--ui-gray-700); }
.ui-tab-active {
  color: var(--ui-primary);
}
.ui-tab-active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--ui-primary);
  border-radius: 1px 1px 0 0;
}

/* === Toggle === */
.ui-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--ui-gray-200);
  border-radius: var(--ui-radius-full);
  cursor: pointer;
  transition: all var(--ui-transition);
  border: none;
}
.ui-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  box-shadow: var(--ui-shadow-sm);
  transition: transform var(--ui-transition);
}
.ui-toggle-active { background: var(--ui-primary); }
.ui-toggle-active::after { transform: translateX(20px); }

/* === Tooltip === */
.ui-tooltip-wrapper { position: relative; display: inline-flex; }
.ui-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  font-size: 12px;
  background: var(--ui-gray-900);
  color: white;
  border-radius: var(--ui-radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--ui-transition);
}
.ui-tooltip-wrapper:hover .ui-tooltip { opacity: 1; }

/* === Empty State === */
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
}
.ui-empty-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-gray-50);
  color: var(--ui-gray-400);
  margin-bottom: 16px;
}
.ui-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-gray-900);
  margin-bottom: 4px;
}
.ui-empty-text {
  font-size: 14px;
  color: var(--ui-gray-500);
  margin-bottom: 20px;
  max-width: 320px;
}

/* === Animations === */
@keyframes ui-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ui-slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ui-slide-in-right {
  from { opacity: 0; transform: translateX(100px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes ui-spin {
  to { transform: rotate(360deg); }
}
@keyframes ui-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes ui-bounce-in {
  0% { opacity: 0; transform: scale(0.9); }
  50% { transform: scale(1.02); }
  100% { opacity: 1; transform: scale(1); }
}

.ui-animate-fade-in { animation: ui-fade-in 400ms ease; }
.ui-animate-slide-up { animation: ui-slide-up 500ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.ui-animate-bounce-in { animation: ui-bounce-in 500ms cubic-bezier(0.34, 1.56, 0.64, 1); }

/* Stagger children animations */
.ui-stagger > * { animation: ui-slide-up 400ms ease both; }
.ui-stagger > *:nth-child(1) { animation-delay: 0ms; }
.ui-stagger > *:nth-child(2) { animation-delay: 60ms; }
.ui-stagger > *:nth-child(3) { animation-delay: 120ms; }
.ui-stagger > *:nth-child(4) { animation-delay: 180ms; }
.ui-stagger > *:nth-child(5) { animation-delay: 240ms; }
.ui-stagger > *:nth-child(6) { animation-delay: 300ms; }
.ui-stagger > *:nth-child(7) { animation-delay: 360ms; }
.ui-stagger > *:nth-child(8) { animation-delay: 420ms; }

/* === Responsive === */
@media (max-width: 768px) {
  .ui-hero-title { font-size: 36px; }
  .ui-hero-subtitle { font-size: 16px; }
  .ui-section { padding: 48px 16px; }
  .ui-navbar { padding: 0 16px; }
  .ui-navbar-links { display: none; }
  .ui-modal { padding: 24px; margin: 16px; }
}

/* === Utility === */
.ui-text-center { text-align: center; }
.ui-text-left { text-align: left; }
.ui-text-right { text-align: right; }
.ui-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(COMPONENT_CSS, { headers: corsHeaders });
});
