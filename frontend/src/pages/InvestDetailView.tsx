import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, BarChart2, Star } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { fmt, fmtDecimal } from "../lib/utils";
import { ChangeChip, Card } from "../components/ui";
import { useApp } from "../context/AppContext";
import { getMfHistory, getMutualFundDetail, getStockDetail, getStockHistory } from "../lib/api";
import type {
  CagrPeriod,
  HistoryPoint,
  MutualFundInvestResponse,
  StockInvestResponse,
} from "../lib/api-types";
import { num } from "../lib/portfolio";
import { toast } from "sonner";

const STOCK_RANGE_TO_PERIOD = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "1Y": "1y",
} as const;

type StockChartRange = keyof typeof STOCK_RANGE_TO_PERIOD;
type MfChartRange = "1Y" | "3Y" | "5Y";

const MF_RANGE_TO_PERIOD: Record<MfChartRange, string> = {
  "1Y": "1y",
  "3Y": "3y",
  "5Y": "5y",
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: HistoryPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="bg-[#131820] border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs font-mono font-bold text-foreground">{fmt(point.value)}</p>
      <p className="text-[10px] text-muted-foreground">{point.payload.date}</p>
    </div>
  );
}

function formatChartTick(date: string, points: HistoryPoint[]): string {
  if (points.length <= 2) return date.slice(5);
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date.slice(5);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className="text-sm font-mono font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function formatMarketCap(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `₹${(value / 1e12).toFixed(2)} T`;
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  return fmt(value);
}

function formatNullableNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

