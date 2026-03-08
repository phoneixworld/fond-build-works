/**
 * Phase 2: Page Templates Library
 * 
 * Full-page HTML templates the AI can use as starting points.
 * These are structural blueprints — the AI customizes colors, content, and details.
 */

export interface PageTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  keywords: string[];
  /** Compact structural blueprint the AI uses as a starting point */
  blueprint: string;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "saas-landing",
    name: "SaaS Landing Page",
    emoji: "🚀",
    category: "landing",
    description: "Modern SaaS product landing with hero, features, pricing, testimonials, and CTA",
    keywords: ["saas", "landing", "product", "startup", "app", "software", "platform", "tool", "service"],
    blueprint: `STRUCTURE: Sticky nav → Hero (badge + h1 + subtitle + 2 CTAs) → Logo bar → Features grid (3 cols, icon cards) → How it works (3 steps) → Testimonials (3 cards) → Pricing (3 tiers, middle highlighted) → FAQ accordion → CTA banner (dark bg) → Footer
DESIGN: Gradient blob behind hero. Primary color for CTAs. Cards with hover lift. Pricing cards with ring-2 on popular tier. Stats counter in hero or after logo bar.
SECTIONS: #hero, #features, #how-it-works, #testimonials, #pricing, #faq, #cta, #footer
NAV: Product, Features, Pricing, FAQ | Sign in (ghost) + Get Started (primary)`,
  },
  {
    id: "portfolio",
    name: "Creative Portfolio",
    emoji: "🎨",
    category: "portfolio",
    description: "Designer/developer portfolio with project showcase, about, skills, and contact",
    keywords: ["portfolio", "designer", "developer", "creative", "personal", "freelance", "resume", "cv", "work"],
    blueprint: `STRUCTURE: Minimal nav (name + links) → Hero (large name, role tagline, subtle animation) → About section (photo placeholder + bio) → Projects grid (2-3 cols, image cards with overlay) → Skills/tech (tag pills) → Testimonials (carousel or grid) → Contact form → Footer
DESIGN: Monochrome or muted palette with one accent. Large typography. Generous whitespace. Project cards with hover overlay showing title + description. Smooth scroll.
SECTIONS: #hero, #about, #projects, #skills, #testimonials, #contact
NAV: About, Work, Skills, Contact`,
  },
  {
    id: "ecommerce",
    name: "E-Commerce Store",
    emoji: "🛍️",
    category: "ecommerce",
    description: "Product catalog with featured items, categories, cart functionality",
    keywords: ["ecommerce", "store", "shop", "product", "buy", "sell", "commerce", "retail", "market"],
    blueprint: `STRUCTURE: Nav (logo + search bar + cart icon with count) → Hero banner (promo with CTA) → Categories row (horizontal scroll cards) → Featured products grid (4 cols) → Product cards (image, name, price, rating stars, add to cart) → Newsletter signup → Footer with payment icons
DESIGN: Clean white bg. Product cards with shadow on hover. Price in bold. Sale prices with strikethrough. Category cards with gradient overlay. Cart badge with primary color.
SECTIONS: #hero, #categories, #featured, #newsletter, #footer
NAV: Shop, Categories, Deals, About | Search bar + Cart icon`,
  },
  {
    id: "dashboard",
    name: "Admin Dashboard",
    emoji: "📊",
    category: "dashboard",
    description: "Data dashboard with stats cards, charts area, tables, and sidebar navigation",
    keywords: ["dashboard", "admin", "analytics", "panel", "manage", "data", "metrics", "overview", "crm"],
    blueprint: `STRUCTURE: Sidebar (logo + nav links + user avatar at bottom) → Top bar (search + notifications bell + profile dropdown) → Main content: Stats row (4 cards with icon, number, trend arrow) → Charts row (2 cols: line chart area + bar chart area) → Recent activity table → Quick actions bar
DESIGN: Sidebar dark (slate-900), content area light (gray-50). Stats cards with colored left border. Green/red for positive/negative trends. Table with hover rows. Rounded cards everywhere.
LAYOUT: Fixed sidebar 256px. Responsive: sidebar collapses on mobile. Use CSS grid for stats cards.
NAV: Dashboard, Analytics, Users, Settings, Reports | Sidebar navigation`,
  },
  {
    id: "blog",
    name: "Blog / Magazine",
    emoji: "📝",
    category: "blog",
    description: "Content-focused blog with featured post, article grid, categories, and newsletter",
    keywords: ["blog", "magazine", "article", "post", "content", "news", "editorial", "write", "journal"],
    blueprint: `STRUCTURE: Nav (blog name + category links) → Featured post (full-width hero card with gradient overlay) → Article grid (3 cols: image + title + excerpt + author + date) → Sidebar layout option (2 cols: articles + sidebar with categories/tags) → Newsletter CTA → Footer
DESIGN: Serif font for headings (editorial feel). Clean cards with category badge. Author avatars (initial circles). Reading time estimate. Muted palette, primary for links/accents.
SECTIONS: #featured, #articles, #newsletter, #footer
NAV: Home, Technology, Design, Business, About`,
  },
  {
    id: "restaurant",
    name: "Restaurant / Food",
    emoji: "🍽️",
    category: "restaurant",
    description: "Restaurant site with menu, reservations, about, gallery, and location",
    keywords: ["restaurant", "food", "menu", "cafe", "bar", "dining", "recipe", "cook", "eat", "reservation"],
    blueprint: `STRUCTURE: Nav (restaurant name + links + Reserve button) → Hero (large bg gradient with tagline + Reserve CTA) → About section (story + chef bio) → Menu sections (starters, mains, desserts with price) → Gallery (CSS grid, gradient placeholders) → Testimonials → Reservation form (date, time, guests) → Location/map placeholder + hours → Footer
DESIGN: Warm palette (amber/orange accents). Elegant serif for headings. Menu items with dotted line between name and price. Dark hero section. Gold/amber accents.
SECTIONS: #hero, #about, #menu, #gallery, #reviews, #reservations, #location
NAV: About, Menu, Gallery, Reservations, Contact`,
  },
  {
    id: "agency",
    name: "Agency / Services",
    emoji: "🏢",
    category: "agency",
    description: "Digital agency with services, case studies, team, process, and contact",
    keywords: ["agency", "services", "consulting", "marketing", "design", "development", "company", "business", "firm"],
    blueprint: `STRUCTURE: Nav (agency logo + links + Let's Talk CTA) → Hero (bold statement + subtitle + CTA + abstract gradient art) → Services grid (4 cards with icons) → Case studies (2-3 large cards with results/metrics) → Process steps (4 numbered steps) → Team grid (photo placeholders + name + role) → Client logos bar → CTA section → Footer
DESIGN: Bold, confident. Dark sections alternating with light. Large headings. Metrics in big numbers. Team cards with hover effect showing bio. Professional color palette.
SECTIONS: #hero, #services, #work, #process, #team, #clients, #contact
NAV: Services, Work, About, Process, Contact`,
  },
  {
    id: "app-landing",
    name: "Mobile App Landing",
    emoji: "📱",
    category: "landing",
    description: "App download page with phone mockup, features, screenshots, reviews, and download CTAs",
    keywords: ["app", "mobile", "download", "ios", "android", "phone", "install", "launch"],
    blueprint: `STRUCTURE: Nav (app icon + name + Download CTA) → Hero (tagline + phone mockup CSS art + app store buttons) → Features (alternating left-right: text + phone screen) → Stats bar (downloads, rating, reviews) → Reviews carousel → Download CTA section → Footer
DESIGN: Vibrant gradient hero. Phone mockup using CSS (rounded rect with screen area). App store button styles. Floating elements for playfulness. Feature sections with subtle bg tints.
SECTIONS: #hero, #features, #stats, #reviews, #download
NAV: Features, Reviews, Download`,
  },
  {
    id: "event",
    name: "Event / Conference",
    emoji: "🎪",
    category: "event",
    description: "Event landing with schedule, speakers, venue, tickets, and countdown",
    keywords: ["event", "conference", "meetup", "workshop", "summit", "hackathon", "webinar", "concert", "festival"],
    blueprint: `STRUCTURE: Nav (event logo + links + Get Tickets CTA) → Hero (event name + date + location + countdown timer + Register CTA) → About/intro → Speakers grid (avatar circles + name + title + topic) → Schedule timeline (day tabs → time slots) → Venue info + gradient map placeholder → Sponsors logo bar → Ticket tiers (3 pricing cards) → FAQ → Footer
DESIGN: Dynamic, energetic palette. Countdown with large numbers. Speaker cards with gradient borders. Timeline with connected dots. Ticket cards similar to pricing.
SECTIONS: #hero, #about, #speakers, #schedule, #venue, #sponsors, #tickets, #faq
NAV: Speakers, Schedule, Venue, Tickets, FAQ`,
  },
  {
    id: "documentation",
    name: "Documentation / Wiki",
    emoji: "📚",
    category: "docs",
    description: "Documentation site with sidebar nav, search, code blocks, and content sections",
    keywords: ["docs", "documentation", "wiki", "guide", "tutorial", "api", "reference", "help", "manual"],
    blueprint: `STRUCTURE: Top bar (product name + search bar + version selector + GitHub link) → Sidebar (collapsible nav tree: Getting Started, Installation, API Reference, etc.) → Main content (breadcrumb → h1 → content with code blocks, tables, callout boxes) → On-this-page TOC (right sidebar) → Prev/Next navigation → Footer
DESIGN: Clean, readable. Sidebar with tree indentation. Code blocks with syntax highlighting colors (dark bg). Callout boxes (info blue, warning yellow, error red). Monospace for code. Max-width prose for readability.
LAYOUT: 3-column: sidebar 240px + content flex-1 + TOC 200px. Responsive: sidebars collapse on mobile.
NAV: Sidebar tree navigation + top search`,
  },
];

/**
 * Match a user prompt to the best template
 */
export function matchTemplate(prompt: string): PageTemplate | null {
  const lower = prompt.toLowerCase();
  
  let bestMatch: PageTemplate | null = null;
  let bestScore = 0;
  
  for (const template of PAGE_TEMPLATES) {
    let score = 0;
    
    // Check keyword matches
    for (const keyword of template.keywords) {
      if (lower.includes(keyword)) {
        score += keyword.length > 4 ? 3 : 2; // Longer keywords score higher
      }
    }
    
    // Check category match
    if (lower.includes(template.category)) {
      score += 5;
    }
    
    // Check name match
    if (lower.includes(template.name.toLowerCase())) {
      score += 10;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = template;
    }
  }
  
  // Only return if we have reasonable confidence
  return bestScore >= 3 ? bestMatch : null;
}
