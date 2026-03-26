/**
 * Multi-File Parser — parses AI multi-file output and builds React preview HTML.
 * 
 * Extracted from VirtualFSContext.tsx (pure utility functions unrelated to React context).
 * 
 * Responsibilities:
 * - parseMultiFileOutput: parse ```file:path format or fallback HTML fences
 * - buildReactPreviewHtml: generate self-contained HTML from React component code
 * - detectLanguage: map file extensions to language identifiers
 */

import type { VirtualFile } from "@/contexts/VirtualFSContext";

// ─── Language Detection ───────────────────────────────────────────────────

export function detectLanguage(path: string): string {
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
  const filename = path.split("/").pop()?.toLowerCase() || "";
  if (filename === "dockerfile") return "dockerfile";
  if (filename === "makefile") return "makefile";
  if (filename.startsWith("requirements")) return "text";
  return map[ext] || "text";
}

// ─── Multi-File Output Parser ─────────────────────────────────────────────

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
    chatText = response.replace(multiFileRegex, "").trim();

    if (files["index.html"]) {
      html = files["index.html"].content;
    } else if (files["src/App.tsx"] || files["src/App.jsx"]) {
      const appFile = files["src/App.tsx"] || files["src/App.jsx"];
      const cssFile = files["src/index.css"] || files["src/styles.css"] || files["src/App.css"];
      html = buildReactPreviewHtml(appFile.content, cssFile?.content || "", files);
    }
  } else {
    let fenceStart = response.indexOf("```html-preview");
    if (fenceStart === -1) fenceStart = response.indexOf("```html");
    if (fenceStart !== -1) {
      chatText = response.slice(0, fenceStart).trim();
      const codeStart = response.indexOf("\n", fenceStart) + 1;
      const fenceEnd = response.indexOf("```", codeStart);
      const htmlCode = fenceEnd === -1 ? response.slice(codeStart) : response.slice(codeStart, fenceEnd);
      html = htmlCode.trim();
      
      files["index.html"] = { path: "index.html", content: html, language: "html" };
      
      const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      const styles: string[] = [];
      let m;
      while ((m = styleRegex.exec(html)) !== null) styles.push(m[1].trim());
      if (styles.length > 0) {
        files["src/styles.css"] = { path: "src/styles.css", content: styles.join("\n\n"), language: "css" };
      }

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

// ─── React Preview HTML Builder ───────────────────────────────────────────

/** Build a self-contained HTML preview from React component code */
function buildReactPreviewHtml(appCode: string, css: string, allFiles: Record<string, VirtualFile>): string {
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
  <script src="https://cdn.tailwindcss.com"><\/script>
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
