import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Code, Eye, Zap, LogOut } from "lucide-react";
import { PreviewProvider } from "@/contexts/PreviewContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import ChatPanel from "@/components/ChatPanel";
import ProjectList from "@/components/ProjectList";
import CodeEditor from "@/components/CodeEditor";
import PreviewPanel from "@/components/PreviewPanel";

const Index = () => {
  const { user, signOut } = useAuth();
  const [selectedFile, setSelectedFile] = useState("App.tsx");
  const [rightPanel, setRightPanel] = useState<"code" | "preview">("preview");

  return (
    <ProjectProvider>
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
                  rightPanel === "code" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                Code
              </button>
              <button
                onClick={() => setRightPanel("preview")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  rightPanel === "preview" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <div className="w-px h-5 bg-border mx-2" />
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">{user?.email}</span>
              <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors p-1.5" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Main area */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal">
              {/* Left: Projects + Chat */}
              <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
                <ResizablePanelGroup direction="vertical">
                  <ResizablePanel defaultSize={30} minSize={15} maxSize={50}>
                    <ProjectList />
                  </ResizablePanel>
                  <ResizableHandle className="h-px bg-border hover:bg-primary transition-colors" />
                  <ResizablePanel defaultSize={70}>
                    <ChatPanel />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>

              <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />

              {/* Right: Code or Preview */}
              <ResizablePanel defaultSize={65}>
                {rightPanel === "code" ? (
                  <CodeEditor selectedFile={selectedFile} />
                ) : (
                  <PreviewPanel />
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </PreviewProvider>
    </ProjectProvider>
  );
};

export default Index;
