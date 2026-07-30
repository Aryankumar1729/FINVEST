import { useState } from "react";
import { useNavigate } from "react-router";
import { PrimaryButton, GhostButton, Input, Select, Card } from "../components/ui";
import { Wallet, Shield, TrendingUp, CheckCircle } from "lucide-react";
import { riskQuestions } from "../lib/data";
import { markOnboardingComplete, submitOnboarding } from "../lib/onboarding";
import { CURRENT_USER_ID } from "../lib/constants";
import { toast } from "sonner";

const steps = [
  { id: 0, label: "Welcome" },
  { id: 1, label: "About You" },
  { id: 2, label: "Financial Details" },
  { id: 3, label: "Risk Profile" },
];

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    dob: "",
    employment: "Salaried",
    annualIncome: "",
    riskChoice: "",
  });

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));
  const next = () => setStep((s) => s + 1);
  const prev = () => setStep((s) => s - 1);

  const handleFinish = async () => {
    const salaryVal = parseFloat(form.annualIncome);
    if (Number.isNaN(salaryVal) || salaryVal <= 0) {
      setSubmitError("Please enter a valid positive annual income.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    const selfReportAnswers = [];
    if (form.name.trim()) selfReportAnswers.push({ question: "Name", answer: form.name.trim() });
    if (form.email.trim()) selfReportAnswers.push({ question: "Email", answer: form.email.trim() });
    if (form.dob) selfReportAnswers.push({ question: "Date of Birth", answer: form.dob });
    if (form.employment) selfReportAnswers.push({ question: "Employment", answer: form.employment });

    try {
      await submitOnboarding({
        user_id: CURRENT_USER_ID,
        salary: salaryVal,
        tax_regime: "new", // TEMPORARY: hardcoded default, onboarding UI doesn't collect this yet
        current_expense_estimate: 0, // TEMPORARY: hardcoded default, onboarding UI doesn't collect this yet
        current_cash_balance: 0, // TEMPORARY: hardcoded default, onboarding UI doesn't collect this yet
        liabilities: [], // TEMPORARY: hardcoded default, onboarding UI doesn't collect this yet
        self_report_answers: selfReportAnswers,
      });
      markOnboardingComplete();
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onboarding failed";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--background)" }}>
      {/* Left panel */}
      <div className="w-80 shrink-0 border-r border-white/[0.05] flex flex-col p-8"
        style={{ background: "rgba(10,13,20,0.9)" }}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-12">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-[0_0_14px_rgba(0,201,122,0.4)]">
            <Wallet size={16} className="text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">Finvest OS</span>
            <span className="block text-[9px] text-muted-foreground tracking-[0.12em] uppercase">Alpha</span>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex flex-col gap-4">
          {steps.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-all duration-300 ${
                  done ? "bg-primary border-primary" : active ? "border-primary" : "border-white/[0.12]"
                }`}>
                  {done
                    ? <CheckCircle size={12} className="text-primary-foreground" />
                    : <span className={`text-[10px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
                  }
                </div>
                <span className={`text-sm transition-colors ${active ? "text-foreground font-semibold" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-4">
          {[
            { icon: <Shield size={13} />, text: "Bank-grade encryption" },
            { icon: <TrendingUp size={13} />, text: "SEBI-compliant platform" },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
              <span className="text-primary">{f.icon}</span> {f.text}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="w-full max-w-md">
          {submitError && (
            <Card className="p-4 mb-6 border border-red-500/30 bg-red-500/10 text-sm text-red-400">
              {submitError}
            </Card>
          )}
          {step === 0 && <WelcomeStep onNext={next} />}
          {step === 1 && <AboutStep form={form} update={update} onNext={next} onBack={prev} />}
          {step === 2 && <FinancialStep form={form} update={update} onNext={next} onBack={prev} />}
          {step === 3 && (
            <RiskStep
              form={form}
              update={update}
              onFinish={handleFinish}
              onBack={prev}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-8">
        <Wallet size={28} className="text-primary" />
      </div>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-3">
        Your AI Financial OS
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-sm mx-auto">
        Manage stocks, mutual funds, goals, and tax in one place — powered by AI that takes real action on your behalf.
      </p>
      <PrimaryButton onClick={onNext} className="w-full py-3">Get Started</PrimaryButton>
    </div>
  );
}

function AboutStep({ form, update, onNext, onBack }: any) {
  const valid = form.name && form.email;
  return (
    <div>
      <h2 className="text-2xl font-semibold text-foreground mb-1">About You</h2>
      <p className="text-sm text-muted-foreground mb-8">Tell us a bit about yourself to get started.</p>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Full Name</label>
          <Input placeholder="Arjun Rathi" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Email Address</label>
          <Input type="email" placeholder="arjun@example.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Date of Birth</label>
          <Input type="date" value={form.dob} onChange={(e) => update("dob", e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Employment</label>
          <Select value={form.employment} onChange={(e) => update("employment", e.target.value)}>
            <option>Salaried</option>
            <option>Self-Employed</option>
            <option>Business</option>
            <option>Freelancer</option>
          </Select>
        </div>
      </div>
      <div className="flex gap-3 mt-8">
        <GhostButton onClick={onBack} className="flex-1">Back</GhostButton>
        <PrimaryButton onClick={onNext} disabled={!valid} className="flex-1">Continue</PrimaryButton>
      </div>
    </div>
  );
}

function FinancialStep({ form, update, onNext, onBack }: any) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-foreground mb-1">Financial Details</h2>
      <p className="text-sm text-muted-foreground mb-8">Used to calculate your tax estimates and net worth.</p>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Annual Income (₹)</label>
          <Input type="number" placeholder="1800000" value={form.annualIncome} onChange={(e) => update("annualIncome", e.target.value)} className="font-mono" />
        </div>
      </div>
      <div className="flex gap-3 mt-8">
        <GhostButton onClick={onBack} className="flex-1">Back</GhostButton>
        <PrimaryButton onClick={onNext} className="flex-1">Continue</PrimaryButton>
      </div>
    </div>
  );
}

function RiskStep({ update, onFinish, onBack }: any) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const total = riskQuestions.length;
  const pct = ((current + 1) / total) * 100;
  const q = riskQuestions[current];

  const pick = (qi: number, opt: number) => {
    const next = { ...answers, [qi]: opt };
    setAnswers(next);
    if (qi < total - 1) {
      setTimeout(() => setCurrent(qi + 1), 280);
    } else {
      const sum = Object.values(next).reduce((a, v) => a + v, 0);
      const max = (total - 1) * 3;
      const score = sum / max;
      const tier = score >= 0.67 ? "High" : score >= 0.34 ? "Moderate" : "Low";
      update("riskChoice", tier);
      setTimeout(onFinish, 280);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-foreground mb-1">Risk Appetite</h2>
      <p className="text-sm text-muted-foreground mb-6">Answer a few questions so we can understand your comfort with risk.</p>

      {/* Progress */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Question {current + 1} of {total}
        </p>
        <p className="text-[10px] font-mono text-primary">{Math.round(pct)}%</p>
      </div>
      <div className="w-full h-0.5 bg-white/[0.06] rounded-full mb-7">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Question */}
      <p className="text-base font-semibold text-foreground mb-1">{q.question}</p>
      <p className="text-xs text-muted-foreground mb-5">{q.description}</p>

      {/* Options */}
      <div className="flex flex-col gap-2.5">
        {q.options.map((opt, i) => {
          const selected = answers[current] === i;
          return (
            <button
              key={i}
              onClick={() => pick(current, i)}
              className={`text-left px-4 py-3 rounded-xl border transition-all duration-150 active:scale-[0.99] ${
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-white/[0.07] bg-white/[0.03] text-foreground hover:border-white/20 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                  selected ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {selected && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
                </div>
                <span className="text-sm font-medium">{opt}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <GhostButton onClick={onBack} className="w-full">Back</GhostButton>
      </div>
    </div>
  );
}
