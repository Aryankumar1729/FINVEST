import { useApp } from "../../context/AppContext";
import { detailChartData } from "../../lib/data";
import { fmt } from "../../lib/utils";
import { ChangeChip } from "../ui";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { X, Info } from "lucide-react";

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e1219] px-3 py-2 shadow-xl">
      <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs font-mono font-semibold text-foreground">{fmt(payload[0].value)}</p>
    </div>
  );
}

export function DetailPanel() {
  const { panel, setPanel, openBuy, openSell } = useApp();
  if (!panel) return null;

  const { data } = panel;

  const isStock = panel.type === "stock";
  const isMF = panel.type === "mutual-fund";
  const isGold = panel.type === "gold";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setPanel(null)}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-screen z-40 w-[380px] border-l border-white/[0.06] flex flex-col"
        style={{
          background: "rgba(11,15,20,0.98)",
          backdropFilter: "blur(16px)",
          animation: "slideIn 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <p className="text-sm font-mono font-bold text-foreground tracking-wide">
              {data.symbol || data.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.name !== data.symbol ? data.name : data.category || "ETF"}
            </p>
          </div>
          <button
            onClick={() => setPanel(null)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-white/[0.05]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6" style={{ scrollbarWidth: "none" }}>

          {/* Price */}
          <div>
            <p className="text-3xl font-mono font-bold text-foreground">
              {fmt(data.price || data.nav || 0)}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {data.change !== undefined && <ChangeChip value={data.change} />}
              {data.return1y !== undefined && (
                <span className="text-xs text-muted-foreground">1Y: <span className="text-emerald-400 font-mono">+{data.return1y}%</span></span>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {isStock && [
              { label: "52W High", value: fmt(data.high52w) },
              { label: "Risk", value: data.risk },
              { label: "Market Cap", value: "Large Cap" },
              { label: "Sector", value: "Equity" },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-sm font-mono font-semibold text-foreground">{s.value}</p>
              </div>
            ))}

            {isMF && [
              { label: "Category", value: data.category },
              { label: "Risk", value: data.risk },
              { label: "1Y Return", value: `+${data.return1y}%` },
              { label: "3Y CAGR", value: `+${data.return3y}%` },
              { label: "NAV", value: fmt(data.nav) },
              { label: "Min SIP", value: fmt(data.minSip) },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-sm font-mono font-semibold text-foreground">{s.value}</p>
              </div>
            ))}

            {isGold && [
              { label: "Ticker", value: data.ticker || data.symbol || "—" },
              {
                label: "Expense Ratio",
                value: data.expenseRatio != null ? `${data.expenseRatio}%` : "—",
              },
              {
                label: "Change",
                value:
                  data.change != null
                    ? `${data.change >= 0 ? "+" : ""}${data.change}%`
                    : "—",
              },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-sm font-mono font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Mini chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">7-Day Trend</p>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/8 border border-amber-500/20">
                <Info size={9} className="text-amber-400" />
                <span className="text-[9px] text-amber-400">Illustrative · not live</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={detailChartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00c97a" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00c97a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#6b7585" }} axisLine={false} tickLine={false} />
                <Tooltip content={<MiniTooltip />} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="value" stroke="#00c97a" strokeWidth={1.5} fill="url(#panelGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Footer CTAs */}
        <div className="px-6 py-4 border-t border-white/[0.06]">
          {isStock && (
            <div className="flex gap-3">
              <button
                onClick={() => { openBuy(data.symbol); setPanel(null); }}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Buy
              </button>
              <button
                onClick={() => { openSell(data.symbol); setPanel(null); }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/25 text-sm font-semibold hover:bg-red-500/25 active:scale-[0.98] transition-all"
              >
                Sell
              </button>
            </div>
          )}
          {(isMF || isGold) && (
            <button
              className="w-full py-2.5 rounded-xl border border-white/[0.1] text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-white/20 transition-all active:scale-[0.98]"
              onClick={() => setPanel(null)}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </>
  );
}
