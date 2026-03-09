/**
 * Component Snippets Library
 * 
 * Reusable section blueprints the AI can mix-and-match.
 * Updated to leverage DaisyUI component classes where applicable.
 */

export interface ComponentSnippet {
  id: string;
  name: string;
  category: "hero" | "features" | "pricing" | "testimonials" | "cta" | "footer" | "contact" | "stats" | "faq" | "gallery" | "team" | "navigation" | "micro-interaction" | "newsletter" | "logo-cloud" | "blog" | "timeline" | "auth" | "banner" | "tabs" | "error" | "dashboard" | "progress" | "social-proof" | "cookie" | "sidebar" | "video";
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

  // === CARDS ===
  {
    id: "card-glass",
    name: "Glassmorphism Card",
    category: "features",
    structure: `<div class="relative group">
  <!-- Glow effect behind card -->
  <div style="position:absolute;inset:-1px;background:linear-gradient(135deg,rgba(99,102,241,0.5),rgba(236,72,153,0.5));border-radius:24px;filter:blur(20px);opacity:0;transition:opacity 0.3s;" class="group-hover:opacity-100"></div>
  <!-- Glass card -->
  <div style="background:rgba(255,255,255,0.7);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.5);border-radius:24px;padding:32px;position:relative;">
    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg">
      <i data-lucide="sparkles" class="w-7 h-7 text-white"></i>
    </div>
    <h3 class="text-xl font-bold mb-3">Glassmorphism</h3>
    <p class="text-gray-600">Modern frosted glass effect with gradient glow on hover.</p>
  </div>
</div>`,
  },
  {
    id: "card-glass-dark",
    name: "Glassmorphism Card (Dark)",
    category: "features",
    structure: `<div class="relative group">
  <!-- Glow effect -->
  <div style="position:absolute;inset:-2px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:28px;opacity:0.5;filter:blur(24px);transition:opacity 0.3s;" class="group-hover:opacity-80"></div>
  <!-- Dark glass card -->
  <div style="background:rgba(15,23,42,0.8);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:32px;position:relative;">
    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center mb-5">
      <i data-lucide="layers" class="w-7 h-7 text-white"></i>
    </div>
    <h3 class="text-xl font-bold text-white mb-3">Dark Glass</h3>
    <p class="text-gray-400">Sleek dark mode glassmorphism with vibrant glow.</p>
  </div>
</div>`,
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
  {
    id: "stats-animated",
    name: "Animated Stats Counter",
    category: "stats",
    structure: `<section id="stats" class="py-20 bg-gray-900 text-white relative overflow-hidden">
  <!-- Background glow -->
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:800px;height:400px;background:radial-gradient(ellipse,rgba(99,102,241,0.15),transparent 70%);"></div>
  <div class="max-w-7xl mx-auto px-4 relative z-10">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
      <!-- Stat card with animated counter -->
      <div class="text-center p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
        <p class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2" data-counter="10000" data-suffix="+">0</p>
        <p class="text-sm text-gray-400 uppercase tracking-wider">Active Users</p>
      </div>
      <div class="text-center p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
        <p class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-2" data-counter="99.9" data-suffix="%">0</p>
        <p class="text-sm text-gray-400 uppercase tracking-wider">Uptime</p>
      </div>
      <div class="text-center p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
        <p class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent mb-2" data-counter="150" data-suffix="M">0</p>
        <p class="text-sm text-gray-400 uppercase tracking-wider">Requests/Day</p>
      </div>
      <div class="text-center p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
        <p class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent mb-2" data-counter="4.9" data-suffix="/5">0</p>
        <p class="text-sm text-gray-400 uppercase tracking-wider">User Rating</p>
      </div>
    </div>
  </div>
  <script>
    // Animate counters on scroll into view
    const counters = document.querySelectorAll('[data-counter]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseFloat(el.dataset.counter);
          const suffix = el.dataset.suffix || '';
          const isDecimal = target % 1 !== 0;
          let current = 0;
          const increment = target / 60;
          const animate = () => {
            current += increment;
            if (current < target) {
              el.textContent = (isDecimal ? current.toFixed(1) : Math.floor(current)) + suffix;
              requestAnimationFrame(animate);
            } else {
              el.textContent = (isDecimal ? target.toFixed(1) : target) + suffix;
            }
          };
          animate();
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(c => observer.observe(c));
  </script>
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

  // === FLOATING NAVBAR ===
  {
    id: "nav-floating",
    name: "Floating Navbar with Blur",
    category: "navigation",
    structure: `<nav class="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl">
  <div class="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-gray-200/50 dark:border-white/10 shadow-lg shadow-black/5 px-6 py-3 flex items-center justify-between">
    <a href="#hero" class="flex items-center gap-2 font-bold">
      <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)));display:flex;align-items:center;justify-content:center;">
        <i data-lucide="sparkles" style="width:14px;height:14px;color:white;"></i>
      </div>
      <span class="hidden sm:inline">Brand</span>
    </a>
    <div class="hidden md:flex items-center gap-1">
      <a href="#features" class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">Features</a>
      <a href="#pricing" class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">Pricing</a>
      <a href="#about" class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">About</a>
    </div>
    <div class="flex items-center gap-2">
      <a href="#login" class="text-sm text-muted-foreground hover:text-foreground font-medium hidden md:inline-flex">Sign in</a>
      <a href="#signup" class="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-xl font-medium hover:opacity-90 transition-all">Get Started</a>
    </div>
  </div>
