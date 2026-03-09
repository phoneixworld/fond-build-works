/**
 * Instant Templates — pre-compiled React file sets that render in <1 second.
 * These are complete, working React apps that Sandpack can render immediately.
 * After instant render, an AI polish pass customizes content/branding.
 */

export interface InstantTemplate {
  id: string;
  /** Template IDs from pageTemplates.ts that this instant template covers */
  matchIds: string[];
  files: Record<string, string>;
  deps: Record<string, string>;
}

// ─── Helper: inject user's project name/description into template files ───
export function hydrateTemplate(
  template: InstantTemplate,
  projectName: string,
  description: string
): { files: Record<string, string>; deps: Record<string, string> } {
  const name = projectName.replace(/^\p{Emoji}\s*/u, "").trim() || "My App";
  const desc = description || "Build amazing things faster than ever.";

  const files: Record<string, string> = {};
  for (const [path, code] of Object.entries(template.files)) {
    files[path] = code
      .replace(/\{\{APP_NAME\}\}/g, name)
      .replace(/\{\{APP_DESC\}\}/g, desc)
      .replace(/\{\{APP_TAGLINE\}\}/g, desc.length > 80 ? desc.slice(0, 80) : desc);
  }
  return { files, deps: { ...template.deps } };
}

// ─── Match a page template ID to an instant template ───
export function findInstantTemplate(templateId: string): InstantTemplate | null {
  return INSTANT_TEMPLATES.find(t => t.matchIds.includes(templateId)) || null;
}

