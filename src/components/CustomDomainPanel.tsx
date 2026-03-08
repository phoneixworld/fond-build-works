import { useState } from "react";
import { Globe, Check, Loader2, Trash2, AlertCircle, Shield, RefreshCw, ExternalLink, Copy, ArrowRight } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  verified: boolean;
}

interface ZoneConfig {
  domain: string;
  zoneId: string;
  status: "pending" | "verifying" | "active" | "failed";
  sslMode: string;
  nameservers: string[];
  dnsRecords: DnsRecord[];
  addedAt: string | null;
}

const CustomDomainPanel = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [domainInput, setDomainInput] = useState("");
  const [cfTokenInput, setCfTokenInput] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [config, setConfig] = useState<ZoneConfig>({
    domain: "",
    zoneId: "",
    status: "pending",
    sslMode: "off",
    nameservers: [],
    dnsRecords: [],
    addedAt: null,
  });

  const callCloudflare = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("cloudflare-dns", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleAddDomain = async () => {
    const domain = domainInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!domain || !domain.includes(".")) {
      toast({ title: "Enter a valid domain", description: "e.g. myapp.com", variant: "destructive" });
      return;
    }
    if (!cfTokenInput.trim()) {
      toast({ title: "Cloudflare API token required", description: "Enter a token with Zone:Edit permissions.", variant: "destructive" });
      return;
    }

    setAdding(true);
    try {
      // Verify token
      await callCloudflare({ action: "verify", cfToken: cfTokenInput });

      // Check if zone exists
      const zonesData = await callCloudflare({ action: "list-zones", cfToken: cfTokenInput, domain });
      
      let zone;
      if (zonesData.zones && zonesData.zones.length > 0) {
        zone = zonesData.zones[0];
      } else {
        // Add zone
        const addData = await callCloudflare({ action: "add-zone", cfToken: cfTokenInput, domain });
        zone = addData.zone;
      }

      // Enable full SSL
      await callCloudflare({ action: "set-ssl", cfToken: cfTokenInput, zoneId: zone.id });

      // Get DNS records
      const recordsData = await callCloudflare({ action: "list-records", cfToken: cfTokenInput, zoneId: zone.id });

      setCfToken(cfTokenInput);
      setConfig({
        domain,
        zoneId: zone.id,
        status: zone.status === "active" ? "active" : "verifying",
        sslMode: "full",
        nameservers: zone.nameservers || [],
        dnsRecords: (recordsData.records || []).map((r: any) => ({
          type: r.type,
          name: r.name,
          value: r.content,
          verified: true,
        })),
        addedAt: new Date().toISOString(),
      });

      toast({ title: "Domain added! 🎉", description: zone.status === "active" ? "Zone is active!" : "Update your nameservers to activate." });
    } catch (err: any) {
      toast({ title: "Failed to add domain", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleAddDnsRecord = async () => {
    if (!config.zoneId || !cfToken) return;
    
    try {
      // Add an A record pointing to app hosting
      const slug = (currentProject as any)?.published_slug;
      if (!slug) {
        toast({ title: "Publish your app first", description: "You need to publish before adding DNS records.", variant: "destructive" });
        return;
      }

      await callCloudflare({
        action: "create-record",
        cfToken,
        zoneId: config.zoneId,
        recordType: "CNAME",
        recordName: config.domain,
        recordValue: `${import.meta.env.VITE_SUPABASE_PROJECT_ID || "oyjwexbyxggotuuxxisq"}.supabase.co`,
        proxied: true,
      });

      toast({ title: "DNS record added!", description: "CNAME record pointing to your app's hosting." });
      
      // Refresh records
      const recordsData = await callCloudflare({ action: "list-records", cfToken, zoneId: config.zoneId });
      setConfig(prev => ({
        ...prev,
        dnsRecords: (recordsData.records || []).map((r: any) => ({
          type: r.type, name: r.name, value: r.content, verified: true,
        })),
      }));
    } catch (err: any) {
      toast({ title: "Failed to add record", description: err.message, variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    setChecking(true);
    try {
      // DNS lookup
      const dnsData = await callCloudflare({ action: "dns-lookup", cfToken, domain: config.domain });
      
      // Check zone status
      const zonesData = await callCloudflare({ action: "list-zones", cfToken, domain: config.domain });
      const zone = zonesData.zones?.[0];

      // Check SSL
      const sslData = await callCloudflare({ action: "ssl-status", cfToken, zoneId: config.zoneId });

      const isActive = zone?.status === "active";
      setConfig(prev => ({
        ...prev,
        status: isActive ? "active" : "verifying",
        sslMode: sslData.ssl?.mode || prev.sslMode,
      }));

      if (isActive) {
        toast({ title: "Domain is active! 🎉", description: "SSL is provisioned. Your app is live!" });
      } else {
        toast({
          title: "Still pending",
          description: `DNS has ${dnsData.dns?.a_records?.length || 0} A records. Update nameservers to: ${config.nameservers.join(", ")}`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const handleRemove = () => {
    setConfig({ domain: "", zoneId: "", status: "pending", sslMode: "off", nameservers: [], dnsRecords: [], addedAt: null });
    setDomainInput("");
    setCfTokenInput("");
    setCfToken("");
    toast({ title: "Domain removed" });
  };

  const statusColors: Record<string, string> = {
    pending: "text-muted-foreground",
    verifying: "text-yellow-500",
    active: "text-[hsl(var(--ide-success))]",
    failed: "text-destructive",
  };

  const statusLabels: Record<string, string> = {
    pending: "Not configured",
    verifying: "Verifying...",
    active: "Active ✓",
    failed: "Failed",
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Globe className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Custom Domain</h2>
            <p className="text-[10px] text-muted-foreground">
              {config.domain || "Point your own domain via Cloudflare"}
            </p>
          </div>
          {config.domain && (
            <span className={`ml-auto text-[10px] font-medium ${statusColors[config.status]}`}>
              {statusLabels[config.status]}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {!config.domain ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">
                Cloudflare API Token
                <span className="text-muted-foreground font-normal ml-1">(Zone:Edit)</span>
              </label>
              <input
                type="password"
                value={cfTokenInput}
                onChange={(e) => setCfTokenInput(e.target.value)}
                placeholder="Your Cloudflare API token"
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Create at Cloudflare → My Profile → API Tokens → Create Token
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Your Domain</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="myapp.com"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                />
                <button
                  onClick={handleAddDomain}
                  disabled={adding}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Add
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Real Cloudflare integration:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Add your domain to Cloudflare</li>
                    <li>Cloudflare provides nameservers</li>
                    <li>Update nameservers at your registrar</li>
                    <li>SSL is auto-provisioned via Cloudflare</li>
                    <li>DNS records are managed here</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Domain status */}
            <div className="p-3 rounded-xl bg-secondary border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground">{config.domain}</span>
                <div className="flex items-center gap-1.5">
                  {config.sslMode !== "off" && (
                    <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--ide-success))]">
                      <Shield className="w-3 h-3" /> SSL ({config.sslMode})
                    </span>
                  )}
                </div>
              </div>
              {config.addedAt && (
                <p className="text-[10px] text-muted-foreground">Added {new Date(config.addedAt).toLocaleDateString()}</p>
              )}
            </div>

            {/* Nameservers */}
            {config.nameservers.length > 0 && config.status !== "active" && (
              <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <p className="text-[11px] font-semibold text-foreground mb-2">⚠️ Update your nameservers</p>
                <p className="text-[10px] text-muted-foreground mb-2">Set these at your domain registrar:</p>
                {config.nameservers.map((ns, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <code className="text-[10px] text-foreground font-mono flex-1">{ns}</code>
                    <button onClick={() => handleCopy(ns, `ns-${i}`)} className="text-muted-foreground hover:text-foreground">
                      {copied === `ns-${i}` ? <Check className="w-3 h-3 text-[hsl(var(--ide-success))]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* DNS Records */}
            {config.dnsRecords.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">DNS Records</h3>
                <div className="space-y-1.5">
                  {config.dnsRecords.slice(0, 10).map((record, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{record.type}</span>
                      <span className="text-[10px] text-foreground truncate flex-1">{record.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{record.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add app DNS record */}
            <button
              onClick={handleAddDnsRecord}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border border-primary/20 text-primary hover:bg-primary/5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" /> Auto-configure DNS for this app
            </button>

            {/* Verify */}
            {config.status !== "active" && (
              <button
                onClick={handleVerify}
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {checking ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" /> Verify Domain</>
                )}
              </button>
            )}

            {/* Active */}
            {config.status === "active" && (
              <div className="p-3 rounded-xl bg-[hsl(var(--ide-success))]/10 border border-[hsl(var(--ide-success))]/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--ide-success))]" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Domain is live! 🚀</p>
                    <p className="text-[10px] text-muted-foreground">SSL active via Cloudflare</p>
                  </div>
                </div>
                <a href={`https://${config.domain}`} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline">
                  https://{config.domain} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <button onClick={handleRemove} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Remove Domain
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomDomainPanel;
