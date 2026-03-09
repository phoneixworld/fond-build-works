import { useState, useEffect } from "react";
import { Tag, Globe, Palette, Type, Image, Download, Save, Eye, ExternalLink, Copy, Check, RefreshCw, Shield, DollarSign, Users, Zap, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/contexts/ProjectContext";

interface WhiteLabelConfig {
  brandName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  customDomain: string;
  hideAttribution: boolean;
  customFooter: string;
  resellEnabled: boolean;
  resellMarkup: number;
  resellBranding: string;
  customCss: string;
}

const DEFAULT_CONFIG: WhiteLabelConfig = {
  brandName: "My App Builder",
  tagline: "Build apps with AI",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#6d28d9",
  accentColor: "#f59e0b",
  customDomain: "",
  hideAttribution: false,
  customFooter: "",
  resellEnabled: false,
  resellMarkup: 30,
  resellBranding: "",
  customCss: "",
};

const COLOR_PRESETS = [
  { name: "Purple", primary: "#6d28d9", accent: "#f59e0b" },
  { name: "Ocean", primary: "#0891b2", accent: "#06b6d4" },
  { name: "Forest", primary: "#059669", accent: "#10b981" },
  { name: "Rose", primary: "#e11d48", accent: "#f43f5e" },
  { name: "Midnight", primary: "#1e3a5f", accent: "#3b82f6" },
  { name: "Sunset", primary: "#ea580c", accent: "#f97316" },
];

const SECTIONS = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "domain", label: "Domain", icon: Globe },
  { id: "resell", label: "Resell", icon: DollarSign },
  { id: "advanced", label: "Advanced", icon: Zap },
];

