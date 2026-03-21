import type { InstantTemplate } from "../instantTemplates";

export const BLOG: InstantTemplate = {
  id: "blog-cms",
  matchIds: ["blog-cms", "blog"],
  deps: { "lucide-react": "^0.400.0", "framer-motion": "^11.0.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ToastContainer from "./components/ui/Toast";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <ToastContainer />
    </HashRouter>
  );
}`,

    "/pages/Home.jsx": `import React, { useState } from "react";
import Navbar from "../components/Navbar";
import FeaturedPost from "../components/FeaturedPost";
import ArticleGrid from "../components/ArticleGrid";
import Sidebar from "../components/Sidebar";
import Newsletter from "../components/Newsletter";
import Footer from "../components/Footer";

export default function Home() {
  const [category, setCategory] = useState("All");
  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <FeaturedPost />
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <ArticleGrid category={category} />
          </div>
          <Sidebar activeCategory={category} onCategoryChange={setCategory} />
        </div>
      </div>
      <Newsletter />
      <Footer />
    </div>
  );
}`,

    "/components/Navbar.jsx": `import React from "react";
import { BookOpen, Search, PenTool } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-stone-800" />
          <span className="text-lg font-bold text-stone-800 tracking-tight" style={{ fontFamily: "'Georgia', serif" }}>{{APP_NAME}}</span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          {["Technology", "Design", "Business", "Culture"].map(l => (
            <a key={l} href="#" className="text-sm text-stone-500 hover:text-stone-800 transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-stone-500 hover:text-stone-800"><Search className="w-5 h-5" /></button>
          <button className="flex items-center gap-2 px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700">
            <PenTool className="w-3.5 h-3.5" /> Write
          </button>
        </div>
      </div>
    </nav>
  );
}`,

    "/components/FeaturedPost.jsx": `import React from "react";
import { motion } from "framer-motion";
import { Clock, ArrowRight } from "lucide-react";

export default function FeaturedPost() {
  return (
    <section className="px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 p-10 md:p-16">
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur text-white/90 text-xs font-medium rounded-full mb-6">
              ✨ Featured Article
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight mb-4" style={{ fontFamily: "'Georgia', serif" }}>
              {{APP_DESC}}
            </h1>
            <p className="text-white/70 text-lg mb-8 leading-relaxed">An in-depth exploration of the ideas and innovations shaping our world today.</p>
            <div className="flex items-center gap-6">
              <button className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-900 rounded-xl font-medium hover:bg-gray-100 transition-colors">
                Read Article <ArrowRight className="w-4 h-4" />
              </button>
              <span className="flex items-center gap-1.5 text-white/60 text-sm"><Clock className="w-4 h-4" /> 8 min read</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}`,

    "/components/ArticleGrid.jsx": `import React from "react";
import { Clock, Heart, MessageCircle } from "lucide-react";

const articles = [
  { id: 1, title: "The Rise of AI-Powered Development", excerpt: "How artificial intelligence is transforming the way we write and ship code.", category: "Technology", author: "Alex Chen", date: "Mar 5", readTime: "6 min", gradient: "from-blue-100 to-indigo-100", likes: 234 },
  { id: 2, title: "Designing for Emotional Impact", excerpt: "Creating interfaces that connect with users on a deeper, more meaningful level.", category: "Design", author: "Maya Patel", date: "Mar 3", readTime: "5 min", gradient: "from-rose-100 to-pink-100", likes: 189 },
  { id: 3, title: "Scaling Startups in 2025", excerpt: "Lessons learned from founders who grew from zero to millions in revenue.", category: "Business", author: "James Liu", date: "Mar 1", readTime: "8 min", gradient: "from-amber-100 to-yellow-100", likes: 312 },
  { id: 4, title: "The Future of Remote Work", excerpt: "Why distributed teams are outperforming traditional office setups.", category: "Culture", author: "Sarah Kim", date: "Feb 28", readTime: "4 min", gradient: "from-emerald-100 to-teal-100", likes: 156 },
  { id: 5, title: "Web Performance Masterclass", excerpt: "Deep dive into Core Web Vitals and how to achieve perfect scores.", category: "Technology", author: "Dev Sharma", date: "Feb 26", readTime: "10 min", gradient: "from-violet-100 to-purple-100", likes: 278 },
  { id: 6, title: "Building Design Systems at Scale", excerpt: "A practical guide to creating consistent, maintainable UI component libraries.", category: "Design", author: "Lisa Park", date: "Feb 24", readTime: "7 min", gradient: "from-cyan-100 to-sky-100", likes: 198 },
];

export default function ArticleGrid({ category }) {
  const filtered = category === "All" ? articles : articles.filter(a => a.category === category);
  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-800 mb-8" style={{ fontFamily: "'Georgia', serif" }}>Latest Articles</h2>
      <div className="space-y-6">
        {filtered.map(a => (
          <article key={a.id} className="group flex gap-6 p-5 bg-white rounded-2xl border border-stone-100 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
            <div className={"w-40 h-32 rounded-xl bg-gradient-to-br " + a.gradient + " flex-shrink-0 hidden sm:block"} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2.5 py-0.5 bg-stone-100 text-stone-600 text-xs font-medium rounded-full">{a.category}</span>
                <span className="text-xs text-stone-400">{a.date}</span>
              </div>
              <h3 className="text-lg font-semibold text-stone-800 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1" style={{ fontFamily: "'Georgia', serif" }}>{a.title}</h3>
              <p className="text-sm text-stone-500 mb-3 line-clamp-2">{a.excerpt}</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400" />
                  <span className="text-xs text-stone-600 font-medium">{a.author}</span>
                </div>
                <span className="flex items-center gap-1 text-xs text-stone-400"><Clock className="w-3 h-3" /> {a.readTime}</span>
                <span className="flex items-center gap-1 text-xs text-stone-400"><Heart className="w-3 h-3" /> {a.likes}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}`,

    "/components/Sidebar.jsx": `import React from "react";
import { TrendingUp, Tag } from "lucide-react";

const categories = ["All", "Technology", "Design", "Business", "Culture"];
const trending = [
  { title: "Why TypeScript Won", views: "12.4k" },
  { title: "CSS Container Queries Guide", views: "8.9k" },
  { title: "React Server Components Deep Dive", views: "7.2k" },
  { title: "The Art of Code Review", views: "6.1k" },
];

const tags = ["React", "AI", "Design", "TypeScript", "Startup", "CSS", "Node.js", "UX", "Performance", "DevOps"];

export default function Sidebar({ activeCategory, onCategoryChange }) {
  return (
    <aside className="space-y-8">
      <div className="bg-white rounded-2xl p-6 border border-stone-100">
        <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2"><Tag className="w-4 h-4" /> Categories</h3>
        <div className="space-y-1.5">
          {categories.map(c => (
            <button key={c} onClick={() => onCategoryChange(c)} className={"w-full text-left px-3 py-2 rounded-lg text-sm transition-colors " + (c === activeCategory ? "bg-stone-800 text-white font-medium" : "text-stone-600 hover:bg-stone-100")}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 border border-stone-100">
        <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Trending</h3>
        <div className="space-y-4">
          {trending.map((t, i) => (
            <div key={i} className="flex gap-3 cursor-pointer group">
              <span className="text-lg font-bold text-stone-300 w-6">0{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-stone-700 group-hover:text-indigo-600 transition-colors">{t.title}</p>
                <p className="text-xs text-stone-400">{t.views} views</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 border border-stone-100">
        <h3 className="font-semibold text-stone-800 mb-4">Popular Tags</h3>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => <span key={t} className="px-3 py-1.5 bg-stone-100 text-stone-600 text-xs rounded-full hover:bg-stone-200 cursor-pointer transition-colors">{t}</span>)}
        </div>
      </div>
    </aside>
  );
}`,

    "/components/Newsletter.jsx": `import React from "react";

export default function Newsletter() {
  return (
    <section className="py-20 px-6 bg-stone-800">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: "'Georgia', serif" }}>Never miss a story</h2>
        <p className="text-stone-400 mb-8">Get the latest articles delivered straight to your inbox every week.</p>
        <div className="flex gap-3 max-w-md mx-auto">
          <input type="email" placeholder="Your email" className="flex-1 px-5 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-stone-500 outline-none focus:border-white/40 text-sm" />
          <button className="px-6 py-3.5 bg-white text-stone-800 rounded-xl font-medium hover:bg-stone-100 transition-colors text-sm">Subscribe</button>
        </div>
      </div>
    </section>
  );
}`,

    "/components/Footer.jsx": `import React from "react";
import { BookOpen } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-stone-200 py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-stone-800" />
          <span className="font-bold text-stone-800" style={{ fontFamily: "'Georgia', serif" }}>{{APP_NAME}}</span>
        </div>
        <p className="text-sm text-stone-400">© {new Date().getFullYear()} {{APP_NAME}}. All rights reserved.</p>
      </div>
    </footer>
  );
}`,

    "/components/ui/Toast.jsx": `import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
let toastHandler = null;
export function showToast(message, type = "success") { if (toastHandler) toastHandler({ message, type, id: Date.now() }); }
const ToastContext = createContext({ addToast: () => {} });
export function useToast() { return useContext(ToastContext); }
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((t) => { const toast = typeof t === "string" ? { message: t, type: "success", id: Date.now() } : { ...t, id: t.id || Date.now() }; setToasts(p => [...p, toast]); setTimeout(() => setToasts(p => p.filter(x => x.id !== toast.id)), 4000); }, []);
  useEffect(() => { toastHandler = (t) => addToast(t); return () => { toastHandler = null; }; }, [addToast]);
  return <ToastContext.Provider value={{ addToast }}>{children}<div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">{toasts.map(t => <div key={t.id} className={"px-4 py-3 rounded-lg text-white text-sm shadow-lg " + (t.type === "error" ? "bg-red-500" : "bg-emerald-500")}>{t.message}</div>)}</div></ToastContext.Provider>;
}
export default function ToastContainer() { return <ToastProvider>{null}</ToastProvider>; }`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:wght@400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-stone-50 text-stone-800 antialiased; }
  html { scroll-behavior: smooth; }
}`,
  },
};
