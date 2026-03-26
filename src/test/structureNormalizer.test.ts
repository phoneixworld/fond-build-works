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
    // .jsx files get renamed to .tsx
    expect(ws.hasFile("/pages/components/StatCard.jsx")).toBe(false);
    expect(ws.hasFile("/pages/components/StatCard.tsx")).toBe(false);
    // Dashboard was renamed too
    const dashboard = ws.getFile("/pages/Dashboard.tsx") || "";
    expect(dashboard).toContain("StatCard");
  });

  it("deletes legacy utils and ensures /lib/utils.ts exists", () => {
    const ws = new Workspace({
      "/components/ui/utils.js": `export function cn(...inputs){ return inputs.filter(Boolean).join(" "); }`,
      "/components/ui/Button.tsx": `import { cn } from "./utils";\nexport function Button({ children }) { return <button className={cn("btn")}>{children}</button>; }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    // components/ui/utils.* must be gone
    expect(ws.hasFile("/components/ui/utils.js")).toBe(false);
    expect(ws.hasFile("/components/ui/utils.ts")).toBe(false);
    // /utils/cn.ts must NOT exist (removed)
    expect(ws.hasFile("/utils/cn.ts")).toBe(false);
    // /lib/utils.ts must exist
    const cnFile = ws.getFile("/lib/utils.ts") || "";
    expect(cnFile).toContain("export function cn");
  });

  it("rewrites hook default imports to named imports when target has no default", () => {
    const ws = new Workspace({
      "/hooks/useClass.jsx": `export function useClasses(){ return []; }`,
      "/pages/Dashboard/DashboardPage.jsx": `import useClass from "../../hooks/useClass";\nexport default function DashboardPage(){ const data = useClass(); return <div>{data.length}</div>; }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    // File was renamed to .tsx
    const dashboard = ws.getFile("/pages/Dashboard/DashboardPage.tsx") || "";
    expect(dashboard).toContain("useClasses");
  });

  it("prevents ToastContainer toasts.map crashes by normalizing app wiring and container defaults", () => {
    const ws = new Workspace({
      "/components/ui/Toast.tsx": `import React from "react";
export function ToastProvider({ children }) { return <>{children}</>; }
export function ToastContainer({ toasts, removeToast }) {
  return <div>{toasts.map((t) => <span key={t.id}>{t.message}</span>)}</div>;
}`,
      "/App.tsx": `import { ToastProvider, ToastContainer } from "./components/ui/Toast";
export default function App(){
  return <ToastProvider><div>App</div><ToastContainer /></ToastProvider>;
}`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    const toast = ws.getFile("/components/ui/Toast.tsx") || "";
    const app = ws.getFile("/App.tsx") || "";

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
    const statCard = ws.getFile("/components/StatCard.tsx") || "";

    expect(fixed).toBeGreaterThan(0);
    expect(statCard).toContain("export default StatCard");
    expect(statCard).toContain("TrendingUp");
    expect(statCard).not.toContain("BadIcon");
  });

  it("moves domain components from /components/ui/ to /components/", () => {
    const ws = new Workspace({
      "/components/ui/Button.tsx": `import React from "react";\nexport function Button({ children }) { return <button>{children}</button>; }`,
      "/components/ui/StatCard.tsx": `import React from "react";\nexport default function StatCard() { return <div>stat</div>; }`,
      "/components/ui/ActivityFeed.tsx": `import React from "react";\nexport default function ActivityFeed() { return <div>feed</div>; }`,
      "/pages/Dashboard.tsx": `import StatCard from "../components/ui/StatCard";\nexport default function Dashboard() { return <StatCard />; }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    // Domain components moved out of ui/
    expect(ws.hasFile("/components/ui/StatCard.tsx")).toBe(false);
    expect(ws.hasFile("/components/ui/ActivityFeed.tsx")).toBe(false);
    // Button stays in ui/
    expect(ws.hasFile("/components/ui/Button.tsx")).toBe(true);
    // Domain components exist at /components/
    expect(ws.hasFile("/components/StatCard.tsx")).toBe(true);
    expect(ws.hasFile("/components/ActivityFeed.tsx")).toBe(true);
  });

  it("renames .jsx files to .tsx", () => {
    const ws = new Workspace({
      "/components/Hero.jsx": `import React from "react";\nexport default function Hero() { return <div>Hero</div>; }`,
      "/pages/Home.jsx": `import Hero from "../components/Hero";\nexport default function Home() { return <Hero />; }`,
    });

    const fixed = normalizeGeneratedStructure(ws);

    expect(fixed).toBeGreaterThan(0);
    expect(ws.hasFile("/components/Hero.jsx")).toBe(false);
    expect(ws.hasFile("/components/Hero.tsx")).toBe(true);
    expect(ws.hasFile("/pages/Home.jsx")).toBe(false);
    expect(ws.hasFile("/pages/Home.tsx")).toBe(true);
  });

  it("does not generate /utils/cn.ts (uses /lib/utils.ts instead)", () => {
    const ws = new Workspace({
      "/utils/cn.ts": `export function cn(...classes) { return classes.filter(Boolean).join(" "); }`,
      "/components/ui/Button.tsx": `import { cn } from "../utils/cn";\nexport function Button({ children }) { return <button className={cn("btn")}>{children}</button>; }`,
    });

    normalizeGeneratedStructure(ws);

    // /utils/cn.ts must be deleted
    expect(ws.hasFile("/utils/cn.ts")).toBe(false);
    // /lib/utils.ts must exist
    expect(ws.hasFile("/lib/utils.ts")).toBe(true);
    // Button import should point to ../lib/utils
    const button = ws.getFile("/components/ui/Button.tsx") || "";
    expect(button).toContain("../lib/utils");
  });
});
