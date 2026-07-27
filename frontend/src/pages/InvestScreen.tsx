import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { aiRecs, fdList } from "../lib/data";
import { fmt } from "../lib/utils";
import {
  ChangeChip, SectionHeader, Card, TableContainer,
  TableHeader, OutlineButton, SearchBar, EmptyState
} from "../components/ui";
import { useApp } from "../context/AppContext";
import type { InvestTab, PanelItem } from "../lib/types";
import type { GoldInvestResponse, MutualFundInvestResponse, StockInvestResponse } from "../lib/api-types";
import { getGoldList, getMutualFunds, getStocks } from "../lib/api";
import { num } from "../lib/portfolio";
import { toast } from "sonner";
import { TrendingUp, Sparkles, BookOpen, Shield, ChevronRight, ChevronLeft } from "lucide-react";

const PAGE_SIZE = 15;

const tabs: { id: InvestTab; label: string }[] = [
  { id: "stocks",        label: "Stocks" },
  { id: "mutual-funds",  label: "Mutual Funds" },
  { id: "gold",          label: "Gold ETFs" },
  { id: "fd",            label: "Fixed Deposits" },
];

function PaginationBar({
  page,
  totalPages,
  hasPrev,
  hasNext,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1 && !hasPrev && !hasNext) return null;
  return (
    <div className="flex items-center justify-between pt-4 mt-1 border-t border-white/[0.05]">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/20 transition-all disabled:opacity-35 disabled:pointer-events-none"
      >
        <ChevronLeft size={14} />
        Prev
      </button>
      <p className="text-xs text-muted-foreground tabular-nums">
        Page <span className="text-foreground font-mono font-semibold">{page}</span>
        {" of "}
        <span className="text-foreground font-mono font-semibold">{Math.max(1, totalPages)}</span>
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/20 transition-all disabled:opacity-35 disabled:pointer-events-none"
      >
        Next
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export function InvestScreen() {
  const { openBuy, setPanel } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<InvestTab>("stocks");
  const [search, setSearch] = useState("");
  const [stockPage, setStockPage] = useState(1);
  const [mfPage, setMfPage] = useState(1);

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (tab === "stocks") setStockPage(1);
    if (tab === "mutual-funds") setMfPage(1);
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-8">

        <SectionHeader eyebrow="Market" title="Invest" />

        <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl self-start">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearch(""); }}
              className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(0,201,122,0.25)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "stocks" && (
          <StocksTab
            search={search}
            setSearch={onSearchChange}
            page={stockPage}
            setPage={setStockPage}
            openBuy={openBuy}
            onSelectStock={(symbol: string) => navigate(`/invest/stock/${encodeURIComponent(symbol)}`)}
          />
        )}
        {tab === "mutual-funds" && (
          <MutualFundsTab
            search={search}
            setSearch={onSearchChange}
            page={mfPage}
            setPage={setMfPage}
            onSelectFund={(name: string) => navigate(`/invest/fund/${encodeURIComponent(name)}`)}
          />
        )}
        {tab === "gold" && (
          <GoldTab
            search={search}
            setSearch={setSearch}
            setPanel={setPanel}
            openBuy={openBuy}
          />
        )}
        {tab === "fd" && <FDTab search={search} setSearch={setSearch} />}
      </div>
    </div>
  );
}

