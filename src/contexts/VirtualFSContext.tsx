import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

export interface VirtualFile {
  path: string;
  content: string;
  language: string;
}

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
}

interface VirtualFSContextType {
  files: Record<string, VirtualFile>;
  fileTree: FileNode[];
  setFiles: (files: Record<string, VirtualFile>) => void;
  updateFile: (path: string, content: string) => void;
  addFile: (path: string, content: string) => void;
  removeFile: (path: string) => void;
  getFile: (path: string) => VirtualFile | null;
  activeFile: string;
  setActiveFile: (path: string) => void;
}

const VirtualFSContext = createContext<VirtualFSContextType | null>(null);

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    tsx: "typescript", ts: "typescript", jsx: "javascript", js: "javascript",
    css: "css", html: "html", json: "json", md: "markdown", svg: "svg",
    py: "python", go: "go", rs: "rust", rb: "ruby", java: "java",
    sh: "bash", bash: "bash", yml: "yaml", yaml: "yaml", toml: "toml",
    sql: "sql", graphql: "graphql", dockerfile: "dockerfile",
    mod: "go", sum: "text", txt: "text", env: "text",
    gitignore: "text", dockerignore: "text",
  };
  // Handle files like "Dockerfile" or "Makefile" with no extension
  const filename = path.split("/").pop()?.toLowerCase() || "";
  if (filename === "dockerfile") return "dockerfile";
  if (filename === "makefile") return "makefile";
  if (filename.startsWith("requirements")) return "text";
  return map[ext] || "text";
}

function buildTree(files: Record<string, VirtualFile>): FileNode[] {
  const root: FileNode[] = [];
  const paths = Object.keys(files).sort();

  for (const path of paths) {
    const parts = path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;

      let existing = current.find(n => n.name === name);
      if (!existing) {
        existing = {
          name,
          type: isFile ? "file" : "folder",
          path: fullPath,
          children: isFile ? undefined : [],
        };
        // Insert folders first, then files, alphabetically
        if (isFile) {
          current.push(existing);
        } else {
          const firstFileIdx = current.findIndex(n => n.type === "file");
          if (firstFileIdx === -1) current.push(existing);
          else current.splice(firstFileIdx, 0, existing);
        }
      }
      if (!isFile && existing.children) {
        current = existing.children;
      }
    }
  }
  return root;
}

