/**
 * ChatWelcomeScreen — The welcome/empty-state UI shown when no messages exist.
 * 
 * Features a visual template marketplace with categories, search,
 * preview thumbnails, and prompt suggestions.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Search, Grid3X3, Layers, ChevronRight, Star } from "lucide-react";
import { PROMPT_SUGGESTIONS } from "@/lib/aiModels";
import { PAGE_TEMPLATES } from "@/lib/pageTemplates";
import type { PageTemplate } from "@/lib/pageTemplates";

interface ChatWelcomeScreenProps {
  onSend: (prompt: string) => void;
  selectedTemplate: PageTemplate | null;
  onSelectTemplate: (template: PageTemplate | null) => void;
}

// Category definitions with icons and colors
const CATEGORIES = [
  { id: "all", label: "All", icon: "✨" },
  { id: "landing", label: "Landing", icon: "🚀" },
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "ecommerce", label: "E-Commerce", icon: "🛍️" },
  { id: "portfolio", label: "Portfolio", icon: "🎨" },
  { id: "blog", label: "Blog", icon: "📝" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "crm", label: "CRM", icon: "🤝" },
  { id: "productivity", label: "Productivity", icon: "⚡" },
];

// Template card gradient backgrounds for visual variety
const CARD_GRADIENTS = [
  "from-indigo-500/10 via-purple-500/5 to-pink-500/10",
  "from-emerald-500/10 via-teal-500/5 to-cyan-500/10",
  "from-amber-500/10 via-orange-500/5 to-red-500/10",
  "from-blue-500/10 via-sky-500/5 to-cyan-500/10",
  "from-violet-500/10 via-fuchsia-500/5 to-pink-500/10",
  "from-rose-500/10 via-pink-500/5 to-fuchsia-500/10",
  "from-teal-500/10 via-emerald-500/5 to-green-500/10",
  "from-cyan-500/10 via-blue-500/5 to-indigo-500/10",
];

export default function ChatWelcomeScreen({ onSend, selectedTemplate, onSelectTemplate }: ChatWelcomeScreenProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const filteredTemplates = PAGE_TEMPLATES.filter(t => {
    const matchesCategory = activeCategory === "all" || t.category === activeCategory ||
      t.keywords.some(k => k.includes(activeCategory));
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.keywords.some(k => k.includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const displayTemplates = showAllTemplates ? filteredTemplates : filteredTemplates.slice(0, 8);

  return (
    <div className="flex flex-col items-center h-full overflow-y-auto py-6 px-2 gap-5">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-2.5 text-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-base font-bold text-foreground">What do you want to build?</h3>
        <p className="text-xs text-muted-foreground max-w-[280px]">
          Pick a template, use a suggestion, or describe your app from scratch
        </p>
      </motion.div>

      {/* Quick prompts */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md"
      >
        <div className="grid grid-cols-2 gap-2">
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.04 }}
              onClick={() => onSend(s.prompt)}
              className="text-left px-3 py-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all group"
            >
              <span className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors">{s.label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Template Marketplace */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="w-full max-w-md"
      >
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground">Templates</span>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">{PAGE_TEMPLATES.length}</span>
          </div>
          {filteredTemplates.length > 8 && (
            <button
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              className="text-[10px] text-primary font-semibold hover:underline flex items-center gap-0.5"
            >
              {showAllTemplates ? "Show less" : `View all ${filteredTemplates.length}`}
              <ChevronRight className={"w-3 h-3 transition-transform " + (showAllTemplates ? "rotate-90" : "")} />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => { setActiveCategory(c.id); setShowAllTemplates(false); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${
                activeCategory === c.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <span className="text-xs">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory + searchQuery}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-2"
          >
            {displayTemplates.length === 0 ? (
              <div className="col-span-2 py-8 text-center">
                <p className="text-xs text-muted-foreground">No templates match your search</p>
              </div>
            ) : (
              displayTemplates.map((t, i) => {
                const isSelected = selectedTemplate?.id === t.id;
                const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                return (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => onSelectTemplate(isSelected ? null : t)}
                    className={`group relative text-left rounded-xl border overflow-hidden transition-all duration-200 ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10"
                        : "border-border hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
                    }`}
                  >
                    {/* Preview gradient area */}
                    <div className={`h-20 bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
                      <span className="text-2xl drop-shadow-sm">{t.emoji}</span>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                        >
                          <Star className="w-3 h-3 text-primary-foreground fill-current" />
                        </motion.div>
                      )}
                      {/* Subtle grid pattern */}
                      <div className="absolute inset-0 opacity-[0.04]" style={{
                        backgroundImage: "linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)",
                        backgroundSize: "20px 20px",
                      }} />
                    </div>
                    {/* Info */}
                    <div className="p-2.5 bg-card">
                      <p className="text-[11px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{t.name}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{t.description}</p>
                    </div>
                  </motion.button>
                );
              })
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Capabilities */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="rounded-xl border border-border/50 bg-card/50 p-3">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2 text-center">Platform Capabilities</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { icon: "🧠", label: "Multi-model AI" },
              { icon: "🎨", label: "Design themes" },
              { icon: "📸", label: "Image-to-code" },
              { icon: "🔧", label: "Auto-fix errors" },
              { icon: "⚡", label: "Live preview" },
              { icon: "🧩", label: "Smart suggestions" },
            ].map((cap, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg">
                <span className="text-xs shrink-0">{cap.icon}</span>
                <p className="text-[10px] font-medium text-foreground/70 leading-tight">{cap.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Keyboard hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5"
      >
        <kbd className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-mono">Enter</kbd>
        to send
        <span className="mx-1">·</span>
        <kbd className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-mono">Shift+Enter</kbd>
        new line
      </motion.p>
    </div>
  );
}
