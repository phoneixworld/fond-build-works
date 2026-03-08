import { useState, useRef, useCallback } from "react";
import {
  Palette, Upload, Sparkles, Type, Layers, Copy, Check, Wand2,
  CircleDot, Sun, Moon, Paintbrush, Download, RefreshCw, ImagePlus, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface BrandColor {
  hsl: string;
  hex: string;
  name: string;
}

interface BrandKit {
  brandName: string;
  tagline: string;
  personality: string[];
  colors: {
    primary: BrandColor;
    secondary: BrandColor;
    accent: BrandColor;
    background: BrandColor;
    foreground: BrandColor;
    muted: BrandColor;
    destructive: BrandColor;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    monoFont: string;
    scale: string;
  };
  style: {
    borderRadius: string;
    shadowStyle: string;
    density: string;
    mood: string;
  };
  cssVariables: string;
}

const MOOD_OPTIONS = [
  { id: "minimal", emoji: "⚪", label: "Minimal" },
  { id: "bold", emoji: "🔥", label: "Bold" },
  { id: "playful", emoji: "🎮", label: "Playful" },
  { id: "elegant", emoji: "✨", label: "Elegant" },
  { id: "dark", emoji: "🌙", label: "Dark" },
  { id: "corporate", emoji: "🏢", label: "Corporate" },
];

const BrandKitGenerator = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [mood, setMood] = useState<string>("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Too large", description: "Image must be under 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  const generate = useCallback(async () => {
    if (!image && !description) {
      toast({ title: "Need input", description: "Upload an image or describe your brand", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-brand-kit", {
        body: { image, mood, description },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setKit(data as BrandKit);
      toast({ title: "Brand kit generated! ✨", description: `"${data.brandName}" is ready` });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [image, mood, description, toast]);

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied!", description: `${field} copied to clipboard` });
  }, [toast]);

  const ColorSwatch = ({ color, label }: { color: BrandColor; label: string }) => (
    <div className="flex items-center gap-3 group">
      <div
        className="w-10 h-10 rounded-lg border border-border shadow-sm shrink-0 cursor-pointer transition-transform hover:scale-110"
        style={{ backgroundColor: color.hex }}
        onClick={() => copyToClipboard(color.hex, label)}
        title={`Click to copy ${color.hex}`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{color.name}</div>
        <div className="text-[10px] text-muted-foreground font-mono">{color.hex}</div>
      </div>
      <button
        onClick={() => copyToClipboard(color.hex, label)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
      >
        {copiedField === label ? <Check className="w-3 h-3 text-[hsl(var(--ide-success))]" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Brand Kit Generator</span>
        </div>
        {kit && (
          <button
            onClick={() => { setKit(null); setImage(null); setDescription(""); setMood(""); }}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> New
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence mode="wait">
          {!kit ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Image upload */}
              <div className="border border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors relative">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                {image ? (
                  <div className="relative inline-block">
                    <img src={image} alt="Upload" className="max-h-32 rounded-lg mx-auto" />
                    <button
                      onClick={() => setImage(null)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} className="space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                      <ImagePlus className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">Upload a logo, screenshot, or mood board</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG up to 5MB</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Mood selector */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Style Direction</label>
                <div className="grid grid-cols-3 gap-2">
                  {MOOD_OPTIONS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMood(mood === m.id ? "" : m.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                        mood === m.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/30"
                      }`}
                    >
                      <span>{m.emoji}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Describe Your Brand (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. A modern fintech startup targeting millennials, we want to feel trustworthy but approachable..."
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:border-primary outline-none transition-colors"
                />
              </div>

              {/* Generate button */}
              <button
                onClick={generate}
                disabled={loading || (!image && !description)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Generating brand kit...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Generate Brand Kit
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Brand header */}
              <div className="border border-border rounded-xl p-5 bg-background text-center">
                <h2 className="text-xl font-bold text-foreground">{kit.brandName}</h2>
                <p className="text-xs text-muted-foreground mt-1">{kit.tagline}</p>
                <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
                  {kit.personality.map((p, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Color palette */}
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-1.5 mb-3">
                  <CircleDot className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Color Palette</span>
                </div>
                {/* Swatches row */}
                <div className="flex gap-1 mb-4 rounded-lg overflow-hidden">
                  {Object.entries(kit.colors).map(([key, color]) => (
                    <div
                      key={key}
                      className="flex-1 h-12 cursor-pointer hover:scale-y-110 transition-transform origin-bottom"
                      style={{ backgroundColor: color.hex }}
                      title={`${color.name} — ${color.hex}`}
                      onClick={() => copyToClipboard(color.hex, key)}
                    />
                  ))}
                </div>
                <div className="space-y-2.5">
                  {Object.entries(kit.colors).map(([key, color]) => (
                    <ColorSwatch key={key} color={color} label={key} />
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-1.5 mb-3">
                  <Type className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Typography</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Heading</span>
                    <span className="text-sm font-bold text-foreground">{kit.typography.headingFont}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Body</span>
                    <span className="text-sm text-foreground">{kit.typography.bodyFont}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Mono</span>
                    <span className="text-sm font-mono text-foreground">{kit.typography.monoFont}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Scale</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-foreground">{kit.typography.scale}</span>
                  </div>
                </div>
              </div>

              {/* Style tokens */}
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-1.5 mb-3">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Style Tokens</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Radius", value: kit.style.borderRadius },
                    { label: "Shadows", value: kit.style.shadowStyle },
                    { label: "Density", value: kit.style.density },
                    { label: "Mood", value: kit.style.mood },
                  ].map(item => (
                    <div key={item.label} className="bg-secondary/50 rounded-lg p-2.5">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</div>
                      <div className="text-xs font-medium text-foreground mt-0.5">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CSS Output */}
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Paintbrush className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">CSS Variables</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(kit.cssVariables, "CSS Variables")}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copiedField === "CSS Variables" ? <Check className="w-3 h-3 text-[hsl(var(--ide-success))]" /> : <Copy className="w-3 h-3" />}
                    Copy
                  </button>
                </div>
                <pre className="bg-[hsl(var(--ide-panel))] rounded-lg p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
                  {kit.cssVariables}
                </pre>
              </div>

              {/* Preview card */}
              <div
                className="border border-border rounded-xl p-5 overflow-hidden relative"
                style={{ backgroundColor: kit.colors.background.hex, color: kit.colors.foreground.hex }}
              >
                <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-wider opacity-50">
                  <Sparkles className="w-3 h-3" /> Live Preview
                </div>
                <h3 className="text-lg font-bold mb-1" style={{ color: kit.colors.foreground.hex }}>
                  {kit.brandName}
                </h3>
                <p className="text-xs opacity-70 mb-3">{kit.tagline}</p>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: kit.colors.primary.hex, color: "#fff" }}
                  >
                    Primary Action
                  </button>
                  <button
                    className="px-4 py-1.5 rounded-lg text-xs font-medium border"
                    style={{ borderColor: kit.colors.secondary.hex, color: kit.colors.foreground.hex }}
                  >
                    Secondary
                  </button>
                </div>
                <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: kit.colors.muted.hex }}>
                  <p className="text-[11px] opacity-60">
                    This is how your muted background will look with content inside a card component.
                  </p>
                </div>
              </div>

              {/* Action: Copy full CSS */}
              <button
                onClick={() => copyToClipboard(kit.cssVariables, "CSS Variables")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-all"
              >
                <Download className="w-4 h-4" />
                Copy CSS to Clipboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BrandKitGenerator;
