import type { InstantTemplate } from "../instantTemplates";

export const CRM: InstantTemplate = {
  id: "crm",
  matchIds: ["crm", "sales-crm", "customer-management"],
  deps: {
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
    "recharts": "^2.15.0",
  },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsRow from "./components/StatsRow";
import Pipeline from "./components/Pipeline";
import ContactsTable from "./components/ContactsTable";
import ActivityFeed from "./components/ActivityFeed";
import RevenueChart from "./components/RevenueChart";
import DealModal from "./components/DealModal";

export default function App() {
  const [view, setView] = useState("pipeline");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState("Deals");
  const [showDealModal, setShowDealModal] = useState(false);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen flex bg-[var(--surface-primary)] overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          view={view}
          onViewChange={setView}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          onNewDeal={() => setShowDealModal(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <StatsRow loading={loading} />
          <AnimatePresence mode="wait">
            {view === "pipeline" && (
              <motion.div
                key="pipeline"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <Pipeline loading={loading} />
              </motion.div>
            )}
            {view === "table" && (
              <motion.div
                key="table"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <ContactsTable loading={loading} />
              </motion.div>
            )}
            {view === "analytics" && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2"><RevenueChart /></div>
                  <ActivityFeed />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {showDealModal && <DealModal onClose={() => setShowDealModal(false)} />}
      </AnimatePresence>
    </div>
  );
}`,

    "/components/Sidebar.jsx": `import React from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Users, Target, Calendar, BarChart3,
  Mail, Settings, Zap, ChevronLeft, Sparkles
} from "lucide-react";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Target, label: "Deals" },
  { icon: Users, label: "Contacts" },
  { icon: Calendar, label: "Activities" },
  { icon: BarChart3, label: "Reports" },
  { icon: Mail, label: "Email" },
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
          {open && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-sm tracking-tight whitespace-nowrap"
            >
              {{APP_NAME}}
            </motion.span>
          )}
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
            <button
              key={n.label}
              onClick={() => onNavigate(n.label)}
              className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative " +
                (active
                  ? "bg-[var(--accent-primary)] text-white font-semibold shadow-md shadow-[var(--accent-primary)]/25"
                  : "text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]"
                )
              }
            >
              <n.icon className="w-[18px] h-[18px] flex-shrink-0" />
              {open && <span className="truncate">{n.label}</span>}
              {active && !open && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
              )}
            </button>
          );
        })}
      </nav>

      {open && (
        <div className="p-3">
          <div className="p-4 bg-gradient-to-br from-[var(--accent-primary)]/10 to-[var(--accent-secondary)]/10 border border-[var(--accent-primary)]/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-xs font-bold text-[var(--sidebar-text)]">Upgrade to Pro</span>
            </div>
            <p className="text-[11px] text-[var(--sidebar-text-muted)] mb-3 leading-relaxed">
              Unlock AI insights, automation workflows & advanced analytics.
            </p>
            <button className="w-full py-2 bg-[var(--accent-primary)] text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-[var(--accent-primary)]/30 transition-all active:scale-[0.97]">
              Upgrade Now
            </button>
          </div>
        </div>
      )}
    </motion.aside>
  );
}`,

    "/components/Header.jsx": `import React from "react";
import { motion } from "framer-motion";
import { Search, Bell, Plus, Menu, Filter, ArrowUpDown } from "lucide-react";

const tabs = [
  { id: "pipeline", label: "Pipeline" },
  { id: "table", label: "Contacts" },
  { id: "analytics", label: "Analytics" },
];

