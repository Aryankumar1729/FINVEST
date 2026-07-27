import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { stockList } from "../../lib/data";
import { fmt } from "../../lib/utils";
import { Input, Select, PrimaryButton, GhostButton } from "../ui";
import { toast } from "sonner";
import { X, TrendingUp } from "lucide-react";
import { buyLot } from "../../lib/api";
import { CURRENT_USER_ID } from "../../lib/constants";
import { todayISODate } from "../../lib/portfolio";

/** Catalog / API symbols use NSE suffix; mock list does not. */
function toCatalogSymbol(symbol: string): string {
  return symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
}

function fromCatalogSymbol(symbol: string): string {
  return symbol.endsWith(".NS") ? symbol.slice(0, -3) : symbol;
}

export function BuyModal() {
  const { modal, setModal, modalSymbol, modalPrice, setModalPrice, refreshPortfolio } = useApp();
  if (modal !== "buy") return null;

  return (
    <BuyModalInner
      key={`${modalSymbol ?? ""}:${modalPrice ?? ""}`}
      symbol={modalSymbol}
      initialPrice={modalPrice}
      onClose={() => {
        setModal(null);
        setModalPrice(undefined);
      }}
      onSuccess={refreshPortfolio}
    />
  );
}

function BuyModalInner({
  symbol,
  initialPrice,
  onClose,
  onSuccess,
}: {
  symbol?: string;
  initialPrice?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const bare = fromCatalogSymbol(symbol || stockList[0].symbol);
  const inStockList = stockList.some((s) => s.symbol === bare);

  const [selectedSymbol, setSelectedSymbol] = useState(bare);
  const [qty, setQty] = useState("1");
  const defaultPrice =
    initialPrice != null && !Number.isNaN(initialPrice)
      ? String(initialPrice)
      : String((stockList.find((s) => s.symbol === bare) ?? stockList[0]).price);
  const [buyPrice, setBuyPrice] = useState(defaultPrice);
  const [buyDate, setBuyDate] = useState(todayISODate());
  const [loading, setLoading] = useState(false);

  const qtyNum = parseFloat(qty) || 0;
  const priceNum = parseFloat(buyPrice) || 0;
  const total = qtyNum * priceNum;
  const valid = qtyNum > 0 && priceNum > 0 && Boolean(buyDate);

  const onSymbolChange = (next: string) => {
    setSelectedSymbol(next);
    const s = stockList.find((row) => row.symbol === next);
    if (s) setBuyPrice(String(s.price));
  };

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const catalogSymbol = toCatalogSymbol(selectedSymbol);
      await buyLot({
        user_id: CURRENT_USER_ID,
        stock_symbol: catalogSymbol,
        buy_price: priceNum,
        buy_date: buyDate,
        quantity: qtyNum,
      });
      onClose();
      onSuccess();
      toast.success(`Bought ${qty} share${qtyNum > 1 ? "s" : ""} of ${catalogSymbol}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.15s ease" }}>
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
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
              <TrendingUp size={13} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Buy Stock</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Stock</label>
            {inStockList ? (
              <Select value={selectedSymbol} onChange={(e) => onSymbolChange(e.target.value)}>
                {stockList.map((s) => (
                  <option key={s.symbol} value={s.symbol}>{s.symbol}.NS — {s.name}</option>
                ))}
              </Select>
            ) : (
              <div className="px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] font-mono text-sm text-foreground">
                {toCatalogSymbol(selectedSymbol)}
                {/* Outside mock stockList (e.g. gold ETF) — display-only; not forced into dropdown */}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Buy price</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Buy date</label>
              <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Quantity (shares)</label>
            <Input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Enter quantity"
              className="font-mono text-lg"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-primary/[0.06] border border-primary/20">
            <p className="text-sm text-foreground">Total Investment</p>
            <p className="text-xl font-mono font-bold text-primary">{fmt(total)}</p>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/[0.06]">
          <GhostButton onClick={onClose} className="flex-1">Cancel</GhostButton>
          <PrimaryButton onClick={submit} disabled={!valid || loading} className="flex-1">
            {loading ? "Processing…" : `Buy ${qty} Share${qtyNum !== 1 ? "s" : ""}`}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
