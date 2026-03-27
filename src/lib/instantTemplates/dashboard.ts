import type { InstantTemplate } from "../instantTemplates";

export const DASHBOARD: InstantTemplate = {
  id: "dashboard",
  matchIds: ["dashboard", "dashboard-app", "admin-dashboard", "analytics-dashboard"],
  deps: {
    "lucide-react": "^0.400.0",
    "recharts": "^2.15.0",
    "framer-motion": "^11.0.0",
  },
  files: {
    "/App.jsx": `import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsCards from "./components/StatsCards";
import Charts from "./components/Charts";
import RecentTable from "./components/RecentTable";
import QuickActions from "./components/QuickActions";
import ActivityTimeline from "./components/ActivityTimeline";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [page, setPage] = useState("Dashboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen flex bg-[var(--surface-primary)] overflow-hidden">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} activePage={page} onNavigate={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} title={page} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <StatsCards loading={loading} />
          <Charts loading={loading} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><RecentTable loading={loading} /></div>
            <div className="space-y-6">
              <QuickActions />
              <ActivityTimeline />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}`,

    "/components/Sidebar.jsx": `import React from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, Users, BarChart3, FileText, ShoppingCart, Settings, HelpCircle, ChevronLeft, Zap, Sparkles } from "lucide-react";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Users, label: "Users" },
  { icon: ShoppingCart, label: "Orders" },
  { icon: FileText, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

export default function Sidebar({ open, onToggle, activePage, onNavigate }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 256 : 72 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="h-full bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] flex flex-col flex-shrink-0 border-r border-[var(--border-subtle)]"
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--accent-primary)]/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {open && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-bold text-sm tracking-tight whitespace-nowrap">{{APP_NAME}}</motion.span>}
        </div>
        {open && (
          <button onClick={onToggle} className="p-1.5 rounded-lg text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {nav.map(n => {
          const active = activePage === n.label;
          return (
            <button key={n.label} onClick={() => onNavigate(n.label)}
              className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative " +
                (active ? "bg-[var(--accent-primary)] text-white font-semibold shadow-md shadow-[var(--accent-primary)]/25" : "text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]")
              }>
              <n.icon className="w-[18px] h-[18px] flex-shrink-0" />
              {open && <span className="truncate">{n.label}</span>}
              {active && !open && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />}
            </button>
          );
        })}
      </nav>
      {open && (
        <div className="p-3">
          <div className="p-4 bg-gradient-to-br from-[var(--accent-primary)]/10 to-[var(--accent-secondary)]/10 border border-[var(--accent-primary)]/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-xs font-bold text-[var(--sidebar-text)]">Pro Features</span>
            </div>
            <p className="text-[11px] text-[var(--sidebar-text-muted)] mb-3 leading-relaxed">Unlock advanced analytics, custom reports & API access.</p>
            <button className="w-full py-2 bg-[var(--accent-primary)] text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-[var(--accent-primary)]/30 transition-all active:scale-[0.97]">Upgrade Now</button>
          </div>
        </div>
      )}
      <div className="p-2 border-t border-[var(--border-subtle)]">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] text-sm rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors">
          <HelpCircle className="w-[18px] h-[18px] flex-shrink-0" />
          {open && <span>Help & Support</span>}
        </button>
      </div>
    </motion.aside>
  );
}`,

    "/components/Header.jsx": `import React from "react";
import { Search, Bell, Menu, Calendar } from "lucide-react";

export default function Header({ onMenuToggle, title }) {
  return (
    <header className="h-16 bg-[var(--surface-primary)] border-b border-[var(--border-default)] flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-4">
        <button onClick={onMenuToggle} className="lg:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors"><Menu className="w-5 h-5" /></button>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
          <p className="text-xs text-[var(--text-muted)] hidden sm:block">Welcome back! Here's what's happening.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-2 px-3.5 py-2 bg-[var(--surface-secondary)] rounded-xl border border-transparent focus-within:border-[var(--accent-primary)]/30 focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/10 transition-all">
          <Search className="w-4 h-4 text-[var(--text-muted)]" />
          <input placeholder="Search..." className="bg-transparent text-sm outline-none w-48 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
        </div>
        <button className="p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors hidden md:flex">
          <Calendar className="w-5 h-5" />
        </button>
        <button className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[var(--status-error)] rounded-full border-2 border-[var(--surface-primary)]" />
        </button>
        <div className="w-px h-6 bg-[var(--border-subtle)] mx-1 hidden md:block" />
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white text-sm font-bold shadow-md shadow-[var(--accent-primary)]/20 cursor-pointer">A</div>
      </div>
    </header>
  );
}`,

    "/components/StatsCards.jsx": `import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Users, DollarSign, ShoppingCart, Eye, ArrowUpRight, ArrowDownRight } from "lucide-react";

const stats = [
  { icon: DollarSign, label: "Revenue", value: "$48,294", change: "+12.5%", up: true, gradient: "from-emerald-500 to-teal-600" },
  { icon: Users, label: "Active Users", value: "2,847", change: "+8.2%", up: true, gradient: "from-blue-500 to-indigo-600" },
  { icon: ShoppingCart, label: "Orders", value: "1,394", change: "-2.4%", up: false, gradient: "from-amber-500 to-orange-600" },
  { icon: Eye, label: "Page Views", value: "89.4K", change: "+18.7%", up: true, gradient: "from-violet-500 to-purple-600" },
];

function Skeleton() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4"><div className="w-11 h-11 rounded-xl bg-[var(--surface-secondary)]" /><div className="h-3 w-16 bg-[var(--surface-secondary)] rounded-full" /></div>
      <div className="h-7 w-24 bg-[var(--surface-secondary)] rounded-lg mb-2" />
      <div className="h-3 w-16 bg-[var(--surface-secondary)] rounded-full" />
    </div>
  );
}

export default function StatsCards({ loading }) {
  if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[0,1,2,3].map(i => <Skeleton key={i} />)}</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.4 }}
          className="group bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-5 hover:shadow-xl hover:shadow-black/[0.04] hover:border-[var(--border-active)] transition-all duration-300 cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <div className={"w-11 h-11 rounded-xl bg-gradient-to-br " + s.gradient + " flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-110 transition-transform duration-300"}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <span className={"flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full " + (s.up ? "text-[var(--status-success)] bg-[var(--status-success)]/10" : "text-[var(--status-error)] bg-[var(--status-error)]/10")}>
              {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{s.change}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">{s.value}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">{s.label}</p>
        </motion.div>
      ))}
    </div>
  );
}`,

    "/components/Charts.jsx": `import React from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const revenueData = [
  { name: "Mon", value: 4200 }, { name: "Tue", value: 3800 }, { name: "Wed", value: 5100 },
  { name: "Thu", value: 4600 }, { name: "Fri", value: 6200 }, { name: "Sat", value: 5800 }, { name: "Sun", value: 7100 },
];
const categoryData = [
  { name: "Electronics", value: 4200 }, { name: "Clothing", value: 3100 },
  { name: "Food", value: 2800 }, { name: "Books", value: 1900 }, { name: "Sports", value: 2400 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--surface-primary)] border border-[var(--border-default)] rounded-xl p-3 shadow-xl shadow-black/10">
      <p className="text-xs font-bold text-[var(--text-primary)]">{label}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">\${payload[0]?.value?.toLocaleString()}</p>
    </div>
  );
};

function ChartSkeleton() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-6 animate-pulse">
      <div className="h-5 w-28 bg-[var(--surface-secondary)] rounded-lg mb-2" />
      <div className="h-3 w-20 bg-[var(--surface-secondary)] rounded mb-6" />
      <div className="h-[240px] bg-[var(--surface-secondary)] rounded-xl" />
    </div>
  );
}

export default function Charts({ loading }) {
  if (loading) return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ChartSkeleton /><ChartSkeleton /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h3 className="font-bold text-[var(--text-primary)]">Revenue</h3><p className="text-xs text-[var(--text-muted)] mt-0.5">Last 7 days</p></div>
          <span className="text-xs font-semibold text-[var(--status-success)] bg-[var(--status-success)]/10 px-2.5 py-1 rounded-full">+12.5%</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={revenueData}>
            <defs><linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.2}/><stop offset="100%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorVal)" dot={{ r: 4, fill: "#6366f1", stroke: "var(--surface-primary)", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h3 className="font-bold text-[var(--text-primary)]">Top Categories</h3><p className="text-xs text-[var(--text-muted)] mt-0.5">By revenue</p></div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={categoryData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}`,

    "/components/RecentTable.jsx": `import React from "react";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";

const orders = [
  { id: "#ORD-7892", customer: "Sarah Johnson", product: "Pro Plan", amount: "$299.00", status: "Completed", color: "bg-[var(--status-success)]/10 text-[var(--status-success)] border border-[var(--status-success)]/20", avatar: "SJ", gradient: "from-pink-400 to-rose-400" },
  { id: "#ORD-7891", customer: "Mike Chen", product: "Starter Pack", amount: "$49.00", status: "Processing", color: "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20", avatar: "MC", gradient: "from-blue-400 to-cyan-400" },
  { id: "#ORD-7890", customer: "Emily Davis", product: "Enterprise", amount: "$999.00", status: "Completed", color: "bg-[var(--status-success)]/10 text-[var(--status-success)] border border-[var(--status-success)]/20", avatar: "ED", gradient: "from-emerald-400 to-green-400" },
  { id: "#ORD-7889", customer: "Alex Kumar", product: "Pro Plan", amount: "$299.00", status: "Pending", color: "bg-[var(--status-warning)]/10 text-[var(--status-warning)] border border-[var(--status-warning)]/20", avatar: "AK", gradient: "from-amber-400 to-orange-400" },
  { id: "#ORD-7888", customer: "Lisa Park", product: "Starter Pack", amount: "$49.00", status: "Cancelled", color: "bg-[var(--status-error)]/10 text-[var(--status-error)] border border-[var(--status-error)]/20", avatar: "LP", gradient: "from-red-400 to-rose-400" },
];

function SkeletonTable() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] animate-pulse">
      <div className="p-5 border-b border-[var(--border-subtle)]"><div className="h-5 w-28 bg-[var(--surface-secondary)] rounded-lg" /></div>
      {[0,1,2,3].map(i => <div key={i} className="flex gap-4 px-5 py-4 border-b border-[var(--border-subtle)]"><div className="w-9 h-9 rounded-full bg-[var(--surface-secondary)]" /><div className="flex-1 space-y-2"><div className="h-3 w-1/3 bg-[var(--surface-secondary)] rounded" /><div className="h-3 w-1/4 bg-[var(--surface-secondary)] rounded" /></div></div>)}
    </div>
  );
}

export default function RecentTable({ loading }) {
  if (loading) return <SkeletonTable />;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
      className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] overflow-hidden">
      <div className="p-5 border-b border-[var(--border-subtle)] flex justify-between items-center">
        <div><h3 className="font-bold text-[var(--text-primary)]">Recent Orders</h3><p className="text-xs text-[var(--text-muted)] mt-0.5">Latest transactions</p></div>
        <button className="text-xs text-[var(--accent-primary)] font-semibold hover:underline">View all</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border-subtle)] text-left bg-[var(--surface-secondary)]/40">
            <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Order</th>
            <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Customer</th>
            <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Product</th>
            <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Amount</th>
            <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Status</th>
            <th className="px-5 py-3 w-10"></th>
          </tr></thead>
          <tbody>
            {orders.map((o, i) => (
              <motion.tr key={o.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.05 }}
                className="border-b border-[var(--border-subtle)] hover:bg-[var(--accent-primary)]/[0.03] transition-colors">
                <td className="px-5 py-3.5 font-bold text-[var(--text-primary)] text-xs">{o.id}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={"w-8 h-8 rounded-full bg-gradient-to-br " + o.gradient + " flex items-center justify-center text-white text-[10px] font-bold shadow-sm"}>{o.avatar}</div>
                    <span className="text-[var(--text-primary)] font-medium">{o.customer}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[var(--text-muted)] hidden md:table-cell">{o.product}</td>
                <td className="px-5 py-3.5 font-bold text-[var(--text-primary)]">{o.amount}</td>
                <td className="px-5 py-3.5"><span className={"px-2.5 py-1 text-[11px] font-semibold rounded-full " + o.color}>{o.status}</span></td>
                <td className="px-5 py-3.5"><button className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors"><MoreHorizontal className="w-4 h-4" /></button></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}`,

    "/components/QuickActions.jsx": `import React from "react";
import { motion } from "framer-motion";
import { Plus, Download, Send, RefreshCw } from "lucide-react";

const actions = [
  { icon: Plus, label: "New Order", gradient: "from-blue-500 to-indigo-500" },
  { icon: Download, label: "Export Data", gradient: "from-emerald-500 to-teal-500" },
  { icon: Send, label: "Send Report", gradient: "from-violet-500 to-purple-500" },
  { icon: RefreshCw, label: "Sync Data", gradient: "from-amber-500 to-orange-500" },
];

export default function QuickActions() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
      className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-5">
      <h3 className="font-bold text-[var(--text-primary)] mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a, i) => (
          <button key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-secondary)]/60 hover:bg-[var(--surface-secondary)] border border-transparent hover:border-[var(--border-default)] transition-all duration-200 hover:shadow-md hover:shadow-black/[0.03] group">
            <div className={"w-10 h-10 rounded-xl bg-gradient-to-br " + a.gradient + " flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-110 transition-transform"}>
              <a.icon className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{a.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}`,

    "/components/ActivityTimeline.jsx": `import React from "react";
import { motion } from "framer-motion";
import { ShoppingCart, User, CreditCard, Package, Star } from "lucide-react";

const events = [
  { icon: ShoppingCart, text: "New order #7892 placed", time: "2m ago", color: "text-blue-500 bg-blue-500/10" },
  { icon: User, text: "New user registered", time: "15m ago", color: "text-emerald-500 bg-emerald-500/10" },
  { icon: CreditCard, text: "Payment of $299 received", time: "1h ago", color: "text-violet-500 bg-violet-500/10" },
  { icon: Package, text: "Order #7886 shipped", time: "3h ago", color: "text-amber-500 bg-amber-500/10" },
  { icon: Star, text: "5-star review received", time: "5h ago", color: "text-pink-500 bg-pink-500/10" },
];

export default function ActivityTimeline() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
      className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] overflow-hidden">
      <div className="p-5 border-b border-[var(--border-subtle)]">
        <h3 className="font-bold text-[var(--text-primary)]">Activity</h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Real-time events</p>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {events.map((e, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.06 }}
            className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-secondary)]/40 transition-colors cursor-pointer">
            <div className={"w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 " + e.color}>
              <e.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{e.text}</p>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{e.time}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --surface-primary: #ffffff;
  --surface-secondary: #f8fafc;
  --sidebar-bg: #0f172a;
  --sidebar-text: #f1f5f9;
  --sidebar-text-muted: #94a3b8;
  --sidebar-hover: rgba(255, 255, 255, 0.06);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border-default: #e2e8f0;
  --border-subtle: #f1f5f9;
  --border-active: #cbd5e1;
  --accent-primary: #6366f1;
  --accent-secondary: #8b5cf6;
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-error: #ef4444;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface-primary: #0f172a;
    --surface-secondary: #1e293b;
    --sidebar-bg: #020617;
    --sidebar-text: #f1f5f9;
    --sidebar-text-muted: #64748b;
    --sidebar-hover: rgba(255, 255, 255, 0.04);
    --text-primary: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-muted: #64748b;
    --border-default: #1e293b;
    --border-subtle: #1e293b;
    --border-active: #334155;
    --accent-primary: #818cf8;
    --accent-secondary: #a78bfa;
    --status-success: #34d399;
    --status-warning: #fbbf24;
    --status-error: #f87171;
  }
}

@layer base {
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--surface-primary); color: var(--text-primary); -webkit-font-smoothing: antialiased; }
  * { scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
  *::-webkit-scrollbar { width: 6px; height: 6px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 100px; }
}`,
  },
};
