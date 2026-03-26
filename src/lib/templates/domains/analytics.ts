/**
 * Analytics Dashboard Template
 */

import { registerTemplate, TEMPLATE_CSS, generateSidebar, generateHeader, generateStatsCards } from "./templateRegistry";

const ANALYTICS_APP = `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsCards from "./components/StatsCards";
import Charts from "./components/Charts";
import TopPages from "./components/TopPages";
import LiveVisitors from "./components/LiveVisitors";

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState("7d");

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-bg-secondary)]">
      <Sidebar activePage={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Analytics" subtitle="Website performance overview" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center gap-2">
            {["24h", "7d", "30d", "90d"].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={"px-3 py-1 rounded-lg text-sm font-medium transition-colors " +
                  (period === p ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]")
                }>{p}</button>
            ))}
          </div>
          <StatsCards />
          <Charts />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopPages />
            <LiveVisitors />
          </div>
        </main>
      </div>
    </div>
  );
}`;

const CHARTS = `import React from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const trafficData = [
  { day: "Mon", visitors: 2400, pageViews: 4800 },
  { day: "Tue", visitors: 1398, pageViews: 3200 },
  { day: "Wed", visitors: 3800, pageViews: 6800 },
  { day: "Thu", visitors: 3908, pageViews: 7200 },
  { day: "Fri", visitors: 4800, pageViews: 9100 },
  { day: "Sat", visitors: 3200, pageViews: 5800 },
  { day: "Sun", visitors: 2800, pageViews: 4900 },
];

const sourceData = [
  { source: "Direct", visits: 4200 },
  { source: "Google", visits: 3800 },
  { source: "Social", visits: 2400 },
  { source: "Referral", visits: 1800 },
  { source: "Email", visits: 1200 },
];

export default function Charts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-sm mb-4">Traffic Overview</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trafficData}>
            <defs>
              <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }} />
            <Area type="monotone" dataKey="visitors" stroke="var(--color-primary)" fill="url(#colorVisitors)" strokeWidth={2} />
            <Area type="monotone" dataKey="pageViews" stroke="var(--color-success)" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-sm mb-4">Traffic Sources</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={sourceData} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
            <YAxis type="category" dataKey="source" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={70} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }} />
            <Bar dataKey="visits" fill="var(--color-primary)" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}`;

const TOP_PAGES = `import React from "react";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";

const pages = [
  { path: "/", title: "Home", views: "12,480", unique: "8,320", bounce: "32%", trend: "up" },
  { path: "/pricing", title: "Pricing", views: "8,210", unique: "5,890", bounce: "28%", trend: "up" },
  { path: "/docs", title: "Documentation", views: "6,450", unique: "4,120", bounce: "18%", trend: "up" },
  { path: "/blog", title: "Blog", views: "5,230", unique: "3,780", bounce: "45%", trend: "down" },
  { path: "/about", title: "About Us", views: "3,100", unique: "2,340", bounce: "52%", trend: "down" },
  { path: "/contact", title: "Contact", views: "2,890", unique: "2,100", bounce: "35%", trend: "up" },
];

export default function TopPages() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
      <div className="p-5 border-b border-[var(--color-border)]">
        <h3 className="font-semibold text-sm">Top Pages</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase px-5 py-2.5">Page</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] uppercase px-5 py-2.5">Views</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] uppercase px-5 py-2.5">Unique</th>
              <th className="text-right text-xs font-medium text-[var(--color-text-muted)] uppercase px-5 py-2.5">Bounce</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(page => (
              <tr key={page.path} className="border-b last:border-0 border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{page.title}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{page.path}</span>
                  </div>
                </td>
                <td className="text-right px-5 py-3 text-sm">{page.views}</td>
                <td className="text-right px-5 py-3 text-sm text-[var(--color-text-secondary)]">{page.unique}</td>
                <td className="text-right px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-sm">{page.bounce}</span>
                    {page.trend === "up" ? <TrendingUp className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <TrendingDown className="w-3.5 h-3.5 text-[var(--color-danger)]" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}`;

