import { useState, useEffect, useCallback } from "react";
import {
  Mail, Plus, Loader2, Save, Trash2, X, Send, Settings, ScrollText,
  Code, FileText, CheckCircle, XCircle, Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

type Tab = "templates" | "config" | "logs";

const PROVIDERS = [
  { id: "mock", label: "Mock / Log Only", desc: "Emails are logged but not sent. Great for development." },
  { id: "resend", label: "Resend", desc: "Modern email API with generous free tier (100 emails/day)." },
  { id: "smtp", label: "SMTP Generic", desc: "Use any SMTP server (Gmail, Mailgun, etc.)." },
];

const DEFAULT_TEMPLATE_HTML = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333;">{{title}}</h1>
  <p style="color: #555; line-height: 1.6;">{{body}}</p>
  <p style="color: #999; font-size: 12px; margin-top: 30px;">Sent from your app</p>
</body>
</html>`;

const CloudEmail = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({ provider: "mock", from_name: "", from_email: "", config: {} });
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newHtml, setNewHtml] = useState(DEFAULT_TEMPLATE_HTML);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  // Config form state
  const [configProvider, setConfigProvider] = useState("mock");
  const [configFromName, setConfigFromName] = useState("");
  const [configFromEmail, setConfigFromEmail] = useState("");
  const [configApiKey, setConfigApiKey] = useState("");
  const [configSmtpHost, setConfigSmtpHost] = useState("");
  const [configSmtpPort, setConfigSmtpPort] = useState("587");
  const [configSmtpUser, setConfigSmtpUser] = useState("");
  const [configSmtpPass, setConfigSmtpPass] = useState("");

  const fetchTemplates = useCallback(async () => {
    if (!currentProject) return;
    const { data } = await supabase
      .from("project_email_templates")
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false });
    setTemplates(data || []);
  }, [currentProject]);

  const fetchConfig = useCallback(async () => {
    if (!currentProject) return;
    const { data } = await supabase
      .from("project_email_config")
      .select("*")
      .eq("project_id", currentProject.id)
      .single();
    if (data) {
      setConfig(data);
      setConfigProvider(data.provider);
      setConfigFromName(data.from_name || "");
      setConfigFromEmail(data.from_email || "");
      const cfg = (data.config as any) || {};
      setConfigApiKey(cfg.api_key || "");
      setConfigSmtpHost(cfg.host || "");
      setConfigSmtpPort(String(cfg.port || "587"));
      setConfigSmtpUser(cfg.username || "");
      setConfigSmtpPass(cfg.password || "");
    }
  }, [currentProject]);

  const fetchLogs = useCallback(async () => {
    if (!currentProject) return;
    const { data } = await supabase
      .from("project_email_log")
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(data || []);
  }, [currentProject]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTemplates(), fetchConfig(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchTemplates, fetchConfig, fetchLogs]);

  const handleCreateTemplate = async () => {
    if (!newName.trim() || !currentProject) return;
    const { error } = await supabase
      .from("project_email_templates")
      .insert({
        project_id: currentProject.id,
        name: newName.trim(),
        subject: newSubject || "{{title}}",
        html_body: newHtml,
        text_body: "",
        variables: ["title", "body"],
      });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Created", description: `Template "${newName}" created` });
    setNewName(""); setNewSubject(""); setNewHtml(DEFAULT_TEMPLATE_HTML); setShowCreate(false);
    fetchTemplates();
  };

  const handleDeleteTemplate = async (id: string) => {
    await supabase.from("project_email_templates").delete().eq("id", id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleSaveConfig = async () => {
    if (!currentProject) return;
    setSaving(true);
    const providerConfig: any = {};
    if (configProvider === "resend") providerConfig.api_key = configApiKey;
    if (configProvider === "smtp") {
      providerConfig.host = configSmtpHost;
      providerConfig.port = parseInt(configSmtpPort);
      providerConfig.username = configSmtpUser;
      providerConfig.password = configSmtpPass;
    }

    const payload = {
      project_id: currentProject.id,
      provider: configProvider,
      from_name: configFromName,
      from_email: configFromEmail,
      config: providerConfig,
      updated_at: new Date().toISOString(),
    };

    const { error } = config?.id
      ? await supabase.from("project_email_config").update(payload).eq("id", config.id)
      : await supabase.from("project_email_config").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Email configuration updated" });
      fetchConfig();
    }
    setSaving(false);
  };

  const handleTestSend = async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("project-email", {
        body: {
          project_id: currentProject.id,
          action: "send",
          to: configFromEmail || "test@example.com",
          subject: "Test email from Phoenix Builder",
          html: "<h1>It works!</h1><p>Your email service is configured correctly.</p>",
          text: "It works! Your email service is configured correctly.",
        },
      });
      if (error) throw error;
      toast({ title: "Test sent!", description: `Provider: ${configProvider}` });
      fetchLogs();
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const statusIcon = (status: string) => {
    if (status === "sent") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    return <Clock className="w-3.5 h-3.5 text-amber-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Email Service</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium uppercase">
              {configProvider}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {([
            { id: "templates" as Tab, icon: FileText, label: "Templates" },
            { id: "config" as Tab, icon: Settings, label: "Configuration" },
            { id: "logs" as Tab, icon: ScrollText, label: "Send Log" },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* ---- Templates Tab ---- */}
        {tab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Create email templates with <code className="text-primary">{`{{variable}}`}</code> placeholders.
              </p>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showCreate ? "Cancel" : "New Template"}
              </button>
            </div>

            {showCreate && (
              <div className="p-4 rounded-lg border border-border bg-secondary/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Template Name</label>
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="contact-form"
                      className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Subject Line</label>
                    <input
                      value={newSubject}
                      onChange={e => setNewSubject(e.target.value)}
                      placeholder="New message from {{name}}"
                      className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">HTML Body</label>
                  <textarea
                    value={newHtml}
                    onChange={e => setNewHtml(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    className="w-full mt-1 bg-secondary text-xs text-foreground font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30 outline-none resize-none"
                  />
                </div>
                <button
                  onClick={handleCreateTemplate}
                  disabled={!newName.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> Create Template
                </button>
              </div>
            )}

            {templates.length === 0 && !showCreate ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Mail className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No email templates yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Create templates for contact forms, notifications, and more
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Code className="w-4 h-4 text-primary/70" />
                      <div>
                        <p className="text-xs font-medium text-foreground font-mono">{tpl.name}</p>
                        <p className="text-[10px] text-muted-foreground">Subject: {tpl.subject}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Config Tab ---- */}
        {tab === "config" && (
          <div className="space-y-6 max-w-lg">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Email Provider</label>
              <div className="mt-2 space-y-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setConfigProvider(p.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      configProvider === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/20"
                    }`}
                  >
                    <p className="text-xs font-medium text-foreground">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">From Name</label>
                <input
                  value={configFromName}
                  onChange={e => setConfigFromName(e.target.value)}
                  placeholder="My App"
                  className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">From Email</label>
                <input
                  value={configFromEmail}
                  onChange={e => setConfigFromEmail(e.target.value)}
                  placeholder="noreply@myapp.com"
                  className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                />
              </div>
            </div>

            {configProvider === "resend" && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Resend API Key</label>
                <input
                  type="password"
                  value={configApiKey}
                  onChange={e => setConfigApiKey(e.target.value)}
                  placeholder="re_xxxxxxxxxx"
                  className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Get your API key at{" "}
                  <a href="https://resend.com/api-keys" target="_blank" rel="noopener" className="text-primary hover:underline">
                    resend.com/api-keys
                  </a>
                </p>
              </div>
            )}

            {configProvider === "smtp" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">SMTP Host</label>
                    <input
                      value={configSmtpHost}
                      onChange={e => setConfigSmtpHost(e.target.value)}
                      placeholder="smtp.gmail.com"
                      className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Port</label>
                    <input
                      value={configSmtpPort}
                      onChange={e => setConfigSmtpPort(e.target.value)}
                      placeholder="587"
                      className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Username</label>
                    <input
                      value={configSmtpUser}
                      onChange={e => setConfigSmtpUser(e.target.value)}
                      placeholder="user@gmail.com"
                      className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      value={configSmtpPass}
                      onChange={e => setConfigSmtpPass(e.target.value)}
                      placeholder="••••••"
                      className="w-full mt-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground/40 outline-none font-mono px-2.5 py-1.5 rounded border border-border focus:border-primary/30"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Configuration
              </button>
              <button
                onClick={handleTestSend}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors border border-border"
              >
                <Send className="w-3.5 h-3.5" />
                Send Test
              </button>
            </div>
          </div>
        )}

        {/* ---- Logs Tab ---- */}
        {tab === "logs" && (
          <div>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ScrollText className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No emails sent yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Send logs will appear here</p>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map(log => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {statusIcon(log.status)}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {log.to_email}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {log.subject} · {log.template_name} · {log.provider}
                        </p>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-3">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudEmail;