export default function Header({ view, onViewChange, onMenuToggle, onNewDeal }) {
  return (
    <header className="h-16 bg-[var(--surface-primary)] border-b border-[var(--border-default)] flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-4">
        <button onClick={onMenuToggle} className="lg:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-[var(--text-primary)] hidden sm:block">Deals</h1>
        <div className="flex bg-[var(--surface-secondary)] rounded-xl p-1 gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => onViewChange(t.id)}
              className={"relative px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all " +
                (view === t.id ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")
              }
            >
              {view === t.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-[var(--surface-primary)] rounded-lg shadow-sm border border-[var(--border-subtle)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-2 px-3.5 py-2 bg-[var(--surface-secondary)] rounded-xl border border-transparent focus-within:border-[var(--accent-primary)]/30 focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/10 transition-all">
          <Search className="w-4 h-4 text-[var(--text-muted)]" />
          <input placeholder="Search deals, contacts..." className="bg-transparent text-sm outline-none w-52 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
        </div>
        <button className="p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors hidden md:flex">
          <Filter className="w-4 h-4" />
        </button>
        <button className="p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors hidden md:flex">
          <ArrowUpDown className="w-4 h-4" />
        </button>
        <button className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[var(--status-error)] rounded-full border-2 border-[var(--surface-primary)]" />
        </button>
        <div className="w-px h-6 bg-[var(--border-subtle)] mx-1 hidden md:block" />
        <button
          onClick={onNewDeal}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 active:scale-[0.97] transition-all"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Deal</span>
        </button>
      </div>
    </header>
  );
}`,

    "/components/StatsRow.jsx": `import React from "react";
import { motion } from "framer-motion";
import { DollarSign, Target, TrendingUp, Award, ArrowUpRight, ArrowDownRight } from "lucide-react";

const stats = [
  { icon: DollarSign, label: "Total Revenue", value: "$284,500", change: "+12.5%", up: true, gradient: "from-emerald-500 to-teal-600" },
  { icon: Target, label: "Active Deals", value: "47", change: "+8 new", up: true, gradient: "from-blue-500 to-indigo-600" },
  { icon: TrendingUp, label: "Conversion Rate", value: "32.8%", change: "+4.2%", up: true, gradient: "from-violet-500 to-purple-600" },
  { icon: Award, label: "Won This Month", value: "$68,200", change: "-2.1%", up: false, gradient: "from-amber-500 to-orange-600" },
];

function Skeleton() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-[var(--surface-secondary)]" />
        <div className="h-3 w-20 bg-[var(--surface-secondary)] rounded-full" />
      </div>
      <div className="h-7 w-24 bg-[var(--surface-secondary)] rounded-lg mb-2" />
      <div className="h-3 w-16 bg-[var(--surface-secondary)] rounded-full" />
    </div>
  );
}

export default function StatsRow({ loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <Skeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
          className="group bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-5 hover:shadow-xl hover:shadow-black/[0.04] hover:border-[var(--border-active)] transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={"w-11 h-11 rounded-xl bg-gradient-to-br " + s.gradient + " flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-110 transition-transform duration-300"}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <span className={"flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full " +
              (s.up
                ? "text-[var(--status-success)] bg-[var(--status-success)]/10"
                : "text-[var(--status-error)] bg-[var(--status-error)]/10"
              )
            }>
              {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {s.change}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">{s.value}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">{s.label}</p>
        </motion.div>
      ))}
    </div>
  );
}`,

    "/components/Pipeline.jsx": `import React from "react";
import { motion } from "framer-motion";
import { MoreHorizontal, DollarSign, Clock, GripVertical } from "lucide-react";

