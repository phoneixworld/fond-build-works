import { useState, useEffect, useCallback } from "react";
import { Activity, Eye, MousePointerClick, TrendingUp, Calendar, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";

interface AnalyticsData {
  totalViews: number;
  todayViews: number;
  uniqueReferrers: string[];
  dailyData: { date: string; views: number }[];
}

const PulseAnalytics = () => {
  const { currentProject } = useProjects();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");

  const fetchAnalytics = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);

    const daysAgo = range === "7d" ? 7 : range === "30d" ? 30 : 365;
    const since = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const { data: rows } = await supabase
      .from("project_analytics" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const items = (rows || []) as any[];

    const todayViews = items.filter(r => r.created_at?.slice(0, 10) === today).length;
    const referrers = [...new Set(items.map(r => r.referrer).filter(Boolean))];

    // Group by day
    const byDay: Record<string, number> = {};
    items.forEach(r => {
      const day = r.created_at?.slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
    });
    const dailyData = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, views]) => ({ date, views }));

    setData({ totalViews: items.length, todayViews, uniqueReferrers: referrers, dailyData });
    setLoading(false);
  }, [currentProject, range]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const maxViews = data ? Math.max(...data.dailyData.map(d => d.views), 1) : 1;

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Pulse</span>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          {(["7d", "30d", "all"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : !data || data.totalViews === 0 ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">No analytics yet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Publish your app to start tracking visitors.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <Eye className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Total Views</span>
                </div>
                <span className="text-2xl font-bold text-foreground">{data.totalViews.toLocaleString()}</span>
              </div>
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Today</span>
                </div>
                <span className="text-2xl font-bold text-foreground">{data.todayViews.toLocaleString()}</span>
              </div>
            </div>

            {/* Chart */}
            <div className="border border-border rounded-xl p-4 bg-background">
              <div className="flex items-center gap-1.5 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Daily Views</span>
              </div>
              <div className="flex items-end gap-[2px] h-24">
                {data.dailyData.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors relative group"
                    style={{ height: `${(d.views / maxViews) * 100}%`, minHeight: "2px" }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground whitespace-nowrap shadow-lg z-10">
                      {d.date}: {d.views}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Referrers */}
            {data.uniqueReferrers.length > 0 && (
              <div className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-1.5 mb-3">
                  <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Top Referrers</span>
                </div>
                <div className="space-y-2">
                  {data.uniqueReferrers.slice(0, 5).map((ref, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">{ref}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PulseAnalytics;
