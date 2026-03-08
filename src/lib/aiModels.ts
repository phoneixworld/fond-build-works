export const AI_MODELS = [
  { id: "google/gemini-3-flash-preview", label: "Gemini Flash", description: "Fast & efficient", tier: "fast" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Balanced speed + quality", tier: "fast" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Best reasoning", tier: "pro" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", description: "Strong & affordable", tier: "pro" },
  { id: "openai/gpt-5", label: "GPT-5", description: "Most capable", tier: "premium" },
] as const;

export type AIModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_MODEL: AIModelId = "google/gemini-3-flash-preview";

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
