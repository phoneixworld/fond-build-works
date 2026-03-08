import { useState, useRef, useCallback } from "react";
import {
  Image, Download, Loader2, ImagePlus, X, RefreshCw,
  Share2, CreditCard, Mail, Globe, Instagram, Twitter, FileText, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/contexts/ProjectContext";
import type { BrandKit } from "./BrandKitGenerator";

interface GeneratedAsset {
  assetType: string;
  imageData: string;
  storedUrl: string | null;
  filename: string;
  description: string;
}

const ASSET_OPTIONS = [
  { id: "social-banner", label: "Social Banner", icon: Share2, desc: "Facebook / LinkedIn cover" },
  { id: "og-image", label: "OG Image", icon: Globe, desc: "Link preview share image" },
  { id: "business-card", label: "Business Card", icon: CreditCard, desc: "Professional card layout" },
  { id: "email-signature", label: "Email Signature", icon: Mail, desc: "Email signature banner" },
  { id: "favicon", label: "Favicon / Icon", icon: Image, desc: "App icon & favicon" },
  { id: "instagram-post", label: "Instagram Post", icon: Instagram, desc: "Square post template" },
  { id: "letterhead", label: "Letterhead", icon: FileText, desc: "Document header" },
  { id: "twitter-header", label: "Twitter Header", icon: Twitter, desc: "X/Twitter banner" },
] as const;

interface MarketingMaterialsProps {
  brandKit: BrandKit | null;
}

const MarketingMaterials = ({ brandKit }: MarketingMaterialsProps) => {
  const { toast } = useToast();
  const { currentProject } = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<string | null>(null);
  const [assets, setAssets] = useState<Record<string, GeneratedAsset>>({});

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Too large", description: "Logo must be under 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generateAsset = useCallback(async (assetType: string) => {
    if (!logo && !brandKit) {
      toast({ title: "Need input", description: "Upload a logo or generate a Brand Kit first", variant: "destructive" });
      return;
    }
    setGenerating(assetType);
    try {
      const { data, error } = await supabase.functions.invoke("generate-marketing-materials", {
        body: {
          assetType,
          logoImage: logo,
          brandKit,
          projectId: currentProject?.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAssets(prev => ({ ...prev, [assetType]: data as GeneratedAsset }));
      toast({ title: "Generated! ✨", description: `${ASSET_OPTIONS.find(a => a.id === assetType)?.label} is ready` });
    } catch (e: any) {
      if (e?.message?.includes("Rate limit") || e?.status === 429) {
        toast({ title: "Rate limited", description: "Please wait a moment and try again", variant: "destructive" });
      } else if (e?.status === 402) {
        toast({ title: "Credits needed", description: "Please add credits to continue generating", variant: "destructive" });
      } else {
        toast({ title: "Generation failed", description: e.message || "Try again", variant: "destructive" });
      }
    } finally {
      setGenerating(null);
    }
  }, [logo, brandKit, currentProject, toast]);

  const generateSelected = useCallback(async () => {
    const items = Array.from(selected);
    for (const id of items) {
      await generateAsset(id);
      // Small delay between requests to avoid rate limiting
      if (items.indexOf(id) < items.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }, [selected, generateAsset]);

  const downloadAsset = (asset: GeneratedAsset) => {
    const link = document.createElement("a");
    link.href = asset.imageData;
    link.download = asset.filename;
    link.click();
  };

  const hasAnyAsset = Object.keys(assets).length > 0;

  return (
    <div className="space-y-4">
      {/* Logo upload */}
      <div className="border border-dashed border-border rounded-xl p-5 text-center hover:border-primary/40 transition-colors">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        {logo ? (
          <div className="relative inline-block">
            <img src={logo} alt="Logo" className="max-h-20 rounded-lg mx-auto" />
            <button
              onClick={() => setLogo(null)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Upload your logo</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">PNG or JPG, up to 5MB</p>
            </div>
          </button>
        )}
      </div>

      {/* Brand kit status */}
      {brandKit && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] text-foreground">
            Using <strong>{brandKit.brandName}</strong> brand kit colors & style
          </span>
        </div>
      )}

      {/* Asset type selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Select Assets to Generate</label>
          <button
            onClick={() => {
              if (selected.size === ASSET_OPTIONS.length) setSelected(new Set());
              else setSelected(new Set(ASSET_OPTIONS.map(a => a.id)));
            }}
            className="text-[10px] text-primary hover:underline"
          >
            {selected.size === ASSET_OPTIONS.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ASSET_OPTIONS.map(option => {
            const Icon = option.icon;
            const isSelected = selected.has(option.id);
            const isGenerating = generating === option.id;
            const isGenerated = !!assets[option.id];
            return (
              <button
                key={option.id}
                onClick={() => toggleSelect(option.id)}
                disabled={isGenerating}
                className={`relative flex items-start gap-2.5 p-3 rounded-lg text-left transition-all border ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/30"
                } ${isGenerating ? "opacity-60" : ""}`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    {option.label}
                    {isGenerated && <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-success))]" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{option.desc}</div>
                </div>
                {isGenerating && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary absolute top-2 right-2" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={generateSelected}
        disabled={selected.size === 0 || !!generating || (!logo && !brandKit)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating {ASSET_OPTIONS.find(a => a.id === generating)?.label}...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate {selected.size} Asset{selected.size !== 1 ? "s" : ""}
          </>
        )}
      </button>

      {/* Generated assets gallery */}
      <AnimatePresence>
        {hasAnyAsset && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Generated Assets</span>
              <span className="text-[10px] text-muted-foreground">({Object.keys(assets).length})</span>
            </div>
            <div className="space-y-3">
              {Object.entries(assets).map(([type, asset]) => {
                const option = ASSET_OPTIONS.find(a => a.id === type);
                return (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="border border-border rounded-xl overflow-hidden bg-background"
                  >
                    <div className="relative">
                      <img
                        src={asset.imageData}
                        alt={option?.label || type}
                        className="w-full object-contain max-h-64 bg-[hsl(var(--ide-panel))]"
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 border-t border-border">
                      <div>
                        <span className="text-xs font-medium text-foreground">{option?.label}</span>
                        {asset.storedUrl && (
                          <span className="text-[9px] ml-2 text-muted-foreground">Saved to storage</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => generateAsset(type)}
                          disabled={!!generating}
                          className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                          title="Regenerate"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => downloadAsset(asset)}
                          className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MarketingMaterials;
