import { useState } from "react";
import {
  LayoutDashboard,
  Database,
  Users,
  HardDrive,
  KeyRound,
  Zap,
  Terminal,
  ScrollText,
  Download,
  Brain,
  GitBranch,
  ShieldCheck,
  Rocket,
  ShieldAlert,
  Mail,
  Smartphone,
} from "lucide-react";
import SchemaBuilder from "./SchemaBuilder";
import CloudOverview from "./cloud/CloudOverview";
import CloudUsers from "./cloud/CloudUsers";
import CloudStorage from "./cloud/CloudStorage";
import CloudSecrets from "./cloud/CloudSecrets";
import CloudFunctions from "./cloud/CloudFunctions";
import CloudSqlEditor from "./cloud/CloudSqlEditor";
import CloudLogs from "./cloud/CloudLogs";
import CloudExport from "./cloud/CloudExport";
import ProjectMemory from "./cloud/ProjectMemory";
import DependencyGraph from "./cloud/DependencyGraph";
import GovernanceEngine from "./cloud/GovernanceEngine";
import EnvironmentManager from "./cloud/EnvironmentManager";
import SecurityDashboard from "./cloud/SecurityDashboard";
import CloudEmail from "./cloud/CloudEmail";
import AndroidExport from "./cloud/AndroidExport";

const PREMIUM_SECTIONS = new Set(["environments"]);

const CLOUD_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "environments", label: "Environments", icon: Rocket },
  { id: "security", label: "Security", icon: ShieldAlert },
  { id: "database", label: "Database", icon: Database },
  { id: "email", label: "Email", icon: Mail },
  { id: "memory", label: "Project Memory", icon: Brain },
  { id: "dependencies", label: "Dependencies", icon: GitBranch },
  { id: "governance", label: "Governance", icon: ShieldCheck },
  { id: "users", label: "Users", icon: Users },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "secrets", label: "Secrets", icon: KeyRound },
  { id: "functions", label: "Edge Functions", icon: Zap },
  { id: "sql", label: "SQL Editor", icon: Terminal },
  { id: "export", label: "Export & Migrate", icon: Download },
  { id: "android", label: "Android Export", icon: Smartphone },
  { id: "logs", label: "Logs", icon: ScrollText },
] as const;

type SectionId = (typeof CLOUD_SECTIONS)[number]["id"];

const CloudPanel = () => {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return <CloudOverview onNavigate={setActiveSection} />;
      case "database":
        return <SchemaBuilder />;
      case "email":
        return <CloudEmail />;
      case "environments":
        return <EnvironmentManager />;
      case "security":
        return <SecurityDashboard />;
      case "memory":
        return <ProjectMemory />;
      case "dependencies":
        return <DependencyGraph />;
      case "governance":
        return <GovernanceEngine />;
      case "users":
        return <CloudUsers />;
      case "storage":
        return <CloudStorage />;
      case "secrets":
        return <CloudSecrets />;
      case "functions":
        return <CloudFunctions />;
      case "sql":
        return <CloudSqlEditor />;
      case "export":
        return <CloudExport />;
      case "logs":
        return <CloudLogs />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full bg-ide-panel">
      {/* Sidebar nav */}
      <nav className="w-44 shrink-0 border-r border-border bg-sidebar-background flex flex-col">
        <div className="px-3 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-xs font-semibold text-sidebar-foreground tracking-wide uppercase">Cloud</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
          {CLOUD_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
                {section.label}
                {PREMIUM_SECTIONS.has(section.id) && (
                  <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 rounded font-bold ml-auto">PRO</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

export default CloudPanel;
