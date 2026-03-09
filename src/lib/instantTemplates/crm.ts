import type { InstantTemplate } from "../instantTemplates";

export const CRM: InstantTemplate = {
  id: "crm",
  matchIds: ["crm"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsRow from "./components/StatsRow";
import Pipeline from "./components/Pipeline";
import ContactsTable from "./components/ContactsTable";

export default function App() {
  const [view, setView] = useState("pipeline");
  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header view={view} onViewChange={setView} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <StatsRow />
          {view === "pipeline" ? <Pipeline /> : <ContactsTable />}
        </main>
      </div>
    </div>
  );
}`,

    "/components/Sidebar.jsx": `import React from "react";
import { LayoutDashboard, Users, Target, Calendar, BarChart3, Mail, Settings, Zap } from "lucide-react";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "Contacts" },
  { icon: Target, label: "Deals" },
  { icon: Calendar, label: "Activities" },
  { icon: BarChart3, label: "Reports" },
  { icon: Mail, label: "Email" },
  { icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center"><Zap className="w-5 h-5" /></div>
        <span className="font-bold text-sm tracking-tight">{{APP_NAME}}</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {nav.map(n => (
          <button key={n.label} className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all " + (n.active ? "bg-blue-600 text-white font-medium" : "text-gray-400 hover:text-white hover:bg-white/5")}>
            <n.icon className="w-5 h-5" /><span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 mx-3 mb-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl">
        <p className="text-sm font-semibold mb-1">Upgrade to Pro</p>
        <p className="text-xs text-blue-200 mb-3">Unlock advanced analytics & automations</p>
        <button className="w-full py-2 bg-white text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors">Upgrade Now</button>
      </div>
    </aside>
  );
}`,

    "/components/Header.jsx": `import React from "react";
import { Search, Bell, Plus } from "lucide-react";

export default function Header({ view, onViewChange }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-semibold text-gray-800">Deals</h1>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => onViewChange("pipeline")} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === "pipeline" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>Pipeline</button>
          <button onClick={() => onViewChange("table")} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === "table" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>Table</button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
          <Search className="w-4 h-4 text-gray-400" />
          <input placeholder="Search deals..." className="bg-transparent text-sm outline-none w-40" />
        </div>
        <button className="relative p-2 text-gray-500 hover:text-gray-700"><Bell className="w-5 h-5" /><span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" /></button>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Plus className="w-4 h-4" /> Add Deal</button>
      </div>
    </header>
  );
}`,

    "/components/StatsRow.jsx": `import React from "react";
import { DollarSign, Target, TrendingUp, Award } from "lucide-react";

const stats = [
  { icon: DollarSign, label: "Total Revenue", value: "$284,500", sub: "This quarter", color: "text-emerald-600 bg-emerald-50" },
  { icon: Target, label: "Active Deals", value: "47", sub: "12 closing this week", color: "text-blue-600 bg-blue-50" },
  { icon: TrendingUp, label: "Conversion Rate", value: "32.8%", sub: "+4.2% from last month", color: "text-purple-600 bg-purple-50" },
  { icon: Award, label: "Won This Month", value: "$68,200", sub: "18 deals closed", color: "text-amber-600 bg-amber-50" },
];

export default function StatsRow() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className={"w-10 h-10 rounded-xl flex items-center justify-center " + s.color}><s.icon className="w-5 h-5" /></div>
            <span className="text-sm text-gray-500">{s.label}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}`,

    "/components/Pipeline.jsx": `import React from "react";
import { MoreHorizontal, User, DollarSign } from "lucide-react";

const stages = [
  { name: "Lead", color: "border-t-blue-400", deals: [
    { title: "Website Redesign", company: "Acme Corp", value: "$12,000", contact: "JD", probability: 20 },
    { title: "Mobile App", company: "TechStart", value: "$28,000", contact: "SK", probability: 15 },
    { title: "SEO Package", company: "GrowFast", value: "$5,500", contact: "MP", probability: 10 },
  ]},
  { name: "Qualified", color: "border-t-indigo-400", deals: [
    { title: "Cloud Migration", company: "DataFlow", value: "$45,000", contact: "AL", probability: 40 },
    { title: "API Integration", company: "ConnectIO", value: "$18,000", contact: "RW", probability: 35 },
  ]},
  { name: "Proposal", color: "border-t-amber-400", deals: [
    { title: "Enterprise Suite", company: "BigCorp", value: "$92,000", contact: "TB", probability: 65 },
    { title: "Dashboard Build", company: "InsightCo", value: "$34,000", contact: "EL", probability: 55 },
    { title: "Branding Package", company: "FreshBrand", value: "$8,500", contact: "NP", probability: 60 },
  ]},
  { name: "Won", color: "border-t-emerald-400", deals: [
    { title: "Platform Dev", company: "ScaleUp", value: "$68,000", contact: "JC", probability: 100 },
    { title: "Consulting", company: "StrategyX", value: "$15,000", contact: "AH", probability: 100 },
  ]},
];