const LIVE_VISITORS = `import React, { useState, useEffect } from "react";
import { Globe, Monitor, Smartphone, Tablet } from "lucide-react";

const countries = [
  { name: "United States", flag: "🇺🇸", visitors: 142 },
  { name: "United Kingdom", flag: "🇬🇧", visitors: 89 },
  { name: "Germany", flag: "🇩🇪", visitors: 67 },
  { name: "Japan", flag: "🇯🇵", visitors: 45 },
  { name: "Brazil", flag: "🇧🇷", visitors: 38 },
  { name: "India", flag: "🇮🇳", visitors: 31 },
];

const maxVisitors = Math.max(...countries.map(c => c.visitors));

export default function LiveVisitors() {
  const [total, setTotal] = useState(412);

  useEffect(() => {
    const interval = setInterval(() => {
      setTotal(prev => prev + Math.floor(Math.random() * 5) - 2);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-sm">Live Visitors</h3>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
          <span className="text-2xl font-bold">{total}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5 p-3 bg-[var(--color-bg-secondary)] rounded-lg">
        <div className="flex items-center gap-2 flex-1">
          <Monitor className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <div><p className="text-xs text-[var(--color-text-muted)]">Desktop</p><p className="text-sm font-semibold">62%</p></div>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Smartphone className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <div><p className="text-xs text-[var(--color-text-muted)]">Mobile</p><p className="text-sm font-semibold">31%</p></div>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Tablet className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <div><p className="text-xs text-[var(--color-text-muted)]">Tablet</p><p className="text-sm font-semibold">7%</p></div>
        </div>
      </div>

      <h4 className="text-xs font-medium text-[var(--color-text-muted)] uppercase mb-3">By Country</h4>
      <div className="space-y-3">
        {countries.map(country => (
          <div key={country.name} className="flex items-center gap-3">
            <span className="text-lg">{country.flag}</span>
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span>{country.name}</span>
                <span className="font-medium">{country.visitors}</span>
              </div>
              <div className="h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-primary)] rounded-full transition-all"
                  style={{ width: (country.visitors / maxVisitors * 100) + "%" }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}`;

registerTemplate({
  id: "analytics-dashboard",
  name: "Analytics Dashboard",
  category: "dashboard",
  keywords: ["analytics", "metrics", "traffic", "visitors", "pageviews", "monitoring", "statistics", "web analytics"],
  description: "Website analytics dashboard with traffic charts, top pages, and live visitors",
  variables: ["APP_NAME"],
  deps: { "lucide-react": "^0.400.0", "recharts": "^2.15.0" },
  files: {
    "/App.jsx": ANALYTICS_APP,
    "/components/Sidebar.jsx": generateSidebar("{{APP_NAME}}", [
      { icon: "LayoutDashboard", label: "Dashboard" },
      { icon: "BarChart3", label: "Analytics" },
      { icon: "Users", label: "Audience" },
      { icon: "Globe", label: "Acquisition" },
      { icon: "MousePointer", label: "Behavior" },
      { icon: "Target", label: "Conversions" },
      { icon: "Settings", label: "Settings" },
    ]),
    "/components/Header.jsx": generateHeader(true),
    "/components/StatsCards.jsx": generateStatsCards([
      { label: "Total Visitors", value: "24,589", change: "+14.2%", icon: "Users", trend: "up" },
      { label: "Page Views", value: "68,420", change: "+8.7%", icon: "Eye", trend: "up" },
      { label: "Bounce Rate", value: "34.2%", change: "-2.1%", icon: "TrendingDown", trend: "up" },
      { label: "Avg. Duration", value: "3m 42s", change: "+12s", icon: "Clock", trend: "up" },
    ]),
    "/components/Charts.jsx": CHARTS,
    "/components/TopPages.jsx": TOP_PAGES,
    "/components/LiveVisitors.jsx": LIVE_VISITORS,
    "/styles.css": TEMPLATE_CSS,
  },
});
