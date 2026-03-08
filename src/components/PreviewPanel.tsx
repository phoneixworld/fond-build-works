import { Globe, RefreshCw, ExternalLink } from "lucide-react";
import { useState } from "react";

const PreviewPanel = () => {
  const [url, setUrl] = useState("localhost:5173");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-ide-panel-header">
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-md px-3 py-1">
          <Globe className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{url}</span>
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Preview content */}
      <div key={refreshKey} className="flex-1 bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">L</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome to Your App</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Start building by chatting with the AI assistant
            </p>
          </div>
          <div className="flex gap-2 justify-center">
            <div className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
              Get Started
            </div>
            <div className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm">
              Learn More
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewPanel;
