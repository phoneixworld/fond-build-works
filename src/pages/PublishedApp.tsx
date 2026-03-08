import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const PublishedApp = () => {
  const { slug } = useParams<{ slug: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!slug) { setError("No app found"); setLoading(false); return; }

      const { data, error: err } = await supabase
        .from("projects")
        .select("html_content")
        .eq("published_slug", slug)
        .eq("is_published", true)
        .single();

      if (err || !data) {
        setError("App not found or not published");
      } else {
        setHtml(data.html_content);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !html) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">404</h1>
          <p className="text-muted-foreground">{error || "App not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      srcDoc={html}
      className="w-full h-screen border-0"
      title="Published App"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
};

export default PublishedApp;
