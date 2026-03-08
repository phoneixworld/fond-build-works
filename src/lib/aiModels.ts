export const AI_MODELS = [
  { id: "google/gemini-3-flash-preview", label: "Gemini Flash", description: "Fast & efficient", tier: "fast" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Balanced speed + quality", tier: "fast" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Best reasoning", tier: "pro" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", description: "Strong & affordable", tier: "pro" },
  { id: "openai/gpt-5", label: "GPT-5", description: "Most capable", tier: "premium" },
] as const;

export type AIModelId = (typeof AI_MODELS)[number]["id"];

// Upgraded default to Pro for much better quality
export const DEFAULT_MODEL: AIModelId = "google/gemini-2.5-pro";

export const PROMPT_SUGGESTIONS = [
  { label: "🎨 Add dark mode", prompt: "Add a dark mode toggle to the app with smooth transitions" },
  { label: "📱 Make responsive", prompt: "Make the app fully responsive for mobile, tablet and desktop" },
  { label: "✨ Add animations", prompt: "Add smooth entrance animations and hover effects throughout the app" },
  { label: "🔐 Add login page", prompt: "Add a beautiful login and signup page with form validation" },
  { label: "📊 Add dashboard", prompt: "Build a data dashboard with charts and summary cards" },
  { label: "🛒 E-commerce", prompt: "Build a modern product listing page with shopping cart" },
];

export const QUICK_ACTIONS = [
  { label: "Improve design", prompt: "Improve the overall design — better colors, spacing, typography, and visual hierarchy" },
  { label: "Fix bugs", prompt: "Review the current app for any bugs or issues and fix them" },
  { label: "Add loading states", prompt: "Add proper loading states, skeletons, and error handling throughout the app" },
  { label: "Optimize performance", prompt: "Optimize the app for performance — lazy loading, caching, and efficient rendering" },
];

// Design theme presets
export interface DesignTheme {
  id: string;
  label: string;
  emoji: string;
  description: string;
  prompt: string; // injected into system prompt
}

export const DESIGN_THEMES: DesignTheme[] = [
  {
    id: "minimal",
    label: "Minimal",
    emoji: "⚪",
    description: "Clean, lots of whitespace, subtle shadows",
    prompt: `DESIGN THEME: Minimal
- Color palette: monochromatic with one subtle accent. Primary: slate-800. Accent: a single muted color (blue-500 or emerald-500).
- Typography: Light weights (font-light for headings, font-normal for body). Large font sizes. Lots of letter-spacing.
- Spacing: VERY generous. Sections: py-24 to py-32. Cards: p-8 to p-12.
- Shadows: Almost none. Use subtle borders (border-gray-100) instead.
- Border radius: rounded-lg max. No heavily rounded elements.
- Decorations: NONE. No gradients, no blobs, no patterns. Pure whitespace.
- Animations: Minimal fade-ins only. No bouncy effects.
- Overall feel: Like a high-end Swiss design studio. Every pixel intentional.`,
  },
  {
    id: "bold",
    label: "Bold",
    emoji: "🔥",
    description: "Vibrant colors, strong contrasts, eye-catching",
    prompt: `DESIGN THEME: Bold & Vibrant
- Color palette: Rich, saturated colors. Use a bold primary (violet-600, rose-600, or amber-500) with a contrasting accent.
- Typography: HEAVY weights (font-extrabold, font-black). Oversized hero text (text-6xl to text-8xl). Tight line-height.
- Spacing: Generous but dynamic. Mix tight and loose spacing for rhythm.
- Shadows: Large, colorful shadows. shadow-xl with primary color tint (shadow-violet-500/25).
- Border radius: Mix sharp (rounded-none) and very round (rounded-3xl) for contrast.
- Decorations: Gradient backgrounds, gradient text, abstract shapes, overlapping elements.
- Animations: Bouncy, energetic. Scale effects, slide-ins, staggered reveals.
- Dark sections: Use rich dark backgrounds (slate-950, zinc-950) with bright text and neon-like accents.
- Overall feel: Like a cutting-edge startup or creative agency. Maximum visual impact.`,
  },
  {
    id: "corporate",
    label: "Corporate",
    emoji: "🏢",
    description: "Professional, trustworthy, clean structure",
    prompt: `DESIGN THEME: Corporate / Professional
- Color palette: Conservative. Primary: blue-600 or indigo-600. Neutrals: gray scale. Very limited accent usage.
- Typography: Professional. "Inter" or "DM Sans". Medium weights. Standard sizes. Clear hierarchy.
- Spacing: Structured and consistent. Even grid layouts. Aligned elements.
- Shadows: Subtle, standard. shadow-sm to shadow-md only.
- Border radius: Moderate. rounded-lg consistently throughout.
- Decorations: Minimal. Clean lines, structured grids. Maybe subtle dot patterns.
- Animations: Subtle, professional. Gentle fade-ins. No playful effects.
- Components: Emphasis on data tables, forms, navigation breadcrumbs, status badges.
- Overall feel: Like a Fortune 500 website. Trustworthy, organized, competent.`,
  },
  {
    id: "playful",
    label: "Playful",
    emoji: "🎮",
    description: "Fun, rounded, friendly with warm colors",
    prompt: `DESIGN THEME: Playful & Friendly
- Color palette: Warm and inviting. Use orange, pink, yellow, teal. Multiple colors in harmony.
- Typography: Rounded, friendly fonts ("Nunito", "Poppins", "Quicksand"). Mix of weights. Emoji usage encouraged.
- Spacing: Comfortable. Not too tight, not too loose. Cozy feeling.
- Shadows: Soft, warm shadows. shadow-lg with warm color tints.
- Border radius: VERY rounded. rounded-2xl to rounded-3xl everywhere. Pill buttons (rounded-full).
- Decorations: Illustrated elements, emoji, rounded blobs, wavy dividers, confetti-like accents.
- Animations: Bouncy, delightful. Spring physics, wiggle effects, playful hover states.
- Components: Rounded cards, pill badges, circular avatars, progress indicators.
- Overall feel: Like a modern consumer app. Friendly, approachable, delightful.`,
  },
  {
    id: "dark",
    label: "Dark Mode",
    emoji: "🌙",
    description: "Dark backgrounds, glowing accents, modern",
    prompt: `DESIGN THEME: Dark Mode / Cyberpunk
- Color palette: Dark backgrounds (gray-950, slate-950, zinc-950). Glowing accents (cyan-400, violet-400, emerald-400).
- Typography: Clean sans-serif. Light text on dark. font-light for large headings, font-medium for body.
- Spacing: Standard. Clean and structured.
- Shadows: Glow effects! box-shadow with colored glow: 0 0 30px rgba(cyan/violet, 0.2).
- Border radius: Moderate to sharp. Mix rounded-lg and rounded-xl.
- Borders: Use subtle light borders (border-gray-800 or border-white/10) for structure.
- Decorations: Gradient glows, grid patterns (opacity-5), subtle noise texture.
- Animations: Smooth, elegant. Glow pulses, gradient shifts.
- Overall feel: Like a premium developer tool or gaming platform. Sleek, modern, immersive.
- IMPORTANT: body background must be dark (bg-gray-950 or similar). All text must be light.`,
  },
];
