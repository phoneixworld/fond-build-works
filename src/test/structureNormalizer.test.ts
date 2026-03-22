import { describe, expect, it } from "vitest";
import { Workspace } from "@/lib/compiler/workspace";
import { normalizeGeneratedStructure } from "@/lib/compiler/structureNormalizer";

describe("structureNormalizer", () => {
  it("removes mirrored files under /pages/components and rewrites imports", () => {
    const ws = new Workspace({
      "/components/StatCard.jsx": `export default function StatCard(){ return <div>Card</div>; }`,
      "/pages/components/StatCard.jsx": `export default function StatCard(){ return <div>Card</div>; }`,
      "/pages/Dashboard.jsx": `import StatCard from "./components/StatCard";\nexport default function Dashboard(){ return <StatCard />; }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    expect(ws.hasFile("/pages/components/StatCard.jsx")).toBe(false);
    const dashboard = ws.getFile("/pages/Dashboard.jsx") || "";
    expect(dashboard).toContain('import StatCard from "../components/StatCard";');
  });

  it("normalizes utility files and removes conflicting variants", () => {
    const ws = new Workspace({
      "/lib/utils.js": `import { clsx } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\nimport { cn } from "./utils";\n\nexport function cn(...inputs){ return twMerge(clsx(inputs)); }`,
      "/lib/utils.jsx": `export const cn = null;`,
      "/components/ui/utils.js": `import { cn } from "../../lib/utils";\nexport function cn(...inputs){ return inputs.filter(Boolean).join(" "); }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    expect(ws.hasFile("/lib/utils.jsx")).toBe(false);

    const libUtils = ws.getFile("/lib/utils.js") || "";
    expect(libUtils).toContain("export function cn");
    expect(libUtils).not.toContain('import { cn } from "./utils"');

    const uiUtils = ws.getFile("/components/ui/utils.js") || "";
    expect(uiUtils).toContain("export function cn");
    expect(uiUtils).not.toContain("import { cn }");
  });

  it("rewrites hook default imports to named imports when target has no default", () => {
    const ws = new Workspace({
      "/hooks/useClass.jsx": `export function useClasses(){ return []; }`,
      "/pages/Dashboard/DashboardPage.jsx": `import useClass from "../../hooks/useClass";\nexport default function DashboardPage(){ const data = useClass(); return <div>{data.length}</div>; }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    const dashboard = ws.getFile("/pages/Dashboard/DashboardPage.jsx") || "";
    expect(dashboard).toContain('import { useClasses as useClass } from "../../hooks/useClass";');
  });

  it("prevents ToastContainer toasts.map crashes by normalizing app wiring and container defaults", () => {
    const ws = new Workspace({
      "/components/ui/Toast.jsx": `import React from "react";
export function ToastProvider({ children }) { return <>{children}</>; }
export function ToastContainer({ toasts, removeToast }) {
  return <div>{toasts.map((t) => <span key={t.id}>{t.message}</span>)}</div>;
}`,
      "/App.jsx": `import { ToastProvider, ToastContainer } from "./components/ui/Toast";
export default function App(){
  return <ToastProvider><div>App</div><ToastContainer /></ToastProvider>;
}`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    const toast = ws.getFile("/components/ui/Toast.jsx") || "";
    const app = ws.getFile("/App.jsx") || "";

    expect(toast).toContain("ToastContainer({ toasts = [], removeToast = () => {} })");
    expect(app).toContain('import { ToastProvider } from "./components/ui/Toast";');
    expect(app).not.toContain("<ToastContainer />");
  });

  it("replaces malformed StatCard with a safe fallback when JSX references undefined components", () => {
    const ws = new Workspace({
      "/components/StatCard.jsx": `export default function StatCard({ title, value }) {
  return <div><BadIcon className="w-4 h-4" />{title}:{value}</div>;
}`,
    });

    const fixed = normalizeGeneratedStructure(ws);
    const statCard = ws.getFile("/components/StatCard.jsx") || "";

    expect(fixed).toBeGreaterThan(0);
    expect(statCard).toContain("export default StatCard");
    expect(statCard).toContain("TrendingUp");
    expect(statCard).not.toContain("BadIcon");
  });
});