const stages = [
  { name: "Lead", count: 3, value: "$45.5K", color: "from-blue-400 to-blue-500", borderColor: "border-t-blue-500", deals: [
    { title: "Website Redesign", company: "Acme Corp", value: "$12,000", contact: "JD", daysAgo: 2, probability: 20, avatar: "from-blue-400 to-cyan-400" },
    { title: "Mobile App MVP", company: "TechStart", value: "$28,000", contact: "SK", daysAgo: 5, probability: 15, avatar: "from-pink-400 to-rose-400" },
    { title: "SEO Package", company: "GrowFast", value: "$5,500", contact: "MP", daysAgo: 1, probability: 10, avatar: "from-emerald-400 to-green-400" },
  ]},
  { name: "Qualified", count: 2, value: "$63K", color: "from-indigo-400 to-indigo-500", borderColor: "border-t-indigo-500", deals: [
    { title: "Cloud Migration", company: "DataFlow Inc", value: "$45,000", contact: "AL", daysAgo: 3, probability: 40, avatar: "from-purple-400 to-violet-400" },
    { title: "API Integration", company: "ConnectIO", value: "$18,000", contact: "RW", daysAgo: 7, probability: 35, avatar: "from-amber-400 to-orange-400" },
  ]},
  { name: "Proposal", count: 3, value: "$134.5K", color: "from-amber-400 to-amber-500", borderColor: "border-t-amber-500", deals: [
    { title: "Enterprise Suite", company: "BigCorp Ltd", value: "$92,000", contact: "TB", daysAgo: 1, probability: 65, avatar: "from-red-400 to-rose-400" },
    { title: "Dashboard Build", company: "InsightCo", value: "$34,000", contact: "EL", daysAgo: 4, probability: 55, avatar: "from-teal-400 to-cyan-400" },
    { title: "Branding Package", company: "FreshBrand", value: "$8,500", contact: "NP", daysAgo: 6, probability: 60, avatar: "from-fuchsia-400 to-pink-400" },
  ]},
  { name: "Won", count: 2, value: "$83K", color: "from-emerald-400 to-emerald-500", borderColor: "border-t-emerald-500", deals: [
    { title: "Platform Dev", company: "ScaleUp", value: "$68,000", contact: "JC", daysAgo: 0, probability: 100, avatar: "from-indigo-400 to-blue-400" },
    { title: "Consulting", company: "StrategyX", value: "$15,000", contact: "AH", daysAgo: 2, probability: 100, avatar: "from-lime-400 to-green-400" },
  ]},
];

function SkeletonPipeline() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0,1,2,3].map(i => (
        <div key={i} className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] animate-pulse">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <div className="h-4 w-20 bg-[var(--surface-secondary)] rounded-lg" />
          </div>
          <div className="p-3 space-y-3">
            {[0,1].map(j => (
              <div key={j} className="p-4 bg-[var(--surface-secondary)] rounded-xl">
                <div className="h-3 w-3/4 bg-[var(--border-default)] rounded mb-2" />
                <div className="h-3 w-1/2 bg-[var(--border-default)] rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Pipeline({ loading }) {
  if (loading) return <SkeletonPipeline />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stages.map((stage, si) => (
        <motion.div
          key={stage.name}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: si * 0.1, duration: 0.4 }}
          className={"bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] border-t-[3px] " + stage.borderColor + " overflow-hidden"}
        >
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5">
              <div className={"w-2 h-2 rounded-full bg-gradient-to-r " + stage.color} />
              <h3 className="font-bold text-sm text-[var(--text-primary)]">{stage.name}</h3>
              <span className="text-[11px] text-[var(--text-muted)] bg-[var(--surface-secondary)] px-2 py-0.5 rounded-full font-medium">{stage.count}</span>
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{stage.value}</span>
          </div>
          <div className="p-2.5 space-y-2">
            {stage.deals.map((d, di) => (
              <motion.div
                key={di}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: si * 0.1 + di * 0.05 }}
                className="group p-3.5 bg-[var(--surface-secondary)]/60 hover:bg-[var(--surface-secondary)] rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-black/[0.03] border border-transparent hover:border-[var(--border-default)]"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{d.title}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{d.company}</p>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-primary)] transition-all">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <div className={"w-6 h-6 rounded-full bg-gradient-to-br " + d.avatar + " flex items-center justify-center text-white text-[9px] font-bold shadow-sm"}>{d.contact}</div>
                    <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1 font-medium">
                      <DollarSign className="w-3 h-3" />{d.value}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />{d.daysAgo}d
                    </span>
                    <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " +
                      (d.probability >= 100 ? "bg-[var(--status-success)]/15 text-[var(--status-success)]"
                        : d.probability >= 50 ? "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
                        : "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]")
                    }>{d.probability}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}`,

    "/components/ContactsTable.jsx": `import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MoreHorizontal, ChevronDown, Check } from "lucide-react";

