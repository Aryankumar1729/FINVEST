import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeader, Card, Input, Select, PrimaryButton, EmptyState } from "../components/ui";
import { toast } from "sonner";
import { Shield, FileText, Target, Plus, Trash2, User } from "lucide-react";
import {
  adjustRiskTier,
  getLiabilities,
  getProfile,
  submitRiskQuestionnaire,
  updateLiabilities,
  updateSalary,
} from "../lib/api";
import type {
  LiabilityItem,
  LiabilityResponse,
  ProfileResponse,
  ProfileRiskTier,
  TaxRegime,
} from "../lib/api-types";
import { CURRENT_USER_ID } from "../lib/constants";
import { RISK_QUESTIONNAIRE, RISK_SECTIONS } from "../lib/risk-questionnaire";
import { cn } from "../lib/utils";

type LiabilityDraft = LiabilityItem & { key: string };

const LOAN_PRESETS = ["Home Loan", "Car Loan", "Personal Loan", "Credit Card", "Education Loan", "Other"];

function emptyLiability(): LiabilityDraft {
  return {
    key: crypto.randomUUID(),
    loan_type: "Home Loan",
    principal: "",
    remaining_balance: "",
    interest_rate: "",
    tenure_months: 0,
    monthly_emi: "",
  };
}

function fromApiLiability(row: LiabilityResponse): LiabilityDraft {
  return {
    key: String(row.liability_id),
    loan_type: row.loan_type,
    principal: String(row.principal),
    remaining_balance: String(row.remaining_balance),
    interest_rate: String(row.interest_rate),
    tenure_months: Number(row.tenure_months),
    monthly_emi: String(row.monthly_emi),
  };
}

function toLiabilityPayload(rows: LiabilityDraft[]): LiabilityItem[] {
  return rows.map((r) => ({
    loan_type: r.loan_type,
    principal: r.principal === "" ? 0 : Number(r.principal),
    remaining_balance: r.remaining_balance === "" ? 0 : Number(r.remaining_balance),
    interest_rate: r.interest_rate === "" ? 0 : Number(r.interest_rate),
    tenure_months: Number(r.tenure_months) || 0,
    monthly_emi: r.monthly_emi === "" ? 0 : Number(r.monthly_emi),
  }));
}

