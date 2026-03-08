import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CF_API = "https://api.cloudflare.com/client/v4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, cfToken, zoneId, domain, recordType, recordName, recordValue, proxied } = await req.json();

    if (!cfToken) {
      return new Response(JSON.stringify({ error: "Cloudflare API token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = {
      Authorization: `Bearer ${cfToken}`,
      "Content-Type": "application/json",
    };

    // Verify token
    if (action === "verify") {
      const res = await fetch(`${CF_API}/user/tokens/verify`, { headers });
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: `Invalid Cloudflare token [${res.status}]: ${err}` }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, status: data.result?.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List zones (domains)
    if (action === "list-zones") {
      const url = domain
        ? `${CF_API}/zones?name=${encodeURIComponent(domain)}`
        : `${CF_API}/zones?per_page=50`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: `Failed to list zones [${res.status}]: ${err}` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify({
        success: true,
        zones: data.result.map((z: any) => ({
          id: z.id,
          name: z.name,
          status: z.status,
          nameservers: z.name_servers,
          ssl_status: z.ssl?.status || "unknown",
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add zone (domain)
    if (action === "add-zone") {
      if (!domain) {
        return new Response(JSON.stringify({ error: "Domain is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${CF_API}/zones`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: domain, type: "full" }),
      });
      const data = await res.json();
      if (!data.success) {
        return new Response(JSON.stringify({ error: `Failed to add zone: ${data.errors?.[0]?.message || "Unknown error"}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        success: true,
        zone: {
          id: data.result.id,
          name: data.result.name,
          status: data.result.status,
          nameservers: data.result.name_servers,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List DNS records
    if (action === "list-records") {
      if (!zoneId) {
        return new Response(JSON.stringify({ error: "Zone ID is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records?per_page=100`, { headers });
      const data = await res.json();
      return new Response(JSON.stringify({
        success: true,
        records: data.result.map((r: any) => ({
          id: r.id,
          type: r.type,
          name: r.name,
          content: r.content,
          proxied: r.proxied,
          ttl: r.ttl,
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create DNS record
    if (action === "create-record") {
      if (!zoneId || !recordType || !recordName || !recordValue) {
        return new Response(JSON.stringify({ error: "zoneId, recordType, recordName, and recordValue are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: recordType,
          name: recordName,
          content: recordValue,
          proxied: proxied ?? (recordType === "A" || recordType === "CNAME"),
          ttl: 1, // auto
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return new Response(JSON.stringify({ error: `Failed to create record: ${data.errors?.[0]?.message || "Unknown"}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, record: data.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check SSL status
    if (action === "ssl-status") {
      if (!zoneId) {
        return new Response(JSON.stringify({ error: "Zone ID is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${CF_API}/zones/${zoneId}/ssl/verification`, { headers });
      const data = await res.json();
      
      // Also get SSL settings
      const settingsRes = await fetch(`${CF_API}/zones/${zoneId}/settings/ssl`, { headers });
      const settingsData = await settingsRes.json();

      return new Response(JSON.stringify({
        success: true,
        ssl: {
          mode: settingsData.result?.value || "off",
          verification: data.result,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set SSL mode
    if (action === "set-ssl") {
      if (!zoneId) {
        return new Response(JSON.stringify({ error: "Zone ID is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${CF_API}/zones/${zoneId}/settings/ssl`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ value: "full" }),
      });
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, ssl_mode: data.result?.value }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DNS lookup (verify records exist without Cloudflare — uses public DNS)
    if (action === "dns-lookup") {
      if (!domain) {
        return new Response(JSON.stringify({ error: "Domain is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use Cloudflare's public DNS-over-HTTPS
      const lookups = await Promise.all([
        fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, { headers: { Accept: "application/dns-json" } }).then(r => r.json()),
        fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=CNAME`, { headers: { Accept: "application/dns-json" } }).then(r => r.json()),
        fetch(`https://cloudflare-dns.com/dns-query?name=_verify.${domain}&type=TXT`, { headers: { Accept: "application/dns-json" } }).then(r => r.json()),
      ]);

      return new Response(JSON.stringify({
        success: true,
        dns: {
          a_records: lookups[0].Answer?.map((a: any) => a.data) || [],
          cname_records: lookups[1].Answer?.map((a: any) => a.data) || [],
          txt_records: lookups[2].Answer?.map((a: any) => a.data) || [],
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Cloudflare edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
