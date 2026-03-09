import { useState } from "react";
import { GitBranch, GitCommit, Check, Loader2, ArrowUpCircle, ArrowDownCircle, Plus, Trash2, ExternalLink, Building2, ChevronRight, FolderGit2, Lock, Globe, RefreshCw } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toExportPath, toSandpackPath } from "@/lib/pathNormalizer";

type Step = "connect" | "select-account" | "select-repo" | "connected";

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string;
}

interface GitHubOrg {
  login: string;
  avatar_url: string;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
}

interface Commit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

const GitHubPanel = () => {
  const { currentProject } = useProjects();
  const { files, addFile, updateFile } = useVirtualFS();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("connect");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");

  const [user, setUser] = useState<GitHubUser | null>(null);
  const [orgs, setOrgs] = useState<GitHubOrg[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [showNewRepo, setShowNewRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);

  const [connectedRepo, setConnectedRepo] = useState<GitHubRepo | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);

  const callGitHub = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("github-api", { body: { ...payload, token } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // Step 1: User pastes token → verify → fetch user + orgs
  const handleAuthenticate = async () => {
    if (!tokenInput.trim()) {
      // Open GitHub token creation page
      window.open("https://github.com/settings/tokens/new?scopes=repo&description=IDE+App", "_blank");
      toast({ title: "Create a token on GitHub", description: "Copy the token and paste it below." });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("github-api", {
        body: { action: "verify", token: tokenInput },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setToken(tokenInput);
      setUser(data.user);

      // Fetch orgs
      const orgsRes = await fetch("https://api.github.com/user/orgs", {
        headers: { Authorization: `Bearer ${tokenInput}`, Accept: "application/vnd.github.v3+json" },
      });
      const orgsData = await orgsRes.json();
      setOrgs(Array.isArray(orgsData) ? orgsData.map((o: any) => ({ login: o.login, avatar_url: o.avatar_url })) : []);

      setStep("select-account");
      toast({ title: "Authenticated! ✓", description: `Signed in as ${data.user.login}` });
    } catch (err: any) {
      toast({ title: "Authentication failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: User picks account → fetch repos
  const handleSelectAccount = async (account: string) => {
    setSelectedAccount(account);
    setLoading(true);
    try {
      const isOrg = account !== user?.login;
      const url = isOrg
        ? `https://api.github.com/orgs/${account}/repos?sort=updated&per_page=30`
        : `https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      const data = await res.json();
      setRepos(
        Array.isArray(data)
          ? data.map((r: any) => ({
              name: r.name,
              full_name: r.full_name,
              html_url: r.html_url,
              private: r.private,
              default_branch: r.default_branch,
            }))
          : []
      );
      setStep("select-repo");
    } catch (err: any) {
      toast({ title: "Failed to fetch repos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 3a: Connect existing repo
  const handleConnectRepo = async (repo: GitHubRepo) => {
    setLoading(true);
    try {
      const [owner, repoName] = repo.full_name.split("/");
      const commitsData = await callGitHub({ action: "commits", owner, repo: repoName, branch: repo.default_branch });
      setConnectedRepo(repo);
      setCommits(commitsData.commits || []);
      setStep("connected");
      toast({ title: "Connected! 🎉", description: `Linked to ${repo.full_name}` });
    } catch (err: any) {
      toast({ title: "Failed to connect", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 3b: Create new repo
  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setLoading(true);
    try {
      const repoData = await callGitHub({
        action: "create-repo",
        repoName: newRepoName,
        description: `${currentProject?.name || "Project"} — created from IDE`,
        isPrivate: newRepoPrivate,
      });

      const [owner, repoName] = repoData.repo.full_name.split("/");
      const newRepo: GitHubRepo = {
        name: repoName,
        full_name: repoData.repo.full_name,
        html_url: repoData.repo.html_url,
        private: newRepoPrivate,
        default_branch: repoData.repo.default_branch || "main",
      };
      setConnectedRepo(newRepo);
      setCommits([]);
      setStep("connected");
      toast({ title: "Repository created! 🎉", description: repoData.repo.full_name });
    } catch (err: any) {
      toast({ title: "Failed to create repo", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setStep("connect");
    setConnectedRepo(null);
    setCommits([]);
    setToken("");
    setTokenInput("");
    setUser(null);
    setOrgs([]);
    setRepos([]);
    setSelectedAccount("");
    toast({ title: "Disconnected" });
  };

  const handlePush = async () => {
    if (!connectedRepo) return;
    const fileEntries = Object.entries(files);
    if (fileEntries.length === 0) {
      toast({ title: "No files to push", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      const [owner, repo] = connectedRepo.full_name.split("/");
      await callGitHub({
        action: "push",
        owner,
        repo,
        branch: connectedRepo.default_branch,
        files: fileEntries.map(([path, file]) => ({ path, content: file.content })),
        message: `Update from IDE – ${currentProject?.name || "project"}`,
      });
      const commitsData = await callGitHub({ action: "commits", owner, repo, branch: connectedRepo.default_branch });
      setCommits(commitsData.commits || []);
      toast({ title: "Pushed! ⬆️", description: `${fileEntries.length} files pushed.` });
    } catch (err: any) {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!connectedRepo) return;
    setSyncing(true);
    try {
      const [owner, repo] = connectedRepo.full_name.split("/");
      const data = await callGitHub({ action: "pull", owner, repo, branch: connectedRepo.default_branch });
      if (data.files) {
        for (const file of data.files) {
          if (files[file.path]) {
            updateFile(file.path, file.content);
          } else {
            addFile(file.path, file.content);
          }
        }
      }
      const commitsData = await callGitHub({ action: "commits", owner, repo, branch: connectedRepo.default_branch });
      setCommits(commitsData.commits || []);
      toast({ title: "Pulled! ⬇️", description: `${data.files?.length || 0} files synced.` });
    } catch (err: any) {
      toast({ title: "Pull failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#24292e] flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">GitHub</h2>
            <p className="text-[10px] text-muted-foreground">
              {connectedRepo ? connectedRepo.full_name : "Version control & collaboration"}
            </p>
          </div>
          {connectedRepo && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--ide-success))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-success))] animate-pulse" />
              Connected
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* ─── Step: Connect ─── */}
        {step === "connect" && (
          <div className="space-y-5">
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-[#24292e] flex items-center justify-center mx-auto mb-4">
                <GitBranch className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">Connect to GitHub</h3>
              <p className="text-xs text-muted-foreground max-w-[250px] mx-auto">
                Push your code, pull updates, and collaborate with version control.
              </p>
            </div>

            <button
              onClick={() => {
                if (!tokenInput.trim()) {
                  window.open("https://github.com/settings/tokens/new?scopes=repo&description=IDE+App", "_blank");
                  toast({ title: "GitHub opened", description: "Create a token, then paste it below." });
                }
              }}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold bg-[#24292e] text-white hover:bg-[#333] transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Connect to GitHub
            </button>

            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted-foreground">Paste your access token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  onKeyDown={(e) => e.key === "Enter" && handleAuthenticate()}
                />
                <button
                  onClick={handleAuthenticate}
                  disabled={loading || !tokenInput.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step: Select Account / Org ─── */}
        {step === "select-account" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground">Select account</h3>
              <button onClick={() => setStep("connect")} className="text-[10px] text-muted-foreground hover:text-foreground">← Back</button>
            </div>

            <div className="space-y-1.5">
              {/* Personal account */}
              {user && (
                <button
                  onClick={() => handleSelectAccount(user.login)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  <img src={user.avatar_url} alt={user.login} className="w-9 h-9 rounded-full ring-2 ring-border group-hover:ring-primary/30" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{user.name || user.login}</p>
                    <p className="text-[10px] text-muted-foreground">Personal account</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                </button>
              )}

              {/* Organizations */}
              {orgs.map((org) => (
                <button
                  key={org.login}
                  onClick={() => handleSelectAccount(org.login)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  <img src={org.avatar_url} alt={org.login} className="w-9 h-9 rounded-lg ring-2 ring-border group-hover:ring-primary/30" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{org.login}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Organization
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                </button>
              ))}

              {orgs.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">No organizations found</p>
              )}
            </div>

            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}

        {/* ─── Step: Select / Create Repo ─── */}
        {step === "select-repo" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground">
                {showNewRepo ? "Create new repository" : "Select repository"}
              </h3>
              <button onClick={() => { setShowNewRepo(false); setStep("select-account"); }} className="text-[10px] text-muted-foreground hover:text-foreground">← Back</button>
            </div>

            {!showNewRepo ? (
              <>
                {/* Create new repo button */}
                <button
                  onClick={() => {
                    setNewRepoName(currentProject?.name?.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "my-app");
                    setShowNewRepo(true);
                  }}
                  className="w-full flex items-center gap-2.5 p-3 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-all"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold">Create new repository</p>
                    <p className="text-[10px] text-primary/60">Under {selectedAccount}</p>
                  </div>
                </button>

                {/* Existing repos */}
                <div className="space-y-1">
                  {repos.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleConnectRepo(repo)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary transition-colors text-left group"
                    >
                      <FolderGit2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground truncate">{repo.name}</p>
                      </div>
                      {repo.private ? (
                        <Lock className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <Globe className="w-3 h-3 text-muted-foreground" />
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                  {repos.length === 0 && !loading && (
                    <p className="text-[11px] text-muted-foreground text-center py-4">No repositories found</p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Owner</label>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary">
                    <span className="text-xs font-medium text-foreground">{selectedAccount}</span>
                    <span className="text-muted-foreground">/</span>
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
                      className="flex-1 bg-transparent text-xs text-foreground outline-none"
                      placeholder="repo-name"
                      autoFocus
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRepoPrivate}
                    onChange={(e) => setNewRepoPrivate(e.target.checked)}
                    className="rounded border-border"
                  />
                  <Lock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Private repository</span>
                </label>

                <button
                  onClick={handleCreateRepo}
                  disabled={loading || !newRepoName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5" /> Create Repository</>
                  )}
                </button>
              </div>
            )}

            {loading && !showNewRepo && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}

        {/* ─── Step: Connected ─── */}
        {step === "connected" && connectedRepo && (
          <div className="space-y-4">
            {/* User + repo info */}
            <div className="p-3 rounded-xl bg-secondary border border-border">
              <div className="flex items-center gap-3">
                {user && <img src={user.avatar_url} alt={user.login} className="w-8 h-8 rounded-full" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{connectedRepo.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{connectedRepo.default_branch}</span>
                    {connectedRepo.private ? (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Private</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" /> Public</span>
                    )}
                  </div>
                </div>
                <a href={connectedRepo.html_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
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

            {/* Commits */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Commits</h3>
                <button
                  onClick={async () => {
                    if (!connectedRepo) return;
                    const [owner, repo] = connectedRepo.full_name.split("/");
                    try {
                      const data = await callGitHub({ action: "commits", owner, repo, branch: connectedRepo.default_branch });
                      setCommits(data.commits || []);
                    } catch {}
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                {commits.length === 0 && <p className="text-[11px] text-muted-foreground">No commits yet</p>}
                {commits.map((commit, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <GitCommit className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-foreground leading-tight">{commit.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        <span className="font-mono">{commit.sha}</span> · {commit.author} · {new Date(commit.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Disconnect */}
            <div className="pt-2 border-t border-border">
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Disconnect Repository
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubPanel;
