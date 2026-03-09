/**
 * Component Snippets Library
 * 
 * Reusable section blueprints the AI can mix-and-match.
 * Updated to leverage DaisyUI component classes where applicable.
 */

export interface ComponentSnippet {
  id: string;
  name: string;
  category: "hero" | "features" | "pricing" | "testimonials" | "cta" | "footer" | "contact" | "stats" | "faq" | "gallery" | "team" | "navigation";
  /** Compact structural description */
  structure: string;
}

export const COMPONENT_SNIPPETS: ComponentSnippet[] = [
  // === HEROES ===
  {
    id: "hero-centered",
    name: "Centered Hero",
    category: "hero",
    structure: `<section id="hero" class="py-24 text-center relative overflow-hidden">
  <!-- Decorative gradient blob -->
  <div style="position:absolute;top:-100px;left:50%;transform:translateX(-50%);width:600px;height:600px;background:radial-gradient(circle,rgba(PRIMARY,0.15),transparent 70%);pointer-events:none;"></div>
  <div class="max-w-4xl mx-auto px-4 relative z-10">
    <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">✨ Badge text</span>
    <h1 class="text-5xl md:text-6xl font-bold tracking-tight mb-6">Main <span class="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">headline</span></h1>
    <p class="text-xl text-gray-600 max-w-2xl mx-auto mb-8">Subtitle description goes here with compelling copy.</p>
    <div class="flex gap-4 justify-center">
      <a href="#cta" class="px-8 py-3 bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all">Primary CTA</a>
      <a href="#features" class="px-8 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all">Secondary CTA</a>
    </div>
  </div>
</section>`,
  },
  {
    id: "hero-split",
    name: "Split Hero (text + visual)",
    category: "hero",
    structure: `<section id="hero" class="py-20">
  <div class="max-w-7xl mx-auto px-4 flex flex-col lg:flex-row items-center gap-12">
    <div class="flex-1">
      <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">Badge</span>
      <h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-4">Headline text</h1>
      <p class="text-lg text-gray-600 mb-8 max-w-lg">Description paragraph.</p>
      <div class="flex gap-3">
        <a href="#cta" class="px-6 py-3 bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all">Get Started</a>
        <a href="#features" class="px-6 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all">Learn More</a>
      </div>
    </div>
    <div class="flex-1">
      <div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-radius:16px;padding:48px;min-height:400px;display:flex;align-items:center;justify-content:center;">
        <!-- Visual placeholder: use SVG illustration or CSS art -->
        <div style="width:200px;height:200px;border-radius:24px;background:linear-gradient(135deg,var(--primary),var(--accent));opacity:0.8;"></div>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: "hero-dark",
    name: "Dark Mode Hero",
    category: "hero",
    structure: `<section id="hero" class="py-24 bg-gray-950 text-white relative overflow-hidden">
  <!-- Animated gradient orbs -->
  <div style="position:absolute;top:-150px;left:-150px;width:400px;height:400px;background:radial-gradient(circle,rgba(99,102,241,0.4),transparent 70%);filter:blur(60px);animation:pulse 8s ease-in-out infinite;"></div>
  <div style="position:absolute;bottom:-100px;right:-100px;width:350px;height:350px;background:radial-gradient(circle,rgba(236,72,153,0.3),transparent 70%);filter:blur(60px);animation:pulse 6s ease-in-out infinite 2s;"></div>
  <!-- Grid pattern overlay -->
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:64px 64px;"></div>
  <div class="max-w-4xl mx-auto px-4 text-center relative z-10">
    <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-sm font-medium mb-6 border border-white/10">
      <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite;"></span>
      Now in beta
    </span>
    <h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-6">
      Build <span class="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">faster</span>
    </h1>
    <p class="text-xl text-gray-400 max-w-2xl mx-auto mb-8">Compelling description with a dark, modern aesthetic.</p>
    <div class="flex gap-4 justify-center">
      <a href="#cta" class="px-8 py-3 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 transition-all">Get Started</a>
      <a href="#features" class="px-8 py-3 border border-white/20 text-white rounded-xl font-medium hover:bg-white/10 transition-all flex items-center gap-2">
        <i data-lucide="play" class="w-4 h-4"></i> Watch Demo
      </a>
    </div>
  </div>
</section>`,
  },

  // === FEATURES ===
  {
    id: "features-grid",
    name: "Features Grid (3 cols)",
    category: "features",
    structure: `<section id="features" class="py-20 bg-gray-50/50">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">Features</h2>
      <p class="text-gray-600 max-w-2xl mx-auto">Subtitle text</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Repeat 6x: -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <i data-lucide="icon-name" class="w-6 h-6 text-primary"></i>
        </div>
        <h3 class="text-lg font-semibold mb-2">Feature name</h3>
        <p class="text-gray-600 text-sm">Feature description.</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: "features-alternating",
    name: "Features Alternating (left-right)",
    category: "features",
    structure: `<section id="features" class="py-20">
  <div class="max-w-7xl mx-auto px-4 space-y-24">
    <!-- Row 1: text left, visual right -->
    <div class="flex flex-col lg:flex-row items-center gap-12">
      <div class="flex-1"><h3 class="text-2xl font-bold mb-4">Feature 1</h3><p class="text-gray-600">Description</p></div>
      <div class="flex-1"><div style="height:300px;border-radius:16px;background:linear-gradient(135deg,#dbeafe,#ede9fe);"></div></div>
    </div>
    <!-- Row 2: visual left, text right (reversed) -->
    <div class="flex flex-col lg:flex-row-reverse items-center gap-12">
      <div class="flex-1"><h3 class="text-2xl font-bold mb-4">Feature 2</h3><p class="text-gray-600">Description</p></div>
      <div class="flex-1"><div style="height:300px;border-radius:16px;background:linear-gradient(135deg,#fce7f3,#fdf2f8);"></div></div>
    </div>
  </div>
</section>`,
  },
  {
    id: "features-bento",
    name: "Bento Grid Layout",
    category: "features",
    structure: `<section id="features" class="py-20 bg-gray-50/50">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">Everything you need</h2>
      <p class="text-gray-600">Powerful features in a beautiful package</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Large feature (spans 2 cols) -->
      <div class="md:col-span-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 text-white relative overflow-hidden min-h-[280px]">
        <div style="position:absolute;bottom:-50px;right:-50px;width:200px;height:200px;background:rgba(255,255,255,0.1);border-radius:50%;"></div>
        <h3 class="text-2xl font-bold mb-3">Main Feature</h3>
        <p class="text-white/80 max-w-md">Description of the primary feature with compelling copy.</p>
      </div>
      <!-- Small feature -->
      <div class="bg-white rounded-3xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
        <div class="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
          <i data-lucide="zap" class="w-6 h-6 text-amber-600"></i>
        </div>
        <h3 class="font-semibold mb-2">Feature Two</h3>
        <p class="text-sm text-gray-600">Brief description.</p>
      </div>
      <!-- Small feature -->
      <div class="bg-white rounded-3xl p-6 border border-gray-100 hover:shadow-xl transition-shadow">
        <div class="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
          <i data-lucide="shield" class="w-6 h-6 text-emerald-600"></i>
        </div>
        <h3 class="font-semibold mb-2">Feature Three</h3>
        <p class="text-sm text-gray-600">Brief description.</p>
      </div>
      <!-- Medium feature (spans 2 cols) -->
      <div class="md:col-span-2 bg-gray-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div style="position:absolute;top:0;right:0;width:300px;height:100%;background:linear-gradient(90deg,transparent,rgba(99,102,241,0.2));"></div>
        <h3 class="text-xl font-bold mb-3">Another Key Feature</h3>
        <p class="text-gray-400 max-w-lg">Expanded description for this feature section.</p>
      </div>
    </div>
  </div>
</section>`,
  },

  // === PRICING ===
  {
    id: "pricing-3tier",
    name: "Pricing 3-Tier",
    category: "pricing",
    structure: `<section id="pricing" class="py-20">
  <div class="max-w-5xl mx-auto px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">Pricing</h2>
      <p class="text-gray-600">Simple, transparent pricing</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Basic -->
      <div class="bg-white rounded-2xl border border-gray-200 p-8">
        <h3 class="font-semibold mb-2">Basic</h3><p class="text-3xl font-bold mb-1">$9<span class="text-base font-normal text-gray-500">/mo</span></p>
        <p class="text-sm text-gray-500 mb-6">For individuals</p>
        <ul class="space-y-3 mb-8 text-sm"><!-- list items with check icons --></ul>
        <a href="#signup" class="block w-full py-3 text-center border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all">Get Started</a>
      </div>
      <!-- Pro (highlighted) -->
      <div class="bg-white rounded-2xl border-2 border-primary p-8 ring-4 ring-primary/10 relative">
        <span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">Popular</span>
        <h3 class="font-semibold mb-2">Pro</h3><p class="text-3xl font-bold mb-1">$29<span class="text-base font-normal text-gray-500">/mo</span></p>
        <p class="text-sm text-gray-500 mb-6">For teams</p>
        <ul class="space-y-3 mb-8 text-sm"><!-- list items --></ul>
        <a href="#signup" class="block w-full py-3 text-center bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all">Get Started</a>
      </div>
      <!-- Enterprise -->
      <div class="bg-white rounded-2xl border border-gray-200 p-8">
        <h3 class="font-semibold mb-2">Enterprise</h3><p class="text-3xl font-bold mb-1">$99<span class="text-base font-normal text-gray-500">/mo</span></p>
        <p class="text-sm text-gray-500 mb-6">For large teams</p>
        <ul class="space-y-3 mb-8 text-sm"><!-- list items --></ul>
        <a href="#contact" class="block w-full py-3 text-center border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all">Contact Sales</a>
      </div>
    </div>
  </div>
</section>`,
  },

  // === TESTIMONIALS ===
  {
    id: "testimonials-grid",
    name: "Testimonials Grid",
    category: "testimonials",
    structure: `<section id="testimonials" class="py-20 bg-gray-50/50">
  <div class="max-w-7xl mx-auto px-4">
    <h2 class="text-3xl font-bold text-center mb-12">What people say</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Card: -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex gap-1 mb-4"><!-- 5 star SVGs in yellow --></div>
        <p class="text-gray-700 mb-4">"Quote text here."</p>
        <div class="flex items-center gap-3">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#ec4899);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:14px;">JD</div>
          <div><p class="font-medium text-sm">Name</p><p class="text-xs text-gray-500">Role, Company</p></div>
        </div>
      </div>
    </div>
  </div>
</section>`,
  },

  // === CTA ===
  {
    id: "cta-dark",
    name: "CTA Section (dark)",
    category: "cta",
    structure: `<section id="cta" class="py-20 bg-gray-900 text-white relative overflow-hidden">
  <div style="position:absolute;top:-200px;right:-200px;width:500px;height:500px;background:radial-gradient(circle,rgba(99,102,241,0.3),transparent);pointer-events:none;"></div>
  <div class="max-w-3xl mx-auto px-4 text-center relative z-10">
    <h2 class="text-3xl md:text-4xl font-bold mb-4">Ready to get started?</h2>
    <p class="text-gray-400 mb-8 text-lg">Compelling subtitle text here.</p>
    <div class="flex gap-4 justify-center">
      <a href="#signup" class="px-8 py-3 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 transition-all">Get Started Free</a>
      <a href="#contact" class="px-8 py-3 border border-white/20 text-white rounded-xl font-medium hover:bg-white/10 transition-all">Talk to Sales</a>
    </div>
  </div>
</section>`,
  },

  // === FOOTER ===
  {
    id: "footer-standard",
    name: "Standard Footer",
    category: "footer",
    structure: `<footer id="footer" class="bg-gray-900 text-gray-400 pt-16 pb-8">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
      <div><h4 class="text-white font-semibold mb-4">Product</h4><ul class="space-y-2 text-sm"><li><a href="#features" class="hover:text-white transition-colors">Features</a></li><li><a href="#pricing" class="hover:text-white transition-colors">Pricing</a></li></ul></div>
      <div><h4 class="text-white font-semibold mb-4">Company</h4><ul class="space-y-2 text-sm"><li><a href="#about" class="hover:text-white transition-colors">About</a></li><li><a href="#contact" class="hover:text-white transition-colors">Contact</a></li></ul></div>
      <div><h4 class="text-white font-semibold mb-4">Resources</h4><ul class="space-y-2 text-sm"><li><a href="#" class="hover:text-white transition-colors">Blog</a></li><li><a href="#" class="hover:text-white transition-colors">Docs</a></li></ul></div>
      <div><h4 class="text-white font-semibold mb-4">Legal</h4><ul class="space-y-2 text-sm"><li><a href="#" class="hover:text-white transition-colors">Privacy</a></li><li><a href="#" class="hover:text-white transition-colors">Terms</a></li></ul></div>
    </div>
    <div class="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
      <p class="text-sm">© 2024 Company. All rights reserved.</p>
      <div class="flex gap-4"><!-- Social icons --></div>
    </div>
  </div>
</footer>`,
  },

  // === CONTACT ===
  {
    id: "contact-form",
    name: "Contact Form",
    category: "contact",
    structure: `<section id="contact" class="py-20">
  <div class="max-w-3xl mx-auto px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">Get in touch</h2>
      <p class="text-gray-600">We'd love to hear from you</p>
    </div>
    <form class="space-y-5" onsubmit="event.preventDefault();">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div><label class="block text-sm font-medium text-gray-700 mb-2">First Name</label><input type="text" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" placeholder="John"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-2">Last Name</label><input type="text" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" placeholder="Doe"></div>
      </div>
      <div><label class="block text-sm font-medium text-gray-700 mb-2">Email</label><input type="email" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" placeholder="john@example.com"></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-2">Message</label><textarea rows="4" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all resize-none" placeholder="Your message..."></textarea></div>
      <button type="submit" class="w-full py-3 bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all">Send Message</button>
    </form>
  </div>
</section>`,
  },

  // === STATS ===
  {
    id: "stats-bar",
    name: "Stats Bar",
    category: "stats",
    structure: `<section id="stats" class="py-16 border-y border-gray-100">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      <div><p class="text-3xl md:text-4xl font-bold text-primary mb-1">10K+</p><p class="text-sm text-gray-500">Users</p></div>
      <div><p class="text-3xl md:text-4xl font-bold text-primary mb-1">99.9%</p><p class="text-sm text-gray-500">Uptime</p></div>
      <div><p class="text-3xl md:text-4xl font-bold text-primary mb-1">50+</p><p class="text-sm text-gray-500">Countries</p></div>
      <div><p class="text-3xl md:text-4xl font-bold text-primary mb-1">4.9/5</p><p class="text-sm text-gray-500">Rating</p></div>
    </div>
  </div>
</section>`,
  },

  // === FAQ ===
  {
    id: "faq-accordion",
    name: "FAQ Accordion",
    category: "faq",
    structure: `<section id="faq" class="py-20">
  <div class="max-w-3xl mx-auto px-4">
    <h2 class="text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
    <div class="space-y-3">
      <!-- Each FAQ item: -->
      <details class="group bg-white rounded-xl border border-gray-200 overflow-hidden">
        <summary class="flex items-center justify-between px-6 py-4 cursor-pointer font-medium hover:bg-gray-50 transition-colors">
          <span>Question text?</span>
          <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180"></i>
        </summary>
        <div class="px-6 pb-4 text-gray-600 text-sm">Answer text.</div>
      </details>
    </div>
  </div>
</section>`,
  },

  // === NAVIGATION ===
  {
    id: "nav-sticky",
    name: "Sticky Navigation",
    category: "navigation",
    structure: `<nav class="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-100">
  <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
    <a href="#hero" class="flex items-center gap-2 font-bold text-lg">
      <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,var(--primary-color,#6366f1),#ec4899);display:flex;align-items:center;justify-content:center;">
        <i data-lucide="zap" style="width:18px;height:18px;color:white;"></i>
      </div>
      Brand
    </a>
    <div class="hidden md:flex items-center gap-8">
      <a href="#features" class="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">Features</a>
      <a href="#pricing" class="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">Pricing</a>
      <a href="#about" class="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">About</a>
    </div>
    <div class="flex items-center gap-3">
      <a href="#login" class="text-sm text-gray-600 hover:text-gray-900 font-medium hidden md:inline-flex">Sign in</a>
      <a href="#signup" class="px-4 py-2 bg-primary text-white text-sm rounded-lg font-medium hover:-translate-y-0.5 shadow-lg shadow-primary/25 transition-all">Get Started</a>
      <button class="md:hidden p-2" data-menu-toggle><i data-lucide="menu" class="w-5 h-5"></i></button>
    </div>
  </div>
  <!-- Mobile menu -->
  <div class="hidden md:hidden mobile-menu" data-mobile-menu>
    <div class="px-4 py-4 space-y-3 border-t border-gray-100">
      <a href="#features" class="block text-sm text-gray-600 hover:text-gray-900 font-medium">Features</a>
      <a href="#pricing" class="block text-sm text-gray-600 hover:text-gray-900 font-medium">Pricing</a>
      <a href="#about" class="block text-sm text-gray-600 hover:text-gray-900 font-medium">About</a>
    </div>
  </div>
</nav>`,
  },
];

/**
 * Get snippets by category
 */
export function getSnippetsByCategory(category: ComponentSnippet["category"]): ComponentSnippet[] {
  return COMPONENT_SNIPPETS.filter(s => s.category === category);
}

/**
 * Get a compact snippets reference for the AI system prompt
 */
export function getSnippetsPromptContext(): string {
  const categories = [...new Set(COMPONENT_SNIPPETS.map(s => s.category))];
  
  return categories.map(cat => {
    const snippets = COMPONENT_SNIPPETS.filter(s => s.category === cat);
    return `### ${cat.charAt(0).toUpperCase() + cat.slice(1)} Snippets\n${snippets.map(s => `- **${s.name}** (${s.id})`).join('\n')}`;
  }).join('\n\n');
}