function capitalizeTier(tier: ProfileRiskTier | null | undefined): string {
  if (!tier) return "—";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function tierColor(tier: ProfileRiskTier | null | undefined): string {
  if (tier === "aggressive") return "text-red-400";
  if (tier === "moderate") return "text-amber-400";
  if (tier === "conservative") return "text-emerald-400";
  return "text-muted-foreground";
}

function RiskAppetiteCard({
  riskTier,
  onTierUpdated,
}: {
  riskTier: ProfileRiskTier | null;
  onTierUpdated: () => Promise<void>;
}) {
  const [quizOpen, setQuizOpen] = useState(false);
  const [answers, setAnswers] = useState<Partial<Record<string, number>>>({});
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [manualTier, setManualTier] = useState<ProfileRiskTier>(riskTier ?? "moderate");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  useEffect(() => {
    if (riskTier) setManualTier(riskTier);
  }, [riskTier]);

  const answeredCount = RISK_QUESTIONNAIRE.filter((q) => answers[q.id] != null).length;
  const allAnswered = answeredCount === RISK_QUESTIONNAIRE.length;

  const startQuiz = () => {
    setAnswers({});
    setQuizError(null);
    setQuizOpen(true);
  };

  const submitQuiz = async () => {
    if (!allAnswered) {
      setQuizError("Please answer all 18 questions before submitting.");
      return;
    }
    const payload: Record<string, number> = {};
    for (const q of RISK_QUESTIONNAIRE) {
      payload[q.id] = answers[q.id]!;
    }
    setQuizLoading(true);
    setQuizError(null);
    try {
      const res = await submitRiskQuestionnaire(CURRENT_USER_ID, payload);
      toast.success(`Risk tier set to ${capitalizeTier(res.risk_tier)}`);
      setQuizOpen(false);
      await onTierUpdated();
    } catch (err: unknown) {
      setQuizError(err instanceof Error ? err.message : "Questionnaire failed");
    } finally {
      setQuizLoading(false);
    }
  };

  const applyManual = async () => {
    setAdjustLoading(true);
    setAdjustError(null);
    try {
      await adjustRiskTier(CURRENT_USER_ID, manualTier);
      toast.success(`Risk tier overridden to ${capitalizeTier(manualTier)}`);
      await onTierUpdated();
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setAdjustLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
          <Target size={13} className="text-violet-400" />
        </div>
        <p className="text-sm font-semibold text-foreground">Risk Appetite</p>
      </div>

      {!quizOpen ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Current classification</p>
              <p className={cn("text-base font-bold", tierColor(riskTier))}>
                {capitalizeTier(riskTier)} Risk
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                From questionnaire or a manual override. Manual override does not recompute your quiz score.
              </p>
            </div>
            <button
              type="button"
              onClick={startQuiz}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground border border-white/[0.08] hover:text-foreground hover:border-white/20 transition-all duration-150 active:scale-95 shrink-0"
            >
              Retake Quiz
            </button>
          </div>

          <div className="pt-4 border-t border-white/[0.05]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Adjust manually
            </p>
            <p className="text-[10px] text-muted-foreground mb-3">
              Overrides the displayed tier without re-running the questionnaire. Stored quiz answers/score are left unchanged.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={manualTier}
                onChange={(e) => setManualTier(e.target.value as ProfileRiskTier)}
                className="max-w-[200px]"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </Select>
              <PrimaryButton onClick={() => void applyManual()} disabled={adjustLoading}>
                {adjustLoading ? "Saving…" : "Apply override"}
              </PrimaryButton>
            </div>
            {adjustError && <p className="text-xs text-red-400 mt-2">{adjustError}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {answeredCount} / {RISK_QUESTIONNAIRE.length} answered
            </p>
            <button
              type="button"
              onClick={() => setQuizOpen(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {RISK_SECTIONS.map((section) => {
            const qs = RISK_QUESTIONNAIRE.filter((q) => q.section === section.id);
            return (
              <div key={section.id} className="flex flex-col gap-4">
                <p className="text-xs font-semibold text-primary uppercase tracking-[0.14em]">
                  {section.title}
                </p>
                {qs.map((q) => (
                  <div key={q.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-sm font-medium text-foreground mb-1">{q.prompt}</p>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-[10px] text-muted-foreground max-w-[40%]">{q.lowLabel}</span>
                      <span className="text-[10px] text-muted-foreground text-right max-w-[40%]">{q.highLabel}</span>
                    </div>
                    <div className="flex gap-2 justify-between">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const selected = answers[q.id] === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: n }))}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-mono font-semibold border transition-all",
                              selected
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-foreground"
                            )}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {quizError && <p className="text-xs text-red-400">{quizError}</p>}

          <PrimaryButton onClick={() => void submitQuiz()} disabled={!allAnswered || quizLoading}>
            {quizLoading ? "Submitting…" : "Submit questionnaire"}
          </PrimaryButton>
        </div>
      )}
    </Card>
  );
}

export function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);

  const [salary, setSalary] = useState("");
  const [taxRegime, setTaxRegime] = useState<TaxRegime>("new");
  const [expense, setExpense] = useState("");
  const [cash, setCash] = useState("");
  const [salaryDirty, setSalaryDirty] = useState(false);
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);

  const [liabilities, setLiabilities] = useState<LiabilityDraft[]>([]);
  const [liabDirty, setLiabDirty] = useState(false);
  const [liabSaving, setLiabSaving] = useState(false);
  const [liabError, setLiabError] = useState<string | null>(null);

  const applyProfile = useCallback((p: ProfileResponse) => {
    setProfile(p);
    setSalary(p.salary != null ? String(p.salary) : "");
    setTaxRegime(p.tax_regime ?? "new");
    setExpense(p.current_expense_estimate != null ? String(p.current_expense_estimate) : "");
    setCash(p.current_cash_balance != null ? String(p.current_cash_balance) : "");
    setSalaryDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await getProfile(CURRENT_USER_ID);
      if (p == null) {
        setProfileMissing(true);
        setProfile(null);
        setLiabilities([]);
        return;
      }
      setProfileMissing(false);
      applyProfile(p);
      const rows = await getLiabilities(CURRENT_USER_ID);
      setLiabilities(rows.map(fromApiLiability));
      setLiabDirty(false);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshProfileOnly = useCallback(async () => {
    const p = await getProfile(CURRENT_USER_ID);
    if (p) applyProfile(p);
  }, [applyProfile]);

  const saveSalary = async () => {
    setSalarySaving(true);
    setSalaryError(null);
    try {
      const updated = await updateSalary(CURRENT_USER_ID, salary, taxRegime, expense, cash);
      applyProfile(updated);
      toast.success("Salary & finances saved");
    } catch (err: unknown) {
      setSalaryError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSalarySaving(false);
    }
  };

  const saveLiabilities = async () => {
    setLiabSaving(true);
    setLiabError(null);
    try {
      const rows = await updateLiabilities(CURRENT_USER_ID, toLiabilityPayload(liabilities));
      setLiabilities(rows.map(fromApiLiability));
      setLiabDirty(false);
      toast.success("Liabilities saved");
    } catch (err: unknown) {
      setLiabError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLiabSaving(false);
    }
  };

  const updateLiability = (key: string, field: keyof LiabilityItem, value: string) => {
    setLiabilities((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        if (field === "tenure_months") return { ...row, tenure_months: Number(value) || 0 };
        return { ...row, [field]: value };
      })
    );
    setLiabDirty(true);
  };

  const riskTier = useMemo(() => profile?.risk_tier ?? null, [profile]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-[760px] mx-auto px-8 py-8">
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading profile…</Card>
        </div>
      </div>
    );
  }

  if (profileMissing) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-[760px] mx-auto px-8 py-8 flex flex-col gap-8">
          <SectionHeader eyebrow="Account" title="Profile" />
          <Card>
            <EmptyState
              icon={<User size={26} />}
              title="No profile yet"
              description="Complete onboarding to create your profile before editing salary, liabilities, or risk."
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[760px] mx-auto px-8 py-8 flex flex-col gap-8">
        <SectionHeader eyebrow="Account" title="Profile" />

        {loadError && (
          <Card className="p-4 text-sm text-red-400 border-red-500/30">{loadError}</Card>
        )}

        {/* Income & cash */}
        <Card className="p-6">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
              <FileText size={13} className="text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">Income & Finances</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Annual Salary (₹)
              </label>
              <Input
                type="number"
                value={salary}
                onChange={(e) => {
                  setSalary(e.target.value);
                  setSalaryDirty(true);
                }}
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Tax Regime
              </label>
              <Select
                value={taxRegime}
                onChange={(e) => {
                  setTaxRegime(e.target.value as TaxRegime);
                  setSalaryDirty(true);
                }}
              >
                <option value="new">New Regime</option>
                <option value="old">Old Regime</option>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Monthly Expense Estimate (₹)
              </label>
              <Input
                type="number"
                value={expense}
                onChange={(e) => {
                  setExpense(e.target.value);
                  setSalaryDirty(true);
                }}
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Cash Balance (₹)
              </label>
              <Input
                type="number"
                value={cash}
                onChange={(e) => {
                  setCash(e.target.value);
                  setSalaryDirty(true);
                }}
                className="font-mono"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-4">
            All four fields are sent together on every save (server has no partial update).
          </p>
          {salaryError && <p className="text-xs text-red-400 mt-2">{salaryError}</p>}
          <div className="flex justify-end mt-4">
            <PrimaryButton onClick={() => void saveSalary()} disabled={!salaryDirty || salarySaving}>
              {salarySaving ? "Saving…" : salaryDirty ? "Save finances" : "Saved"}
            </PrimaryButton>
          </div>
        </Card>

        {/* Liabilities */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-red-500/10 border border-red-500/15 flex items-center justify-center">
                <Shield size={13} className="text-red-400" />
              </div>
              <p className="text-sm font-semibold text-foreground">Liabilities</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLiabilities((prev) => [...prev, emptyLiability()]);
                setLiabDirty(true);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-all"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {liabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">No liabilities on file. Add a loan to get started.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {liabilities.map((row) => (
                <div
                  key={row.key}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Select
                      value={LOAN_PRESETS.includes(row.loan_type) ? row.loan_type : "Other"}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateLiability(row.key, "loan_type", v === "Other" ? "Other" : v);
                      }}
                      className="max-w-[220px]"
                    >
                      {LOAN_PRESETS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => {
                        setLiabilities((prev) => prev.filter((r) => r.key !== row.key));
                        setLiabDirty(true);
                      }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      aria-label="Remove liability"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {!LOAN_PRESETS.slice(0, -1).includes(row.loan_type) && (
                    <Input
                      placeholder="Loan type"
                      value={row.loan_type}
                      onChange={(e) => updateLiability(row.key, "loan_type", e.target.value)}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Principal</label>
                      <Input
                        type="number"
                        className="font-mono"
                        value={String(row.principal)}
                        onChange={(e) => updateLiability(row.key, "principal", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Remaining</label>
                      <Input
                        type="number"
                        className="font-mono"
                        value={String(row.remaining_balance)}
                        onChange={(e) => updateLiability(row.key, "remaining_balance", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Interest %</label>
                      <Input
                        type="number"
                        className="font-mono"
                        value={String(row.interest_rate)}
                        onChange={(e) => updateLiability(row.key, "interest_rate", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Tenure (months)</label>
                      <Input
                        type="number"
                        className="font-mono"
                        value={String(row.tenure_months)}
                        onChange={(e) => updateLiability(row.key, "tenure_months", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Monthly EMI</label>
                      <Input
                        type="number"
                        className="font-mono"
                        value={String(row.monthly_emi)}
                        onChange={(e) => updateLiability(row.key, "monthly_emi", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-4 pt-4 border-t border-white/[0.05]">
            Saving replaces your entire liabilities list on the server — always send the full list.
          </p>
          {liabError && <p className="text-xs text-red-400 mt-2">{liabError}</p>}
          <div className="flex justify-end mt-4">
            <PrimaryButton onClick={() => void saveLiabilities()} disabled={!liabDirty || liabSaving}>
              {liabSaving ? "Saving…" : liabDirty ? "Save liabilities" : "Saved"}
            </PrimaryButton>
          </div>
        </Card>

        <RiskAppetiteCard riskTier={riskTier} onTierUpdated={refreshProfileOnly} />
      </div>
    </div>
  );
}
