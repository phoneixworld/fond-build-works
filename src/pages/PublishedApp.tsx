import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewPane,
} from "@codesandbox/sandpack-react";

const SANDPACK_MARKER = "<!--SANDPACK_JSON-->";

const PublishedApp = () => {
  const { slug } = useParams<{ slug: string }>();
  const [content, setContent] = useState<string | null>(null);
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
        setContent(data.html_content);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  const isSandpack = content?.startsWith(SANDPACK_MARKER);

  const sandpackFiles = useMemo(() => {
    if (!isSandpack || !content) return null;
    try {
      const json = content.slice(SANDPACK_MARKER.length);
      const raw = JSON.parse(json) as Record<string, string>;
      // Convert to Sandpack file format
      const files: Record<string, { code: string }> = {};
      for (const [path, code] of Object.entries(raw)) {
        files[path] = { code };
      }
      return files;
    } catch {
      return null;
    }
  }, [content, isSandpack]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">404</h1>
          <p className="text-muted-foreground">{error || "App not found"}</p>
        </div>
      </div>
    );
  }

  // Render Sandpack files using the real Sandpack bundler
  if (isSandpack && sandpackFiles) {
    return (
      <div className="h-screen w-screen">
        <SandpackProvider
          template="react"
          files={sandpackFiles}
          customSetup={{
            dependencies: {
              "react-router-dom": "^6.20.0",
              "framer-motion": "^11.0.0",
              "lucide-react": "^0.400.0",
              "clsx": "^2.1.0",
              "tailwind-merge": "^2.2.0",
            },
          }}
          options={{
            externalResources: ["https://cdn.tailwindcss.com"],
            bundlerTimeOut: 120000,
          }}
        >
          <SandpackPreviewPane
            showOpenInCodeSandbox={false}
            showRefreshButton={false}
            style={{ height: "100vh", width: "100vw" }}
          />
        </SandpackProvider>
      </div>
    );
  }

  // Fallback: render raw HTML in iframe
  return (
    <iframe
      srcDoc={content}
      className="w-full h-screen border-0"
      title="Published App"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      style={{ background: "#fff" }}
    />
  );
};

export default PublishedApp;
