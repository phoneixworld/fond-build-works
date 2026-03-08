import { useState } from "react";
import { GitBranch, GitCommit, GitPullRequest, Link2, Check, Loader2, RefreshCw, ArrowUpCircle, ArrowDownCircle, Plus, Trash2, AlertCircle } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

interface GitHubConfig {
  repoUrl: string;
  branch: string;
  connected: boolean;
  lastSync: string | null;
  commits: { hash: string; message: string; date: string; author: string }[];
}

const GitHubPanel = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [config, setConfig] = useState<GitHubConfig>({
    repoUrl: "",
    branch: "main",
    connected: false,
    lastSync: null,
    commits: [],
  });

  const handleConnect = async () => {
    if (!repoInput.trim()) {
      toast({ title: "Enter a repository URL", variant: "destructive" });
      return;
    }
    if (!tokenInput.trim()) {
      setShowTokenInput(true);
      toast({ title: "GitHub token required", description: "Enter a personal access token with repo scope.", variant: "destructive" });
      return;
    }

    setConnecting(true);
    // Simulate GitHub API connection
    await new Promise(r => setTimeout(r, 2000));
    
    const repoName = repoInput.replace("https://github.com/", "").replace(".git", "");
    setConfig({
      repoUrl: repoInput,
      branch: "main",
      connected: true,
      lastSync: new Date().toISOString(),
      commits: [
        { hash: "a1b2c3d", message: "Initial commit from IDE", date: new Date().toISOString(), author: "you" },
      ],
    });
    setConnecting(false);
    toast({ title: "Connected! 🎉", description: `Linked to ${repoName}` });
  };

  const handleDisconnect = () => {
    setConfig({ repoUrl: "", branch: "main", connected: false, lastSync: null, commits: [] });
    setRepoInput("");
    setTokenInput("");
    toast({ title: "Disconnected", description: "GitHub repo unlinked." });
  };

  const handlePush = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 1500));
    const newCommit = {
      hash: Math.random().toString(36).slice(2, 9),
      message: `Update from IDE – ${currentProject?.name || "project"}`,
      date: new Date().toISOString(),
      author: "you",
    };
    setConfig(prev => ({
      ...prev,
      lastSync: new Date().toISOString(),
      commits: [newCommit, ...prev.commits],
    }));
    setSyncing(false);
    toast({ title: "Pushed! ⬆️", description: "Changes pushed to GitHub." });
  };

  const handlePull = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 1500));
    setConfig(prev => ({ ...prev, lastSync: new Date().toISOString() }));
    setSyncing(false);
    toast({ title: "Pulled! ⬇️", description: "Latest changes synced from GitHub." });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#24292e] flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">GitHub</h2>
            <p className="text-[10px] text-muted-foreground">
              {config.connected ? "Connected" : "Connect a repository to sync code"}
            </p>
          </div>
          {config.connected && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--ide-success))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-success))] animate-pulse" />
              Linked
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {!config.connected ? (
          <div className="space-y-4">
            {/* Connect form */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Repository URL</label>
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {showTokenInput && (
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Personal Access Token
                    <span className="text-muted-foreground font-normal ml-1">(repo scope)</span>
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Generate at GitHub → Settings → Developer Settings → Personal Access Tokens
                  </p>
                </div>
              )}

              {!showTokenInput && (
                <button
                  onClick={() => setShowTokenInput(true)}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Add access token
                </button>
              )}

              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    Connect Repository
                  </>
                )}
              </button>
            </div>

            {/* Or create new */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-[10px] text-muted-foreground">or</span></div>
            </div>

            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border border-border text-foreground hover:bg-secondary transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Create New Repository
            </button>

            {/* Info */}
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">What this does:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Push your code to GitHub for version control</li>
                    <li>Pull updates from collaborators</li>
                    <li>Two-way sync keeps code in sync</li>
                    <li>Works with any public or private repo</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected repo info */}
            <div className="p-3 rounded-xl bg-secondary border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-foreground truncate">
                  {config.repoUrl.replace("https://github.com/", "")}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {config.branch}
                </span>
              </div>
              {config.lastSync && (
                <p className="text-[10px] text-muted-foreground">
                  Last synced: {new Date(config.lastSync).toLocaleString()}
                </p>
              )}
            </div>

            {/* Push / Pull */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePush}
                disabled={syncing}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                Push
              </button>
              <button
                onClick={handlePull}
                disabled={syncing}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                Pull
              </button>
            </div>

            {/* Recent commits */}
            <div>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Commits</h3>
              <div className="space-y-1">
                {config.commits.map((commit, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <GitCommit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-foreground truncate">{commit.message}</p>
                      <p className="text-[10px] text-muted-foreground">
                        <span className="font-mono">{commit.hash}</span> · {new Date(commit.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Disconnect */}
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Disconnect Repository
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubPanel;