const CAGR_PERIODS: { key: CagrPeriod; label: string }[] = [
  { key: "1y", label: "1Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
  { key: "7y", label: "7Y" },
  { key: "10y", label: "10Y" },
];

export function StockDetailView({ stock }: { stock: StockInvestResponse }) {
  const navigate = useNavigate();
  const { openBuy } = useApp();
  const onBack = () => navigate("/invest");
  const onBuy = () => openBuy(stock.symbol);
  const [range, setRange] = useState<StockChartRange>("1Y");
  const [chartData, setChartData] = useState<HistoryPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  const price = num(stock.price);
  const change = num(stock.pct_change);
  const high52 = stock.fifty_two_week_high == null ? null : num(stock.fifty_two_week_high);
  const low52 = stock.fifty_two_week_low == null ? null : num(stock.fifty_two_week_low);
  const pe = stock.pe_ratio == null ? null : num(stock.pe_ratio);
  const marketCap = stock.market_cap == null ? null : num(stock.market_cap);
  const eps = stock.eps == null ? null : num(stock.eps);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartError(null);
    getStockHistory(stock.symbol, STOCK_RANGE_TO_PERIOD[range])
      .then((res) => {
        if (!cancelled) setChartData(res.points);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setChartData([]);
        setChartError(err instanceof Error ? err.message : "Failed to load price history");
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stock.symbol, range]);

  const isPositive = useMemo(() => {
    if (chartData.length >= 2) {
      return chartData[chartData.length - 1].value >= chartData[0].value;
    }
    return change >= 0;
  }, [chartData, change]);
  const rangePct =
    high52 != null && low52 != null && high52 > low52
      ? ((price - low52) / (high52 - low52)) * 100
      : null;

  const fundamentals = [
    { label: "Market Cap", value: formatMarketCap(marketCap) },
    { label: "P/E Ratio", value: formatNullableNumber(pe, 1) },
    { label: "EPS (TTM)", value: eps == null ? "—" : fmtDecimal(eps) },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-6">

        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Stocks
          </button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
                <span className="text-xs font-mono font-bold text-foreground">{stock.symbol.slice(0, 2)}</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">{stock.name ?? stock.symbol}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs font-mono text-muted-foreground">{stock.symbol}</p>
                  <span className="text-white/20">·</span>
                  <p className="text-xs text-muted-foreground">{stock.sector ?? "—"}</p>
                  <span className="text-white/20">·</span>
                  <p className="text-xs text-muted-foreground">NSE</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="w-9 h-9 rounded-xl border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:border-amber-500/30 transition-all">
                <Star size={14} />
              </button>
              <button
                onClick={onBuy}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-[0_0_16px_rgba(0,201,122,0.25)] hover:shadow-[0_0_20px_rgba(0,201,122,0.35)] transition-all active:scale-95"
              >
                Buy Now
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <p className="text-4xl font-mono font-bold text-foreground">
            {stock.price == null ? "—" : fmtDecimal(price)}
          </p>
          <div className="mb-1 flex items-center gap-2">
            {stock.pct_change == null ? (
              <span className="text-xs text-muted-foreground">N/A</span>
            ) : (
              <ChangeChip value={change} />
            )}
            <span className="text-xs text-muted-foreground">today</span>
          </div>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Price History</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {chartLoading
                  ? "Loading…"
                  : chartError
                    ? chartError
                    : chartData.length
                      ? `${chartData[0].date} → ${chartData[chartData.length - 1].date} · ${chartData.length} sessions`
                      : "No history available"}
              </p>
            </div>
            <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl">
              {(Object.keys(STOCK_RANGE_TO_PERIOD) as StockChartRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    range === r ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {chartLoading ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
          ) : chartError || chartData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              {chartError ?? "Price history unavailable"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPositive ? "#00c97a" : "#ef4444"} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={isPositive ? "#00c97a" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                  tickFormatter={(d: string) => formatChartTick(d, chartData)}
                />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => "₹" + v.toFixed(0)} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isPositive ? "#00c97a" : "#ef4444"}
                  strokeWidth={2}
                  fill="url(#stockGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: isPositive ? "#00c97a" : "#ef4444", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-4">52-Week Range</p>
          {high52 == null || low52 == null ? (
            <p className="text-xs text-muted-foreground">52-week range unavailable</p>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-red-400">{fmtDecimal(low52)}</span>
              <div className="flex-1 relative h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400"
                  style={{ width: `${Math.min(100, Math.max(0, rangePct ?? 0))}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-background shadow"
                  style={{ left: `calc(${Math.min(95, Math.max(0, rangePct ?? 0))}% - 6px)` }}
                />
              </div>
              <span className="text-xs font-mono text-emerald-400">{fmtDecimal(high52)}</span>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Fundamentals</p>
          <div className="grid grid-cols-3 gap-3">
            {fundamentals.map((f) => (
              <StatBox key={f.label} label={f.label} value={f.value} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 opacity-55">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">vs. Benchmarks</p>
            <span className="text-[9px] uppercase tracking-wider text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              Illustrative — not live data
            </span>
          </div>
          <Card className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
              <p className="text-xs font-mono font-bold text-foreground">{stock.symbol}</p>
              {stock.pct_change == null ? (
                <span className="text-xs text-muted-foreground">N/A</span>
              ) : (
                <ChangeChip value={change} />
              )}
            </div>
            <div className="flex items-center justify-between py-1">
              <p className="text-xs text-muted-foreground">NIFTY50</p>
              <ChangeChip value={0.54} />
            </div>
            <div className="flex items-center justify-between py-1">
              <p className="text-xs text-muted-foreground">{(stock.sector ?? "Sector") + " Index"}</p>
              <ChangeChip value={change * 0.65} />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">About</p>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {stock.name ?? stock.symbol} is listed on NSE
              {stock.sector ? ` in the ${stock.sector.toLowerCase()} sector` : ""}.
              Fundamentals above are sourced from the live invest API; narrative copy is placeholder until a description field is exposed.
            </p>
            <div className="flex gap-4 mt-4 pt-4 border-t border-white/[0.05]">
              {["NSE", "BSE", stock.sector].filter(Boolean).map((tag) => (
                <span key={tag!} className="text-[10px] text-muted-foreground bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-lg">
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3 opacity-55">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Analyst Ratings</p>
            <span className="text-[9px] uppercase tracking-wider text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              Illustrative — not live data
            </span>
          </div>
          <Card className="p-5">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-emerald-400">16</p>
                <p className="text-[10px] text-muted-foreground mt-1">Buy</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-amber-400">5</p>
                <p className="text-[10px] text-muted-foreground mt-1">Hold</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-red-400">2</p>
                <p className="text-[10px] text-muted-foreground mt-1">Sell</p>
              </div>
              <div className="flex-1 pl-4 border-l border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground mb-1">12M Target Price</p>
                <p className="text-xl font-mono font-bold text-foreground">
                  {stock.price == null ? "—" : fmt(Math.round(price * 1.18))}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Placeholder +18% upside</p>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}

export function MutualFundDetailView({ fund }: { fund: MutualFundInvestResponse }) {
  const navigate = useNavigate();
  const onBack = () => navigate("/invest");
  const [range, setRange] = useState<MfChartRange>("3Y");
  const [chartData, setChartData] = useState<HistoryPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartUnavailable, setChartUnavailable] = useState(false);

  const nav = num(fund.latest_nav);
  const dayPct = fund.pct_change == null ? null : num(fund.pct_change);
  const return1y = fund.cagr_returns?.["1y"];
  const return3y = fund.cagr_returns?.["3y"];

  useEffect(() => {
    let cancelled = false;
    const code = fund.amfi_scheme_code?.trim();
    if (!code) {
      setChartData([]);
      setChartError(null);
      setChartUnavailable(true);
      setChartLoading(false);
      return;
    }
    setChartUnavailable(false);
    setChartLoading(true);
    setChartError(null);
    getMfHistory(code, MF_RANGE_TO_PERIOD[range])
      .then((res) => {
        if (!cancelled) setChartData(res.points);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setChartData([]);
        setChartError(err instanceof Error ? err.message : "Failed to load NAV history");
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fund.amfi_scheme_code, range]);

  const weightageBars = [
    { label: "Large Cap", pct: fund.market_cap_weightage?.large_cap == null ? null : num(fund.market_cap_weightage.large_cap) },
    { label: "Mid Cap", pct: fund.market_cap_weightage?.mid_cap == null ? null : num(fund.market_cap_weightage.mid_cap) },
    { label: "Small Cap", pct: fund.market_cap_weightage?.small_cap == null ? null : num(fund.market_cap_weightage.small_cap) },
    { label: "Others", pct: fund.market_cap_weightage?.others == null ? null : num(fund.market_cap_weightage.others) },
  ];

  const assetBars = [
    { label: "Equity", pct: fund.asset_allocation?.equity ?? null },
    { label: "Debt", pct: fund.asset_allocation?.debt ?? null },
    { label: "Cash", pct: fund.asset_allocation?.cash ?? null },
    { label: "Other", pct: fund.asset_allocation?.other ?? null },
  ];

  const barColors = ["bg-emerald-400", "bg-blue-400", "bg-amber-400", "bg-purple-400"];

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-6">

        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Mutual Funds
          </button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
                <BarChart2 size={18} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">{fund.name}</h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-muted-foreground">{fund.scheme_category ?? "—"}</p>
                  {fund.scheme_category_label && (
                    <>
                      <span className="text-white/20">·</span>
                      <p className="text-xs text-muted-foreground">{fund.scheme_category_label}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-5 py-2.5 rounded-xl border border-white/[0.1] text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-white/20 transition-all active:scale-95">
                Start SIP
              </button>
              <button className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-[0_0_16px_rgba(0,201,122,0.25)] hover:shadow-[0_0_20px_rgba(0,201,122,0.35)] transition-all active:scale-95">
                Lump Sum
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current NAV</p>
            <p className="text-4xl font-mono font-bold text-foreground">
              {fund.latest_nav == null ? "—" : fmtDecimal(nav)}
            </p>
          </div>
          <div className="mb-1 flex flex-col gap-1">
            {dayPct == null ? (
              <span className="text-xs text-muted-foreground">Day change N/A</span>
            ) : (
              <ChangeChip value={dayPct} label="today" />
            )}
            {return1y == null ? (
              <span className="text-xs text-muted-foreground">1Y N/A</span>
            ) : (
              <ChangeChip value={return1y} label="1Y" />
            )}
            {return3y == null ? (
              <span className="text-xs text-muted-foreground">3Y N/A</span>
            ) : (
              <ChangeChip value={return3y} label="3Y CAGR" />
            )}
          </div>
        </div>

        {(fund.previous_nav != null || fund.nav_change != null) && (
          <div className="flex gap-6 text-xs text-muted-foreground">
            {fund.previous_nav != null && (
              <p>Previous NAV <span className="font-mono text-foreground">{fmtDecimal(num(fund.previous_nav))}</span></p>
            )}
            {fund.nav_change != null && (
              <p>Change <span className="font-mono text-foreground">{num(fund.nav_change).toFixed(4)}</span></p>
            )}
          </div>
        )}

        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">NAV History</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {chartUnavailable
                  ? "NAV history unavailable (no AMFI scheme code)"
                  : chartLoading
                    ? "Loading…"
                    : chartError
                      ? chartError
                      : chartData.length
                        ? `${chartData[0].date} → ${chartData[chartData.length - 1].date} · ${chartData.length} points`
                        : "No history available"}
              </p>
            </div>
            <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl">
              {(Object.keys(MF_RANGE_TO_PERIOD) as MfChartRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  disabled={chartUnavailable}
                  className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40 ${
                    range === r ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {chartUnavailable ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              Chart unavailable for this fund
            </div>
          ) : chartLoading ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
          ) : chartError || chartData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              {chartError ?? "NAV history unavailable"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00c97a" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#00c97a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                  tickFormatter={(d: string) => formatChartTick(d, chartData)}
                />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => "₹" + v.toFixed(0)} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" stroke="#00c97a" strokeWidth={2} fill="url(#mfGrad)" dot={false} activeDot={{ r: 4, fill: "#00c97a", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Returns Overview</p>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-5">
              {CAGR_PERIODS.map((period, i) => {
                const value = fund.cagr_returns?.[period.key];
                const missing = value == null;
                return (
                  <div
                    key={period.key}
                    className={`p-4 text-center ${i < CAGR_PERIODS.length - 1 ? "border-r border-white/[0.05]" : ""} ${
                      missing ? "opacity-40" : ""
                    }`}
                  >
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{period.label}</p>
                    {missing ? (
                      <p className="text-sm font-mono font-bold text-muted-foreground">N/A</p>
                    ) : (
                      <p className={`text-sm font-mono font-bold ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Market Cap Weightage</p>
            <Card className="p-5 flex flex-col gap-3">
              {weightageBars.every((b) => b.pct == null) ? (
                <p className="text-xs text-muted-foreground">Weightage unavailable</p>
              ) : (
                weightageBars.map((a, i) => (
                  <div key={a.label} className={a.pct == null ? "opacity-40" : ""}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">{a.label}</span>
                      <span className="text-xs font-mono font-semibold text-foreground">
                        {a.pct == null ? "N/A" : `${a.pct.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColors[i % barColors.length]}`}
                        style={{ width: `${Math.min(100, Math.max(0, a.pct ?? 0))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Asset Allocation</p>
            <Card className="p-5 flex flex-col gap-3">
              {assetBars.every((b) => b.pct == null) ? (
                <p className="text-xs text-muted-foreground">Allocation unavailable</p>
              ) : (
                assetBars.map((a, i) => (
                  <div key={a.label} className={a.pct == null ? "opacity-40" : ""}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">{a.label}</span>
                      <span className="text-xs font-mono font-semibold text-foreground">
                        {a.pct == null ? "N/A" : `${a.pct.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColors[i % barColors.length]}`}
                        style={{ width: `${Math.min(100, Math.max(0, a.pct ?? 0))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Sectors</p>
          <Card className="overflow-hidden">
            {!fund.sectors?.length ? (
              <p className="px-5 py-4 text-xs text-muted-foreground">Sector breakdown unavailable</p>
            ) : (
              fund.sectors.map((s, i) => (
                <div
                  key={`${s.sector}-${i}`}
                  className={`flex items-center justify-between px-5 py-3.5 ${
                    i < fund.sectors!.length - 1 ? "border-b border-white/[0.05]" : ""
                  }`}
                >
                  <p className="text-xs font-medium text-foreground">{s.sector}</p>
                  <div className="flex items-center gap-4">
                    <div className="w-28 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, s.weightage ?? 0))}%` }}
                      />
                    </div>
                    <p className="text-xs font-mono text-foreground w-12 text-right">
                      {s.weightage == null ? "N/A" : `${s.weightage.toFixed(1)}%`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* TODO: holdings exist in the backend's internal FinAPI fetch but aren't exposed on MutualFundInvestResponse yet. */}
      </div>
    </div>
  );
}

export function StockDetailRoute() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [stock, setStock] = useState<StockInvestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) {
      navigate("/invest", { replace: true });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStockDetail(decodeURIComponent(symbol))
      .then((row) => {
        if (!cancelled) setStock(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load stock";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, navigate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading stock…</p>
      </div>
    );
  }
  if (error || !stock) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error ?? "Stock not found"}</p>
        <button onClick={() => navigate("/invest")} className="text-xs text-primary">Back to Invest</button>
      </div>
    );
  }
  return <StockDetailView stock={stock} />;
}

export function MutualFundDetailRoute() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [fund, setFund] = useState<MutualFundInvestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      navigate("/invest", { replace: true });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMutualFundDetail(decodeURIComponent(name))
      .then((row) => {
        if (!cancelled) setFund(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load fund";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, navigate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading fund…</p>
      </div>
    );
  }
  if (error || !fund) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error ?? "Fund not found"}</p>
        <button onClick={() => navigate("/invest")} className="text-xs text-primary">Back to Invest</button>
      </div>
    );
  }
  return <MutualFundDetailView fund={fund} />;
}