export const VirtualFSProvider = ({ children }: { children: ReactNode }) => {
  const [files, setFilesState] = useState<Record<string, VirtualFile>>({});
  const [activeFile, setActiveFile] = useState("src/App.tsx");

  const setFiles = useCallback((newFiles: Record<string, VirtualFile>) => {
    setFilesState(newFiles);
  }, []);

  const updateFile = useCallback((path: string, content: string) => {
    setFilesState(prev => ({
      ...prev,
      [path]: { ...prev[path], content, path, language: detectLanguage(path) },
    }));
  }, []);

  const getFile = useCallback((path: string) => files[path] || null, [files]);

  const addFile = useCallback((path: string, content: string) => {
    setFilesState(prev => ({
      ...prev,
      [path]: { path, content, language: detectLanguage(path) },
    }));
  }, []);

  const removeFile = useCallback((path: string) => {
    setFilesState(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const fileTree = buildTree(files);

  return (
    <VirtualFSContext.Provider value={{ files, fileTree, setFiles, updateFile, addFile, removeFile, getFile, activeFile, setActiveFile }}>
      {children}
    </VirtualFSContext.Provider>
  );
};

export const useVirtualFS = () => {
  const ctx = useContext(VirtualFSContext);
  if (!ctx) throw new Error("useVirtualFS must be used within VirtualFSProvider");
  return ctx;
};

/**
 * Parse AI multi-file output format.
 * Expected format:
 * ```file:path/to/file.tsx
 * content here
 * ```
 * Falls back to single HTML file if no multi-file markers found.
 */
export function parseMultiFileOutput(response: string): { files: Record<string, VirtualFile>; html: string | null; chatText: string } {
  const files: Record<string, VirtualFile> = {};
  let html: string | null = null;
  let chatText = response;

  // Try multi-file format: ```file:path\n...\n```
  const multiFileRegex = /```file:([\w\-./]+)\n([\s\S]*?)```/g;
  let match;
  let hasMultiFile = false;

  while ((match = multiFileRegex.exec(response)) !== null) {
    hasMultiFile = true;
    const path = match[1].trim();
    const content = match[2].trimEnd();
    files[path] = { path, content, language: detectLanguage(path) };
  }

  if (hasMultiFile) {
    // Remove file blocks from chat text
    chatText = response.replace(multiFileRegex, "").trim();

    // If there's an index.html or App.tsx, try to build preview HTML
    if (files["index.html"]) {
      html = files["index.html"].content;
    } else if (files["src/App.tsx"] || files["src/App.jsx"]) {
      // Build a preview HTML that loads React from CDN with the component code
      const appFile = files["src/App.tsx"] || files["src/App.jsx"];
      const cssFile = files["src/index.css"] || files["src/styles.css"] || files["src/App.css"];
      html = buildReactPreviewHtml(appFile.content, cssFile?.content || "", files);
    }
  } else {
    // Fall back to html-preview / html fence (existing behavior)
    let fenceStart = response.indexOf("```html-preview");
    if (fenceStart === -1) fenceStart = response.indexOf("```html");
    if (fenceStart !== -1) {
      chatText = response.slice(0, fenceStart).trim();
      const codeStart = response.indexOf("\n", fenceStart) + 1;
      const fenceEnd = response.indexOf("```", codeStart);
      const htmlCode = fenceEnd === -1 ? response.slice(codeStart) : response.slice(codeStart, fenceEnd);
      html = htmlCode.trim();
      
      // Create virtual files from single HTML
      files["index.html"] = { path: "index.html", content: html, language: "html" };
      
      // Extract CSS
      const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      const styles: string[] = [];
      let m;
      while ((m = styleRegex.exec(html)) !== null) styles.push(m[1].trim());
      if (styles.length > 0) {
        files["src/styles.css"] = { path: "src/styles.css", content: styles.join("\n\n"), language: "css" };
      }

      // Extract JS
      const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
      const scripts: string[] = [];
      while ((m = scriptRegex.exec(html)) !== null) {
        const c = m[1].trim();
        if (c && !c.includes("preview-error") && !c.includes("direct-touch")) scripts.push(c);
      }
      if (scripts.length > 0) {
        files["src/main.js"] = { path: "src/main.js", content: scripts.join("\n\n"), language: "javascript" };
      }
    }
  }

  // Always add scaffold files for frontend
  if (Object.keys(files).length > 0 && !files["package.json"]) {
    files["package.json"] = {
      path: "package.json",
      content: JSON.stringify({
        name: "my-app",
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.3.0",
          vite: "^5.4.0",
        },
      }, null, 2),
      language: "json",
    };
    files["vite.config.js"] = {
      path: "vite.config.js",
      content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});`,
      language: "javascript",
    };
    files["README.md"] = {
      path: "README.md",
      content: `# My App\n\nGenerated with AI.\n\n## Frontend\n\`\`\`bash\nnpm install && npm run dev\n\`\`\`\n\n## Backend (if applicable)\nCheck the \`server/\` directory for backend setup instructions.\n`,
      language: "markdown",
    };
  }

  // Add docker-compose if both frontend and backend exist
  const hasBackend = Object.keys(files).some(p => p.startsWith("server/"));
  if (hasBackend && !files["docker-compose.yml"]) {
    files["docker-compose.yml"] = {
      path: "docker-compose.yml",
      content: `version: '3.8'\nservices:\n  frontend:\n    build: .\n    ports:\n      - "3000:3000"\n  backend:\n    build: ./server\n    ports:\n      - "8000:8000"\n    environment:\n      - NODE_ENV=production\n`,
      language: "yaml",
    };
  }

  return { files, html, chatText };
}

/** Build a self-contained HTML preview from React component code */
function buildReactPreviewHtml(appCode: string, css: string, allFiles: Record<string, VirtualFile>): string {
  // Collect all component files
  const componentImports: string[] = [];
  for (const [path, file] of Object.entries(allFiles)) {
    if (path.startsWith("src/components/") && (path.endsWith(".tsx") || path.endsWith(".jsx"))) {
      componentImports.push(`// === ${path} ===\n${file.content}`);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${componentImports.join("\n\n")}
    
    // === src/App ===
    ${appCode}

    const rootEl = document.getElementById('root');
    ReactDOM.createRoot(rootEl).render(React.createElement(typeof App !== 'undefined' ? App : (() => React.createElement('div', null, 'Loading...'))));
  </script>
  <script>
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 500);
  </script>
</body>
</html>`;
}
