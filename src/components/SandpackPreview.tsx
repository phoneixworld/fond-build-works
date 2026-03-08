import { useMemo } from "react";
import {
  SandpackProvider,
  SandpackPreview as SandpackPreviewPane,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
import { usePreview, SandpackFileSet } from "@/contexts/PreviewContext";

const DEFAULT_APP = `import React from "react";

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">L</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome to Your App</h1>
        <p className="text-sm text-gray-500">Start building by chatting with the AI assistant</p>
      </div>
    </div>
  );
}
`;

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

function buildSandpackFiles(files: SandpackFileSet | null): Record<string, string> {
  const base: Record<string, string> = {
    "/index.js": INDEX_JS,
    "/styles.css": DEFAULT_STYLES,
    "/public/index.html": DEFAULT_INDEX_HTML,
  };

  if (!files || Object.keys(files).length === 0) {
    base["/App.js"] = DEFAULT_APP;
    return base;
  }

  // Map user files into sandpack paths
  for (const [path, code] of Object.entries(files)) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    // Convert .tsx to .js for sandpack (it handles JSX in .js)
    const sandpackPath = normalized.replace(/\.tsx?$/, ".js");
    base[sandpackPath] = code;
  }

  // Ensure /App.js exists
  if (!base["/App.js"] && !base["/App.jsx"]) {
    base["/App.js"] = DEFAULT_APP;
  }

  return base;
}

interface SandpackPreviewProps {
  viewport?: { width: string; maxWidth: string };
  showConsole?: boolean;
}

const SandpackPreview = ({ viewport, showConsole = false }: SandpackPreviewProps) => {
  const { sandpackFiles, sandpackDeps } = usePreview();

  const files = useMemo(() => buildSandpackFiles(sandpackFiles), [sandpackFiles]);

  const dependencies = useMemo(() => ({
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
    "date-fns": "^3.6.0",
    "recharts": "^2.12.0",
    "react-router-dom": "^6.22.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    ...sandpackDeps,
  }), [sandpackDeps]);

  return (
    <SandpackProvider
      template="react"
      theme="auto"
      files={files}
      customSetup={{
        dependencies,
      }}
      options={{
        externalResources: [
          "https://cdn.tailwindcss.com",
        ],
        recompileMode: "delayed",
        recompileDelay: 500,
      }}
    >
      <div className="h-full flex flex-col" style={viewport ? { width: viewport.width, maxWidth: viewport.maxWidth } : {}}>
        <SandpackPreviewPane
          showOpenInCodeSandbox={false}
          showRefreshButton={false}
          style={{ flex: 1, minHeight: 0 }}
        />
        {showConsole && (
          <div className="h-40 border-t border-border overflow-auto">
            <SandpackConsole />
          </div>
        )}
      </div>
    </SandpackProvider>
  );
};

export default SandpackPreview;