const WhiteLabelPanel = () => {
  const { toast } = useToast();
  const { currentProject } = useProjects();
  const [config, setConfig] = useState<WhiteLabelConfig>(DEFAULT_CONFIG);
  const [activeSection, setActiveSection] = useState("branding");
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const update = <K extends keyof WhiteLabelConfig>(key: K, value: WhiteLabelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    // In a real implementation, save to project_data table
    setSaved(true);
    toast({ title: "White-label config saved", description: "Your branding settings have been updated." });
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExportConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "whitelabel-config.json";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Config downloaded as JSON." });
  };

  const copyEmbedCode = () => {
    const code = `<script src="https://${config.customDomain || 'your-domain.com'}/embed.js" data-brand="${config.brandName}" data-primary="${config.primaryColor}"></script>`;
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: "Embed code copied to clipboard." });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">White-label & Resell</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportConfig} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Download className="w-3 h-3" /> Export
          </button>
          <button onClick={handleSave} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${saved ? "bg-green-500/10 text-green-500" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
            {saved ? <><Check className="w-3 h-3" /> Saved</> : <><Save className="w-3 h-3" /> Save</>}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto scrollbar-none">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-all ${
                activeSection === s.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-3 h-3" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Branding Section */}
        {activeSection === "branding" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Live Preview Card */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Live Preview</span>
                <Eye className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="p-4" style={{ background: `linear-gradient(135deg, ${config.primaryColor}15, ${config.accentColor}10)` }}>
                <div className="flex items-center gap-2 mb-3">
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: config.primaryColor }}>
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-bold">{config.brandName || "My App Builder"}</h3>
                    <p className="text-[10px] text-muted-foreground">{config.tagline || "Build apps with AI"}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 rounded-md px-3 flex items-center text-[10px] text-white font-medium" style={{ background: config.primaryColor }}>
                    Get Started
                  </div>
                  <div className="h-6 rounded-md px-3 flex items-center text-[10px] border" style={{ borderColor: config.accentColor, color: config.accentColor }}>
                    Learn More
                  </div>
                </div>
              </div>
            </div>

            {/* Brand Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Type className="w-3 h-3" /> Brand Name
              </label>
              <input value={config.brandName} onChange={e => update("brandName", e.target.value)} className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
            </div>

            {/* Tagline */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tagline</label>
              <input value={config.tagline} onChange={e => update("tagline", e.target.value)} className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
            </div>

            {/* Logo URL */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Image className="w-3 h-3" /> Logo URL
              </label>
              <input value={config.logoUrl} onChange={e => update("logoUrl", e.target.value)} placeholder="https://..." className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Palette className="w-3 h-3" /> Colors
              </label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => { update("primaryColor", preset.primary); update("accentColor", preset.accent); }}
                    className={`group relative w-8 h-8 rounded-lg overflow-hidden border-2 transition-all ${
                      config.primaryColor === preset.primary ? "border-foreground scale-110" : "border-transparent hover:border-primary/30"
                    }`}
                    title={preset.name}
                  >
                    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})` }} />
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <span className="text-[10px] text-muted-foreground">Primary</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={config.primaryColor} onChange={e => update("primaryColor", e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <input value={config.primaryColor} onChange={e => update("primaryColor", e.target.value)} className="flex-1 bg-secondary text-xs font-mono rounded-lg px-2 py-1.5 outline-none border border-border focus:border-primary" />
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-[10px] text-muted-foreground">Accent</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={config.accentColor} onChange={e => update("accentColor", e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <input value={config.accentColor} onChange={e => update("accentColor", e.target.value)} className="flex-1 bg-secondary text-xs font-mono rounded-lg px-2 py-1.5 outline-none border border-border focus:border-primary" />
                  </div>
                </div>
              </div>
            </div>

            {/* Hide Attribution */}
            <label className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border cursor-pointer">
              <div>
                <span className="text-xs font-medium">Hide "Built with Phoneix World" badge</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Remove all Phoneix World branding from your app</p>
              </div>
              <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${config.hideAttribution ? "bg-primary" : "bg-muted"}`} onClick={() => update("hideAttribution", !config.hideAttribution)}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.hideAttribution ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </motion.div>
        )}

        {/* Domain Section */}
        {activeSection === "domain" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <Globe className="w-3 h-3" /> Custom Domain
              </label>
              <input value={config.customDomain} onChange={e => update("customDomain", e.target.value)} placeholder="app.yourbrand.com" className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
              <p className="text-[10px] text-muted-foreground">Point your domain's CNAME to <code className="px-1 py-0.5 bg-secondary rounded font-mono">cname.phoneix.world</code></p>
            </div>

            {/* DNS Instructions */}
            <div className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> DNS Setup</h4>
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center gap-3 p-2 bg-background rounded-lg">
                  <span className="text-muted-foreground w-12">Type</span>
                  <span className="font-mono font-medium">CNAME</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-background rounded-lg">
                  <span className="text-muted-foreground w-12">Name</span>
                  <span className="font-mono font-medium">{config.customDomain ? config.customDomain.split('.')[0] : "app"}</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-background rounded-lg">
                  <span className="text-muted-foreground w-12">Value</span>
                  <span className="font-mono font-medium">cname.phoneix.world</span>
                </div>
              </div>
            </div>

            {/* Favicon */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Favicon URL</label>
              <input value={config.faviconUrl} onChange={e => update("faviconUrl", e.target.value)} placeholder="https://..." className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
            </div>

            {/* Custom Footer */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Custom Footer Text</label>
              <input value={config.customFooter} onChange={e => update("customFooter", e.target.value)} placeholder="© 2026 Your Brand. All rights reserved." className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
            </div>
          </motion.div>
        )}

        {/* Resell Section */}
        {activeSection === "resell" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <label className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border cursor-pointer">
              <div>
                <span className="text-xs font-medium flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-primary" /> Enable Reselling</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Resell this platform under your own brand with custom pricing</p>
              </div>
              <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${config.resellEnabled ? "bg-primary" : "bg-muted"}`} onClick={() => update("resellEnabled", !config.resellEnabled)}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.resellEnabled ? "translate-x-5" : ""}`} />
              </div>
            </label>

            <AnimatePresence>
              {config.resellEnabled && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
                  {/* Markup */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Price Markup (%)</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={100} value={config.resellMarkup} onChange={e => update("resellMarkup", Number(e.target.value))} className="flex-1 accent-primary" />
                      <span className="text-sm font-bold w-12 text-right">{config.resellMarkup}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Your customers pay {config.resellMarkup}% more than base price</p>
                  </div>

                  {/* Resell Branding */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reseller Company Name</label>
                    <input value={config.resellBranding} onChange={e => update("resellBranding", e.target.value)} placeholder="Your Agency Name" className="w-full bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors" />
                  </div>

                  {/* Revenue Calculator */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-primary" /> Revenue Estimate</h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-bold text-foreground">${(19 * (1 + config.resellMarkup / 100)).toFixed(0)}</p>
                        <p className="text-[10px] text-muted-foreground">Pro / user / mo</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-primary">${(19 * config.resellMarkup / 100).toFixed(0)}</p>
                        <p className="text-[10px] text-muted-foreground">Your margin</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">${(19 * config.resellMarkup / 100 * 100).toFixed(0)}</p>
                        <p className="text-[10px] text-muted-foreground">/ 100 users / mo</p>
                      </div>
                    </div>
                  </div>

                  {/* Embed Code */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Embed Code</label>
                    <div className="relative">
                      <pre className="bg-secondary rounded-lg p-3 text-[10px] font-mono overflow-x-auto text-muted-foreground">
{`<script src="https://${config.customDomain || 'your-domain.com'}/embed.js"
  data-brand="${config.brandName}"
  data-primary="${config.primaryColor}">
</script>`}
                      </pre>
                      <button onClick={copyEmbedCode} className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background transition-colors">
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Advanced Section */}
        {activeSection === "advanced" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Custom CSS */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Custom CSS Override</label>
              <textarea
                value={config.customCss}
                onChange={e => update("customCss", e.target.value)}
                placeholder={`:root {\n  --primary: 262 83% 58%;\n  --accent: 38 92% 50%;\n}`}
                className="w-full bg-secondary text-xs font-mono rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors min-h-[120px] resize-y"
              />
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quick Actions</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { update("brandName", DEFAULT_CONFIG.brandName); update("primaryColor", DEFAULT_CONFIG.primaryColor); update("accentColor", DEFAULT_CONFIG.accentColor); }} className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border text-[11px] hover:bg-secondary transition-colors">
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Reset to defaults
                </button>
                <button onClick={handleExportConfig} className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border text-[11px] hover:bg-secondary transition-colors">
                  <Download className="w-3.5 h-3.5 text-muted-foreground" /> Export config
                </button>
              </div>
            </div>

            {/* Feature flags for white-label */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Feature Visibility</label>
              {["AI Chat", "Code Editor", "Cloud Panel", "Team Chat", "Plugin Marketplace", "A/B Testing", "Analytics"].map(feat => (
                <label key={feat} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors">
                  <span className="text-xs">{feat}</span>
                  <div className="w-8 h-4 rounded-full bg-primary p-0.5">
                    <div className="w-3 h-3 rounded-full bg-white translate-x-4" />
                  </div>
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default WhiteLabelPanel;