</nav>
<!-- Spacer for fixed nav -->
<div class="h-20"></div>`,
  },

  // === TESTIMONIAL CAROUSEL ===
  {
    id: "testimonial-carousel",
    name: "Testimonial Carousel",
    category: "testimonials",
    structure: `<section id="testimonials" class="py-20 bg-muted/30 overflow-hidden">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">Loved by thousands</h2>
      <p class="text-muted-foreground max-w-2xl mx-auto">See what our customers are saying</p>
    </div>
    <!-- Carousel container -->
    <div class="relative">
      <div class="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4" style="scroll-behavior:smooth;">
        <!-- Testimonial card 1 -->
        <div class="snap-center shrink-0 w-[350px] bg-card rounded-2xl p-6 border shadow-sm">
          <div class="flex gap-1 mb-4">
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
          </div>
          <p class="text-foreground mb-6">"This product has completely transformed how we work. The results speak for themselves."</p>
          <div class="flex items-center gap-3">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)));"></div>
            <div>
              <p class="font-semibold text-sm">Sarah Johnson</p>
              <p class="text-xs text-muted-foreground">CEO, TechCorp</p>
            </div>
          </div>
        </div>
        <!-- Testimonial card 2 -->
        <div class="snap-center shrink-0 w-[350px] bg-card rounded-2xl p-6 border shadow-sm">
          <div class="flex gap-1 mb-4">
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
          </div>
          <p class="text-foreground mb-6">"Incredible value for money. The support team is responsive and the product just works."</p>
          <div class="flex items-center gap-3">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#f472b6,#a855f7);"></div>
            <div>
              <p class="font-semibold text-sm">Michael Chen</p>
              <p class="text-xs text-muted-foreground">Founder, StartupXYZ</p>
            </div>
          </div>
        </div>
        <!-- Testimonial card 3 -->
        <div class="snap-center shrink-0 w-[350px] bg-card rounded-2xl p-6 border shadow-sm">
          <div class="flex gap-1 mb-4">
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
          </div>
          <p class="text-foreground mb-6">"We've tried many solutions but this one stands out. Highly recommend to any team."</p>
          <div class="flex items-center gap-3">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#34d399,#0ea5e9);"></div>
            <div>
              <p class="font-semibold text-sm">Emily Davis</p>
              <p class="text-xs text-muted-foreground">CTO, InnovateCo</p>
            </div>
          </div>
        </div>
        <!-- Add more cards as needed -->
      </div>
      <!-- Navigation arrows -->
      <button class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 rounded-full bg-background border shadow-lg flex items-center justify-center hover:bg-muted transition-colors" onclick="this.parentElement.querySelector('.overflow-x-auto').scrollBy({left:-370,behavior:'smooth'})">
        <i data-lucide="chevron-left" class="w-5 h-5"></i>
      </button>
      <button class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 rounded-full bg-background border shadow-lg flex items-center justify-center hover:bg-muted transition-colors" onclick="this.parentElement.querySelector('.overflow-x-auto').scrollBy({left:370,behavior:'smooth'})">
        <i data-lucide="chevron-right" class="w-5 h-5"></i>
      </button>
    </div>
  </div>
  <style>
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  </style>
</section>`,
  },

  // === GRADIENT BORDER CARDS ===
  {
    id: "card-gradient-border",
    name: "Gradient Border Card",
    category: "features",
    structure: `<div class="relative group">
  <!-- Gradient border background -->
  <div class="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl opacity-75 group-hover:opacity-100 blur-sm transition-all duration-500 group-hover:blur-md"></div>
  <!-- Card content -->
  <div class="relative bg-card rounded-xl p-6 h-full">
    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
      <i data-lucide="sparkles" class="w-6 h-6 text-primary"></i>
    </div>
    <h3 class="text-xl font-semibold mb-2">Feature Title</h3>
    <p class="text-muted-foreground">Compelling feature description that explains the value proposition clearly.</p>
  </div>
