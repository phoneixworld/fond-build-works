import { useState } from "react";
import { GitBranch, GitCommit, Link2, Check, Loader2, ArrowUpCircle, ArrowDownCircle, Plus, Trash2, AlertCircle, ExternalLink, User } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string;
}

interface Commit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  connected: boolean;
  htmlUrl: string;
  user: GitHubUser | null;
  commits: Commit[];
}

const GitHubPanel = () => {
  const { currentProject } = useProjects();
  const { files, addFile, updateFile } = useVirtualFS();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [token, setToken] = useState("");
  const [config, setConfig] = useState<GitHubConfig>({
    owner: "",
    repo: "",
    branch: "main",
    connected: false,
    htmlUrl: "",
    user: null,
    commits: [],
  });

  const callGitHub = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("github-api", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

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
    try {
      // Verify token
      const verifyData = await callGitHub({ action: "verify", token: tokenInput });
      
      // Parse owner/repo from URL
      const match = repoInput.match(/github\.com\/([^/]+)\/([^/.]+)/);
      if (!match) throw new Error("Invalid GitHub URL. Use format: https://github.com/user/repo");
      const [, owner, repo] = match;

      // Fetch commits
      const commitsData = await callGitHub({ action: "commits", token: tokenInput, owner, repo, branch: "main" });

      setToken(tokenInput);
      setConfig({
        owner,
        repo,
        branch: "main",
        connected: true,
        htmlUrl: `https://github.com/${owner}/${repo}`,
        user: verifyData.user,
        commits: commitsData.commits || [],
      });
      toast({ title: "Connected! 🎉", description: `Linked to ${owner}/${repo}` });
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!tokenInput.trim()) {
      setShowTokenInput(true);
      toast({ title: "GitHub token required", variant: "destructive" });
      return;
    }
    if (!newRepoName.trim()) {
      toast({ title: "Enter a repo name", variant: "destructive" });
      return;
    }

    setConnecting(true);
    try {
      const verifyData = await callGitHub({ action: "verify", token: tokenInput });
      const repoData = await callGitHub({
        action: "create-repo",
        token: tokenInput,
        repoName: newRepoName,
        description: `${currentProject?.name || "Project"} — created from IDE`,
        isPrivate: false,
      });

      const [owner, repo] = repoData.repo.full_name.split("/");
      setToken(tokenInput);
      setConfig({
        owner,
        repo,
        branch: repoData.repo.default_branch || "main",
        connected: true,
        htmlUrl: repoData.repo.html_url,
        user: verifyData.user,
        commits: [{ sha: "initial", message: "Initial commit", date: new Date().toISOString(), author: verifyData.user.login }],
      });
      toast({ title: "Repository created! 🎉", description: repoData.repo.full_name });
    } catch (err: any) {
      toast({ title: "Failed to create repo", description: err.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setConfig({ owner: "", repo: "", branch: "main", connected: false, htmlUrl: "", user: null, commits: [] });
    setRepoInput("");
    setTokenInput("");
    setToken("");
    toast({ title: "Disconnected" });
  };

  const handlePush = async () => {
    const fileEntries = Object.entries(files);
    if (fileEntries.length === 0) {
      toast({ title: "No files to push", variant: "destructive" });
      return;
    }

    setSyncing(true);
    try {
      const pushFiles = fileEntries.map(([path, file]) => ({ path, content: file.content }));
      const data = await callGitHub({
        action: "push",
        token,
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        files: pushFiles,
        message: `Update from IDE – ${currentProject?.name || "project"}`,
      });

      // Refresh commits
      const commitsData = await callGitHub({ action: "commits", token, owner: config.owner, repo: config.repo, branch: config.branch });
      setConfig(prev => ({ ...prev, commits: commitsData.commits || [] }));
      toast({ title: "Pushed! ⬆️", description: `${fileEntries.length} files pushed to GitHub.` });
    } catch (err: any) {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    setSyncing(true);
    try {
      const data = await callGitHub({
        action: "pull",
        token,
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
      });

      if (data.files) {
        for (const file of data.files) {
          writeFile(file.path, file.content);
        }
      }

      const commitsData = await callGitHub({ action: "commits", token, owner: config.owner, repo: config.repo, branch: config.branch });
      setConfig(prev => ({ ...prev, commits: commitsData.commits || [] }));
      toast({ title: "Pulled! ⬇️", description: `${data.files?.length || 0} files synced from GitHub.` });
    } catch (err: any) {
      toast({ title: "Pull failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
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
              {config.connected ? `${config.owner}/${config.repo}` : "Connect a repository to sync code"}
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
            {/* Token input (always shown first) */}
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

            {!showCreate ? (
              <>
                {/* Connect existing */}
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

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {connecting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</>
                  ) : (
                    <><Link2 className="w-3.5 h-3.5" /> Connect Repository</>
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center"><span className="bg-background px-2 text-[10px] text-muted-foreground">or</span></div>
                </div>

                <button onClick={() => setShowCreate(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border border-border text-foreground hover:bg-secondary transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Create New Repository
                </button>
              </>
            ) : (
              <>
                {/* Create new */}
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Repository Name</label>
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder={currentProject?.name?.toLowerCase().replace(/\s+/g, "-") || "my-app"}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <button
                  onClick={handleCreateRepo}
                  disabled={connecting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {connecting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5" /> Create & Connect</>
                  )}
                </button>

                <button onClick={() => setShowCreate(false)} className="w-full text-[11px] text-muted-foreground hover:text-foreground">
                  ← Connect existing repository instead
                </button>
              </>
            )}

            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Real GitHub integration:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Push all project files to GitHub</li>
                    <li>Pull & sync from collaborators</li>
                    <li>Create new repos directly</li>
                    <li>View commit history</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* User info */}
            {config.user && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary border border-border">
                <img src={config.user.avatar_url} alt={config.user.login} className="w-8 h-8 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{config.user.name || config.user.login}</p>
                  <p className="text-[10px] text-muted-foreground">@{config.user.login}</p>
                </div>
                <a href={config.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Repo info */}
            <div className="p-3 rounded-xl bg-secondary border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-foreground truncate">{config.owner}/{config.repo}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{config.branch}</span>
              </div>
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
                {config.commits.length === 0 && <p className="text-[11px] text-muted-foreground">No commits yet</p>}
                {config.commits.map((commit, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <GitCommit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-foreground truncate">{commit.message}</p>
                      <p className="text-[10px] text-muted-foreground">
                        <span className="font-mono">{commit.sha}</span> · {commit.author} · {new Date(commit.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Disconnect Repository
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubPanel;