const contacts = [
  { name: "John Doe", email: "john@acme.com", company: "Acme Corp", role: "CTO", status: "Active", value: "$12,000", avatar: "JD", gradient: "from-blue-400 to-cyan-400", lastContact: "2h ago" },
  { name: "Sarah Kim", email: "sarah@techstart.com", company: "TechStart", role: "CEO", status: "Active", value: "$28,000", avatar: "SK", gradient: "from-pink-400 to-rose-400", lastContact: "5h ago" },
  { name: "Marcus Park", email: "marcus@growfast.io", company: "GrowFast", role: "VP Sales", status: "Lead", value: "$5,500", avatar: "MP", gradient: "from-emerald-400 to-green-400", lastContact: "1d ago" },
  { name: "Alex Liu", email: "alex@dataflow.co", company: "DataFlow", role: "CTO", status: "Active", value: "$45,000", avatar: "AL", gradient: "from-purple-400 to-violet-400", lastContact: "3h ago" },
  { name: "Tom Brown", email: "tom@bigcorp.com", company: "BigCorp", role: "Director", status: "Prospect", value: "$92,000", avatar: "TB", gradient: "from-amber-400 to-orange-400", lastContact: "2d ago" },
  { name: "Emma Lee", email: "emma@insightco.io", company: "InsightCo", role: "PM", status: "Active", value: "$34,000", avatar: "EL", gradient: "from-teal-400 to-cyan-400", lastContact: "6h ago" },
  { name: "Nina Patel", email: "nina@freshbrand.co", company: "FreshBrand", role: "Founder", status: "Lead", value: "$8,500", avatar: "NP", gradient: "from-fuchsia-400 to-pink-400", lastContact: "4d ago" },
];

const statusStyle = {
  Active: "bg-[var(--status-success)]/10 text-[var(--status-success)] border border-[var(--status-success)]/20",
  Lead: "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20",
  Prospect: "bg-[var(--status-warning)]/10 text-[var(--status-warning)] border border-[var(--status-warning)]/20",
};

function SkeletonTable() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] animate-pulse">
      <div className="p-5 border-b border-[var(--border-subtle)]"><div className="h-5 w-32 bg-[var(--surface-secondary)] rounded-lg" /></div>
      {[0,1,2,3,4].map(i => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-secondary)]" />
          <div className="flex-1 space-y-2"><div className="h-3 w-1/3 bg-[var(--surface-secondary)] rounded" /><div className="h-3 w-1/4 bg-[var(--surface-secondary)] rounded" /></div>
        </div>
      ))}
    </div>
  );
}

export default function ContactsTable({ loading }) {
  const [selected, setSelected] = useState([]);

  if (loading) return <SkeletonTable />;

  const toggleSelect = (email) => {
    setSelected(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] overflow-hidden"
    >
      <div className="p-5 border-b border-[var(--border-subtle)] flex justify-between items-center">
        <div>
          <h3 className="font-bold text-[var(--text-primary)]">All Contacts</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{contacts.length} contacts · {selected.length} selected</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-medium px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--surface-secondary)]/80 transition-colors">
          Sort by <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-left bg-[var(--surface-secondary)]/40">
              <th className="px-5 py-3 w-10"><div className="w-4 h-4 rounded border border-[var(--border-default)]" /></th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Contact</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Company</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Role</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Deal Value</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Status</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider hidden xl:table-cell">Last Contact</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c, i) => (
              <motion.tr
                key={c.email}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={"border-b border-[var(--border-subtle)] hover:bg-[var(--accent-primary)]/[0.03] transition-colors " + (selected.includes(c.email) ? "bg-[var(--accent-primary)]/[0.05]" : "")}
              >
                <td className="px-5 py-3.5">
                  <button onClick={() => toggleSelect(c.email)} className={"w-4 h-4 rounded border flex items-center justify-center transition-all " + (selected.includes(c.email) ? "bg-[var(--accent-primary)] border-[var(--accent-primary)]" : "border-[var(--border-default)] hover:border-[var(--accent-primary)]")}>
                    {selected.includes(c.email) && <Check className="w-3 h-3 text-white" />}
                  </button>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={"w-9 h-9 rounded-full bg-gradient-to-br " + c.gradient + " flex items-center justify-center text-white text-xs font-bold shadow-md shadow-black/10"}>{c.avatar}</div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)] text-sm">{c.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[var(--text-secondary)] font-medium">{c.company}</td>
                <td className="px-5 py-3.5 text-[var(--text-muted)] hidden lg:table-cell">{c.role}</td>
                <td className="px-5 py-3.5 font-bold text-[var(--text-primary)]">{c.value}</td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <span className={"px-2.5 py-1 text-[11px] font-semibold rounded-full " + (statusStyle[c.status] || "")}>{c.status}</span>
                </td>
                <td className="px-5 py-3.5 text-xs text-[var(--text-muted)] hidden xl:table-cell">{c.lastContact}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-0.5">
                    <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] rounded-lg hover:bg-[var(--accent-primary)]/10 transition-colors"><Mail className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] rounded-lg hover:bg-[var(--accent-primary)]/10 transition-colors"><Phone className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-secondary)]/30">
        <p className="text-xs text-[var(--text-muted)]">Showing 1-{contacts.length} of {contacts.length}</p>
        <div className="flex gap-1">
          <button className="px-3 py-1 text-xs font-medium text-[var(--text-muted)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors">Previous</button>
          <button className="px-3 py-1 text-xs font-medium bg-[var(--accent-primary)] text-white rounded-lg">1</button>
          <button className="px-3 py-1 text-xs font-medium text-[var(--text-muted)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors">Next</button>
        </div>
      </div>
    </motion.div>
  );
}`,

    "/components/ActivityFeed.jsx": `import React from "react";