</div>`,
  },
  {
    id: "features-gradient-grid",
    name: "Features Grid with Gradient Borders",
    category: "features",
    structure: `<section id="features" class="py-20">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-12">
      <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">Features</span>
      <h2 class="text-3xl md:text-4xl font-bold mb-4">Everything you need</h2>
      <p class="text-muted-foreground max-w-2xl mx-auto">Built for modern teams with powerful features</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Card 1 -->
      <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl opacity-60 group-hover:opacity-100 blur-sm transition-all duration-500"></div>
        <div class="relative bg-card rounded-xl p-6 h-full border-0">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4">
            <i data-lucide="zap" class="w-6 h-6 text-indigo-500"></i>
          </div>
          <h3 class="text-lg font-semibold mb-2">Lightning Fast</h3>
          <p class="text-muted-foreground text-sm">Optimized for speed with sub-second response times.</p>
        </div>
      </div>
      <!-- Card 2 -->
      <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-2xl opacity-60 group-hover:opacity-100 blur-sm transition-all duration-500"></div>
        <div class="relative bg-card rounded-xl p-6 h-full border-0">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4">
            <i data-lucide="shield" class="w-6 h-6 text-emerald-500"></i>
          </div>
          <h3 class="text-lg font-semibold mb-2">Secure by Default</h3>
          <p class="text-muted-foreground text-sm">Enterprise-grade security with end-to-end encryption.</p>
        </div>
      </div>
      <!-- Card 3 -->
      <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl opacity-60 group-hover:opacity-100 blur-sm transition-all duration-500"></div>
        <div class="relative bg-card rounded-xl p-6 h-full border-0">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4">
            <i data-lucide="users" class="w-6 h-6 text-amber-500"></i>
          </div>
          <h3 class="text-lg font-semibold mb-2">Team Collaboration</h3>
          <p class="text-muted-foreground text-sm">Real-time collaboration features for your entire team.</p>
        </div>
      </div>
    </div>
  </div>
</section>`,
  },

  // === MICRO-INTERACTIONS ===
  {
    id: "hover-lift-cards",
    name: "Hover Lift Cards",
    category: "micro-interaction",
    structure: `<style>
  .lift-card {
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
  }
  .lift-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px -12px hsl(var(--primary) / 0.15);
  }
  .lift-card:active {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -8px hsl(var(--primary) / 0.2);
  }
