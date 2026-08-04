import { useEffect, useState } from "react";
import { fmt } from "../lib/utils";
import { StatusBadge, ProgressBar, SectionHeader, Card, EmptyState, PrimaryButton } from "../components/ui";
import { useApp } from "../context/AppContext";
import { getGoals } from "../lib/api";
import { CURRENT_USER_ID } from "../lib/constants";
import type { GoalListItem } from "../lib/api-types";
import { capitalizeVariant, goalPlanLabel, goalStatus } from "../lib/goals";
import { num } from "../lib/portfolio";
import { Target, Plus, TrendingUp } from "lucide-react";

export function GoalsScreen() {
  const { setModal, goalsVersion } = useApp();
  const [goals, setGoals] = useState<GoalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGoals()
      .then((res) => {
        if (cancelled) return;
        setGoals(res.goals);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load goals");
        setGoals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goalsVersion]);

  const totalTarget = goals.reduce((a, g) => a + num(g.target_amount), 0);
  const totalSaved = goals.reduce((a, g) => a + num(g.saved_amount), 0);

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[900px] mx-auto px-8 py-8 flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-end justify-between">
          <SectionHeader eyebrow="Planning" title="Goals" />
          <button
            onClick={() => setModal("create-goal")}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-xl px-4 py-2 hover:bg-primary hover:text-primary-foreground transition-all duration-150 active:scale-95"
          >
            <Plus size={12} /> New Goal
          </button>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active Goals", value: loading ? "…" : `${goals.length}` },
            { label: "Total Target", value: loading ? "…" : fmt(totalTarget) },
            { label: "Total Saved", value: loading ? "…" : fmt(totalSaved) },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-2">{s.label}</p>
              <p className="text-xl font-mono font-bold text-foreground">{s.value}</p>
            </Card>
          ))}
        </div>

        {error && (
          <Card className="p-4 text-sm text-red-400 border-red-500/30">
            {error}
          </Card>
        )}

        {/* Goal cards */}
        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading goals…</Card>
        ) : goals.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Target size={26} />}
              title="No goals yet"
              description="Create your first financial goal and let AI suggest the best investment strategy."
              action={<PrimaryButton onClick={() => setModal("create-goal")}>Create Goal</PrimaryButton>}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {goals.map((g) => {
              const target = num(g.target_amount);
              const saved = num(g.saved_amount);
              const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
              const remaining = Math.max(target - saved, 0);
              const status = goalStatus(saved, target);
              return (
                <Card key={g.goal_id} className="p-6">
                  <div className="flex items-start gap-6">
                    {/* Left - Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="text-base font-semibold text-foreground">{goalPlanLabel(g.variant_type)}</p>
                        <StatusBadge status={status} />
                      </div>
                      <p className="text-xs text-muted-foreground mb-5">Target: {g.target_date}</p>

                      <ProgressBar pct={pct} variant={status === "At Risk" ? "danger" : "default"} />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% complete</span>
                        <span className="text-[10px] text-muted-foreground">{fmt(remaining)} to go</span>
                      </div>
                    </div>

                    {/* Right - Stats */}
                    <div className="grid grid-cols-2 gap-6 shrink-0">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Saved</p>
                        <p className="text-lg font-mono font-bold text-foreground">{fmt(saved)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Target</p>
                        <p className="text-lg font-mono font-bold text-foreground">{fmt(target)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Strategy tag — real variant_type */}
                  {g.variant_type && (
                    <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-center gap-2">
                      <TrendingUp size={11} className="text-primary" />
                      <p className="text-xs text-muted-foreground">
                        Strategy: <span className="text-foreground font-medium">{capitalizeVariant(g.variant_type)}</span>
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Create CTA */}
        <Card className="p-6 border-dashed">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground mb-0.5">Add a new goal</p>
              <p className="text-xs text-muted-foreground">AI will generate 3 strategy options tailored to your risk profile.</p>
            </div>
            <PrimaryButton onClick={() => setModal("create-goal")}>
              <Plus size={13} className="inline mr-1.5" />Create Goal
            </PrimaryButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
