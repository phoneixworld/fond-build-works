/**
 * Design Theme Presets
 * 
 * Each theme provides visual direction hints that get injected into the build prompt.
 * Themes control: font pairing, color temperature, border radius, shadow intensity,
 * and animation density.
 */

export interface DesignTheme {
  id: string;
  name: string;
  description: string;
  /** Font pair: [display, body] */
  fonts: [string, string];
  /** Color temperature hint */
  colorTemp: "warm" | "cool" | "neutral";
  /** Border radius preference */
  radius: "sharp" | "rounded" | "pill";
  /** Shadow intensity */
  shadows: "flat" | "subtle" | "elevated" | "dramatic";
  /** Animation density */
  animation: "minimal" | "moderate" | "rich";
  /** Additional prompt instructions */
  promptHints: string;
}

export const DESIGN_THEMES: Record<string, DesignTheme> = {
  "corporate-dashboard": {
    id: "corporate-dashboard",
    name: "Corporate Dashboard",
    description: "Clean, data-dense, professional — optimized for enterprise admin panels",
    fonts: ["Inter", "Inter"],
    colorTemp: "cool",
    radius: "rounded",
    shadows: "subtle",
    animation: "minimal",
    promptHints: `DESIGN DIRECTION: Corporate Dashboard
- Use a CLEAN, DATA-DENSE layout with plenty of white space between sections.
- Dashboard pages: lead with 4 stat cards (KPIs) in a responsive row, followed by charts and data tables.
- Sidebar: dark background (var(--color-sidebar)), clean icon + text nav with clear active indicators.
- Tables: compact rows, uppercase muted headers, status badges in cells, action buttons on hover.
- Cards: subtle borders, consistent padding (var(--space-6)), no excessive shadows.
- Typography: precise weight hierarchy — 800 for big numbers, 600 for headings, 400 for body.
- Color: primary blue for actions, muted grays for chrome, semantic colors for statuses only.
- Keep animations subtle: fade-in on page load, no bouncing or dramatic effects.`,
  },

  "modern-saas": {
    id: "modern-saas",
    name: "Modern SaaS",
    description: "Polished, gradient-forward, with depth and micro-interactions",
    fonts: ["Inter", "Inter"],
    colorTemp: "cool",
    radius: "rounded",
    shadows: "elevated",
    animation: "rich",
    promptHints: `DESIGN DIRECTION: Modern SaaS
- Use GRADIENT ACCENTS on primary buttons and hero sections (linear-gradient with primary + info colors).
- Cards should use "card" class with hover lift effect. Feature cards use "card-featured" for emphasis.
- Add "stagger" class to grids/lists for cascading entrance animations.
- Use glassmorphism ("card-glass") for overlay elements or premium feature sections.
- Stat cards: large bold numbers, small trend indicators with up/down arrows.
- Buttons: rounded-lg, hover:shadow-md, hover:translateY(-1px) for lift effect.
- Navigation: clean sidebar or top nav with smooth transitions.
- Empty states: centered with a subtle icon, friendly copy, and a primary CTA.
- Use "text-gradient" class for hero headings or key metrics.`,
  },

  "playful-edu": {
    id: "playful-edu",
    name: "Playful Education",
    description: "Friendly, colorful, accessible — ideal for school/education apps",
    fonts: ["Inter", "Inter"],
    colorTemp: "warm",
    radius: "pill",
    shadows: "subtle",
    animation: "rich",
    promptHints: `DESIGN DIRECTION: Playful Education
- Use WARM, FRIENDLY colors: primary blue for actions, success green for completed, warning amber for pending.
- Rounded corners (radius-xl to radius-2xl) on cards and buttons for a soft, approachable feel.
- Larger text sizes: body at text-base, headings at text-xl to text-3xl with font-bold.
- Avatar groups for student/teacher lists with colorful avatar backgrounds.
- Status badges: use rounded-full (pill shape) with light backgrounds: badge-success, badge-warning, badge-danger.
- Cards: generous padding (var(--space-8)), clear section dividers.
- Icons: use lucide-react icons liberally — they add visual interest and improve scannability.
- Add "animate-bounce-in" for new items, "stagger" for lists, celebration effects for achievements.
- Empty states: friendly illustrations (emoji or icon), encouraging copy ("No assignments yet — create your first!").`,
  },

  "minimal-clean": {
    id: "minimal-clean",
    name: "Minimal Clean",
    description: "Ultra-clean, lots of whitespace, restrained color palette",
    fonts: ["Inter", "Inter"],
    colorTemp: "neutral",
    radius: "rounded",
    shadows: "flat",
    animation: "minimal",
    promptHints: `DESIGN DIRECTION: Minimal Clean
- MAXIMUM WHITESPACE: use generous padding (var(--space-8) to var(--space-12)) between sections.
- RESTRAINED palette: primary color for ONE key action per page, everything else in grays.
- Borders: use thin (1px) light borders (var(--color-border-light)) sparingly — prefer whitespace.
- Typography does all the work: clear hierarchy through size and weight, not color.
- Cards: borderless or very subtle border, no shadows. Distinguish sections with background tints.
- Tables: minimal styling, no visible row borders, just bottom border on header.
- No gratuitous animations — only subtle fade-in on page mount.
- Buttons: clean outlines for secondary, solid fill for ONE primary action.
- Prefer text links over buttons where possible.`,
  },

  "healthcare": {
    id: "healthcare",
    name: "Healthcare Professional",
    description: "Clinical, trustworthy, high-contrast for medical/hospital applications",
    fonts: ["Inter", "Inter"],
    colorTemp: "cool",
    radius: "rounded",
    shadows: "subtle",
    animation: "minimal",
    promptHints: `DESIGN DIRECTION: Healthcare Professional
- TRUST and CLARITY are paramount — use high contrast text, clear labels, no ambiguity.
- Color coding: GREEN for healthy/normal, AMBER for warnings/reviews, RED for critical/urgent.
- Patient/record cards: structured layout with labeled fields, clear status badges.
- Tables: sortable columns, status indicators, action buttons clearly visible.
- Forms: clear labels above inputs, required field indicators, inline validation messages.
- Navigation: sidebar with clear module sections (Patients, Appointments, Records, Reports).
- Dashboard: KPI cards showing key metrics (patients, appointments, alerts), followed by recent activity.
- Use "badge" classes extensively for statuses: Active, Pending, Critical, Discharged.
- Accessibility: ensure WCAG AA contrast ratios. All interactive elements keyboard-navigable.
- Keep animations minimal — healthcare users prioritize speed over visual effects.`,
  },
};