</style>
<section class="py-20">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="lift-card bg-card rounded-2xl border p-6 cursor-pointer">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <i data-lucide="rocket" class="w-6 h-6 text-primary"></i>
        </div>
        <h3 class="text-lg font-semibold mb-2">Card Title</h3>
        <p class="text-muted-foreground text-sm">Hover me to see the lift effect with spring easing.</p>
      </div>
      <div class="lift-card bg-card rounded-2xl border p-6 cursor-pointer">
        <div class="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
          <i data-lucide="sparkles" class="w-6 h-6 text-accent-foreground"></i>
        </div>
        <h3 class="text-lg font-semibold mb-2">Card Title</h3>
        <p class="text-muted-foreground text-sm">Smooth spring-based transition with shadow glow.</p>
      </div>
      <div class="lift-card bg-card rounded-2xl border p-6 cursor-pointer">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <i data-lucide="layers" class="w-6 h-6 text-primary"></i>
        </div>
        <h3 class="text-lg font-semibold mb-2">Card Title</h3>
        <p class="text-muted-foreground text-sm">Active state press-down for tactile feedback.</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: "staggered-reveal",
    name: "Staggered Card Reveal",
    category: "micro-interaction",
    structure: `<style>
  .reveal-card {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .reveal-card.visible {
    opacity: 1;
    transform: translateY(0);
  }
</style>
<section class="py-20">
  <div class="max-w-7xl mx-auto px-4">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold mb-4">Why choose us</h2>
      <p class="text-muted-foreground">Features that make us stand out</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="reveal-grid">
      <div class="reveal-card bg-card rounded-2xl border p-6" data-delay="0">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><i data-lucide="zap" class="w-5 h-5 text-primary"></i></div>
        <h3 class="font-semibold mb-1">Fast</h3>
        <p class="text-muted-foreground text-sm">Blazing fast performance out of the box.</p>
      </div>
      <div class="reveal-card bg-card rounded-2xl border p-6" data-delay="100">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><i data-lucide="shield" class="w-5 h-5 text-primary"></i></div>
        <h3 class="font-semibold mb-1">Secure</h3>
        <p class="text-muted-foreground text-sm">Enterprise-grade security built in.</p>
      </div>
      <div class="reveal-card bg-card rounded-2xl border p-6" data-delay="200">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><i data-lucide="globe" class="w-5 h-5 text-primary"></i></div>
        <h3 class="font-semibold mb-1">Global</h3>
        <p class="text-muted-foreground text-sm">Available worldwide with edge delivery.</p>
      </div>
      <div class="reveal-card bg-card rounded-2xl border p-6" data-delay="300">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><i data-lucide="heart" class="w-5 h-5 text-primary"></i></div>
        <h3 class="font-semibold mb-1">Loved</h3>
        <p class="text-muted-foreground text-sm">Trusted by thousands of happy users.</p>
      </div>
    </div>
  </div>
  <script>
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const cards = entry.target.querySelectorAll('.reveal-card');
          cards.forEach(card => {
            const delay = parseInt(card.dataset.delay || '0');
            setTimeout(() => card.classList.add('visible'), delay);
          });
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('#reveal-grid').forEach(g => revealObserver.observe(g));
  </script>
</section>`,
  },
  {
    id: "typewriter-hero",
    name: "Typewriter Text Hero",
    category: "hero",
    structure: `<section id="hero" class="py-24 text-center relative overflow-hidden">
  <div class="max-w-4xl mx-auto px-4 relative z-10">
    <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">✨ Welcome</span>
    <h1 class="text-5xl md:text-6xl font-bold tracking-tight mb-6">
      Build apps that are
      <span id="typewriter" class="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"></span>
      <span class="animate-pulse">|</span>
    </h1>
    <p class="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">The fastest way to ship beautiful products.</p>
    <div class="flex gap-4 justify-center">
      <a href="#cta" class="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all">Get Started</a>
    </div>
  </div>
  <style>
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    #typewriter + span { animation: blink 0.8s step-end infinite; }
  </style>
  <script>
    (function() {
      const words = ['beautiful', 'powerful', 'fast', 'scalable', 'modern'];
      const el = document.getElementById('typewriter');
      if (!el) return;
      let wordIdx = 0, charIdx = 0, deleting = false;
      function tick() {
        const word = words[wordIdx];
        if (deleting) {
          el.textContent = word.substring(0, charIdx--);
          if (charIdx < 0) { deleting = false; wordIdx = (wordIdx + 1) % words.length; setTimeout(tick, 400); return; }
          setTimeout(tick, 50);
        } else {
          el.textContent = word.substring(0, ++charIdx);
          if (charIdx === word.length) { deleting = true; setTimeout(tick, 2000); return; }
          setTimeout(tick, 100);
        }
      }
      tick();
    })();
  </script>
</section>`,
  },
  {
    id: "scroll-fade-sections",
    name: "Scroll-Triggered Fade Sections",
    category: "micro-interaction",
    structure: `<style>
  .scroll-reveal {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.7s ease-out, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .scroll-reveal.visible { opacity: 1; transform: translateY(0); }
  .scroll-reveal[data-direction="left"] { transform: translateX(-30px) translateY(0); }
  .scroll-reveal[data-direction="left"].visible { transform: translateX(0); }
  .scroll-reveal[data-direction="right"] { transform: translateX(30px) translateY(0); }
  .scroll-reveal[data-direction="right"].visible { transform: translateX(0); }
  .scroll-reveal[data-direction="scale"] { transform: scale(0.9); }
  .scroll-reveal[data-direction="scale"].visible { transform: scale(1); }
</style>
<section class="py-20">
  <div class="max-w-7xl mx-auto px-4 space-y-24">
    <!-- Fade up -->
    <div class="scroll-reveal text-center">
      <h2 class="text-3xl font-bold mb-4">Fade Up on Scroll</h2>
      <p class="text-muted-foreground max-w-xl mx-auto">This section fades in and slides up when scrolled into view.</p>
    </div>
    <!-- Slide from left -->
    <div class="scroll-reveal flex flex-col md:flex-row items-center gap-12" data-direction="left">
      <div class="flex-1">
        <h3 class="text-2xl font-bold mb-3">Slide From Left</h3>
        <p class="text-muted-foreground">Content slides in from the left with smooth easing.</p>
      </div>
      <div class="flex-1 h-48 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl"></div>
    </div>
    <!-- Slide from right -->
    <div class="scroll-reveal flex flex-col md:flex-row-reverse items-center gap-12" data-direction="right">
      <div class="flex-1">
        <h3 class="text-2xl font-bold mb-3">Slide From Right</h3>
        <p class="text-muted-foreground">Content slides in from the right with smooth easing.</p>
      </div>
      <div class="flex-1 h-48 bg-gradient-to-br from-accent/20 to-primary/20 rounded-2xl"></div>
    </div>
    <!-- Scale up -->
    <div class="scroll-reveal text-center" data-direction="scale">
      <div class="bg-card border rounded-2xl p-12 max-w-2xl mx-auto">
        <h3 class="text-2xl font-bold mb-3">Scale Reveal</h3>
        <p class="text-muted-foreground">This card scales up smoothly when it enters the viewport.</p>
      </div>
    </div>
  </div>
  <script>
    (function() {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
      document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
    })();
  </script>
</section>`,
  },
  // === PRICING COMPARISON TABLE ===
  {
    id: "pricing-comparison-table",
    name: "Pricing Comparison Table",
    category: "pricing",
    structure: `<section id="pricing-comparison" class="py-24" style="background:var(--bg,#fafafa)">
  <div class="max-w-6xl mx-auto px-4">
    <div class="text-center mb-16">
      <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-4" style="background:rgba(99,102,241,0.1);color:#6366f1;">💎 Compare Plans</span>
      <h2 class="text-4xl font-bold tracking-tight mb-4">Find the perfect plan</h2>
      <p class="text-lg max-w-xl mx-auto" style="color:#6b7280;">Every feature you need, at a price that works for you.</p>
      <div class="inline-flex mt-6 rounded-xl p-1" style="background:#e5e7eb;">
        <button class="px-5 py-2 rounded-lg text-sm font-medium transition-all" style="background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.1);" onclick="this.style.background='#fff';this.nextElementSibling.style.background='transparent'">Monthly</button>
        <button class="px-5 py-2 rounded-lg text-sm font-medium transition-all" style="background:transparent;" onclick="this.style.background='#fff';this.previousElementSibling.style.background='transparent'">Annual <span style="color:#16a34a;font-size:12px;font-weight:600;">Save 20%</span></button>
      </div>
    </div>
    <div class="overflow-x-auto rounded-2xl border" style="border-color:#e5e7eb;">
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <thead>
          <tr style="border-bottom:2px solid #e5e7eb;">
            <th style="padding:20px 24px;font-size:14px;font-weight:600;color:#6b7280;min-width:200px;">Features</th>
            <th style="padding:20px 24px;text-align:center;min-width:160px;">
              <div style="font-size:18px;font-weight:700;">Starter</div>
              <div style="font-size:28px;font-weight:800;margin:4px 0;">$9<span style="font-size:14px;font-weight:400;color:#6b7280;">/mo</span></div>
            </th>
            <th style="padding:20px 24px;text-align:center;min-width:160px;background:linear-gradient(180deg,rgba(99,102,241,0.05),transparent);position:relative;">
              <span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#6366f1;color:#fff;font-size:11px;font-weight:600;padding:2px 12px;border-radius:99px;">POPULAR</span>
              <div style="font-size:18px;font-weight:700;">Pro</div>
              <div style="font-size:28px;font-weight:800;margin:4px 0;">$29<span style="font-size:14px;font-weight:400;color:#6b7280;">/mo</span></div>
            </th>
            <th style="padding:20px 24px;text-align:center;min-width:160px;">
              <div style="font-size:18px;font-weight:700;">Enterprise</div>
              <div style="font-size:28px;font-weight:800;margin:4px 0;">Custom</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:14px 24px;font-size:14px;">Users</td><td style="padding:14px 24px;text-align:center;font-size:14px;">Up to 5</td><td style="padding:14px 24px;text-align:center;font-size:14px;background:rgba(99,102,241,0.02);">Up to 25</td><td style="padding:14px 24px;text-align:center;font-size:14px;">Unlimited</td></tr>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:14px 24px;font-size:14px;">Storage</td><td style="padding:14px 24px;text-align:center;font-size:14px;">5 GB</td><td style="padding:14px 24px;text-align:center;font-size:14px;background:rgba(99,102,241,0.02);">50 GB</td><td style="padding:14px 24px;text-align:center;font-size:14px;">Unlimited</td></tr>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:14px 24px;font-size:14px;">API Access</td><td style="padding:14px 24px;text-align:center;font-size:14px;">—</td><td style="padding:14px 24px;text-align:center;font-size:14px;background:rgba(99,102,241,0.02);">✓</td><td style="padding:14px 24px;text-align:center;font-size:14px;">✓</td></tr>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:14px 24px;font-size:14px;">Priority Support</td><td style="padding:14px 24px;text-align:center;font-size:14px;">—</td><td style="padding:14px 24px;text-align:center;font-size:14px;background:rgba(99,102,241,0.02);">✓</td><td style="padding:14px 24px;text-align:center;font-size:14px;">✓</td></tr>
          <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:14px 24px;font-size:14px;">Custom Integrations</td><td style="padding:14px 24px;text-align:center;font-size:14px;">—</td><td style="padding:14px 24px;text-align:center;font-size:14px;background:rgba(99,102,241,0.02);">—</td><td style="padding:14px 24px;text-align:center;font-size:14px;">✓</td></tr>
          <tr><td style="padding:14px 24px;font-size:14px;">SLA</td><td style="padding:14px 24px;text-align:center;font-size:14px;">—</td><td style="padding:14px 24px;text-align:center;font-size:14px;background:rgba(99,102,241,0.02);">99.9%</td><td style="padding:14px 24px;text-align:center;font-size:14px;">99.99%</td></tr>
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #e5e7eb;">
            <td style="padding:20px 24px;"></td>
            <td style="padding:20px 24px;text-align:center;"><a href="#" style="display:inline-block;padding:10px 24px;border:2px solid #e5e7eb;border-radius:12px;font-size:14px;font-weight:600;color:#374151;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.borderColor='#6366f1';this.style.color='#6366f1'" onmouseout="this.style.borderColor='#e5e7eb';this.style.color='#374151'">Get Started</a></td>
            <td style="padding:20px 24px;text-align:center;background:rgba(99,102,241,0.02);"><a href="#" style="display:inline-block;padding:10px 24px;background:#6366f1;border-radius:12px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;box-shadow:0 4px 14px rgba(99,102,241,0.35);transition:all 0.2s;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">Get Started</a></td>
            <td style="padding:20px 24px;text-align:center;"><a href="#" style="display:inline-block;padding:10px 24px;border:2px solid #e5e7eb;border-radius:12px;font-size:14px;font-weight:600;color:#374151;text-decoration:none;transition:all 0.2s;" onmouseover="this.style.borderColor='#6366f1';this.style.color='#6366f1'" onmouseout="this.style.borderColor='#e5e7eb';this.style.color='#374151'">Contact Sales</a></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</section>`,
  },

  // === FAQ WITH SEARCH ===
  {
    id: "faq-searchable",
    name: "FAQ with Search",
    category: "faq",
    structure: `<section id="faq-search" class="py-24" style="background:var(--bg,#fff)">
  <div class="max-w-3xl mx-auto px-4">
    <div class="text-center mb-12">
      <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-4" style="background:rgba(16,185,129,0.1);color:#10b981;">❓ Support</span>
      <h2 class="text-4xl font-bold tracking-tight mb-4">Frequently Asked Questions</h2>
      <p class="text-lg mb-8" style="color:#6b7280;">Can't find what you're looking for? Search below.</p>
      <div style="position:relative;max-width:480px;margin:0 auto;">
        <svg style="position:absolute;left:16px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:#9ca3af;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input id="faq-search-input" type="text" placeholder="Search questions..." style="width:100%;padding:14px 16px 14px 48px;border:2px solid #e5e7eb;border-radius:16px;font-size:16px;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='#e5e7eb'" oninput="document.querySelectorAll('.faq-item').forEach(el=>{const match=el.dataset.q.toLowerCase().includes(this.value.toLowerCase());el.style.display=match?'block':'none'});document.getElementById('faq-no-results').style.display=document.querySelectorAll('.faq-item[style*=block]').length||!this.value?'none':'block'">
      </div>
    </div>
    <div id="faq-list">
      <div class="faq-item" data-q="What is your refund policy?" style="display:block;border-bottom:1px solid #f3f4f6;">
        <button style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:20px 0;font-size:16px;font-weight:600;background:none;border:none;cursor:pointer;text-align:left;" onclick="const a=this.nextElementSibling;const open=a.style.maxHeight!=='0px';a.style.maxHeight=open?'0px':a.scrollHeight+'px';a.style.opacity=open?'0':'1';this.querySelector('span').textContent=open?'+':'−'">What is your refund policy?<span style="font-size:20px;color:#9ca3af;transition:transform 0.2s;">+</span></button>
        <div style="max-height:0px;overflow:hidden;transition:all 0.3s ease;opacity:0;"><p style="padding:0 0 20px;color:#6b7280;line-height:1.7;font-size:15px;">We offer a full 30-day money-back guarantee. No questions asked. Simply contact our support team and we'll process your refund within 3-5 business days.</p></div>
      </div>
      <div class="faq-item" data-q="How do I cancel my subscription?" style="display:block;border-bottom:1px solid #f3f4f6;">
        <button style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:20px 0;font-size:16px;font-weight:600;background:none;border:none;cursor:pointer;text-align:left;" onclick="const a=this.nextElementSibling;const open=a.style.maxHeight!=='0px';a.style.maxHeight=open?'0px':a.scrollHeight+'px';a.style.opacity=open?'0':'1';this.querySelector('span').textContent=open?'+':'−'">How do I cancel my subscription?<span style="font-size:20px;color:#9ca3af;">+</span></button>
        <div style="max-height:0px;overflow:hidden;transition:all 0.3s ease;opacity:0;"><p style="padding:0 0 20px;color:#6b7280;line-height:1.7;font-size:15px;">You can cancel anytime from your account settings. Your access continues until the end of the billing period.</p></div>
      </div>
      <div class="faq-item" data-q="Do you offer team discounts?" style="display:block;border-bottom:1px solid #f3f4f6;">
        <button style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:20px 0;font-size:16px;font-weight:600;background:none;border:none;cursor:pointer;text-align:left;" onclick="const a=this.nextElementSibling;const open=a.style.maxHeight!=='0px';a.style.maxHeight=open?'0px':a.scrollHeight+'px';a.style.opacity=open?'0':'1';this.querySelector('span').textContent=open?'+':'−'">Do you offer team discounts?<span style="font-size:20px;color:#9ca3af;">+</span></button>
        <div style="max-height:0px;overflow:hidden;transition:all 0.3s ease;opacity:0;"><p style="padding:0 0 20px;color:#6b7280;line-height:1.7;font-size:15px;">Yes! Teams of 5+ get 15% off, and teams of 20+ get 25% off. Contact sales for custom enterprise pricing.</p></div>
      </div>
      <div class="faq-item" data-q="What integrations do you support?" style="display:block;border-bottom:1px solid #f3f4f6;">
        <button style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:20px 0;font-size:16px;font-weight:600;background:none;border:none;cursor:pointer;text-align:left;" onclick="const a=this.nextElementSibling;const open=a.style.maxHeight!=='0px';a.style.maxHeight=open?'0px':a.scrollHeight+'px';a.style.opacity=open?'0':'1';this.querySelector('span').textContent=open?'+':'−'">What integrations do you support?<span style="font-size:20px;color:#9ca3af;">+</span></button>
        <div style="max-height:0px;overflow:hidden;transition:all 0.3s ease;opacity:0;"><p style="padding:0 0 20px;color:#6b7280;line-height:1.7;font-size:15px;">We integrate with Slack, GitHub, Jira, Notion, Figma, and 50+ other tools. Check our integrations page for the full list.</p></div>
      </div>
      <div class="faq-item" data-q="Is my data secure?" style="display:block;">
        <button style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:20px 0;font-size:16px;font-weight:600;background:none;border:none;cursor:pointer;text-align:left;" onclick="const a=this.nextElementSibling;const open=a.style.maxHeight!=='0px';a.style.maxHeight=open?'0px':a.scrollHeight+'px';a.style.opacity=open?'0':'1';this.querySelector('span').textContent=open?'+':'−'">Is my data secure?<span style="font-size:20px;color:#9ca3af;">+</span></button>
        <div style="max-height:0px;overflow:hidden;transition:all 0.3s ease;opacity:0;"><p style="padding:0 0 20px;color:#6b7280;line-height:1.7;font-size:15px;">Absolutely. We use AES-256 encryption at rest, TLS 1.3 in transit, and are SOC 2 Type II certified. Your data is never shared with third parties.</p></div>
      </div>
    </div>
    <div id="faq-no-results" style="display:none;text-align:center;padding:40px 0;">
      <div style="font-size:48px;margin-bottom:12px;">🔍</div>
      <p style="font-size:16px;font-weight:600;margin-bottom:4px;">No results found</p>
      <p style="color:#9ca3af;font-size:14px;">Try a different search term or <a href="#contact" style="color:#10b981;text-decoration:underline;">contact support</a>.</p>
    </div>
  </div>
</section>`,
  },

  // === NEWSLETTER WITH SUCCESS ANIMATION ===
  {
    id: "newsletter-animated",
    name: "Newsletter with Success Animation",
    category: "newsletter",
    structure: `<section id="newsletter" class="py-24" style="background:linear-gradient(135deg,#0f172a,#1e293b)">
  <div class="max-w-2xl mx-auto px-4 text-center">
    <div id="nl-form-state">
      <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6" style="background:rgba(99,102,241,0.15);color:#a5b4fc;">📬 Stay Updated</span>
      <h2 class="text-3xl md:text-4xl font-bold mb-4" style="color:#f8fafc;">Get insights delivered weekly</h2>
      <p class="text-lg mb-8" style="color:#94a3b8;">Join 12,000+ subscribers. No spam, unsubscribe anytime.</p>
      <form id="nl-form" style="display:flex;gap:12px;max-width:440px;margin:0 auto;" onsubmit="event.preventDefault();this.parentElement.style.display='none';document.getElementById('nl-success-state').style.display='block';document.getElementById('nl-success-state').classList.add('nl-animate-in')">
        <input type="email" placeholder="Enter your email" required style="flex:1;padding:14px 20px;border-radius:12px;border:2px solid rgba(148,163,184,0.2);background:rgba(255,255,255,0.05);color:#f8fafc;font-size:16px;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(148,163,184,0.2)'">
        <button type="submit" style="padding:14px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:12px;font-weight:600;font-size:15px;border:none;cursor:pointer;white-space:nowrap;box-shadow:0 4px 14px rgba(99,102,241,0.4);transition:all 0.2s;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(99,102,241,0.5)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 14px rgba(99,102,241,0.4)'">Subscribe</button>
      </form>
      <p style="margin-top:16px;font-size:13px;color:#64748b;">🔒 We respect your privacy. Read our <a href="#" style="color:#818cf8;text-decoration:underline;">privacy policy</a>.</p>
    </div>
    <div id="nl-success-state" style="display:none;">
      <div class="nl-check-circle" style="width:80px;height:80px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#10b981,#34d399);display:flex;align-items:center;justify-content:center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="nl-check-icon"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h3 class="text-2xl font-bold mb-2" style="color:#f8fafc;">You're all set! 🎉</h3>
      <p style="color:#94a3b8;font-size:16px;">Check your inbox for a confirmation email. Welcome aboard!</p>
    </div>
  </div>
  <style>
    .nl-animate-in { animation: nlFadeUp 0.5s ease-out forwards; }
    .nl-animate-in .nl-check-circle { animation: nlPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both; }
    .nl-animate-in .nl-check-icon { animation: nlDraw 0.5s ease-out 0.5s both; stroke-dasharray: 30; stroke-dashoffset: 30; }
    @keyframes nlFadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes nlPop { from { transform:scale(0); opacity:0; } to { transform:scale(1); opacity:1; } }
    @keyframes nlDraw { to { stroke-dashoffset: 0; } }
  </style>
</section>`,
  },
  // === TESTIMONIAL CAROUSEL ===
  {
    id: "testimonial-carousel",
    name: "Testimonial Carousel with Auto-Play",
    category: "testimonials",
    structure: `<section id="testimonials-carousel" class="py-24" style="background:var(--bg,#fafafa);overflow:hidden;">
  <div class="max-w-4xl mx-auto px-4 text-center">
    <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-4" style="background:rgba(245,158,11,0.1);color:#f59e0b;">⭐ Testimonials</span>
    <h2 class="text-4xl font-bold tracking-tight mb-4">Loved by thousands</h2>
    <p class="text-lg mb-12" style="color:#6b7280;">Here's what our customers have to say.</p>
    <div style="position:relative;">
      <div id="tc-track" style="display:flex;transition:transform 0.5s cubic-bezier(0.4,0,0.2,1);">
        <div class="tc-slide" style="min-width:100%;padding:0 20px;box-sizing:border-box;">
          <div style="background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:600px;margin:0 auto;">
            <div style="display:flex;gap:4px;justify-content:center;margin-bottom:16px;">
              <span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span>
            </div>
            <p style="font-size:18px;line-height:1.7;color:#374151;margin-bottom:24px;font-style:italic;">"This product completely transformed how we work. The team collaboration features alone saved us 20 hours per week."</p>
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
              <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">S</div>
              <div style="text-align:left;"><div style="font-weight:600;font-size:15px;">Sarah Chen</div><div style="color:#9ca3af;font-size:13px;">CTO at TechFlow</div></div>
            </div>
          </div>
        </div>
        <div class="tc-slide" style="min-width:100%;padding:0 20px;box-sizing:border-box;">
          <div style="background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:600px;margin:0 auto;">
            <div style="display:flex;gap:4px;justify-content:center;margin-bottom:16px;">
              <span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span>
            </div>
            <p style="font-size:18px;line-height:1.7;color:#374151;margin-bottom:24px;font-style:italic;">"The best investment we've made this year. Our conversion rates increased by 40% within the first month."</p>
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
              <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#10b981,#34d399);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">M</div>
              <div style="text-align:left;"><div style="font-weight:600;font-size:15px;">Marcus Rivera</div><div style="color:#9ca3af;font-size:13px;">VP Marketing at GrowthLab</div></div>
            </div>
          </div>
        </div>
        <div class="tc-slide" style="min-width:100%;padding:0 20px;box-sizing:border-box;">
          <div style="background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:600px;margin:0 auto;">
            <div style="display:flex;gap:4px;justify-content:center;margin-bottom:16px;">
              <span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#d1d5db;font-size:20px;">★</span>
            </div>
            <p style="font-size:18px;line-height:1.7;color:#374151;margin-bottom:24px;font-style:italic;">"Intuitive design, powerful features, and incredible support. This has become the backbone of our entire operation."</p>
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
              <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#fbbf24);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">A</div>
              <div style="text-align:left;"><div style="font-weight:600;font-size:15px;">Aisha Patel</div><div style="color:#9ca3af;font-size:13px;">Founder at Buildwise</div></div>
            </div>
          </div>
        </div>
        <div class="tc-slide" style="min-width:100%;padding:0 20px;box-sizing:border-box;">
          <div style="background:#fff;border-radius:20px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:600px;margin:0 auto;">
            <div style="display:flex;gap:4px;justify-content:center;margin-bottom:16px;">
              <span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span><span style="color:#f59e0b;font-size:20px;">★</span>
            </div>
            <p style="font-size:18px;line-height:1.7;color:#374151;margin-bottom:24px;font-style:italic;">"We evaluated a dozen solutions before choosing this one. Two years later, it's still the best decision we've made."</p>
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
              <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#ec4899,#f472b6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">J</div>
              <div style="text-align:left;"><div style="font-weight:600;font-size:15px;">James Okonkwo</div><div style="color:#9ca3af;font-size:13px;">Director at ScaleOps</div></div>
            </div>
          </div>
        </div>
      </div>
      <!-- Nav arrows -->
      <button onclick="tcGo(-1)" style="position:absolute;left:-20px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:#fff;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,0.08);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;color:#374151;transition:all 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'">‹</button>
      <button onclick="tcGo(1)" style="position:absolute;right:-20px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:#fff;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,0.08);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;color:#374151;transition:all 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'">›</button>
    </div>
    <!-- Dot navigation -->
    <div id="tc-dots" style="display:flex;gap:8px;justify-content:center;margin-top:32px;"></div>
  </div>
  <script>
    (function(){
      var idx=0, slides=document.querySelectorAll('.tc-slide'), total=slides.length, track=document.getElementById('tc-track'), dots=document.getElementById('tc-dots'), timer;
      for(var i=0;i<total;i++){var d=document.createElement('button');d.dataset.i=i;d.style.cssText='width:10px;height:10px;border-radius:50%;border:none;cursor:pointer;transition:all 0.3s;background:'+(i===0?'#6366f1':'#d1d5db');d.onclick=function(){goTo(+this.dataset.i)};dots.appendChild(d)}
      function goTo(n){idx=(n+total)%total;track.style.transform='translateX(-'+idx*100+'%)';dots.querySelectorAll('button').forEach(function(d,i){d.style.background=i===idx?'#6366f1':'#d1d5db';d.style.transform=i===idx?'scale(1.3)':'scale(1)'})}
      window.tcGo=function(dir){goTo(idx+dir);resetTimer()};
      function resetTimer(){clearInterval(timer);timer=setInterval(function(){goTo(idx+1)},5000)}
      resetTimer();
    })();
  </script>
</section>`,
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
