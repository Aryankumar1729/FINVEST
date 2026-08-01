import { useEffect, useId, useMemo, useState } from "react";
import { BarChart2, Target, Receipt, Wallet, Plus, ChevronRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fmt } from "../lib/utils";
import {
  ChangeChip, StatusBadge, ProgressBar, SectionHeader, Card, TableContainer,
  TableHeader, OutlineButton, EmptyState, PrimaryButton
} from "../components/ui";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { getGoals, getPortfolio, getPortfolioHistory, getTax } from "../lib/api";
import { CURRENT_USER_ID } from "../lib/constants";
import type {
  AggregatedHolding,
  GoalListItem,
  HistoryPoint,
  PortfolioResponse,
  TaxResponse,
} from "../lib/api-types";
import { goalStatus } from "../lib/goals";
import { aggregatePricedLots, num } from "../lib/portfolio";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: HistoryPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e1219] px-3.5 py-2.5 shadow-xl">
      <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">
        {point.payload.date}
      </p>
      <p className="text-sm font-mono font-semibold text-foreground">{fmt(point.value)}</p>
    </div>
  );
}

/** Same tick style as InvestDetailView stock/MF charts. */
function formatChartTick(date: string, points: HistoryPoint[]): string {
  if (points.length <= 2) return date.slice(5);
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date.slice(5);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function Dashboard() {
  const gradId = useId();
  const navigate = useNavigate();
  const { openBuy, openSell, portfolioVersion, goalsVersion } = useApp();

  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [goals, setGoals] = useState<GoalListItem[]>([]);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [tax, setTax] = useState<TaxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPortfolio(CURRENT_USER_ID),
      getGoals(CURRENT_USER_ID),
      getPortfolioHistory(CURRENT_USER_ID, "1y"),
      getTax(CURRENT_USER_ID),
    ])
      .then(([p, g, history, t]) => {
        if (cancelled) return;
        setPortfolio(p);
        setGoals(g.goals);
        setHistoryPoints(history.points);
        setTax(t);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioVersion, goalsVersion]);

  const holdings: AggregatedHolding[] = useMemo(
    () => (portfolio ? aggregatePricedLots(portfolio.priced_lots) : []),
    [portfolio],
  );

  const totalValue = portfolio
    ? portfolio.stock_open_value + portfolio.mutual_fund_open_value
    : holdings.reduce((a, h) => a + h.value, 0);
  const totalGain = holdings.reduce((a, h) => a + h.unrealized_gain, 0);
  const hasHoldings = holdings.length > 0;

  const historyChangePct = useMemo(() => {
    if (historyPoints.length < 2) return null;
    const first = historyPoints[0].value;
    const last = historyPoints[historyPoints.length - 1].value;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [historyPoints]);

  const goalsProgressPct = useMemo(() => {
    if (!goals.length) return 0;
    const ratios = goals.map((g) => {
      const target = num(g.target_amount);
      const saved = num(g.saved_amount);
      return target > 0 ? Math.min(saved / target, 1) : 0;
    });
    return (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100;
  }, [goals]);

  const summaryCards = [
    {
      label: "Portfolio Value",
      value: loading ? "…" : fmt(totalValue),
      sub: loading ? "Loading…" : `${holdings.length} holding${holdings.length === 1 ? "" : "s"}`,
      icon: <BarChart2 size={15} />,
      accent: true,
      gradient: "from-primary/20 to-transparent",
    },
    {
      label: "Unpaid Tax",
      value: loading || !tax ? "…" : fmt(tax.total_liability),
      sub: loading || !tax ? "Loading…" : `AY ${tax.assessment_year}`,
      icon: <Receipt size={15} />,
      accent: false,
      gradient: "from-amber-500/10 to-transparent",
    },
    {
      label: "Goals Progress",
      value: loading ? "…" : `${goalsProgressPct.toFixed(0)}%`,
      sub: loading ? "Loading…" : `${goals.length} committed goal${goals.length === 1 ? "" : "s"}`,
      icon: <Target size={15} />,
      accent: false,
      gradient: "from-blue-500/10 to-transparent",
    },
    {
      label: "Net Worth",
      value: "—",
      sub: "Assets − Liabilities (not wired)",
      icon: <Wallet size={15} />,
      accent: false,
      gradient: "from-purple-500/10 to-transparent",
    },
  ];

  // stock_sector_concentration_pct is available on portfolio but Dashboard has no sector chart yet — left unused.

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-8">

        <div className="flex items-end justify-between">
          <SectionHeader eyebrow="Overview" title="Dashboard" />
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading…" : error ? "Error" : "Live from API"}
          </p>
        </div>

        {error && (
          <Card className="p-4 border border-red-500/30 bg-red-500/10">
            <p className="text-sm text-red-400">{error}</p>
          </Card>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map((c) => (
            <Card key={c.label} className="p-5 relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} pointer-events-none`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{c.label}</p>
                  <span className={c.accent ? "text-primary" : "text-muted-foreground/60"}>{c.icon}</span>
                </div>
                <p className={`text-2xl font-mono font-bold tracking-tight ${c.accent ? "text-primary" : "text-foreground"}`}>{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">Portfolio Value</p>
              <p className="text-2xl font-mono font-bold text-foreground">{loading ? "…" : fmt(totalValue)}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {loading ? (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                ) : historyChangePct != null ? (
                  <>
                    <ChangeChip value={historyChangePct} />
                    <span className="text-xs text-muted-foreground">past 1Y</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">past 1Y</span>
                )}
              </div>
            </div>
          </div>
          {loading ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : historyPoints.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              No portfolio history yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={historyPoints} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00c97a" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#00c97a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#6b7585", fontFamily: "DM Mono" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                  tickFormatter={(d: string) => formatChartTick(d, historyPoints)}
                />
                <YAxis hide />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="value" stroke="#00c97a" strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Holdings</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total unrealised:{" "}
                <span className={totalGain >= 0 ? "text-emerald-400 font-mono" : "text-red-400 font-mono"}>
                  {loading ? "…" : `${totalGain >= 0 ? "+" : ""}${fmt(totalGain)}`}
                </span>
              </p>
            </div>
            <button
              onClick={() => openBuy()}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-xl px-3.5 py-2 hover:bg-primary hover:text-primary-foreground transition-all duration-150 active:scale-95"
            >
              <Plus size={12} /> Buy Stock
            </button>
          </div>

          {loading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Loading holdings…</Card>
          ) : !hasHoldings ? (
            <Card>
              <EmptyState
                icon={<BarChart2 size={26} />}
                title="No holdings yet"
                description="Start building your portfolio by buying your first stock."
                action={<PrimaryButton onClick={() => openBuy()}>Start Investing</PrimaryButton>}
              />
            </Card>
          ) : (
            <TableContainer>
              <TableHeader>
                <div className="grid grid-cols-[2.5fr_1fr_1fr_1fr_1fr_1fr_auto] text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                  <span>Symbol</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Avg Buy</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">Mkt Value</span>
                  <span className="text-right">Unrealised P&amp;L</span>
                  <span />
                </div>
              </TableHeader>
              {holdings.map((h, i) => {
                const cost = h.qty * h.avgBuy;
                const gainPct = cost > 0 ? (h.unrealized_gain / cost) * 100 : 0;
                return (
                  <div
                    key={h.key}
                    className={`grid grid-cols-[2.5fr_1fr_1fr_1fr_1fr_1fr_auto] px-5 py-4 items-center gap-2 hover:bg-white/[0.02] transition-colors ${i < holdings.length - 1 ? "border-b border-white/[0.05]" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-mono font-bold text-foreground tracking-wide">{h.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {h.kind === "stock" ? "Equity" : "Mutual fund"}
                      </p>
                    </div>
                    <p className="text-right text-sm font-mono text-foreground">{h.qty}</p>
                    <p className="text-right text-sm font-mono text-foreground">{fmt(h.avgBuy)}</p>
                    <p className="text-right text-sm font-mono text-foreground">{fmt(h.current)}</p>
                    <p className="text-right text-sm font-mono font-medium text-foreground">{fmt(h.value)}</p>
                    <div className="text-right">
                      <p className={`text-sm font-mono font-semibold ${h.unrealized_gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {h.unrealized_gain >= 0 ? "+" : ""}{fmt(Math.abs(h.unrealized_gain))}
                      </p>
                      <p className={`text-[10px] font-mono ${h.unrealized_gain >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                        {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {h.stock_symbol && (
                        <>
                          <OutlineButton onClick={() => openBuy(h.stock_symbol!)}>Buy</OutlineButton>
                          <button
                            onClick={() => openSell(h.stock_symbol!)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-red-400 border border-red-500/25 hover:bg-red-500/10 transition-all duration-150 active:scale-95"
                          >
                            Sell
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </TableContainer>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Goals at a Glance</p>
            <button
              onClick={() => navigate("/goals")}
              className="flex items-center gap-0.5 text-xs text-primary hover:underline underline-offset-2"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>
          {loading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Loading goals…</Card>
          ) : goals.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No committed goals yet. Create one from the Goals page.
            </Card>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              {goals.map((g) => {
                const target = num(g.target_amount);
                const saved = num(g.saved_amount);
                const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
                const status = goalStatus(saved, target);
                return (
                  <Card key={g.goal_id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs font-semibold text-foreground leading-snug">
                        Goal #{g.goal_id}
                        {g.variant_type ? ` · ${g.variant_type}` : ""}
                      </p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-lg font-mono font-bold text-foreground mb-0.5">{fmt(saved)}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">of {fmt(target)}</p>
                    <ProgressBar pct={pct} variant={status === "At Risk" ? "danger" : "default"} />
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% done</span>
                      <span className="text-[10px] text-muted-foreground">Target {g.target_date}</span>
                    </div>
                    {/* TODO: no backend concept for monthly contribution yet */}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
