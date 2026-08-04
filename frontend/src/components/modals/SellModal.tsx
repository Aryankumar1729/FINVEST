import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { fmt } from "../../lib/utils";
import { Input, Select, GhostButton } from "../ui";
import { toast } from "sonner";
import { X, TrendingDown } from "lucide-react";
import { getPortfolio, sellLot } from "../../lib/api";
import { CURRENT_USER_ID } from "../../lib/constants";
import type { AggregatedHolding } from "../../lib/api-types";
import { aggregatePricedLots, todayISODate } from "../../lib/portfolio";

export function SellModal() {
  const { modal, setModal, modalSymbol, refreshPortfolio } = useApp();
  if (modal !== "sell") return null;

  return (
    <SellModalInner
      symbol={modalSymbol}
      onClose={() => setModal(null)}
      onSuccess={refreshPortfolio}
    />
  );
}

function SellModalInner({
  symbol,
  onClose,
  onSuccess,
}: {
  symbol?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [holdings, setHoldings] = useState<AggregatedHolding[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState(symbol || "");
  const [qty, setQty] = useState("1");
  const [sellPrice, setSellPrice] = useState("");
  const [sellDate, setSellDate] = useState(todayISODate());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingHoldings(true);
    getPortfolio()
      .then((p) => {
        if (cancelled) return;
        const aggregated = aggregatePricedLots(p.priced_lots).filter((h) => h.stock_symbol);
        setHoldings(aggregated);
        const preferred =
          aggregated.find((h) => h.stock_symbol === symbol)
          || aggregated.find((h) => h.stock_symbol === (symbol?.endsWith(".NS") ? symbol : `${symbol}.NS`))
          || aggregated[0];
        if (preferred?.stock_symbol) {
          setSelectedSymbol(preferred.stock_symbol);
          setSellPrice(String(preferred.current.toFixed(2)));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load holdings");
      })
      .finally(() => {
        if (!cancelled) setLoadingHoldings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const holding = useMemo(
    () => holdings.find((h) => h.stock_symbol === selectedSymbol) || holdings[0],
    [holdings, selectedSymbol],
  );

  const qtyNum = parseFloat(qty) || 0;
  const priceNum = parseFloat(sellPrice) || 0;
  const total = qtyNum * priceNum;
  const gain = holding ? qtyNum * (priceNum - holding.avgBuy) : 0;
  const valid =
    Boolean(holding?.stock_symbol)
    && qtyNum > 0
    && qtyNum <= (holding?.qty ?? 0)
    && priceNum > 0
    && Boolean(sellDate);

  const onHoldingChange = (next: string) => {
    setSelectedSymbol(next);
    const h = holdings.find((row) => row.stock_symbol === next);
    if (h) setSellPrice(String(h.current.toFixed(2)));
  };

  const submit = async () => {
    if (!valid || !holding?.stock_symbol) return;
    setLoading(true);
    try {
      await sellLot({
        stock_symbol: holding.stock_symbol,
        sell_price: priceNum,
        sell_date: sellDate,
        quantity: qtyNum,
      });
      onClose();
      onSuccess();
      if (gain >= 0) {
        toast.success(`Sold ${qty} share${qtyNum > 1 ? "s" : ""} of ${holding.stock_symbol} · Gain ${fmt(gain)}`);
      } else {
        toast.success(`Sold ${qty} share${qtyNum > 1 ? "s" : ""} of ${holding.stock_symbol} · Loss ${fmt(Math.abs(gain))}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sell failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative rounded-2xl border border-white/[0.08] w-full max-w-md flex flex-col overflow-hidden"
        style={{
          background: "rgba(14,18,27,0.99)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          animation: "slideUp 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center">
              <TrendingDown size={13} className="text-red-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">Sell Stock</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {loadingHoldings ? (
            <p className="text-sm text-muted-foreground">Loading holdings…</p>
          ) : loadError ? (
            <p className="text-sm text-red-400">{loadError}</p>
          ) : holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock holdings to sell.</p>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Holding</label>
                <Select value={selectedSymbol} onChange={(e) => onHoldingChange(e.target.value)}>
                  {holdings.map((h) => (
                    <option key={h.key} value={h.stock_symbol!}>
                      {h.stock_symbol} ({h.qty} shares)
                    </option>
                  ))}
                </Select>
              </div>

              {holding && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Avg Buy", value: fmt(holding.avgBuy) },
                    { label: "Current", value: fmt(holding.current) },
                    { label: "Available", value: `${holding.qty} shares` },
                  ].map((s) => (
                    <div key={s.label} className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                      <p className="text-sm font-mono font-semibold text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Sell price</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Sell date</label>
                  <Input type="date" value={sellDate} onChange={(e) => setSellDate(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Quantity (max {holding?.qty ?? 0})
                </label>
                <Input
                  type="number"
                  min="1"
                  max={holding?.qty}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Enter quantity"
                  className="font-mono text-lg"
                />
                {holding && qtyNum > holding.qty && (
                  <p className="text-xs text-red-400 mt-1.5">Exceeds available quantity of {holding.qty}</p>
                )}
              </div>

              <div className={`flex items-center justify-between p-4 rounded-xl border ${
                gain >= 0 ? "bg-emerald-500/[0.05] border-emerald-500/20" : "bg-red-500/[0.05] border-red-500/20"
              }`}>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Proceeds</p>
                  <p className="text-xl font-mono font-bold text-foreground">{fmt(total)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">P&amp;L</p>
                  <p className={`text-lg font-mono font-bold ${gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {gain >= 0 ? "+" : ""}{fmt(gain)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/[0.06]">
          <GhostButton onClick={onClose} className="flex-1">Cancel</GhostButton>
          <button
            onClick={submit}
            disabled={!valid || loading || loadingHoldings}
            className="flex-1 px-5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "Processing…" : `Sell ${qty} Share${qtyNum !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
