/**
 * Micro-Interaction Utility Library v1.0
 * 
 * Reusable animation constants and CSS class helpers.
 * Referenced by the build prompt so generated code uses consistent animations.
 */

/** Animation CSS class map — use these in className attributes */
export const ANIMATIONS = {
  fadeIn: "animate-fade-in",
  fadeOut: "animate-fade-out",
  scaleIn: "animate-scale-in",
  slideInRight: "animate-slide-in-right",
  enter: "animate-enter",
  exit: "animate-exit",
  hoverScale: "hover-scale",
  pulse: "pulse",
  storyLink: "story-link",
} as const;

/** 
 * Inline style helpers for JS-driven animations (framer-motion compatible).
 * Use when CSS classes aren't sufficient.
 */
export const MOTION_PRESETS = {
  fadeIn: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } },
  slideUp: { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: "easeOut" } },
  hoverLift: { whileHover: { y: -2, boxShadow: "0 8px 25px -8px rgba(0,0,0,0.15)" }, transition: { duration: 0.2 } },
  scaleIn: { initial: { scale: 0.95, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.25 } },
  stagger: (i: number) => ({ initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.05, duration: 0.3 } }),
} as const;

/**
 * CSS keyframes + utility classes to inject into globals.css
 * These extend the base animation set from tailwind.config.ts
 */
export const ANIMATION_CSS = `
/* ─── Micro-Interaction Utilities ────────────────────── */

/* Shimmer loading effect */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.shimmer {
  background: linear-gradient(90deg, var(--color-bg-muted) 25%, var(--color-bg-hover) 50%, var(--color-bg-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Ripple click effect */
@keyframes ripple {
  0% { transform: scale(0); opacity: 0.5; }
  100% { transform: scale(4); opacity: 0; }
}
.ripple {
  position: relative;
  overflow: hidden;
}
.ripple::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0;
  transform: scale(0);
}
.ripple:active::after {
  animation: ripple 0.4s ease-out;
}

/* Toast slide-in */
@keyframes toast-slide-in {
  0% { transform: translateX(100%); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
.animate-toast-slide-in {
  animation: toast-slide-in 0.3s ease-out;
}

/* Bounce-in for celebratory moments */
@keyframes bounce-in {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); opacity: 1; }
}
.animate-bounce-in {
  animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Stagger parent — children with .stagger-child get delayed fade-in */
.stagger > * {
  opacity: 0;
  animation: fade-in 0.3s ease-out forwards;
}
.stagger > *:nth-child(1) { animation-delay: 0s; }
.stagger > *:nth-child(2) { animation-delay: 0.05s; }
.stagger > *:nth-child(3) { animation-delay: 0.1s; }
.stagger > *:nth-child(4) { animation-delay: 0.15s; }
.stagger > *:nth-child(5) { animation-delay: 0.2s; }
.stagger > *:nth-child(6) { animation-delay: 0.25s; }
.stagger > *:nth-child(7) { animation-delay: 0.3s; }
.stagger > *:nth-child(8) { animation-delay: 0.35s; }

/* Hover lift for cards */
.hover-lift {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px -8px rgba(0, 0, 0, 0.15);
}

/* Skeleton pulse (enhanced) */
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.skeleton-pulse {
  animation: skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
`;

/**
 * Prompt snippet describing available animations for the builder
 */
export const ANIMATION_PROMPT_SECTION = `### AVAILABLE ANIMATIONS (use these classes — do NOT create custom @keyframes):
- \`animate-fade-in\` — Smooth entrance with subtle upward slide (pages, sections)
- \`animate-scale-in\` — Scale up from 95% (modals, popups)  
- \`animate-slide-in-right\` — Slide from right edge (drawers, sheets)
- \`hover-scale\` — Scale to 105% on hover (cards, buttons)
- \`hover-lift\` — Lift up 2px with shadow on hover (cards, clickable items)
- \`stagger\` — Add to parent: children fade in with cascading delay (grids, lists)
- \`shimmer\` — Loading shimmer effect (skeletons, placeholders)
- \`ripple\` — Material-style click ripple (buttons)
- \`animate-bounce-in\` — Celebratory bounce entrance (achievements, success states)
- \`animate-toast-slide-in\` — Toast notification entrance
- \`skeleton-pulse\` — Pulsing skeleton loading effect

Animation usage rules:
1. Every page container should use \`animate-fade-in\`
2. Card grids should use \`stagger\` on the parent div
3. Cards should use \`hover-lift\` for interactive cards
4. Loading states should use \`shimmer\` or \`skeleton-pulse\`
5. Use \`animate-bounce-in\` sparingly — only for success/achievement moments
`;
