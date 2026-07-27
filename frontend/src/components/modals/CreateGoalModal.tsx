import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { createGoal, selectGoalVariant } from "../../lib/api";
import type { StrategyVariant } from "../../lib/api-types";
import { CURRENT_USER_ID } from "../../lib/constants";
import { capitalizeVariant } from "../../lib/goals";
import { fmt } from "../../lib/utils";
import { Input, Select, PrimaryButton, GhostButton } from "../ui";
import { toast } from "sonner";
import { X, Target, CheckCircle } from "lucide-react";
import { cn } from "../../lib/utils";

function formatAllocation(allocation: Record<string, unknown> | null | undefined): string {
  if (!allocation || typeof allocation !== "object") return "—";
  const parts = Object.entries(allocation)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? `${label} ${n}%` : `${label} ${String(v)}`;
    });
  return parts.length ? parts.join(" · ") : "—";
}

export function CreateGoalModal() {
  const { modal, setModal } = useApp();
  if (modal !== "create-goal") return null;

  return <CreateGoalInner onClose={() => setModal(null)} />;
}

function CreateGoalInner({ onClose }: { onClose: () => void }) {
  const { refreshGoals } = useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: "", target: "", horizon: "5", category: "Education" });
  const [selected, setSelected] = useState<number | null>(null);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [variants, setVariants] = useState<StrategyVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));
  const valid1 = form.name && form.target;

  const next = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await createGoal(
        CURRENT_USER_ID,
        Number(form.target),
        Number(form.horizon),
      );
      setGoalId(res.goal_id);
      setVariants(res.variants ?? []);
      setSelected(null);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate strategies");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (selected === null || goalId === null) return;
    setError(null);
    setLoading(true);
    try {
      const res = await selectGoalVariant(CURRENT_USER_ID, goalId, selected);
      const chosen =
        res.variants.find((v) => v.variant_id === selected) ??
        variants.find((v) => v.variant_id === selected);
      const label = capitalizeVariant(chosen?.variant_type ?? null);
      refreshGoals();
      onClose();
      toast.success(`Goal created with ${label} strategy`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to confirm goal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative rounded-2xl border border-white/[0.08] flex flex-col overflow-hidden",
          step === 2 ? "w-full max-w-2xl" : "w-full max-w-md"
        )}
        style={{
          background: "rgba(14,18,27,0.99)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          animation: "slideUp 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
              <Target size={13} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Create Goal</p>
              <p className="text-[10px] text-muted-foreground">{step === 1 ? "Step 1 of 2 · Define goal" : "Step 2 of 2 · Choose strategy"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
            <X size={14} />
          </button>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal Name</label>
                <Input placeholder="e.g. Europe Vacation" value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Category</label>
                <Select value={form.category} onChange={(e) => update("category", e.target.value)}>
                  {["Education", "Travel", "Home", "Retirement", "Emergency", "Business", "Other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target Amount (₹)</label>
                <Input type="number" placeholder="500000" value={form.target} onChange={(e) => update("target", e.target.value)} className="font-mono text-lg" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Time Horizon (years)</label>
                <Select value={form.horizon} onChange={(e) => update("horizon", e.target.value)}>
                  {["1", "2", "3", "5", "7", "10", "15", "20"].map((y) => (
                    <option key={y} value={y}>{y} {parseInt(y) === 1 ? "year" : "years"}</option>
                  ))}
                </Select>
              </div>
            </div>
            {error && (
              <p className="px-6 pb-2 text-xs text-red-400">{error}</p>
            )}
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.06]">
              <GhostButton onClick={onClose} className="flex-1">Cancel</GhostButton>
              <PrimaryButton onClick={next} disabled={!valid1 || loading} className="flex-1">
                {loading ? "Generating strategies…" : "Generate Strategies"}
              </PrimaryButton>
            </div>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <div className="px-6 pt-5 pb-2">
              <p className="text-xs text-muted-foreground">
                Goal: <span className="text-foreground font-semibold">{form.name}</span> ·{" "}
                Target: <span className="text-primary font-mono font-semibold">{form.target ? fmt(parseInt(form.target)) : "—"}</span> ·{" "}
                {form.horizon} yr horizon
              </p>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              {variants.map((v) => {
                const id = v.variant_id;
                const isActive = id != null && selected === id;
                return (
                  <button
                    key={id ?? v.variant_type}
                    type="button"
                    onClick={() => {
                      if (id != null) setSelected(id);
                    }}
                    disabled={id == null}
                    className={cn(
                      "text-left p-5 rounded-2xl border transition-all duration-150 flex flex-col gap-3",
                      isActive
                        ? "border-primary/40 bg-primary/[0.06]"
                        : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <p className={cn("text-sm font-bold", isActive ? "text-primary" : "text-foreground")}>
                        {capitalizeVariant(v.variant_type)}
                      </p>
                      {isActive && <CheckCircle size={14} className="text-primary" />}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Allocation</p>
                      <p className="text-sm font-mono font-semibold text-foreground leading-snug">
                        {formatAllocation(v.allocation_pct)}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {v.rationale ?? "—"}
                    </p>
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="px-6 pb-2 text-xs text-red-400">{error}</p>
            )}
            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.06]">
              <GhostButton
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="flex-1"
              >
                Back
              </GhostButton>
              <PrimaryButton onClick={confirm} disabled={selected === null || goalId === null || loading} className="flex-1">
                {loading ? "Creating goal…" : "Confirm Goal"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
