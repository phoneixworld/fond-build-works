import { useState } from "react";
import { X, FileCode } from "lucide-react";

const sampleCode: Record<string, string> = {
  "App.tsx": `import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Index />} />
    </Routes>
  </BrowserRouter>
);

export default App;`,
  "Header.tsx": `import { Menu, Search } from "lucide-react";

const Header = () => (
  <header className="flex items-center h-12 px-4 border-b">
    <Menu className="w-5 h-5" />
    <span className="ml-3 font-semibold">My App</span>
    <div className="ml-auto">
      <Search className="w-4 h-4" />
    </div>
  </header>
);

export default Header;`,
  "Index.tsx": `const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">
        Welcome to Your App
      </h1>
    </div>
  );
};

export default Index;`,
  "main.tsx": `import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);`,
};

const CodeEditor = ({ selectedFile }: { selectedFile: string }) => {
  const [tabs, setTabs] = useState<string[]>(["App.tsx"]);
  const [activeTab, setActiveTab] = useState("App.tsx");

  const openFile = selectedFile;
  if (openFile && !tabs.includes(openFile)) {
    setTabs((prev) => [...prev, openFile]);
    setActiveTab(openFile);
  } else if (openFile && openFile !== activeTab) {
    setActiveTab(openFile);
  }

  const closeTab = (tab: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter((t) => t !== tab);
    setTabs(newTabs);
    if (activeTab === tab) setActiveTab(newTabs[newTabs.length - 1] || "");
  };

  const code = sampleCode[activeTab] || `// ${activeTab}\n// File contents...`;
  const lines = code.split("\n");

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* Tabs */}
      <div className="flex items-center border-b border-border bg-ide-panel-header overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border transition-colors shrink-0 ${
              activeTab === tab
                ? "bg-ide-panel text-foreground border-t-2 border-t-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCode className="w-3 h-3 text-ide-chat-user" />
            {tab}
            <X
              className="w-3 h-3 ml-1 hover:text-destructive"
              onClick={(e) => closeTab(tab, e)}
            />
          </button>
        ))}
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-auto font-mono text-xs leading-6">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`flex hover:bg-ide-line-highlight ${
              i === 0 ? "bg-ide-line-highlight" : ""
            }`}
          >
            <span className="w-12 text-right pr-4 text-ide-gutter select-none shrink-0">
              {i + 1}
            </span>
            <pre className="text-foreground">
              <code>{colorize(line)}</code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple syntax colorization
function colorize(line: string) {
  return line
    .replace(
      /(import|from|export|default|const|return|function)/g,
      '<span class="text-accent">$1</span>'
    )
    .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="text-ide-success">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="text-ide-gutter">$1</span>');
}

// Use dangerouslySetInnerHTML for syntax highlighting
const CodeLine = ({ line }: { line: string }) => (
  <span dangerouslySetInnerHTML={{ __html: colorize(line) }} />
);

export { CodeLine };
export default CodeEditor;
