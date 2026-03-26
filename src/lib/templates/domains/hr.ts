/**
 * HR / Employee Management Template
 */

import { registerTemplate, TEMPLATE_CSS, generateSidebar, generateHeader, generateStatsCards, generateDataTable } from "../templateRegistry";

const HR_APP = `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsCards from "./components/StatsCards";
import EmployeeTable from "./components/EmployeeTable";
import DepartmentOverview from "./components/DepartmentOverview";

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-bg-secondary)]">
      <Sidebar activePage={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={page} subtitle="Manage your team and organization" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <StatsCards />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><EmployeeTable /></div>
            <DepartmentOverview />
          </div>
        </main>
      </div>
    </div>
  );
}`;

const DEPARTMENT_OVERVIEW = `import React from "react";
import { Users, Calendar, Award, ArrowUpRight } from "lucide-react";

const departments = [
  { name: "Engineering", count: 42, head: "Sarah Chen", growth: "+5" },
  { name: "Marketing", count: 18, head: "Mike Johnson", growth: "+2" },
  { name: "Sales", count: 24, head: "Lisa Park", growth: "+3" },
  { name: "Design", count: 12, head: "Tom Rodriguez", growth: "+1" },
  { name: "Operations", count: 15, head: "Amy Wu", growth: "0" },
];

const upcomingEvents = [
  { type: "Birthday", name: "Alex Turner", date: "Jan 28", emoji: "🎂" },
  { type: "Anniversary", name: "Maria Santos", date: "Jan 30", emoji: "🎉" },
  { type: "Review", name: "James Wilson", date: "Feb 1", emoji: "📋" },
  { type: "Birthday", name: "Priya Patel", date: "Feb 3", emoji: "🎂" },
];

export default function DepartmentOverview() {
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-sm mb-4">Departments</h3>
        <div className="space-y-3">
          {departments.map(dept => (
            <div key={dept.name} className="flex items-center justify-between group cursor-pointer hover:bg-[var(--color-bg-secondary)] -mx-2 px-2 py-1.5 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center">
                  <Users className="w-4 h-4 text-[var(--color-primary)]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{dept.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{dept.head}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{dept.count}</p>
                {dept.growth !== "0" && (
                  <p className="text-xs text-[var(--color-success)]">{dept.growth}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
          <h3 className="font-semibold text-sm">Upcoming</h3>
        </div>
        <div className="space-y-3">
          {upcomingEvents.map((event, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg">{event.emoji}</span>
                <div>
                  <p className="text-sm font-medium">{event.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{event.type}</p>
                </div>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">{event.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}`;

registerTemplate({
  id: "hr",
  name: "HR Management",
  category: "business",
  keywords: ["hr", "employee", "human resource", "staff", "team", "personnel", "people", "hiring", "recruitment"],
  description: "Employee management with departments, attendance, and team overview",
  variables: ["APP_NAME"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": HR_APP,
    "/components/Sidebar.jsx": generateSidebar("{{APP_NAME}}", [
      { icon: "LayoutDashboard", label: "Dashboard" },
      { icon: "Users", label: "Employees" },
      { icon: "Building2", label: "Departments" },
      { icon: "Calendar", label: "Attendance" },
      { icon: "CalendarDays", label: "Leave" },
      { icon: "Award", label: "Performance" },
      { icon: "DollarSign", label: "Payroll" },
      { icon: "Settings", label: "Settings" },
    ]),
    "/components/Header.jsx": generateHeader(true),
    "/components/StatsCards.jsx": generateStatsCards([
      { label: "Total Employees", value: "111", change: "+5", icon: "Users", trend: "up" },
      { label: "New Hires", value: "8", change: "+3", icon: "UserPlus", trend: "up" },
      { label: "On Leave", value: "6", change: "-2", icon: "CalendarOff", trend: "down" },
      { label: "Open Positions", value: "12", change: "+4", icon: "Briefcase", trend: "up" },
    ]),
    "/components/EmployeeTable.jsx": generateDataTable("Employees", [
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "department", label: "Department", type: "text" },
      { key: "role", label: "Role", type: "text" },
      { key: "joined", label: "Joined", type: "text" },
      { key: "status", label: "Status", type: "badge" },
    ], [
      { name: "Sarah Chen", email: "sarah@company.com", department: "Engineering", role: "Tech Lead", joined: "Mar 2022", status: "Active" },
      { name: "Mike Johnson", email: "mike@company.com", department: "Marketing", role: "Director", joined: "Jan 2021", status: "Active" },
      { name: "Lisa Park", email: "lisa@company.com", department: "Sales", role: "VP Sales", joined: "Jun 2020", status: "Active" },
      { name: "Tom Rodriguez", email: "tom@company.com", department: "Design", role: "Lead Designer", joined: "Sep 2022", status: "Active" },
      { name: "Amy Wu", email: "amy@company.com", department: "Operations", role: "Ops Manager", joined: "Nov 2021", status: "Active" },
      { name: "James Wilson", email: "james@company.com", department: "Engineering", role: "Senior Dev", joined: "Feb 2023", status: "Pending" },
    ]),
    "/components/DepartmentOverview.jsx": DEPARTMENT_OVERVIEW,
    "/styles.css": TEMPLATE_CSS,
  },
});
