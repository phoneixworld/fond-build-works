import type { InstantTemplate } from "../instantTemplates";

export const PROJECT_MGMT: InstantTemplate = {
  id: "project-mgmt",
  matchIds: ["project-mgmt"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import KanbanBoard from "./components/KanbanBoard";
import ListView from "./components/ListView";
import TeamPanel from "./components/TeamPanel";

export default function App() {
  const [view, setView] = useState("board");
  const [teamOpen, setTeamOpen] = useState(false);
  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header view={view} onViewChange={setView} onTeamToggle={() => setTeamOpen(!teamOpen)} />
        <main className="flex-1 overflow-x-auto p-6">
          {view === "board" ? <KanbanBoard /> : <ListView />}
        </main>
      </div>
      {teamOpen && <TeamPanel onClose={() => setTeamOpen(false)} />}
    </div>
  );
}`,

    "/components/Sidebar.jsx": `import React from "react";
import { LayoutDashboard, CheckSquare, Calendar, FolderOpen, BarChart3, Settings, Rocket } from "lucide-react";

const nav = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: CheckSquare, label: "My Tasks" },
  { icon: Calendar, label: "Calendar" },
  { icon: FolderOpen, label: "Projects" },
  { icon: BarChart3, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

const projects = [
  { name: "Website Redesign", color: "bg-blue-500" },
  { name: "Mobile App v2", color: "bg-emerald-500" },
  { name: "Marketing Campaign", color: "bg-amber-500" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-gray-100">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Rocket className="w-5 h-5 text-white" /></div>
        <span className="font-bold text-sm text-gray-900 tracking-tight">{{APP_NAME}}</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {nav.map(n => (
          <button key={n.label} className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all " + (n.active ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100")}>
            <n.icon className="w-5 h-5" /><span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-3 pb-4">
        <p className="px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Projects</p>
        {projects.map(p => (
          <button key={p.name} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            <span className={"w-2.5 h-2.5 rounded-full " + p.color} />{p.name}
          </button>
        ))}
      </div>
    </aside>
  );
}`,

    "/components/Header.jsx": `import React from "react";
import { Search, Users, Filter, Plus } from "lucide-react";

export default function Header({ view, onViewChange, onTeamToggle }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-semibold text-gray-800">Website Redesign</h1>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => onViewChange("board")} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === "board" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>Board</button>
          <button onClick={() => onViewChange("list")} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-all " + (view === "list" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>List</button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-lg hover:bg-gray-100"><Filter className="w-4 h-4" /> Filter</button>
        <button onClick={onTeamToggle} className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-lg hover:bg-gray-100"><Users className="w-4 h-4" /> Team</button>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add Task</button>
      </div>
    </header>
  );
}`,

    "/components/KanbanBoard.jsx": `import React from "react";
import { MoreHorizontal, MessageSquare, Paperclip, Clock } from "lucide-react";

const columns = [
  { id: "todo", name: "To Do", color: "border-t-gray-400", tasks: [
    { id: 1, title: "Design new landing page hero", priority: "High", priorityColor: "bg-red-100 text-red-700", assignee: "AK", assigneeColor: "from-blue-400 to-blue-500", dueDate: "Mar 15", comments: 3, attachments: 2 },
    { id: 2, title: "Write copy for features section", priority: "Medium", priorityColor: "bg-amber-100 text-amber-700", assignee: "SP", assigneeColor: "from-pink-400 to-pink-500", dueDate: "Mar 18", comments: 1, attachments: 0 },
    { id: 3, title: "Create icon set", priority: "Low", priorityColor: "bg-blue-100 text-blue-700", assignee: "MW", assigneeColor: "from-emerald-400 to-emerald-500", dueDate: "Mar 20", comments: 0, attachments: 1 },
  ]},
  { id: "progress", name: "In Progress", color: "border-t-blue-500", tasks: [
    { id: 4, title: "Implement navigation component", priority: "High", priorityColor: "bg-red-100 text-red-700", assignee: "JL", assigneeColor: "from-purple-400 to-purple-500", dueDate: "Mar 12", comments: 5, attachments: 3 },
    { id: 5, title: "Set up CI/CD pipeline", priority: "Medium", priorityColor: "bg-amber-100 text-amber-700", assignee: "AK", assigneeColor: "from-blue-400 to-blue-500", dueDate: "Mar 14", comments: 2, attachments: 1 },
  ]},
  { id: "review", name: "In Review", color: "border-t-amber-500", tasks: [
    { id: 6, title: "Mobile responsive layouts", priority: "High", priorityColor: "bg-red-100 text-red-700", assignee: "SP", assigneeColor: "from-pink-400 to-pink-500", dueDate: "Mar 10", comments: 8, attachments: 4 },
    { id: 7, title: "Accessibility audit", priority: "Medium", priorityColor: "bg-amber-100 text-amber-700", assignee: "MW", assigneeColor: "from-emerald-400 to-emerald-500", dueDate: "Mar 11", comments: 4, attachments: 2 },
  ]},
  { id: "done", name: "Done", color: "border-t-emerald-500", tasks: [
    { id: 8, title: "Project kickoff meeting", priority: "Low", priorityColor: "bg-blue-100 text-blue-700", assignee: "JL", assigneeColor: "from-purple-400 to-purple-500", dueDate: "Mar 1", comments: 12, attachments: 5 },
    { id: 9, title: "Design system setup", priority: "High", priorityColor: "bg-red-100 text-red-700", assignee: "AK", assigneeColor: "from-blue-400 to-blue-500", dueDate: "Mar 5", comments: 6, attachments: 3 },
  ]},
];

export default function KanbanBoard() {
  return (
    <div className="flex gap-4 h-full pb-4" style={{ minWidth: "1000px" }}>
      {columns.map(col => (
        <div key={col.id} className={"flex-1 bg-gray-100/60 rounded-xl border-t-4 " + col.color + " flex flex-col min-w-[250px]"}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-gray-700">{col.name}</h3>
              <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{col.tasks.length}</span>
            </div>
            <button className="text-gray-400 hover:text-gray-600"><MoreHorizontal className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 px-3 pb-3 space-y-2.5 overflow-y-auto">
            {col.tasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md cursor-pointer transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <span className={"text-[10px] font-bold uppercase px-2 py-0.5 rounded-full " + task.priorityColor}>{task.priority}</span>
                  <button className="opacity-0 group-hover:opacity-100 text-gray-400"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                </div>
                <p className="font-medium text-sm text-gray-800 mb-3 leading-snug">{task.title}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-gray-400">
                    <span className="flex items-center gap-1 text-[11px]"><Clock className="w-3 h-3" />{task.dueDate}</span>
                    {task.comments > 0 && <span className="flex items-center gap-1 text-[11px]"><MessageSquare className="w-3 h-3" />{task.comments}</span>}
                    {task.attachments > 0 && <span className="flex items-center gap-1 text-[11px]"><Paperclip className="w-3 h-3" />{task.attachments}</span>}
                  </div>
                  <div className={"w-7 h-7 rounded-full bg-gradient-to-br " + task.assigneeColor + " flex items-center justify-center text-white text-[10px] font-bold"}>{task.assignee}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}`,

    "/components/ListView.jsx": `import React from "react";
import { CheckCircle2, Circle, Clock } from "lucide-react";

const tasks = [
  { title: "Design new landing page hero", status: "todo", priority: "High", assignee: "Alex K.", dueDate: "Mar 15" },
  { title: "Implement navigation component", status: "progress", priority: "High", assignee: "James L.", dueDate: "Mar 12" },
  { title: "Mobile responsive layouts", status: "review", priority: "High", assignee: "Sarah P.", dueDate: "Mar 10" },
  { title: "Write copy for features section", status: "todo", priority: "Medium", assignee: "Sarah P.", dueDate: "Mar 18" },
  { title: "Set up CI/CD pipeline", status: "progress", priority: "Medium", assignee: "Alex K.", dueDate: "Mar 14" },
  { title: "Accessibility audit", status: "review", priority: "Medium", assignee: "Mike W.", dueDate: "Mar 11" },
  { title: "Design system setup", status: "done", priority: "High", assignee: "Alex K.", dueDate: "Mar 5" },
  { title: "Project kickoff meeting", status: "done", priority: "Low", assignee: "James L.", dueDate: "Mar 1" },
];

const statusIcons = { todo: Circle, progress: Clock, review: Clock, done: CheckCircle2 };
const statusColors = { todo: "text-gray-400", progress: "text-blue-500", review: "text-amber-500", done: "text-emerald-500" };
const priorityColors = { High: "bg-red-100 text-red-700", Medium: "bg-amber-100 text-amber-700", Low: "bg-blue-100 text-blue-700" };

export default function ListView() {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 text-left">
          <th className="px-5 py-3 text-gray-500 font-medium w-8"></th>
          <th className="px-5 py-3 text-gray-500 font-medium">Task</th>
          <th className="px-5 py-3 text-gray-500 font-medium">Priority</th>
          <th className="px-5 py-3 text-gray-500 font-medium hidden md:table-cell">Assignee</th>
          <th className="px-5 py-3 text-gray-500 font-medium">Due Date</th>
        </tr></thead>
        <tbody>
          {tasks.map((t, i) => {
            const Icon = statusIcons[t.status];
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer">
                <td className="px-5 py-3.5"><Icon className={"w-5 h-5 " + statusColors[t.status]} /></td>
                <td className="px-5 py-3.5 font-medium text-gray-800">{t.title}</td>
                <td className="px-5 py-3.5"><span className={"px-2.5 py-1 text-xs font-medium rounded-full " + priorityColors[t.priority]}>{t.priority}</span></td>
                <td className="px-5 py-3.5 text-gray-600 hidden md:table-cell">{t.assignee}</td>
                <td className="px-5 py-3.5 text-gray-500">{t.dueDate}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}`,

    "/components/TeamPanel.jsx": `import React from "react";
import { X } from "lucide-react";

const members = [
  { name: "Alex Kim", role: "Lead Designer", avatar: "AK", color: "from-blue-400 to-blue-500", online: true },
  { name: "Sarah Park", role: "Frontend Dev", avatar: "SP", color: "from-pink-400 to-pink-500", online: true },
  { name: "Mike Wilson", role: "Backend Dev", avatar: "MW", color: "from-emerald-400 to-emerald-500", online: false },
  { name: "James Lee", role: "Full Stack", avatar: "JL", color: "from-purple-400 to-purple-500", online: true },
];

export default function TeamPanel({ onClose }) {
  return (
    <div className="w-72 border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-semibold text-sm">Team Members</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
      </div>
      <div className="p-4 space-y-3">
        {members.map(m => (
          <div key={m.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="relative">
              <div className={"w-10 h-10 rounded-full bg-gradient-to-br " + m.color + " flex items-center justify-center text-white text-sm font-bold"}>{m.avatar}</div>
              {m.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{m.name}</p>
              <p className="text-xs text-gray-400">{m.role}</p>
            </div>
          </div>
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
