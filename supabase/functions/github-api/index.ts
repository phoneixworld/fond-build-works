import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_API = "https://api.github.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, token, owner, repo, branch, files, message, repoName, isPrivate, description } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "GitHub token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "IDE-App",
    };

    // Verify token
    if (action === "verify") {
      const res = await fetch(`${GITHUB_API}/user`, { headers });
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: `Invalid token [${res.status}]: ${err}` }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const user = await res.json();
      return new Response(JSON.stringify({ success: true, user: { login: user.login, avatar_url: user.avatar_url, name: user.name } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create repository
    if (action === "create-repo") {
      const res = await fetch(`${GITHUB_API}/user/repos`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: repoName,
          description: description || "Created from IDE",
          private: isPrivate ?? false,
          auto_init: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        return new Response(JSON.stringify({ error: `Failed to create repo [${res.status}]: ${err.message}` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, repo: { full_name: data.full_name, html_url: data.html_url, default_branch: data.default_branch } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List commits
    if (action === "commits") {
      const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?sha=${branch || "main"}&per_page=10`, { headers });
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: `Failed to fetch commits [${res.status}]: ${err}` }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const commits = await res.json();
      return new Response(JSON.stringify({
        success: true,
        commits: commits.map((c: any) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message,
          date: c.commit.author.date,
          author: c.commit.author.name,
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Push files (create/update multiple files via tree + commit)
    if (action === "push") {
      if (!files || !Array.isArray(files) || files.length === 0) {
        return new Response(JSON.stringify({ error: "No files to push" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetBranch = branch || "main";

      // Get latest commit SHA
      const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`, { headers });
      if (!refRes.ok) {
        const err = await refRes.text();
        return new Response(JSON.stringify({ error: `Failed to get branch ref [${refRes.status}]: ${err}` }), {
          status: refRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const refData = await refRes.json();
      const latestCommitSha = refData.object.sha;

      // Get the tree of the latest commit
      const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { headers });
      const commitData = await commitRes.json();
      const baseTreeSha = commitData.tree.sha;

      // Create blobs for each file
      const tree = [];
      for (const file of files) {
        const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        });
        const blobData = await blobRes.json();
        tree.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        });
      }

      // Create new tree
      const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree }),
      });
      const treeData = await treeRes.json();

      // Create commit
      const newCommitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: message || "Update from IDE",
          tree: treeData.sha,
          parents: [latestCommitSha],
        }),
      });
      const newCommitData = await newCommitRes.json();

      // Update branch ref
      await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${targetBranch}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: newCommitData.sha }),
      });

      return new Response(JSON.stringify({
        success: true,
        commit: { sha: newCommitData.sha.slice(0, 7), message: newCommitData.message },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull files (get repo contents)
    if (action === "pull") {
      const targetBranch = branch || "main";
      // Get tree recursively
      const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`, { headers });
      const refData = await refRes.json();
      const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${refData.object.sha}`, { headers });
      const commitData = await commitRes.json();
      
      const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${commitData.tree.sha}?recursive=1`, { headers });
      const treeData = await treeRes.json();

      // Fetch content for text files (limit to reasonable size)
      const fileEntries = treeData.tree.filter((t: any) => t.type === "blob" && t.size < 100000).slice(0, 50);
      const fileContents = [];

      for (const entry of fileEntries) {
        const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${entry.sha}`, { headers });
        const blobData = await blobRes.json();
        const content = blobData.encoding === "base64" ? atob(blobData.content) : blobData.content;
        fileContents.push({ path: entry.path, content });
      }

      return new Response(JSON.stringify({ success: true, files: fileContents }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("GitHub edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
