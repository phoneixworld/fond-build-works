import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewPane,
} from "@codesandbox/sandpack-react";

const SANDPACK_MARKER = "<!--SANDPACK_JSON-->";

// ─── Same boilerplate used by the in-app SandpackPreview ───────────────────
const INDEX_JS = `import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

const DEFAULT_STYLES = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const DEFAULT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

const DEFAULT_APP = `import React from "react";
export default function App() {
  return <div className="p-8"><h1>App</h1></div>;
}
`;

function buildFiles(raw: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {
    "/index.js": INDEX_JS,
    "/styles.css": DEFAULT_STYLES,
    "/public/index.html": DEFAULT_INDEX_HTML,
  };

  for (const [path, code] of Object.entries(raw)) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const sandpackPath = normalized.replace(/\.tsx?$/, ".js");
    base[sandpackPath] = code;
  }

  // Check for App entry in root or src/
  const hasAnyAppEntry = [
    "/App.js", "/App.jsx", "/src/App.js", "/src/App.jsx",
  ].some(p => p in base);

  if (!hasAnyAppEntry) {
    // Check if it's under src/ and update index.js import
    const srcApp = Object.keys(base).find(p => /^\/src\/App\.(js|jsx)$/.test(p));
    if (srcApp) {
      base["/index.js"] = INDEX_JS.replace('./App', `./src/App`);
    } else {
      base["/App.js"] = DEFAULT_APP;
    }
  }

  return base;
}

// ─── Component ─────────────────────────────────────────────────────────────
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
      return buildFiles(raw);
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
              "class-variance-authority": "^0.7.1",
              "date-fns": "^3.6.0",
              "recharts": "^2.12.0",
              "react-intersection-observer": "^9.10.0",
            },
          }}
          options={{
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
