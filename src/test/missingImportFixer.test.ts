import { describe, it, expect } from "vitest";
import { fixMissingImports } from "@/lib/compiler/missingImportFixer";
import { Workspace } from "@/lib/compiler/workspace";

function makeWorkspace(files: Record<string, string>): Workspace {
  const ws = new Workspace();
  for (const [path, content] of Object.entries(files)) {
    ws.updateFile(path, content);
  }
  return ws;
}

describe("fixMissingImports", () => {
  it("should NOT duplicate hooks already in combined React import", () => {
    const ws = makeWorkspace({
      "/contexts/AuthContext.jsx": `import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useToast } from "../components/ui/Toast";
const AuthContext = createContext();
const AuthProvider = ({ children }) => {
  const { addToast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const login = useCallback(() => {}, []);
  useEffect(() => {}, []);
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
};
export default AuthProvider;`,
    });

    const fixed = fixMissingImports(ws);
    const result = ws.getFile("/contexts/AuthContext.jsx")!;

    // Should NOT have injected any duplicate imports
    expect(fixed).toBe(0);
    // Should only have ONE import from "react"
    const reactImports = result.match(/from\s+["']react["']/g);
    expect(reactImports?.length).toBe(1);
  });

  it("should NOT duplicate hooks in named-only React import", () => {
    const ws = makeWorkspace({
      "/pages/Home.jsx": `import { useState, useEffect } from "react";
const Home = () => {
  const [x, setX] = useState(0);
  useEffect(() => {}, []);
  return <div>{x}</div>;
};
export default Home;`,
    });

    const fixed = fixMissingImports(ws);
    const result = ws.getFile("/pages/Home.jsx")!;
    expect(fixed).toBe(0);
    const reactImports = result.match(/from\s+["']react["']/g);
    expect(reactImports?.length).toBe(1);
  });

  it("should inject truly missing hooks", () => {
    const ws = makeWorkspace({
      "/pages/Dashboard.jsx": `const Dashboard = () => {
  const [count, setCount] = useState(0);
  useEffect(() => {}, []);
  return <div>{count}</div>;
};
export default Dashboard;`,
    });

    const fixed = fixMissingImports(ws);
    const result = ws.getFile("/pages/Dashboard.jsx")!;
    expect(fixed).toBe(2); // useState + useEffect
    expect(result).toContain("useState");
    expect(result).toContain("useEffect");
    // Should be merged into one import
    const reactImports = result.match(/from\s+["']react["']/g);
    expect(reactImports?.length).toBe(1);
  });

  it("should inject clsx when missing", () => {
    const ws = makeWorkspace({
      "/components/Button.jsx": `const Button = ({ active }) => {
  return <button className={clsx("btn", active && "active")}>Click</button>;
};
export default Button;`,
    });

    const fixed = fixMissingImports(ws);
    const result = ws.getFile("/components/Button.jsx")!;
    expect(fixed).toBe(1);
    expect(result).toContain('import clsx from "clsx"');
  });

  it("should not inject clsx when already imported", () => {
    const ws = makeWorkspace({
      "/components/Button.jsx": `import clsx from "clsx";
const Button = ({ active }) => {
  return <button className={clsx("btn", active && "active")}>Click</button>;
};
export default Button;`,
    });

    const fixed = fixMissingImports(ws);
    expect(fixed).toBe(0);
  });

  it("should inject cn with correct relative path", () => {
    const ws = makeWorkspace({
      "/pages/Auth/LoginPage.jsx": `const LoginPage = () => {
  return <div className={cn("container", "mx-auto")}>Login</div>;
};
export default LoginPage;`,
    });

    const fixed = fixMissingImports(ws);
    const result = ws.getFile("/pages/Auth/LoginPage.jsx")!;
    expect(fixed).toBe(1);
    expect(result).toContain('import { cn } from "../../lib/utils"');
  });

  it("should handle import React (default only) and not re-inject hooks already available via React.*", () => {
    // When `import React from "react"` exists, the importPattern for hooks
    // matches `React` branch — so hooks using direct names still get injected.
    // This is by design: `import React` doesn't give you `useState` directly.
    const ws = makeWorkspace({
      "/components/Widget.jsx": `import React from "react";
const Widget = () => {
  const [val, setVal] = React.useState(0);
  return <div>{val}</div>;
};
export default Widget;`,
    });

    const fixed = fixMissingImports(ws);
    // React.useState doesn't match \buseState\b at word boundary after React.
    // Actually it does: "React.useState" contains "useState" as a word.
    // But importPattern matches "import React" so it's detected as present.
    expect(fixed).toBe(0);
  });
});
