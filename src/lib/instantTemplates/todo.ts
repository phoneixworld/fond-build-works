import type { InstantTemplate } from "../instantTemplates";

export const TODO: InstantTemplate = {
  id: "todo",
  matchIds: ["todo"],
  deps: { "lucide-react": "^0.400.0", "framer-motion": "^11.0.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./components/Header";
import TaskInput from "./components/TaskInput";
import TaskList from "./components/TaskList";
import StatsBar from "./components/StatsBar";
import CategoryFilter from "./components/CategoryFilter";

const initialTasks = [
  { id: 1, text: "Design the new landing page", completed: false, category: "Work", priority: "high", createdAt: new Date().toISOString() },
  { id: 2, text: "Buy groceries for the week", completed: true, category: "Personal", priority: "medium", createdAt: new Date().toISOString() },
  { id: 3, text: "Review pull requests", completed: false, category: "Work", priority: "high", createdAt: new Date().toISOString() },
  { id: 4, text: "Schedule dentist appointment", completed: false, category: "Personal", priority: "low", createdAt: new Date().toISOString() },
  { id: 5, text: "Prepare presentation for Monday", completed: false, category: "Work", priority: "medium", createdAt: new Date().toISOString() },
  { id: 6, text: "Read chapter 5 of design book", completed: true, category: "Learning", priority: "low", createdAt: new Date().toISOString() },
];

export default function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const addTask = (text, category, priority) => {
    setTasks(prev => [{ id: Date.now(), text, completed: false, category, priority, createdAt: new Date().toISOString() }, ...prev]);
  };
  const toggleTask = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));

  const filtered = tasks
    .filter(t => filter === "All" ? true : filter === "Active" ? !t.completed : t.completed)
    .filter(t => categoryFilter === "All" ? true : t.category === categoryFilter);

  const stats = { total: tasks.length, completed: tasks.filter(t => t.completed).length, active: tasks.filter(t => !t.completed).length };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Header />
        <StatsBar stats={stats} />
        <TaskInput onAdd={addTask} />
        <CategoryFilter filter={filter} onFilterChange={setFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />
        <TaskList tasks={filtered} onToggle={toggleTask} onDelete={deleteTask} />
      </div>
    </div>
  );
}`,

    "/components/Header.jsx": `import React from "react";
import { CheckCircle2 } from "lucide-react";

export default function Header() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-white" /></div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{{APP_NAME}}</h1>
      </div>
      <p className="text-gray-400 text-sm ml-[52px]">{today}</p>
    </div>
  );
}`,

    "/components/StatsBar.jsx": `import React from "react";
import { Target, CheckCircle2, Circle } from "lucide-react";

export default function StatsBar({ stats }) {
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Target className="w-5 h-5 text-indigo-500 mx-auto mb-1.5" />
        <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        <p className="text-[11px] text-gray-400">Total</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Circle className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
        <p className="text-xl font-bold text-gray-900">{stats.active}</p>
        <p className="text-[11px] text-gray-400">Active</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
        <p className="text-xl font-bold text-gray-900">{pct}%</p>
        <p className="text-[11px] text-gray-400">Done</p>
      </div>
    </div>
  );
}`,

    "/components/TaskInput.jsx": `import React, { useState } from "react";
import { Plus, ChevronDown } from "lucide-react";

const categories = ["Work", "Personal", "Learning"];
const priorities = ["high", "medium", "low"];
const priorityColors = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-blue-500" };

export default function TaskInput({ onAdd }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Work");
  const [priority, setPriority] = useState("medium");
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim(), category, priority);
    setText("");
    setExpanded(false);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="bg-white rounded-2xl border border-gray-200 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50 transition-all overflow-hidden">
        <div className="flex items-center px-4">
          <Plus className="w-5 h-5 text-gray-300 flex-shrink-0" />
          <input value={text} onChange={e => setText(e.target.value)} onFocus={() => setExpanded(true)} placeholder="Add a new task..." className="flex-1 px-3 py-4 text-sm outline-none text-gray-800 placeholder:text-gray-400" />
          <button type="submit" disabled={!text.trim()} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Add</button>
        </div>
        {expanded && (
          <div className="px-4 pb-3 pt-1 flex items-center gap-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Category:</span>
              <div className="flex gap-1">
                {categories.map(c => (
                  <button key={c} type="button" onClick={() => setCategory(c)} className={"px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors " + (c === category ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>{c}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-gray-400">Priority:</span>
              <div className="flex gap-1.5">
                {priorities.map(p => (
                  <button key={p} type="button" onClick={() => setPriority(p)} className={"w-5 h-5 rounded-full transition-all " + priorityColors[p] + " " + (p === priority ? "ring-2 ring-offset-2 ring-" + p : "opacity-30 hover:opacity-60")} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}`,

    "/components/CategoryFilter.jsx": `import React from "react";

const filters = ["All", "Active", "Completed"];

export default function CategoryFilter({ filter, onFilterChange, categoryFilter, onCategoryFilterChange }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        {filters.map(f => (
          <button key={f} onClick={() => onFilterChange(f)} className={"px-3.5 py-1.5 rounded-md text-xs font-medium transition-all " + (f === filter ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700")}>{f}</button>
        ))}
      </div>
      <div className="flex gap-1">
        {["All", "Work", "Personal", "Learning"].map(c => (
          <button key={c} onClick={() => onCategoryFilterChange(c)} className={"px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors " + (c === categoryFilter ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100")}>{c}</button>
        ))}
      </div>
    </div>
  );
}`,

    "/components/TaskList.jsx": `import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Trash2, Clock } from "lucide-react";

const priorityDots = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-blue-500" };

export default function TaskList({ tasks, onToggle, onDelete }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg mb-1">🎉</p>
        <p className="text-sm">No tasks here. You're all caught up!</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {tasks.map(task => (
          <motion.div key={task.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }} className="group flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3.5 hover:shadow-md transition-all">
            <button onClick={() => onToggle(task.id)} className={"w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all " + (task.completed ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-indigo-400")}>
              {task.completed && <Check className="w-3.5 h-3.5 text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={"text-sm font-medium transition-all " + (task.completed ? "line-through text-gray-400" : "text-gray-800")}>{task.text}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={"w-1.5 h-1.5 rounded-full " + priorityDots[task.priority]} />
                <span className="text-[11px] text-gray-400">{task.category}</span>
              </div>
            </div>
            <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-gray-50 text-gray-800 antialiased; }
  html { scroll-behavior: smooth; }
}`,
  },
};