/**
 * Get the design theme prompt section for injection into build tasks.
 * Returns empty string if no theme matches.
 */
export function getDesignThemePrompt(themeId?: string): string {
  if (!themeId) return "";
  
  const theme = DESIGN_THEMES[themeId];
  if (!theme) {
    // Try fuzzy matching
    const key = Object.keys(DESIGN_THEMES).find(k => 
      themeId.toLowerCase().includes(k.replace(/-/g, " ")) ||
      k.includes(themeId.toLowerCase().replace(/\s+/g, "-"))
    );
    if (key) return DESIGN_THEMES[key].promptHints;
    return "";
  }

  return theme.promptHints;
}

/**
 * Auto-detect the best theme from requirements text
 */
export function detectDesignTheme(requirements: string): string | undefined {
  const lower = requirements.toLowerCase();

  if (/hospital|clinic|patient|medical|health|doctor|nurse|pharma/i.test(lower)) {
    return "healthcare";
  }
  if (/school|education|student|teacher|course|classroom|university|college/i.test(lower)) {
    return "playful-edu";
  }
  if (/dashboard|admin|analytics|enterprise|crm|erp|management/i.test(lower)) {
    return "corporate-dashboard";
  }
  if (/saas|subscription|landing|pricing|startup|app/i.test(lower)) {
    return "modern-saas";
  }
  if (/portfolio|blog|personal|minimal|clean/i.test(lower)) {
    return "minimal-clean";
  }

  return undefined;
}