import { motion } from "framer-motion";
import { MessageCircle, Phone, Mail, FileText, CheckCircle } from "lucide-react";

const activities = [
  { icon: CheckCircle, label: "Deal Won", desc: "Platform Dev with ScaleUp — $68,000", time: "2m ago", color: "text-[var(--status-success)] bg-[var(--status-success)]/10" },
  { icon: Phone, label: "Call Scheduled", desc: "Follow-up with Tom Brown at BigCorp", time: "1h ago", color: "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10" },
  { icon: Mail, label: "Email Sent", desc: "Proposal to Emma Lee at InsightCo", time: "3h ago", color: "text-violet-500 bg-violet-500/10" },
  { icon: MessageCircle, label: "Note Added", desc: "Updated requirements for Cloud Migration", time: "5h ago", color: "text-amber-500 bg-amber-500/10" },
  { icon: FileText, label: "Contract Sent", desc: "Consulting agreement to StrategyX", time: "1d ago", color: "text-teal-500 bg-teal-500/10" },
];

export default function ActivityFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] overflow-hidden"
    >
      <div className="p-5 border-b border-[var(--border-subtle)]">
        <h3 className="font-bold text-[var(--text-primary)]">Recent Activity</h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Your team's latest updates</p>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {activities.map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.06 }}
            className="flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--surface-secondary)]/40 transition-colors cursor-pointer"
          >
            <div className={"w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 " + a.color}>
              <a.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{a.label}</p>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{a.desc}</p>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 mt-0.5">{a.time}</span>
          </motion.div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-[var(--border-subtle)]">
        <button className="text-xs font-semibold text-[var(--accent-primary)] hover:underline">View all activity →</button>
      </div>
    </motion.div>
  );
}`,

    "/components/RevenueChart.jsx": `import React from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "Jan", revenue: 32000, deals: 18 },
  { name: "Feb", revenue: 28000, deals: 14 },
  { name: "Mar", revenue: 41000, deals: 22 },
  { name: "Apr", revenue: 38000, deals: 19 },
  { name: "May", revenue: 52000, deals: 28 },
  { name: "Jun", revenue: 48000, deals: 25 },
  { name: "Jul", revenue: 61000, deals: 32 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--surface-primary)] border border-[var(--border-default)] rounded-xl p-3 shadow-xl shadow-black/10">
      <p className="text-xs font-bold text-[var(--text-primary)] mb-1">{label}</p>
      <p className="text-xs text-[var(--text-muted)]">Revenue: <span className="font-semibold text-[var(--status-success)]">\${payload[0]?.value?.toLocaleString()}</span></p>
    </div>
  );
};

