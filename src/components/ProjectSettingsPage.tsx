import { useState } from "react";
import { ArrowLeft, Settings, Database, Users, Plug, Activity, Wrench, Cloud } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { Separator } from "@/components/ui/separator";

// Tab content components
import ProjectSettings from "@/components/ProjectSettings";
import CloudPanel from "@/components/CloudPanel";
import GitHubPanel from "@/components/GitHubPanel";
import CustomDomainPanel from "@/components/CustomDomainPanel";
import WhiteLabelPanel from "@/components/WhiteLabelPanel";
import CrewSpaces from "@/components/CrewSpaces";
import PulseAnalytics from "@/components/PulseAnalytics";
import ABTesting from "@/components/ABTesting";
import ProjectBrain from "@/components/ProjectBrain";
import PluginMarketplace from "@/components/PluginMarketplace";
import BrandKitGenerator from "@/components/BrandKitGenerator";
import CodeQualityPanel from "@/components/CodeQualityPanel";
import SemanticSearchPanel from "@/components/SemanticSearchPanel";
import IREditor from "@/components/IREditor";
import VersionHistory, { Version } from "@/components/VersionHistory";
import PlanningPanel from "@/components/PlanningPanel";

type SettingsTab = "general" | "cloud" | "integrations" | "team" | "analytics" | "tools";

interface ProjectSettingsPageProps {
  onBack: () => void;
  onRenameClick: () => void;
  onExport?: () => void;
  versions: Version[];
  onRevert: (v: Version) => void;
  onSendMessage?: (prompt: string) => void;
}

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "team", label: "Team", icon: Users },
  { id: "analytics", label: "Analytics", icon: Activity },
  { id: "tools", label: "Tools", icon: Wrench },
];

const ProjectSettingsPage = ({ onBack, onRenameClick, onExport, versions, onRevert, onSendMessage }: ProjectSettingsPageProps) => {
  const { currentProject } = useProjects();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [toolsSubTab, setToolsSubTab] = useState<string>("brain");

  if (!currentProject) return null;

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return <ProjectSettings onRenameClick={onRenameClick} onExport={onExport} />;
      case "cloud":
        return <CloudPanel />;
      case "integrations":
        return (
          <div className="flex flex-col h-full">
            <IntegrationsTabs />
          </div>
        );
      case "team":
        return <CrewSpaces />;
      case "analytics":
        return <AnalyticsTabs />;
      case "tools":
        return <ToolsTabs subTab={toolsSubTab} onSubTabChange={setToolsSubTab} versions={versions} onRevert={onRevert} onSendMessage={onSendMessage} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-12 flex items-center px-4 border-b border-border bg-ide-panel-header shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mr-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to IDE</span>
        </button>
        <Separator orientation="vertical" className="h-5 mx-2" />
        <h1 className="text-sm font-semibold text-foreground">
          Project Settings
        </h1>
        <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
          — {currentProject.name}
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-52 border-r border-border bg-card/50 py-4 shrink-0 overflow-y-auto">
          <div className="space-y-0.5 px-3">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

/* --- Sub-tab sections --- */

const IntegrationsTabs = () => {
  const [sub, setSub] = useState<"github" | "domains" | "whitelabel">("github");
  const subs = [
    { id: "github" as const, label: "GitHub" },
    { id: "domains" as const, label: "Custom Domains" },
    { id: "whitelabel" as const, label: "White-label" },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-5 pt-4 pb-2 border-b border-border bg-ide-panel-header">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sub === s.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {sub === "github" && <GitHubPanel />}
        {sub === "domains" && <CustomDomainPanel />}
        {sub === "whitelabel" && <WhiteLabelPanel />}
      </div>
    </div>
  );
};

const AnalyticsTabs = () => {
  const [sub, setSub] = useState<"pulse" | "abtesting">("pulse");
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-5 pt-4 pb-2 border-b border-border bg-ide-panel-header">
        <button onClick={() => setSub("pulse")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${sub === "pulse" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          Analytics
        </button>
        <button onClick={() => setSub("abtesting")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${sub === "abtesting" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          A/B Tests
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {sub === "pulse" ? <PulseAnalytics /> : <ABTesting />}
      </div>
    </div>
  );
};

interface ToolsTabsProps {
  subTab: string;
  onSubTabChange: (t: string) => void;
  versions: Version[];
  onRevert: (v: Version) => void;
  onSendMessage?: (prompt: string) => void;
}

const ToolsTabs = ({ subTab, onSubTabChange, versions, onRevert, onSendMessage }: ToolsTabsProps) => {
  const subs = [
    { id: "brain", label: "Brain" },
    { id: "plugins", label: "Plugins" },
    { id: "brandkit", label: "Brand Kit" },
    { id: "quality", label: "Quality" },
    { id: "search", label: "Search" },
    { id: "ir", label: "Intent" },
    { id: "planning", label: "Planner" },
    { id: "history", label: "History" },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-5 pt-4 pb-2 border-b border-border bg-ide-panel-header flex-wrap">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => onSubTabChange(s.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              subTab === s.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {subTab === "brain" && <ProjectBrain />}
        {subTab === "plugins" && <PluginMarketplace />}
        {subTab === "brandkit" && <BrandKitGenerator />}
        {subTab === "quality" && <CodeQualityPanel />}
        {subTab === "search" && <SemanticSearchPanel />}
        {subTab === "ir" && <IREditor />}
        {subTab === "planning" && (
          <PlanningPanel
            onExecuteTask={(prompt) => onSendMessage?.(prompt)}
          />
        )}
        {subTab === "history" && (
          <VersionHistory versions={versions} onRevert={onRevert} onClose={() => onSubTabChange("brain")} />
        )}
      </div>
    </div>
  );
};

export default ProjectSettingsPage;
