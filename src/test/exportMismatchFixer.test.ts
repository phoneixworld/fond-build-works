import { describe, it, expect } from "vitest";
import { fixExportMismatches } from "@/lib/compiler/exportMismatchFixer";
import { Workspace } from "@/lib/compiler/workspace";

function makeWorkspace(files: Record<string, string>): Workspace {
  const ws = new Workspace();
  for (const [path, content] of Object.entries(files)) {
    ws.updateFile(path, content);
  }
  return ws;
}

describe("fixExportMismatches", () => {
  it("fixes missing named export when import has default + named symbols", () => {
    const ws = makeWorkspace({
      "/pages/DashboardPage.jsx": `import Layout, { Sidebar } from "../components/Layout";

export default function DashboardPage() {
  return (
    <Layout>
      <Sidebar />
    </Layout>
  );
}`,
      "/components/Layout.jsx": `export default function Layout({ children }) {
  return <div>{children}</div>;
}

const Sidebar = () => <aside>Sidebar</aside>;`,
    });

    const fixed = fixExportMismatches(ws);
    const layoutFile = ws.getFile("/components/Layout.jsx") || "";

    expect(fixed).toBeGreaterThanOrEqual(1);
    expect(layoutFile).toContain("export { Sidebar };");
  });

  it("fixes case-only named import mismatch inside mixed imports", () => {
    const ws = makeWorkspace({
      "/pages/DashboardPage.jsx": `import Layout, { Sidebar } from "../components/Layout";

export default function DashboardPage() {
  return <Sidebar />;
}`,
      "/components/Layout.jsx": `export default function Layout({ children }) {
  return <div>{children}</div>;
}

export const sidebar = () => null;`,
    });

    const fixed = fixExportMismatches(ws);
    const pageFile = ws.getFile("/pages/DashboardPage.jsx") || "";

    expect(fixed).toBeGreaterThanOrEqual(1);
    expect(pageFile).toContain("import Layout, { sidebar as Sidebar } from \"../components/Layout\";");
    expect(pageFile).toContain("return <Sidebar />;");
  });
});