export default function RevenueChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-[var(--text-primary)]">Revenue Overview</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Monthly revenue trend</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-extrabold text-[var(--text-primary)]">$284.5K</p>
            <p className="text-xs text-[var(--status-success)] font-semibold">+12.5% vs last period</p>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => "$" + (v / 1000) + "K"} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revenueGrad)" dot={{ r: 4, fill: "#6366f1", stroke: "var(--surface-primary)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}`,

    "/components/DealModal.jsx": `import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, DollarSign, User, Building, Tag, Calendar } from "lucide-react";

export default function DealModal({ onClose }) {
  const [form, setForm] = useState({ title: "", company: "", contact: "", value: "", stage: "lead", closeDate: "" });
  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative bg-[var(--surface-primary)] rounded-2xl border border-[var(--border-default)] shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Create New Deal</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Add a new deal to your pipeline</p>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { key: "title", label: "Deal Title", icon: Tag, placeholder: "e.g. Website Redesign" },
            { key: "company", label: "Company", icon: Building, placeholder: "e.g. Acme Corp" },
            { key: "contact", label: "Contact Person", icon: User, placeholder: "e.g. John Doe" },
            { key: "value", label: "Deal Value ($)", icon: DollarSign, placeholder: "e.g. 12000" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">{f.label}</label>
              <div className="relative">
                <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  value={form[f.key]}
                  onChange={e => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[var(--surface-secondary)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/15 outline-none transition-all"
                />
              </div>
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">Stage</label>
            <select
              value={form.stage}
              onChange={e => update("stage", e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-[var(--surface-secondary)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/15 outline-none transition-all appearance-none"
            >
              <option value="lead">Lead</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal</option>
              <option value="negotiation">Negotiation</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--surface-secondary)] transition-colors">
            Cancel
          </button>
          <button className="px-6 py-2.5 text-sm font-bold bg-[var(--accent-primary)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 active:scale-[0.97] transition-all">
            Create Deal
          </button>
        </div>
      </motion.div>
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
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--surface-primary);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: var(--border-default) transparent;
  }

  *::-webkit-scrollbar { width: 6px; height: 6px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 100px; }
  *::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
}

@layer utilities {
  .animate-shimmer {
    background: linear-gradient(90deg, var(--surface-secondary) 0%, var(--border-default) 50%, var(--surface-secondary) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
}`,

    "/migrations/001_schema.sql": `-- CRM Database Schema
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL DEFAULT current_setting('app.project_id', true),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  role TEXT,
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'active', 'prospect', 'inactive')),
  avatar_initials TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL DEFAULT current_setting('app.project_id', true),
  title TEXT NOT NULL,
  company TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  value NUMERIC DEFAULT 0,
  stage TEXT DEFAULT 'lead' CHECK (stage IN ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  probability INTEGER DEFAULT 10,
  close_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL DEFAULT current_setting('app.project_id', true),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call', 'email', 'meeting', 'note', 'task')),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_project ON contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_deals_project ON deals(project_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(project_id, stage);
CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id);`,

    "/migrations/002_rls.sql": `-- Enable RLS on CRM tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Contacts policies
CREATE POLICY "Project data access contacts"
  ON contacts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Deals policies
CREATE POLICY "Project data access deals"
  ON deals FOR ALL
  USING (true)
  WITH CHECK (true);

-- Activities policies
CREATE POLICY "Project data access activities"
  ON activities FOR ALL
  USING (true)
  WITH CHECK (true);`,

    "/schema.json": `{
  "entities": [
    {
      "name": "contacts",
      "fields": ["id", "name", "email", "phone", "company", "role", "status", "notes"],
      "primaryKey": "id"
    },
    {
      "name": "deals",
      "fields": ["id", "title", "company", "contact_id", "value", "stage", "probability", "close_date", "notes"],
      "primaryKey": "id"
    },
    {
      "name": "activities",
      "fields": ["id", "deal_id", "contact_id", "activity_type", "title", "description", "scheduled_at", "completed"],
      "primaryKey": "id"
    }
  ]
}`,
  },
};
