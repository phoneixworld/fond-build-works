import { useState } from "react";
import { FlaskConical, Plus, Play, Pause, BarChart3, Trash2, ArrowRight, Percent, Eye, MousePointerClick, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

interface Variant {
  id: string;
  name: string;
  traffic: number;
  views: number;
  conversions: number;
  htmlSnapshot?: string;
}

interface Experiment {
  id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  goal: string;
  variants: Variant[];
  createdAt: number;
}

const GOALS = [
  { id: "clicks", label: "Click-through", icon: MousePointerClick },
  { id: "signups", label: "Sign-ups", icon: TrendingUp },
  { id: "engagement", label: "Engagement", icon: Eye },
];

const ABTesting = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGoal, setNewGoal] = useState("clicks");

  const createExperiment = () => {
    if (!newName.trim()) return;
    const exp: Experiment = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      status: "draft",
      goal: newGoal,
      variants: [
        { id: "a", name: "Control (A)", traffic: 50, views: 0, conversions: 0 },
        { id: "b", name: "Variant B", traffic: 50, views: 0, conversions: 0 },
      ],
      createdAt: Date.now(),
    };
    setExperiments(prev => [exp, ...prev]);
    setNewName("");
    setCreating(false);
    toast({ title: "Experiment created", description: `"${exp.name}" is ready to configure.` });
  };

  const toggleExperiment = (id: string) => {
    setExperiments(prev => prev.map(e => {
      if (e.id !== id) return e;
      const next = e.status === "running" ? "paused" : "running";
      // Simulate some data when running
      if (next === "running") {
        return {
          ...e,
          status: next,
          variants: e.variants.map(v => ({
            ...v,
            views: v.views + Math.floor(Math.random() * 200 + 100),
            conversions: v.conversions + Math.floor(Math.random() * 30 + 5),
          })),
        };
      }
      return { ...e, status: next };
    }));
  };

  const deleteExperiment = (id: string) => {
    setExperiments(prev => prev.filter(e => e.id !== id));
    toast({ title: "Deleted", description: "Experiment removed." });
  };

  const updateTraffic = (expId: string, variantId: string, traffic: number) => {
    setExperiments(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const remaining = 100 - traffic;
      const otherCount = e.variants.length - 1;
      const otherTraffic = Math.floor(remaining / otherCount);
      return {
        ...e,
        variants: e.variants.map(v =>
          v.id === variantId ? { ...v, traffic } : { ...v, traffic: otherTraffic }
        ),
      };
    }));
  };

  const getConversionRate = (v: Variant) => v.views > 0 ? ((v.conversions / v.views) * 100).toFixed(1) : "0.0";

  const getWinner = (variants: Variant[]) => {
    if (variants.every(v => v.views === 0)) return null;
    const sorted = [...variants].sort((a, b) => {
      const rateA = a.views > 0 ? a.conversions / a.views : 0;
      const rateB = b.views > 0 ? b.conversions / b.views : 0;
      return rateB - rateA;
    });
    return sorted[0].id;
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-border bg-[hsl(var(--ide-panel-header))] shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">A/B Testing</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            {experiments.length} experiments
          </span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Test
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Create form */}
        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3"
            >
              <h3 className="text-xs font-semibold">Create Experiment</h3>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createExperiment()}
                placeholder="Experiment name (e.g. 'Hero CTA Color')"
                className="w-full bg-background text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary transition-colors"
                autoFocus
              />
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Goal</label>
                <div className="flex gap-2">
                  {GOALS.map((g) => {
                    const Icon = g.icon;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setNewGoal(g.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                          newGoal === g.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCreating(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createExperiment}
                  disabled={!newName.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Create
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Experiments list */}
        {experiments.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <FlaskConical className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No Experiments Yet</h3>
            <p className="text-xs text-muted-foreground max-w-[250px]">
              Create an A/B test to compare different versions of your app and find what converts best.
            </p>
          </div>
        )}

        {experiments.map((exp) => {
          const winner = getWinner(exp.variants);
          const GoalIcon = GOALS.find(g => g.id === exp.goal)?.icon || BarChart3;
          return (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-secondary/30 border border-border rounded-xl overflow-hidden"
            >
              {/* Experiment header */}
              <div className="flex items-center justify-between p-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    exp.status === "running" ? "bg-green-500 animate-pulse" :
                    exp.status === "paused" ? "bg-amber-500" : "bg-muted-foreground/30"
                  }`} />
                  <span className="text-xs font-semibold">{exp.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    exp.status === "running" ? "bg-green-500/10 text-green-500" :
                    exp.status === "paused" ? "bg-amber-500/10 text-amber-500" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    {exp.status}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleExperiment(exp.id)}
                    className={`p-1.5 rounded-md transition-colors ${
                      exp.status === "running"
                        ? "text-amber-500 hover:bg-amber-500/10"
                        : "text-green-500 hover:bg-green-500/10"
                    }`}
                  >
                    {exp.status === "running" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => deleteExperiment(exp.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Variants */}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <GoalIcon className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Goal: {GOALS.find(g => g.id === exp.goal)?.label}
                  </span>
                </div>
                {exp.variants.map((v) => {
                  const isWinner = winner === v.id && exp.variants.some(vr => vr.views > 0);
                  return (
                    <div
                      key={v.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                        isWinner ? "border-green-500/30 bg-green-500/5" : "border-border/50 bg-background/50"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{v.name}</span>
                          {isWinner && (
                            <span className="text-[9px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full font-semibold">
                              WINNING
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            <Eye className="w-3 h-3 inline mr-0.5" />{v.views.toLocaleString()} views
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            <MousePointerClick className="w-3 h-3 inline mr-0.5" />{v.conversions.toLocaleString()} conv.
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-foreground">{getConversionRate(v)}%</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Percent className="w-3 h-3 text-muted-foreground" />
                          <input
                            type="range"
                            min={10}
                            max={90}
                            value={v.traffic}
                            onChange={(e) => updateTraffic(exp.id, v.id, Number(e.target.value))}
                            className="w-16 h-1 accent-primary"
                          />
                          <span className="text-[10px] text-muted-foreground w-6">{v.traffic}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add variant */}
                {exp.variants.length < 4 && (
                  <button
                    onClick={() => {
                      const letter = String.fromCharCode(65 + exp.variants.length);
                      setExperiments(prev => prev.map(e => {
                        if (e.id !== exp.id) return e;
                        const newTraffic = Math.floor(100 / (e.variants.length + 1));
                        return {
                          ...e,
                          variants: [
                            ...e.variants.map(v => ({ ...v, traffic: newTraffic })),
                            { id: letter.toLowerCase(), name: `Variant ${letter}`, traffic: newTraffic, views: 0, conversions: 0 },
                          ],
                        };
                      }));
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add variant
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default ABTesting;
