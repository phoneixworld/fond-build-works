import { useState } from "react";
import { Globe, Check, Loader2, Trash2, AlertCircle, Shield, RefreshCw, ExternalLink, Copy, ArrowRight } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

interface DomainConfig {
  domain: string;
  status: "pending" | "verifying" | "active" | "failed";
  sslStatus: "none" | "provisioning" | "active";
  dnsRecords: { type: string; name: string; value: string; verified: boolean }[];
  addedAt: string | null;
}

const CustomDomainPanel = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [domainInput, setDomainInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [config, setConfig] = useState<DomainConfig>({
    domain: "",
    status: "pending",
    sslStatus: "none",
    dnsRecords: [],
    addedAt: null,
  });

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

    setAdding(true);
    await new Promise(r => setTimeout(r, 1500));

    const verifyToken = `app-verify=${Math.random().toString(36).slice(2, 14)}`;
    
    setConfig({
      domain,
      status: "verifying",
      sslStatus: "none",
      dnsRecords: [
        { type: "A", name: "@", value: "76.76.21.21", verified: false },
        { type: "A", name: "www", value: "76.76.21.21", verified: false },
        { type: "TXT", name: "_verify", value: verifyToken, verified: false },
        { type: "CNAME", name: "www", value: `${domain}.cdn.app`, verified: false },
      ],
      addedAt: new Date().toISOString(),
    });
    setAdding(false);
    toast({ title: "Domain added!", description: "Configure DNS records to verify ownership." });
  };

  const handleVerify = async () => {
    setChecking(true);
    await new Promise(r => setTimeout(r, 2500));

    // Simulate verification (randomly succeed or keep verifying for demo)
    const success = Math.random() > 0.3;
    
    if (success) {
      setConfig(prev => ({
        ...prev,
        status: "active",
        sslStatus: "active",
        dnsRecords: prev.dnsRecords.map(r => ({ ...r, verified: true })),
      }));
      toast({ title: "Domain verified! 🎉", description: "SSL certificate provisioned. Your app is live!" });
    } else {
      setConfig(prev => ({
        ...prev,
        status: "verifying",
        dnsRecords: prev.dnsRecords.map((r, i) => ({ ...r, verified: i < 2 })),
      }));
      toast({ title: "Still verifying", description: "Some DNS records not found yet. This can take up to 48 hours.", variant: "destructive" });
    }
    setChecking(false);
  };

  const handleRemove = () => {
    setConfig({ domain: "", status: "pending", sslStatus: "none", dnsRecords: [], addedAt: null });
    setDomainInput("");
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
    verifying: "Verifying DNS...",
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
              {config.domain ? config.domain : "Point your own domain to this app"}
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
            {/* Add domain */}
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

            {/* Default URL */}
            {currentProject && (
              <div className="p-3 rounded-xl bg-secondary border border-border">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Current URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-[11px] text-foreground font-mono truncate flex-1">
                    {(currentProject as any).published_slug 
                      ? `your-cdn.app/published/${(currentProject as any).published_slug}/index.html`
                      : "Not published yet"}
                  </code>
                  {(currentProject as any).published_slug && (
                    <button onClick={() => handleCopy(`your-cdn.app/published/${(currentProject as any).published_slug}`, "url")} className="text-muted-foreground hover:text-foreground">
                      {copied === "url" ? <Check className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How it works:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Enter your domain name above</li>
                    <li>Add DNS records at your registrar (GoDaddy, Namecheap, etc.)</li>
                    <li>We verify ownership and provision SSL</li>
                    <li>Your app is live at your custom domain! 🚀</li>
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
                  {config.sslStatus === "active" && (
                    <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--ide-success))]">
                      <Shield className="w-3 h-3" />
                      SSL
                    </span>
                  )}
                  <span className={`text-[10px] font-medium ${statusColors[config.status]}`}>
                    {statusLabels[config.status]}
                  </span>
                </div>
              </div>
              {config.addedAt && (
                <p className="text-[10px] text-muted-foreground">
                  Added {new Date(config.addedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* DNS Records */}
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">DNS Records</h3>
              <p className="text-[10px] text-muted-foreground mb-3">Add these records at your domain registrar:</p>
              
              <div className="space-y-2">
                {config.dnsRecords.map((record, i) => (
                  <div key={i} className="p-2.5 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{record.type}</span>
                        <span className="text-[11px] font-medium text-foreground">{record.name}</span>
                      </div>
                      {record.verified ? (
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />
                      ) : (
                        <span className="text-[9px] text-yellow-500">Pending</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] text-muted-foreground font-mono truncate flex-1">{record.value}</code>
                      <button
                        onClick={() => handleCopy(record.value, `record-${i}`)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        {copied === `record-${i}` ? (
                          <Check className="w-3 h-3 text-[hsl(var(--ide-success))]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verify button */}
            {config.status !== "active" && (
              <button
                onClick={handleVerify}
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {checking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking DNS...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Verify DNS Records
                  </>
                )}
              </button>
            )}

            {/* Active success */}
            {config.status === "active" && (
              <div className="p-3 rounded-xl bg-[hsl(var(--ide-success))]/10 border border-[hsl(var(--ide-success))]/20">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--ide-success))]" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Domain is live!</p>
                    <p className="text-[10px] text-muted-foreground">SSL certificate active. Your app is accessible at:</p>
                  </div>
                </div>
                <a
                  href={`https://${config.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  https://{config.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Remove */}
            <button
              onClick={handleRemove}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Domain
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomDomainPanel;
