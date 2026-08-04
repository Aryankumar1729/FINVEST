import { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { fmt } from "../../lib/utils";
import { Input, Select, PrimaryButton, GhostButton, SearchBar, EmptyState } from "../ui";
import { toast } from "sonner";
import { X, TrendingUp } from "lucide-react";
import { buyLot, getStocks } from "../../lib/api";
import { todayISODate } from "../../lib/portfolio";
import type { StockInvestResponse } from "../../lib/api-types";

/** Catalog / API symbols use NSE suffix; mock list does not. */
function toCatalogSymbol(symbol: string): string {
  return symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
}

export function BuyModal({
  mode = "stock",
  schemeId,
  name,
  latestNav,
  isOpen,
  onClose,
  onSuccess,
}: {
  mode?: "stock" | "mf";
  schemeId?: number;
  name?: string;
  latestNav?: number;
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
} = {}) {
  const { modal, setModal, modalSymbol, modalPrice, setModalPrice, refreshPortfolio } = useApp();

  const isGlobal = isOpen === undefined;
  const showModal = isGlobal ? (modal === "buy") : isOpen;

  if (!showModal) return null;

  const handleClose = () => {
    if (isGlobal) {
      setModal(null);
      setModalPrice(undefined);
    } else {
      onClose?.();
    }
  };

  const handleSuccess = () => {
    if (isGlobal) {
      refreshPortfolio();
    } else {
      onSuccess?.();
    }
  };

  return (
    <BuyModalInner
      key={mode === "mf" ? `mf:${schemeId}` : `${modalSymbol ?? ""}:${modalPrice ?? ""}`}
      mode={mode}
      schemeId={schemeId}
      name={name}
      latestNav={latestNav}
      symbol={isGlobal ? modalSymbol : undefined}
      initialPrice={isGlobal ? modalPrice : undefined}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}

function BuyModalInner({
  mode = "stock",
  schemeId,
  name,
  latestNav,
  symbol,
  initialPrice,
  onClose,
  onSuccess,
}: {
  mode?: "stock" | "mf";
  schemeId?: number;
  name?: string;
  latestNav?: number;
  symbol?: string;
  initialPrice?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [catalog, setCatalog] = useState<StockInvestResponse[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState(symbol || "");
  const [qty, setQty] = useState("1");
  const [amountStr, setAmountStr] = useState("");
  const [buyPrice, setBuyPrice] = useState(
    initialPrice != null && !Number.isNaN(initialPrice) ? String(initialPrice) : ""
  );
  const [buyDate, setBuyDate] = useState(todayISODate());
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Derived first so the clear-on-filter effect can reference it.
  const filteredCatalog = catalog.filter((s) => {
    if (s.is_gold_etf) return false;
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return (
      s.symbol.toLowerCase().includes(searchLower) ||
      (s.name && s.name.toLowerCase().includes(searchLower))
    );
  });

  useEffect(() => {
    if (mode !== "stock") return;
    setCatalogLoading(true);
    setCatalogError(null);
    getStocks({ pageSize: 100 })
      .then((res) => {
        setCatalog(res.items);
      })
      .catch((err) => {
        setCatalogError(err instanceof Error ? err.message : "Failed to load stocks");
      })
      .finally(() => {
        setCatalogLoading(false);
      });
  }, [mode]);

  useEffect(() => {
    if (mode !== "stock") return;
    if (catalog.length > 0) {
      if (!symbol) {
        // General free-choice flow: default to first equity (no gold ETFs)
        const filtered = catalog.filter((s) => !s.is_gold_etf);
        if (filtered.length > 0 && !selectedSymbol) {
          setSelectedSymbol(filtered[0].symbol);
          if (!initialPrice && filtered[0].price != null) {
            setBuyPrice(String(filtered[0].price));
          }
        }
      } else {
        // Pre-selected symbol locked flow
        if (!initialPrice) {
          const match = catalog.find((s) => s.symbol === symbol);
          if (match && match.price != null) {
            setBuyPrice(String(match.price));
          }
        }
      }
    }
  }, [catalog, symbol, initialPrice, selectedSymbol, mode]);

  // Clear stale selection when search filters the selected symbol out of view.
  // Do NOT auto-pick another symbol — require the user to choose explicitly.
  useEffect(() => {
    if (mode !== "stock") return;
    if (!symbol && selectedSymbol && searchText) {
      const stillVisible = filteredCatalog.some((s) => s.symbol === selectedSymbol);
      if (!stillVisible) {
        setSelectedSymbol("");
        setBuyPrice("");
      }
    }
  }, [filteredCatalog, selectedSymbol, searchText, symbol, mode]);

  const qtyNum = parseFloat(qty) || 0;
  const priceNum = parseFloat(buyPrice) || 0;
  const stockTotal = qtyNum * priceNum;
  const stockValid = qtyNum > 0 && priceNum > 0 && Boolean(buyDate) && Boolean(selectedSymbol);

  const navNum = typeof latestNav === "number" ? latestNav : parseFloat(String(latestNav || "0")) || 0;
  const amountNum = parseFloat(amountStr) || 0;
  const computedUnits = navNum > 0 ? (amountNum / navNum) : 0;
  const roundedUnits = Math.round((computedUnits + Number.EPSILON) * 1e6) / 1e6;
  const mfValid = amountNum > 0 && navNum > 0 && Boolean(buyDate) && schemeId !== undefined;

  const total = mode === "mf" ? amountNum : stockTotal;
  const valid = mode === "mf" ? mfValid : stockValid;

  const onSymbolChange = (next: string) => {
    setSelectedSymbol(next);
    const s = catalog.find((row) => row.symbol === next);
    if (s && s.price != null) {
      setBuyPrice(String(s.price));
    }
  };

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      if (mode === "mf") {
        await buyLot({
          mutual_fund_id: schemeId,
          buy_price: navNum,
          buy_date: buyDate,
          quantity: roundedUnits,
        });
        onClose();
        onSuccess();
        toast.success(`Successfully invested ${fmt(amountNum)} in ${name}`);
      } else {
        const catalogSymbol = toCatalogSymbol(selectedSymbol);
        await buyLot({
          stock_symbol: catalogSymbol,
          buy_price: priceNum,
          buy_date: buyDate,
          quantity: qtyNum,
        });
        onClose();
        onSuccess();
        toast.success(`Bought ${qty} share${qtyNum > 1 ? "s" : ""} of ${catalogSymbol}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "stock" && catalogLoading && catalog.length === 0) {
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
          <div className="px-6 py-12 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center animate-pulse">Loading stocks…</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "stock" && catalogError && catalog.length === 0) {
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
          <div className="px-6 py-8">
            <EmptyState icon={<TrendingUp size={24} />} title="Couldn't load stocks" description={catalogError} />
          </div>
        </div>
      </div>
    );
  }

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
            <p className="text-sm font-semibold text-foreground">
              {mode === "mf" ? "Invest in Mutual Fund" : "Buy Stock"}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            {mode === "mf" ? (
              <>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Mutual Fund</label>
                <div className="px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm text-foreground">
                  {name}
                </div>
              </>
            ) : (
              <>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Stock</label>
                {symbol ? (
                  <div className="px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] font-mono text-sm text-foreground">
                    {toCatalogSymbol(symbol)}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <SearchBar
                      value={searchText}
                      onChange={setSearchText}
                      placeholder="Search symbol or company..."
                    />
                    <Select value={selectedSymbol} onChange={(e) => onSymbolChange(e.target.value)}>
                      {filteredCatalog.length === 0 ? (
                        <option value="" disabled>No stocks found</option>
                      ) : (
                        filteredCatalog.map((s) => (
                          <option key={s.symbol} value={s.symbol}>
                            {s.symbol} — {s.name ?? "Unknown"}
                          </option>
                        ))
                      )}
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {mode === "mf" ? "NAV (₹)" : "Buy price"}
              </label>
              {mode === "mf" ? (
                <div className="px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] font-mono text-sm text-foreground">
                  {navNum}
                </div>
              ) : (
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="font-mono"
                />
              )}
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {mode === "mf" ? "Investment date" : "Buy date"}
              </label>
              <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
            </div>
          </div>

          <div>
            {mode === "mf" ? (
              <>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Amount (₹)</label>
                <Input
                  type="number"
                  min="1"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="Enter amount"
                  className="font-mono text-lg"
                />
                <div className="mt-1.5 text-xs text-muted-foreground font-mono">
                  Units: {navNum > 0 ? roundedUnits.toFixed(6) : "0.000000"}
                </div>
              </>
            ) : (
              <>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Quantity (shares)</label>
                <Input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Enter quantity"
                  className="font-mono text-lg"
                />
              </>
            )}
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-primary/[0.06] border border-primary/20">
            <p className="text-sm text-foreground">Total Investment</p>
            <p className="text-xl font-mono font-bold text-primary">{fmt(total)}</p>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-white/[0.06]">
          <GhostButton onClick={onClose} className="flex-1">Cancel</GhostButton>
          <PrimaryButton onClick={submit} disabled={!valid || loading} className="flex-1">
            {loading ? "Processing…" : mode === "mf" ? `Invest ${fmt(amountNum)}` : `Buy ${qty} Share${qtyNum !== 1 ? "s" : ""}`}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
