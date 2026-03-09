import type { InstantTemplate } from "../instantTemplates";

export const DASHBOARD: InstantTemplate = {
  id: "dashboard",
  matchIds: ["dashboard", "dashboard-app"],
  deps: { "lucide-react": "^0.400.0", "recharts": "^2.15.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsCards from "./components/StatsCards";
import Charts from "./components/Charts";
import RecentTable from "./components/RecentTable";
import QuickActions from "./components/QuickActions";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [page, setPage] = useState("Dashboard");
  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} activePage={page} onNavigate={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} title={page} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <StatsCards />
          <Charts />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><RecentTable /></div>
            <QuickActions />
          </div>
        </main>
      </div>
    </div>
  );
}`,

    "/components/Sidebar.jsx": `import React from "react";
import { LayoutDashboard, Users, BarChart3, FileText, ShoppingCart, Settings, HelpCircle, ChevronLeft, Zap } from "lucide-react";

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
    <aside className={"h-full bg-gray-900 text-white flex flex-col transition-all duration-300 " + (open ? "w-64" : "w-20")}>
      <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
        {open && <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5" /></div>
          <span className="font-bold tracking-tight text-sm">{{APP_NAME}}</span>
        </div>}
        {!open && <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto"><Zap className="w-5 h-5" /></div>}
        <button onClick={onToggle} className={"text-gray-400 hover:text-white transition-colors " + (!open && "hidden")}>
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {nav.map(n => (
          <button key={n.label} onClick={() => onNavigate(n.label)}
            className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all " + 
              (activePage === n.label ? "bg-blue-600 text-white font-medium" : "text-gray-400 hover:text-white hover:bg-white/5")}>
            <n.icon className="w-5 h-5 flex-shrink-0" />
            {open && <span>{n.label}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white text-sm rounded-lg hover:bg-white/5 transition-colors">
          <HelpCircle className="w-5 h-5 flex-shrink-0" />
          {open && <span>Help & Support</span>}
        </button>
      </div>
    </aside>
  );
}`,

    "/components/Header.jsx": `import React from "react";
import { Search, Bell, Menu } from "lucide-react";

export default function Header({ onMenuToggle, title }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <button onClick={onMenuToggle} className="lg:hidden p-2 text-gray-500 hover:text-gray-700"><Menu className="w-5 h-5" /></button>
        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
          <Search className="w-4 h-4 text-gray-400" />
          <input placeholder="Search..." className="bg-transparent text-sm outline-none w-48 text-gray-700 placeholder:text-gray-400" />
        </div>
        <button className="relative p-2 text-gray-500 hover:text-gray-700">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">A</div>
      </div>
    </header>
  );
}`,

    "/components/StatsCards.jsx": `import React from "react";
import { TrendingUp, TrendingDown, Users, DollarSign, ShoppingCart, Eye } from "lucide-react";

const stats = [
  { icon: DollarSign, label: "Revenue", value: "$48,294", change: "+12.5%", up: true, color: "bg-blue-500" },
  { icon: Users, label: "Active Users", value: "2,847", change: "+8.2%", up: true, color: "bg-emerald-500" },
  { icon: ShoppingCart, label: "Orders", value: "1,394", change: "-2.4%", up: false, color: "bg-amber-500" },
  { icon: Eye, label: "Page Views", value: "89.4K", change: "+18.7%", up: true, color: "bg-purple-500" },
];

export default function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className={"w-10 h-10 rounded-xl " + s.color + " flex items-center justify-center"}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <span className={"flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full " + (s.up ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50")}>
              {s.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {s.change}
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          <p className="text-sm text-gray-500 mt-1">{s.label}</p>
        </div>
      ))}
    </div>
  );
}`,

    "/components/Charts.jsx": `import React from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const revenueData = [
  { name: "Mon", value: 4200 }, { name: "Tue", value: 3800 }, { name: "Wed", value: 5100 },
  { name: "Thu", value: 4600 }, { name: "Fri", value: 6200 }, { name: "Sat", value: 5800 }, { name: "Sun", value: 7100 },
];
const categoryData = [
  { name: "Electronics", value: 4200 }, { name: "Clothing", value: 3100 },
  { name: "Food", value: 2800 }, { name: "Books", value: 1900 }, { name: "Sports", value: 2400 },
];

export default function Charts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h3 className="font-semibold text-gray-800">Revenue</h3><p className="text-sm text-gray-500">Last 7 days</p></div>
          <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">+12.5%</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={revenueData}>
            <defs><linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" }} />
            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5} fill="url(#colorVal)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h3 className="font-semibold text-gray-800">Top Categories</h3><p className="text-sm text-gray-500">By revenue</p></div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={categoryData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }} />
            <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}`,

    "/components/RecentTable.jsx": `import React from "react";

const orders = [
  { id: "#ORD-7892", customer: "Sarah Johnson", product: "Pro Plan", amount: "$299.00", status: "Completed", statusColor: "bg-emerald-100 text-emerald-700" },
  { id: "#ORD-7891", customer: "Mike Chen", product: "Starter Pack", amount: "$49.00", status: "Processing", statusColor: "bg-blue-100 text-blue-700" },
  { id: "#ORD-7890", customer: "Emily Davis", product: "Enterprise", amount: "$999.00", status: "Completed", statusColor: "bg-emerald-100 text-emerald-700" },
  { id: "#ORD-7889", customer: "Alex Kumar", product: "Pro Plan", amount: "$299.00", status: "Pending", statusColor: "bg-amber-100 text-amber-700" },
  { id: "#ORD-7888", customer: "Lisa Park", product: "Starter Pack", amount: "$49.00", status: "Cancelled", statusColor: "bg-red-100 text-red-700" },
  { id: "#ORD-7887", customer: "Tom Wilson", product: "Pro Plan", amount: "$299.00", status: "Completed", statusColor: "bg-emerald-100 text-emerald-700" },
];

export default function RecentTable() {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <div className="p-5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">Recent Orders</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left">
            <th className="px-5 py-3 text-gray-500 font-medium">Order</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Customer</th>
            <th className="px-5 py-3 text-gray-500 font-medium hidden md:table-cell">Product</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Amount</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-gray-900">{o.id}</td>
                <td className="px-5 py-3.5 text-gray-600">{o.customer}</td>
                <td className="px-5 py-3.5 text-gray-600 hidden md:table-cell">{o.product}</td>
                <td className="px-5 py-3.5 font-medium text-gray-900">{o.amount}</td>
                <td className="px-5 py-3.5"><span className={"px-2.5 py-1 text-xs font-medium rounded-full " + o.statusColor}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}`,

    "/components/QuickActions.jsx": `import React from "react";
import { Plus, Download, Send, RefreshCw } from "lucide-react";

const actions = [
  { icon: Plus, label: "New Order", color: "bg-blue-50 text-blue-600 hover:bg-blue-100" },
  { icon: Download, label: "Export Data", color: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" },
  { icon: Send, label: "Send Report", color: "bg-purple-50 text-purple-600 hover:bg-purple-100" },
  { icon: RefreshCw, label: "Sync Data", color: "bg-amber-50 text-amber-600 hover:bg-amber-100" },
];

export default function QuickActions() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Quick Actions</h3>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <button key={i} className={"w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors " + a.color}>
            <a.icon className="w-4 h-4" /> {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-gray-50 text-gray-800 antialiased; }
}`,
  },
};
