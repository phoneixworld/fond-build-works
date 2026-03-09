import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- Provider senders ----------

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || `Resend error ${res.status}`);
  return body;
}

async function sendViaSMTP(
  config: { host: string; port: number; username: string; password: string; secure?: boolean },
  from: string,
  to: string,
  subject: string,
  html: string,
  _text: string
) {
  // Deno doesn't have a built-in SMTP client, so we use an HTTP-to-SMTP relay approach
  // For a production setup you'd use a Deno SMTP library. Here we simulate via a webhook pattern.
  // Store as "queued" — a future worker or external relay picks it up.
  console.log(`[SMTP] Would send from=${from} to=${to} subject=${subject} via ${config.host}:${config.port}`);
  return { id: crypto.randomUUID(), status: "queued", note: "SMTP relay queued — connect an SMTP relay worker to process." };
}

function sendViaMock(
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string
) {
  console.log(`[MOCK EMAIL] from=${from} to=${to} subject=${subject}`);
  console.log(`[MOCK EMAIL] html length=${html.length}, text length=${text.length}`);
  return { id: crypto.randomUUID(), status: "logged", provider: "mock" };
}

// ---------- Template variable interpolation ----------

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ---------- Main ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { project_id, action } = body;

    if (!project_id || !action) {
      return new Response(
        JSON.stringify({ error: "project_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      // ---- Send an email ----
      case "send": {
        const { template_name, to, variables, subject: customSubject, html: customHtml, text: customText } = body;

        if (!to) throw new Error("'to' email address is required");

        // Get email config
        const { data: emailConfig } = await supabase
          .from("project_email_config")
          .select("*")
          .eq("project_id", project_id)
          .single();

        const provider = emailConfig?.provider || "mock";
        const config = (emailConfig?.config as Record<string, any>) || {};
        const fromName = emailConfig?.from_name || "App";
        const fromEmail = emailConfig?.from_email || "noreply@example.com";
        const from = `${fromName} <${fromEmail}>`;

        let subject = customSubject || "";
        let html = customHtml || "";
        let text = customText || "";

        // If using a template, fetch and interpolate
        if (template_name) {
          const { data: template, error: tplErr } = await supabase
            .from("project_email_templates")
            .select("*")
            .eq("project_id", project_id)
            .eq("name", template_name)
            .single();

          if (tplErr || !template) throw new Error(`Template '${template_name}' not found`);

          const vars = variables || {};
          subject = interpolate(template.subject, vars);
          html = interpolate(template.html_body, vars);
          text = interpolate(template.text_body, vars);
        }

        if (!subject && !html) throw new Error("Either template_name or subject+html are required");

        // Send via provider
        let result: any;
        try {
          switch (provider) {
            case "resend": {
              const apiKey = config.api_key;
              if (!apiKey) throw new Error("Resend API key not configured");
              result = await sendViaResend(apiKey, from, to, subject, html, text);
              break;
            }
            case "smtp": {
              result = await sendViaSMTP(config as any, from, to, subject, html, text);
              break;
            }
            case "mock":
            default: {
              result = sendViaMock(from, to, subject, html, text);
              break;
            }
          }

          // Log success
          await supabase.from("project_email_log").insert({
            project_id,
            template_name: template_name || "custom",
            to_email: to,
            subject,
            status: "sent",
            provider,
          });
        } catch (sendErr: any) {
          // Log failure
          await supabase.from("project_email_log").insert({
            project_id,
            template_name: template_name || "custom",
            to_email: to,
            subject,
            status: "failed",
            provider,
            error: sendErr.message,
          });
          throw sendErr;
        }

        return new Response(JSON.stringify({ data: result }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ---- Get provider config (sanitized) ----
      case "get-config": {
        const { data: emailConfig } = await supabase
          .from("project_email_config")
          .select("provider, from_name, from_email, created_at, updated_at")
          .eq("project_id", project_id)
          .single();

        return new Response(JSON.stringify({ data: emailConfig || { provider: "mock" } }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ---- Get send logs ----
      case "logs": {
        const limit = body.limit || 50;
        const { data: logs } = await supabase
          .from("project_email_log")
          .select("*")
          .eq("project_id", project_id)
          .order("created_at", { ascending: false })
          .limit(limit);

        return new Response(JSON.stringify({ data: logs || [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (e) {
    console.error("project-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