// ─── SaaS Landing Page ───
const SAAS_LANDING: InstantTemplate = {
  id: "saas-landing",
  matchIds: ["saas-landing", "app-landing"],
  deps: {
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
  },
  files: {
    "/App.jsx": `import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ToastContainer from "./components/ui/Toast";

export default function App() {
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </HashRouter>
      <ToastContainer />
    </>
  );
}`,

    "/pages/Home.jsx": `import React from "react";
import Navbar from "../layout/Navbar";
import Hero from "../components/Hero";
import Stats from "../components/Stats";
import Features from "../components/Features";
import HowItWorks from "../components/HowItWorks";
import Testimonials from "../components/Testimonials";
import Pricing from "../components/Pricing";
import CTA from "../components/CTA";
import Footer from "../layout/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  );
}`,

    "/layout/Navbar.jsx": `import React, { useState } from "react";
import { Menu, X, Rocket } from "lucide-react";

const links = ["Features", "How it Works", "Pricing", "Testimonials"];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-slate-800 tracking-tight">{{APP_NAME}}</span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l} href={"#" + l.toLowerCase().replace(/ /g, "-")} className="text-sm text-slate-500 hover:text-slate-800 transition-colors">{l}</a>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <button className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2">Sign in</button>
          <button className="text-sm text-white bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-lg font-medium transition-all hover:-translate-y-0.5 shadow-lg">Get Started</button>
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
      </div>
      {open && (
        <div className="md:hidden px-6 pb-4 space-y-3">
          {links.map(l => <a key={l} href={"#" + l.toLowerCase().replace(/ /g, "-")} className="block text-sm text-slate-600 py-2">{l}</a>)}
          <button className="w-full text-sm text-white bg-slate-800 px-5 py-2.5 rounded-lg font-medium">Get Started</button>
        </div>
      )}
    </nav>
  );
}`,

    "/components/Hero.jsx": `import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };

export default function Hero() {
  return (
    <section className="relative py-24 md:py-36 bg-white overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-violet-50/30" />
      <div className="relative max-w-5xl mx-auto px-6 text-center">
        <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15 } } }}>
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Now in Public Beta
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl lg:text-7xl font-bold text-slate-800 leading-[1.1] tracking-tight mb-6">
            {{APP_DESC}}
          </motion.h1>
          <motion.p variants={fadeUp} className="max-w-2xl mx-auto text-lg md:text-xl text-slate-500 mb-10 leading-relaxed">
            From a single prompt to a fully functional preview in under 5 seconds. The fastest way to bring your ideas to life.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="inline-flex items-center gap-2 px-8 py-4 text-white bg-slate-800 rounded-xl font-medium hover:bg-slate-700 transition-all hover:-translate-y-0.5 shadow-xl hover:shadow-2xl text-base">
              Start Building Free <ArrowRight className="w-5 h-5" />
            </button>
            <button className="inline-flex items-center gap-2 px-8 py-4 text-slate-600 bg-white border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-base">
              Watch Demo
            </button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}`,

    "/components/Stats.jsx": `import React from "react";

const stats = [
  { value: "0-5s", label: "Prompt to Preview" },
  { value: "10,000+", label: "Apps Generated" },
  { value: "99.9%", label: "Uptime" },
  { value: "50k+", label: "Happy Users" },
];

export default function Stats() {
  return (
    <section className="py-16 bg-slate-800">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <p className="text-3xl md:text-4xl font-bold text-white">{s.value}</p>
              <p className="text-sm text-slate-400 mt-1 tracking-wide uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/Features.jsx": `import React from "react";
import { Zap, Shield, Cpu, Layers, Globe, Rocket } from "lucide-react";

const features = [
  { icon: Zap, title: "Instant Previews", desc: "See your app come to life in real-time as you type your prompt." },
  { icon: Cpu, title: "AI-Powered Code", desc: "Production-ready React code generated by state-of-the-art AI models." },
  { icon: Shield, title: "Enterprise Security", desc: "Built with security best practices. SOC2 compliant infrastructure." },
  { icon: Layers, title: "Multi-Page Apps", desc: "Generate complete multi-page applications with routing and navigation." },
  { icon: Globe, title: "One-Click Deploy", desc: "Deploy your app to a custom domain with a single click." },
  { icon: Rocket, title: "Blazing Fast", desc: "Optimized build pipeline delivers results in under 5 seconds." },
];

export default function Features() {
  return (
    <section id="features" className="py-24 md:py-32 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800">Everything you need to ship fast</h2>
          <p className="max-w-2xl mx-auto mt-4 text-lg text-slate-500">Powerful features that make building apps effortless.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <div key={i} className="group p-8 border border-gray-100 rounded-2xl hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors">
                <f.icon className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">{f.title}</h3>
              <p className="text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/HowItWorks.jsx": `import React from "react";
import { Code, Eye, Rocket } from "lucide-react";

const steps = [
  { icon: Code, num: "01", title: "Describe", desc: "Write a simple prompt describing what you want to build." },
  { icon: Eye, num: "02", title: "Preview", desc: "Watch your app materialize in real-time with a live preview." },
  { icon: Rocket, num: "03", title: "Ship", desc: "Deploy to production with one click. Custom domains included." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 md:py-32 bg-gray-50">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800">How it works</h2>
          <p className="mt-4 text-lg text-slate-500">Three simple steps from idea to production.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {steps.map((s, i) => (
            <div key={i} className="text-center">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6 border border-gray-100">
                <s.icon className="w-7 h-7 text-slate-700" />
              </div>
              <span className="text-xs font-bold text-blue-600 tracking-widest uppercase">Step {s.num}</span>
              <h3 className="text-xl font-semibold text-slate-800 mt-2 mb-3">{s.title}</h3>
              <p className="text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/Testimonials.jsx": `import React from "react";
import { Star } from "lucide-react";

const reviews = [
  { name: "Sarah Chen", role: "CTO, StartupXYZ", text: "We went from idea to MVP in one afternoon. This is the future of software development.", rating: 5 },
  { name: "Marcus Williams", role: "Indie Hacker", text: "I've tried every no-code tool out there. Nothing comes close to the speed and quality of the code this generates.", rating: 5 },
  { name: "Priya Patel", role: "Product Manager, Acme", text: "Our team uses it for rapid prototyping. What used to take a week now takes minutes.", rating: 5 },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-24 md:py-32 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800">Loved by builders</h2>
          <p className="mt-4 text-lg text-slate-500">Join thousands of developers and founders who ship faster.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((r, i) => (
            <div key={i} className="p-8 bg-gray-50 rounded-2xl">
              <div className="flex gap-0.5 mb-4">
                {Array(r.rating).fill(0).map((_, j) => <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
              </div>
              <p className="text-slate-600 leading-relaxed mb-6">"{r.text}"</p>
              <div>
                <p className="font-semibold text-slate-800">{r.name}</p>
                <p className="text-sm text-slate-500">{r.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/Pricing.jsx": `import React from "react";
import { Check } from "lucide-react";

const plans = [
  { name: "Free", price: "$0", period: "/month", desc: "Perfect for trying things out", features: ["5 projects", "Basic templates", "Community support", "1 deployment"], highlighted: false },
  { name: "Pro", price: "$29", period: "/month", desc: "For serious builders", features: ["Unlimited projects", "All templates", "Priority support", "Custom domains", "Team collaboration", "Advanced AI models"], highlighted: true },
  { name: "Enterprise", price: "Custom", period: "", desc: "For teams at scale", features: ["Everything in Pro", "SSO / SAML", "Dedicated support", "SLA guarantee", "Custom integrations", "Volume pricing"], highlighted: false },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 md:py-32 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800">Simple, transparent pricing</h2>
          <p className="mt-4 text-lg text-slate-500">No hidden fees. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((p, i) => (
            <div key={i} className={\`p-8 rounded-2xl transition-all \${p.highlighted ? "bg-slate-800 text-white ring-2 ring-slate-800 shadow-2xl scale-105" : "bg-white border border-gray-200"}\`}>
              <h3 className={\`text-lg font-semibold \${p.highlighted ? "text-white" : "text-slate-800"}\`}>{p.name}</h3>
              <p className={\`text-sm mt-1 \${p.highlighted ? "text-slate-300" : "text-slate-500"}\`}>{p.desc}</p>
              <div className="mt-6 mb-8">
                <span className={\`text-4xl font-bold \${p.highlighted ? "text-white" : "text-slate-800"}\`}>{p.price}</span>
                <span className={\`text-sm \${p.highlighted ? "text-slate-300" : "text-slate-500"}\`}>{p.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm">
                    <Check className={\`w-4 h-4 flex-shrink-0 \${p.highlighted ? "text-blue-400" : "text-blue-600"}\`} />
                    <span className={p.highlighted ? "text-slate-200" : "text-slate-600"}>{f}</span>
                  </li>
                ))}
              </ul>
              <button className={\`w-full py-3 rounded-xl font-medium text-sm transition-all hover:-translate-y-0.5 \${p.highlighted ? "bg-white text-slate-800 hover:bg-gray-100 shadow-lg" : "bg-slate-800 text-white hover:bg-slate-700"}\`}>
                {p.name === "Enterprise" ? "Contact Sales" : "Get Started"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/CTA.jsx": `import React from "react";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  return (
    <section className="py-24 md:py-32 bg-slate-800">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Ready to build something amazing?</h2>
        <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">Join thousands of builders who are shipping faster with {{APP_NAME}}. Start for free, no credit card required.</p>
        <button className="inline-flex items-center gap-2 px-8 py-4 text-slate-800 bg-white rounded-xl font-medium hover:bg-gray-100 transition-all hover:-translate-y-0.5 shadow-xl text-base">
          Start Building Free <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}`,

    "/layout/Footer.jsx": `import React from "react";
import { Rocket } from "lucide-react";

const footerLinks = {
  Product: ["Features", "Pricing", "Templates", "Changelog"],
  Resources: ["Documentation", "Blog", "Tutorials", "Community"],
  Company: ["About", "Careers", "Contact", "Press"],
  Legal: ["Privacy", "Terms", "Security"],
};

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center"><Rocket className="w-4 h-4 text-white" /></div>
              <span className="font-semibold text-slate-800">{{APP_NAME}}</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">Build applications at the speed of thought.</p>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-slate-800 text-sm mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map(l => <li key={l}><a href="#" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">{l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-8 text-center">
          <p className="text-sm text-slate-400">© {new Date().getFullYear()} {{APP_NAME}}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}`,

    "/components/ui/Toast.jsx": `import React, { useState, useEffect } from "react";

let toastHandler = null;

export function showToast(message, type = "success") {
  if (toastHandler) toastHandler({ message, type });
}

export default function ToastContainer() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    toastHandler = (t) => { setToast(t); setTimeout(() => setToast(null), 3000); };
    return () => { toastHandler = null; };
  }, []);
  if (!toast) return null;
  const colors = { success: "bg-emerald-500", error: "bg-red-500", info: "bg-blue-500" };
  return (
    <div className={\`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm shadow-lg \${colors[toast.type] || colors.success}\`}>
      {toast.message}
    </div>
  );
}`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-white text-slate-800 antialiased; }
  html { scroll-behavior: smooth; }
}`,
  },
};

// ─── Portfolio Template ───
const PORTFOLIO: InstantTemplate = {
  id: "portfolio",
  matchIds: ["portfolio"],
  deps: { "lucide-react": "^0.400.0", "framer-motion": "^11.0.0" },
  files: {
    "/App.jsx": `import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  );
}`,

    "/pages/Home.jsx": `import React from "react";
import { motion } from "framer-motion";
import { Mail, Github, Linkedin, ExternalLink, ArrowDown } from "lucide-react";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const projects = [
  { title: "Project Alpha", desc: "A modern web application built with React and Node.js", tags: ["React", "Node.js", "MongoDB"] },
  { title: "Project Beta", desc: "Mobile-first e-commerce platform with real-time updates", tags: ["Next.js", "Stripe", "PostgreSQL"] },
  { title: "Project Gamma", desc: "AI-powered analytics dashboard for enterprise clients", tags: ["Python", "TensorFlow", "D3.js"] },
  { title: "Project Delta", desc: "Open source design system with 50+ components", tags: ["TypeScript", "Storybook", "Figma"] },
];

const skills = ["React", "TypeScript", "Node.js", "Python", "PostgreSQL", "AWS", "Docker", "Figma", "GraphQL", "Tailwind CSS"];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl z-50 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-slate-800">{{APP_NAME}}</span>
          <div className="flex gap-6">
            {["Work", "About", "Contact"].map(l => <a key={l} href={"#" + l.toLowerCase()} className="text-sm text-slate-500 hover:text-slate-800">{l}</a>)}
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-24 px-6">
        <motion.div className="max-w-4xl mx-auto" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}>
          <motion.p variants={fadeUp} className="text-sm text-slate-400 tracking-wider uppercase mb-4">Designer & Developer</motion.p>
          <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-bold text-slate-800 leading-[1.1] tracking-tight mb-6">
            I create digital<br />experiences that<br />matter.
          </motion.h1>
          <motion.p variants={fadeUp} className="text-lg text-slate-500 max-w-xl mb-8">{{APP_DESC}}</motion.p>
          <motion.div variants={fadeUp} className="flex gap-4">
            <a href="#work" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowDown className="w-4 h-4" /> View Work</a>
          </motion.div>
        </motion.div>
      </section>

      <section id="work" className="py-24 bg-gray-50 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-800 mb-12">Selected Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((p, i) => (
              <div key={i} className="group p-8 bg-white rounded-2xl border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer">
                <div className="w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl mb-6" />
                <h3 className="text-lg font-semibold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{p.title}</h3>
                <p className="text-sm text-slate-500 mb-4">{p.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {p.tags.map(t => <span key={t} className="text-xs px-2.5 py-1 bg-gray-100 text-slate-600 rounded-full">{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Skills & Technologies</h2>
          <div className="flex flex-wrap gap-3">
            {skills.map(s => <span key={s} className="px-4 py-2 bg-gray-100 text-slate-700 rounded-lg text-sm font-medium">{s}</span>)}
          </div>
        </div>
      </section>

      <section id="contact" className="py-24 bg-slate-800 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Let's work together</h2>
          <p className="text-slate-300 mb-8">Got a project in mind? I'd love to hear about it.</p>
          <div className="flex justify-center gap-4">
            <a href="#" className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"><Mail className="w-5 h-5 text-white" /></a>
            <a href="#" className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"><Github className="w-5 h-5 text-white" /></a>
            <a href="#" className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"><Linkedin className="w-5 h-5 text-white" /></a>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-gray-100 text-center">
        <p className="text-sm text-slate-400">© {new Date().getFullYear()} {{APP_NAME}}</p>
      </footer>
    </div>
  );
}`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-white text-slate-800 antialiased; }
  html { scroll-behavior: smooth; }
}`,
  },
};

// ─── Import additional templates ───
import { ECOMMERCE } from "./instantTemplates/ecommerce";
import { BLOG } from "./instantTemplates/blog";
import { DASHBOARD } from "./instantTemplates/dashboard";
import { CHAT_APP } from "./instantTemplates/chatApp";
import { CRM } from "./instantTemplates/crm";
import { PROJECT_MGMT } from "./instantTemplates/projectMgmt";
import { TODO } from "./instantTemplates/todo";

// ─── All instant templates ───
export const INSTANT_TEMPLATES: InstantTemplate[] = [
  SAAS_LANDING,
  PORTFOLIO,
  ECOMMERCE,
  BLOG,
  DASHBOARD,
  CHAT_APP,
  CRM,
  PROJECT_MGMT,
  TODO,
];