function StocksTab({
  search,
  setSearch,
  page,
  setPage,
  openBuy,
  onSelectStock,
}: {
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (p: number | ((n: number) => number)) => void;
  openBuy: (symbol?: string, price?: number) => void;
  onSelectStock: (symbol: string) => void;
}) {
  const [stocks, setStocks] = useState<StockInvestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [listVisible, setListVisible] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    setError(null);
    setListVisible(false);

    const runFetch = () => {
      if (cancelled) return;
      setLoading(true);
      getStocks({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined })
        .then((res) => {
          if (cancelled) return;
          setStocks(res.items);
          setHasPrev(res.has_prev);
          setHasNext(res.has_next);
          setTotal(res.total);
          setHasLoadedOnce(true);
          requestAnimationFrame(() => {
            if (!cancelled) setListVisible(true);
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : "Failed to load stocks";
          setError(message);
          toast.error(message);
          setListVisible(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    // Fade out briefly when we already have content; first load skips the delay.
    fadeTimer = setTimeout(runFetch, hasLoadedOnce ? 150 : 0);

    return () => {
      cancelled = true;
      if (fadeTimer) clearTimeout(fadeTimer);
    };
    // hasLoadedOnce intentionally omitted — only gates fade delay for the in-flight effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={13} className="text-primary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">AI Picks</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {aiRecs.map((r) => (
            <Card
              key={r.symbol}
              className="p-4 hover:border-primary/20 transition-colors cursor-pointer"
              onClick={() => onSelectStock(r.symbol)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-mono font-bold text-foreground tracking-wide">{r.symbol}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate max-w-[80px]">{r.name}</p>
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  r.confidence === "High" ? "bg-emerald-500/12 text-emerald-400" : "bg-amber-500/12 text-amber-400"
                }`}>{r.confidence}</span>
              </div>
              <p className="text-base font-mono font-bold text-foreground mb-1">{fmt(r.price)}</p>
              <ChangeChip value={r.change} />
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{r.reason}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            All Stocks{total > 0 ? ` · ${total}` : ""}
          </p>
          <div className="w-60">
            <SearchBar value={search} onChange={setSearch} placeholder="Search symbol or company…" />
          </div>
        </div>

        {loading && !hasLoadedOnce ? (
          <Card className="p-8">
            <p className="text-sm text-muted-foreground text-center">Loading stocks…</p>
          </Card>
        ) : error && stocks.length === 0 ? (
          <Card className="p-8">
            <EmptyState icon={<TrendingUp size={24} />} title="Couldn't load stocks" description={error} />
          </Card>
        ) : stocks.length === 0 ? (
          <Card>
            <EmptyState icon={<TrendingUp size={24} />} title="No results" description={search ? `No stocks match "${search}"` : "No stocks available"} />
          </Card>
        ) : (
          <>
            <div className={`transition-opacity duration-150 ${listVisible && !loading ? "opacity-100" : "opacity-0"}`}>
              <TableContainer>
                <TableHeader>
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto] text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                    <span>Company</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Change</span>
                    <span className="text-right">52W High</span>
                    <span className="text-right">Sector</span>
                    <span />
                    <span />
                  </div>
                </TableHeader>
                {stocks.map((s, i) => {
                  const price = num(s.price);
                  const change = num(s.pct_change);
                  const high52 = num(s.fifty_two_week_high);
                  return (
                    <div
                      key={s.symbol}
                      className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto] px-5 py-4 items-center gap-2 hover:bg-white/[0.02] transition-colors cursor-pointer ${
                        i < stocks.length - 1 ? "border-b border-white/[0.05]" : ""
                      }`}
                      onClick={() => onSelectStock(s.symbol)}
                    >
                      <div>
                        <p className="text-sm font-mono font-bold text-foreground">{s.symbol}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.name ?? "—"}</p>
                      </div>
                      <p className="text-right text-sm font-mono text-foreground">
                        {s.price == null ? "—" : fmt(price)}
                      </p>
                      <div className="text-right">
                        {s.pct_change == null ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <ChangeChip value={change} />
                        )}
                      </div>
                      <p className="text-right text-sm font-mono text-foreground">
                        {s.fifty_two_week_high == null ? "—" : fmt(high52)}
                      </p>
                      <p className="text-right text-xs text-muted-foreground truncate">{s.sector ?? "—"}</p>
                      <OutlineButton onClick={(e: React.MouseEvent) => { e.stopPropagation(); openBuy(s.symbol); }}>Buy</OutlineButton>
                      <ChevronRight size={14} className="text-muted-foreground/40" />
                    </div>
                  );
                })}
              </TableContainer>
            </div>
            <PaginationBar
              page={page}
              totalPages={totalPages}
              hasPrev={hasPrev}
              hasNext={hasNext}
              loading={loading}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function MutualFundsTab({
  search,
  setSearch,
  page,
  setPage,
  onSelectFund,
}: {
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (p: number | ((n: number) => number)) => void;
  onSelectFund: (name: string) => void;
}) {
  const [funds, setFunds] = useState<MutualFundInvestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [listVisible, setListVisible] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    setError(null);
    setListVisible(false);

    const runFetch = () => {
      if (cancelled) return;
      setLoading(true);
      getMutualFunds({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined })
        .then((res) => {
          if (cancelled) return;
          setFunds(res.items);
          setHasPrev(res.has_prev);
          setHasNext(res.has_next);
          setTotal(res.total);
          setHasLoadedOnce(true);
          requestAnimationFrame(() => {
            if (!cancelled) setListVisible(true);
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : "Failed to load mutual funds";
          setError(message);
          toast.error(message);
          setListVisible(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    fadeTimer = setTimeout(runFetch, hasLoadedOnce ? 150 : 0);

    return () => {
      cancelled = true;
      if (fadeTimer) clearTimeout(fadeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {loading && !hasLoadedOnce ? "…" : `${total} Funds`}
        </p>
        <div className="w-64">
          <SearchBar value={search} onChange={setSearch} placeholder="Search funds…" />
        </div>
      </div>

      {loading && !hasLoadedOnce ? (
        <Card className="p-8">
          <p className="text-sm text-muted-foreground text-center">Loading mutual funds…</p>
        </Card>
      ) : error && funds.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<BookOpen size={24} />} title="Couldn't load funds" description={error} />
        </Card>
      ) : funds.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen size={24} />} title="No funds found" description={search ? `No funds match "${search}"` : "No funds available"} />
        </Card>
      ) : (
        <>
          <div className={`flex flex-col gap-3 transition-opacity duration-150 ${listVisible && !loading ? "opacity-100" : "opacity-0"}`}>
            {funds.map((f) => {
              const nav = num(f.latest_nav);
              const return1y = f.cagr_returns?.["1y"];
              const return3y = f.cagr_returns?.["3y"];
              return (
                <Card
                  key={f.name}
                  className="p-5 hover:border-white/[0.12] transition-colors cursor-pointer group"
                  onClick={() => onSelectFund(f.name)}
                >
                  <div className="flex items-center gap-5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{f.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {f.scheme_category ?? f.scheme_category_label ?? "—"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-8 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">NAV</p>
                        <p className="text-sm font-mono font-semibold text-foreground">
                          {f.latest_nav == null ? "—" : fmt(nav)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">1Y Return</p>
                        {return1y == null ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <ChangeChip value={return1y} />
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">3Y CAGR</p>
                        {return3y == null ? (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        ) : (
                          <ChangeChip value={return3y} />
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </Card>
              );
            })}
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            hasPrev={hasPrev}
            hasNext={hasNext}
            loading={loading}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}
    </div>
  );
}

function GoldTab({
  search,
  setSearch,
  setPanel,
  openBuy,
}: {
  search: string;
  setSearch: (v: string) => void;
  setPanel: (p: PanelItem | null) => void;
  openBuy: (symbol?: string, price?: number) => void;
}) {
  const [items, setItems] = useState<GoldInvestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGoldList({ search: search.trim() || undefined })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load gold ETFs";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Gold ETFs</p>
        <div className="w-64">
          <SearchBar value={search} onChange={setSearch} placeholder="Search ETF…" />
        </div>
      </div>

      {loading ? (
        <Card className="p-8">
          <p className="text-sm text-muted-foreground text-center">Loading gold ETFs…</p>
        </Card>
      ) : error ? (
        <Card className="p-8">
          <EmptyState icon={<TrendingUp size={24} />} title="Couldn't load gold ETFs" description={error} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp size={24} />}
            title="No gold ETFs"
            description={search ? `No ETFs match "${search}"` : "No gold ETFs in catalog"}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {items.map((g) => {
            const price = g.price == null ? null : num(g.price);
            return (
              <Card key={g.ticker} className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-mono font-bold text-foreground tracking-wide">{g.ticker}</p>
                    {/* TODO: name / change / expenseRatio not on GET /invest/gold — re-add if backend exposes them */}
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                    <span className="text-amber-400 text-xs">Au</span>
                  </div>
                </div>
                <p className="text-xl font-mono font-bold text-foreground">
                  {price == null ? "—" : fmt(price)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">per unit</p>
                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-white/[0.05]">
                  <button
                    onClick={() =>
                      setPanel({
                        type: "gold",
                        // DetailPanel still reads symbol/price; map ticker for compatibility.
                        data: { symbol: g.ticker, ticker: g.ticker, price: price ?? 0 },
                      })
                    }
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground border border-white/[0.08] hover:text-foreground hover:border-white/20 transition-all duration-150 active:scale-95"
                  >
                    View Details
                  </button>
                  <OutlineButton
                    onClick={() => openBuy(g.ticker, price ?? undefined)}
                    disabled={price == null}
                  >
                    Buy
                  </OutlineButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FDTab({ search, setSearch }: any) {
  const filtered = fdList.filter((f) =>
    f.bank.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={13} className="text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">FD Rates</p>
        </div>
        <div className="w-64">
          <SearchBar value={search} onChange={setSearch} placeholder="Search bank…" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((f) => (
          <Card key={f.bank} className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{f.bank}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{f.type}</p>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                DICGC Insured
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {f.rates.map((r) => (
                <div key={r.tenure} className="text-center p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{r.tenure}</p>
                  <p className="text-base font-mono font-bold text-foreground">{r.rate}%</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">p.a.</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 pt-3 border-t border-white/[0.05]">
              Min deposit: <span className="font-mono text-foreground">{fmt(f.minDeposit)}</span>
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
