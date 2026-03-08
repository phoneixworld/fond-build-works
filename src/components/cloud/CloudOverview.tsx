import { useState, useEffect } from "react";
import { Database, Users, HardDrive, KeyRound, Zap, ScrollText, Activity, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";

interface CloudOverviewProps {
  onNavigate: (section: "overview" | "database" | "users" | "storage" | "secrets" | "functions" | "sql" | "logs") => void;
}

const CloudOverview = ({ onNavigate }: CloudOverviewProps) => {
  const { currentProject } = useProjects();
  const [stats, setStats] = useState({ collections: 0, users: 0, records: 0, functions: 0 });

  useEffect(() => {
    if (!currentProject) return;
    const fetchStats = async () => {
      const [schemas, users, data, funcs] = await Promise.all([
        supabase.from("project_schemas" as any).select("id", { count: "exact", head: true }).eq("project_id", currentProject.id),
        supabase.from("project_users" as any).select("id", { count: "exact", head: true }).eq("project_id", currentProject.id),
        supabase.from("project_data" as any).select("id", { count: "exact", head: true }).eq("project_id", currentProject.id),
        supabase.from("project_functions" as any).select("id", { count: "exact", head: true }).eq("project_id", currentProject.id),
      ]);
      setStats({
        collections: schemas.count || 0,
        users: users.count || 0,
        records: data.count || 0,
        functions: funcs.count || 0,
      });
    };
    fetchStats();
  }, [currentProject]);

  const cards = [
    { label: "Database", desc: `${stats.collections} collections · ${stats.records} records`, icon: Database, section: "database", color: "text-blue-400" },
    { label: "Users", desc: `${stats.users} registered users`, icon: Users, section: "users", color: "text-green-400" },
    { label: "Storage", desc: "File uploads & media", icon: HardDrive, section: "storage", color: "text-orange-400" },
    { label: "Edge Functions", desc: `${stats.functions} functions`, icon: Zap, section: "functions", color: "text-purple-400" },
    { label: "Secrets", desc: "Environment variables", icon: KeyRound, section: "secrets", color: "text-yellow-400" },
    { label: "Logs", desc: "Real-time activity", icon: ScrollText, section: "logs", color: "text-cyan-400" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border bg-ide-panel-header">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Overview</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {currentProject?.name || "Project"} — backend services at a glance
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.section}
                onClick={() => onNavigate(card.section)}
                className="group flex flex-col gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-card/80 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-5 h-5 ${card.color}`} />
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CloudOverview;
