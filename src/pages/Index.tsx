import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Settings, Zap } from "lucide-react";
import { PreviewProvider } from "@/contexts/PreviewContext";
import ChatPanel from "@/components/ChatPanel";
import FileTree from "@/components/FileTree";
import CodeEditor from "@/components/CodeEditor";
import PreviewPanel from "@/components/PreviewPanel";

const Index = () => {
  const [selectedFile, setSelectedFile] = useState("App.tsx");
  const [rightPanel, setRightPanel] = useState<"code" | "preview">("preview");

  return (
    <PreviewProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-11 flex items-center px-4 border-b border-border bg-ide-panel-header shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Lovable</span>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setRightPanel("code")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightPanel === "code"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              Code
            </button>
            <button
              onClick={() => setRightPanel("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightPanel === "preview"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
            <div className="w-px h-5 bg-border mx-2" />
            <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main area */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {/* Chat panel */}
            <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
              <ChatPanel />
            </ResizablePanel>

            <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />

            {/* Right side: file tree + code/preview */}
            <ResizablePanel defaultSize={70}>
              <ResizablePanelGroup direction="horizontal">
                {/* File tree */}
                <ResizablePanel defaultSize={20} minSize={12} maxSize={30}>
                  <FileTree selectedFile={selectedFile} onSelectFile={setSelectedFile} />
                </ResizablePanel>

                <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />

                {/* Code or Preview */}
                <ResizablePanel defaultSize={80}>
                  {rightPanel === "code" ? (
                    <CodeEditor selectedFile={selectedFile} />
                  ) : (
                    <PreviewPanel />
                  )}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </PreviewProvider>
  );
};

export default Index;
