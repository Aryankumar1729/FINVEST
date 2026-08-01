import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "../../lib/utils";

// ─── ChangeChip ──────────────────────────────────────────────────────────────
export function ChangeChip({ value, label }: { value: number; label?: string }) {
  const pos = value >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-mono font-semibold px-1.5 py-0.5 rounded-sm tabular-nums",
      pos ? "bg-emerald-500/12 text-emerald-400" : "bg-red-500/12 text-red-400"
    )}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? "+" : ""}{value.toFixed(2)}%
      {label && <span className="ml-0.5 opacity-60">{label}</span>}
    </span>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "On Track": "bg-emerald-500/12 text-emerald-400 border border-emerald-500/20",
    "At Risk":  "bg-red-500/12 text-red-400 border border-red-500/20",
    "Achieved": "bg-primary/15 text-primary border border-primary/25",
    "Paid":     "bg-emerald-500/12 text-emerald-400 border border-emerald-500/20",
    "Unpaid":   "bg-amber-500/12 text-amber-400 border border-amber-500/20",
  };
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md", map[status] || "bg-secondary text-muted-foreground")}>
      {status}
    </span>
  );
}

// ─── RiskBadge ───────────────────────────────────────────────────────────────
export function RiskBadge({ risk }: { risk: string }) {
  const map: Record<string, string> = {
    "Low":      "bg-emerald-500/12 text-emerald-400 border border-emerald-500/20",
    "Moderate": "bg-amber-500/12 text-amber-400 border border-amber-500/20",
    "High":     "bg-red-500/12 text-red-400 border border-red-500/20",
  };
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md", map[risk] || "bg-secondary text-muted-foreground")}>
      {risk}
    </span>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({ pct, variant = "default" }: { pct: number; variant?: "default" | "danger" | "success" }) {
  const trackColor = "bg-white/5";
  const fillColor = variant === "danger" ? "bg-red-500" : variant === "success" ? "bg-primary" : "bg-primary";
  return (
    <div className={cn("w-full h-1 rounded-full overflow-hidden", trackColor)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700", fillColor)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────
export function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-0.5">{eyebrow}</p>
      <h1 className="text-[22px] font-semibold text-foreground tracking-tight">{title}</h1>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
  onClick,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-white/[0.06] bg-card", className)}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>
  );
}

// ─── TableContainer ──────────────────────────────────────────────────────────
export function TableContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/[0.06] overflow-hidden bg-card", className)}>
      {children}
    </div>
  );
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-white/[0.05] bg-white/[0.02]">
      {children}
    </div>
  );
}

// ─── StatBlock ───────────────────────────────────────────────────────────────
export function StatBlock({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-mono font-semibold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Input ───────────────────────────────────────────────────────────────────
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5",
        "text-sm text-foreground placeholder:text-muted-foreground",
        "outline-none focus:border-primary/60 focus:bg-white/[0.06] transition-all duration-150",
        "font-['Inter',sans-serif]",
        className
      )}
    />
  );
}

// ─── Select ──────────────────────────────────────────────────────────────────
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full appearance-none bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5",
        "text-sm text-foreground outline-none focus:border-primary/60 transition-all duration-150",
        className
      )}
    >
      {children}
    </select>
  );
}

// ─── Button variants ─────────────────────────────────────────────────────────
export function PrimaryButton({ children, className, disabled, onClick }: {
  children: React.ReactNode; className?: string; disabled?: boolean; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      onClick={(e) => onClick?.(e)}
      disabled={disabled}
      className={cn(
        "px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold",
        "hover:opacity-90 active:scale-[0.98] transition-all duration-150",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className, onClick }: {
  children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      onClick={(e) => onClick?.(e)}
      className={cn(
        "px-5 py-2.5 rounded-xl border border-white/[0.08] text-sm text-muted-foreground",
        "hover:text-foreground hover:border-white/20 active:scale-[0.98] transition-all duration-150",
        className
      )}
    >
      {children}
    </button>
  );
}

export function OutlineButton({ children, className, onClick, disabled }: {
  children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={(e) => onClick?.(e)}
      disabled={disabled}
      className={cn(
        "px-3 py-1.5 rounded-lg border border-primary/30 text-xs font-semibold text-primary",
        "hover:bg-primary hover:text-primary-foreground active:scale-[0.97] transition-all duration-150",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── SearchBar ───────────────────────────────────────────────────────────────
import { Search } from "lucide-react";
export function SearchBar({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2.5 focus-within:border-white/20 transition-colors">
      <Search size={14} className="text-muted-foreground shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent flex-1 text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="text-center max-w-xs">
        <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      {action && action}
    </div>
  );
}
