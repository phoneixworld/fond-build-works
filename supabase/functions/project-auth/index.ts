import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple hash for demo — in production use bcrypt via a Deno module
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "project-auth-salt-v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(userId: string, projectId: string): string {
  const payload = { uid: userId, pid: projectId, exp: Date.now() + 86400000 }; // 24h
  return btoa(JSON.stringify(payload));
}

function verifyToken(token: string): { uid: string; pid: string } | null {
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) return null;
    return { uid: payload.uid, pid: payload.pid };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { project_id, action, email, password, display_name, name, token } = body;

    if (!project_id || !action) {
      return new Response(JSON.stringify({ error: "project_id and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "signup": {
        if (!email || !password) throw new Error("email and password required");
        const hash = await hashPassword(password);
        const { data: user, error } = await supabase
          .from("project_users")
          .insert({ project_id, email: email.toLowerCase(), password_hash: hash, display_name: display_name || name || email.split("@")[0] })
          .select("id, email, display_name, created_at")
          .single();
        if (error) {
          if (error.code === "23505") throw new Error("Email already registered");
          throw error;
        }
        const tk = generateToken(user.id, project_id);
        return new Response(JSON.stringify({ user, token: tk }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "login": {
        if (!email || !password) throw new Error("email and password required");
        const hash = await hashPassword(password);
        const { data: user, error } = await supabase
          .from("project_users")
          .select("id, email, display_name, created_at")
          .eq("project_id", project_id)
          .eq("email", email.toLowerCase())
          .eq("password_hash", hash)
          .single();
        if (error || !user) throw new Error("Invalid email or password");
        const tk = generateToken(user.id, project_id);
        return new Response(JSON.stringify({ user, token: tk }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "me": {
        if (!token) {
          return new Response(JSON.stringify({ error: "No token provided" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const session = verifyToken(token);
        if (!session || session.pid !== project_id) {
          return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: user, error } = await supabase
          .from("project_users")
          .select("id, email, display_name, metadata, created_at")
          .eq("id", session.uid)
          .single();
        if (error || !user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ user }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("project-auth error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