export default function Pipeline() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stages.map(stage => (
        <div key={stage.name} className={"bg-white rounded-xl border border-gray-100 border-t-4 " + stage.color}>
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-gray-800">{stage.name}</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{stage.deals.length}</span>
            </div>
            <button className="text-gray-400 hover:text-gray-600"><MoreHorizontal className="w-4 h-4" /></button>
          </div>
          <div className="p-3 space-y-2.5">
            {stage.deals.map((d, i) => (
              <div key={i} className="p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors group">
                <p className="font-medium text-sm text-gray-800 mb-1">{d.title}</p>
                <p className="text-xs text-gray-500 mb-3">{d.company}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-[9px] font-bold">{d.contact}</div>
                    <span className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" />{d.value}</span>
                  </div>
                  <span className={"text-[10px] font-medium px-2 py-0.5 rounded-full " + (d.probability >= 100 ? "bg-emerald-100 text-emerald-700" : d.probability >= 50 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>{d.probability}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}`,

    "/components/ContactsTable.jsx": `import React from "react";
import { Mail, Phone, MoreHorizontal } from "lucide-react";

const contacts = [
  { name: "John Doe", email: "john@acme.com", company: "Acme Corp", role: "CTO", status: "Active", value: "$12,000", avatar: "JD", color: "from-blue-400 to-blue-500" },
  { name: "Sarah Kim", email: "sarah@techstart.com", company: "TechStart", role: "CEO", status: "Active", value: "$28,000", avatar: "SK", color: "from-pink-400 to-pink-500" },
  { name: "Marcus Park", email: "marcus@growfast.io", company: "GrowFast", role: "VP Sales", status: "Lead", value: "$5,500", avatar: "MP", color: "from-emerald-400 to-emerald-500" },
  { name: "Alex Liu", email: "alex@dataflow.co", company: "DataFlow", role: "CTO", status: "Active", value: "$45,000", avatar: "AL", color: "from-purple-400 to-purple-500" },
  { name: "Tom Brown", email: "tom@bigcorp.com", company: "BigCorp", role: "Director", status: "Prospect", value: "$92,000", avatar: "TB", color: "from-amber-400 to-amber-500" },
  { name: "Emma Lee", email: "emma@insightco.io", company: "InsightCo", role: "PM", status: "Active", value: "$34,000", avatar: "EL", color: "from-cyan-400 to-cyan-500" },
];

const statusColors = { Active: "bg-emerald-100 text-emerald-700", Lead: "bg-blue-100 text-blue-700", Prospect: "bg-amber-100 text-amber-700" };

export default function ContactsTable() {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <div className="p-5 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">All Contacts</h3>
        <span className="text-sm text-gray-500">{contacts.length} contacts</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left">
            <th className="px-5 py-3 text-gray-500 font-medium">Name</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Company</th>
            <th className="px-5 py-3 text-gray-500 font-medium hidden md:table-cell">Role</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Deal Value</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Status</th>
            <th className="px-5 py-3 text-gray-500 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.email} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={"w-9 h-9 rounded-full bg-gradient-to-br " + c.color + " flex items-center justify-center text-white text-xs font-bold"}>{c.avatar}</div>
                    <div><p className="font-medium text-gray-900">{c.name}</p><p className="text-xs text-gray-400">{c.email}</p></div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-gray-600">{c.company}</td>
                <td className="px-5 py-3.5 text-gray-600 hidden md:table-cell">{c.role}</td>
                <td className="px-5 py-3.5 font-medium text-gray-900">{c.value}</td>
                <td className="px-5 py-3.5"><span className={"px-2.5 py-1 text-xs font-medium rounded-full " + (statusColors[c.status] || "")}>{c.status}</span></td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1">
                    <button className="p-1.5 text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50"><Mail className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50"><Phone className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
