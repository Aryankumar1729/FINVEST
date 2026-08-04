import { useCallback, useEffect, useState } from "react";
import { fmt } from "../lib/utils";
import { StatusBadge, SectionHeader, Card, TableContainer, TableHeader, EmptyState } from "../components/ui";
import { getTax, getTaxAllocations, payTax } from "../lib/api";
import type { SellAllocationItem, TaxResponse } from "../lib/api-types";
import { num } from "../lib/portfolio";
import { toast } from "sonner";
import { Receipt, CheckCircle } from "lucide-react";

function allocationLabel(row: SellAllocationItem): string {
  if (row.stock_symbol) return row.stock_symbol;
  if (row.scheme_name) return row.scheme_name;
  return "Asset sale";
}

function paidBadgeStatus(paidStatus: "unpaid" | "paid"): "Paid" | "Unpaid" {
  return paidStatus === "paid" ? "Paid" : "Unpaid";
}

export function TaxScreen() {
  const [summary, setSummary] = useState<TaxResponse | null>(null);
  const [rows, setRows] = useState<SellAllocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tax = await getTax();
      const alloc = await getTaxAllocations(tax.assessment_year);
      setSummary(tax);
      setRows(alloc.allocations);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tax data");
      setSummary(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmPay = async (row: SellAllocationItem) => {
    setPayError(null);
    setPayingId(row.sell_allocation_id);
    try {
      await payTax(row.sell_allocation_id);
      setConfirming(null);
      toast.success("Tax payment marked as paid");
      await load();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPayingId(null);
    }
  };

  const ayLabel = summary ? `AY ${summary.assessment_year}` : "…";
  const unpaidPending = rows.filter((r) => r.paid_status === "unpaid").length;

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-[900px] mx-auto px-8 py-8 flex flex-col gap-8">

        <SectionHeader eyebrow={ayLabel} title="Tax" />

        {error && (
          <Card className="p-4 text-sm text-red-400 border-red-500/30">{error}</Card>
        )}

        {/* Summary — real GET /tax fields */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-2">Salary Tax</p>
            <p className="text-2xl font-mono font-bold text-foreground">
              {loading || !summary ? "…" : fmt(summary.salary_tax)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{ayLabel}</p>
          </Card>
          <Card className="p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-2">Unpaid Capital Gains</p>
            <p className="text-2xl font-mono font-bold text-amber-400">
              {loading || !summary ? "…" : fmt(summary.unpaid_capital_gains_tax)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? "…" : `${unpaidPending} allocation${unpaidPending === 1 ? "" : "s"} pending`}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-2">Total Liability</p>
            <p className="text-2xl font-mono font-bold text-foreground">
              {loading || !summary ? "…" : fmt(summary.total_liability)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Salary + unpaid CG</p>
          </Card>
        </div>

        {/* Tax table */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-4">Tax Allocations</p>
          {loading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Loading allocations…</Card>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Receipt size={26} />}
                title="No sell allocations"
                description="Capital gains tax rows appear here after you sell holdings this assessment year."
              />
            </Card>
          ) : (
            <TableContainer>
              <TableHeader>
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                  <span>Description</span>
                  <span className="text-right">Type</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Status</span>
                  <span />
                </div>
              </TableHeader>

              {rows.map((r, i) => {
                const label = allocationLabel(r);
                const amount = num(r.computed_tax);
                const isPaid = r.paid_status === "paid";
                const id = r.sell_allocation_id;
                return (
                  <div key={id}>
                    <div
                      className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-5 py-4 items-center gap-2 transition-all ${
                        isPaid ? "opacity-50" : "hover:bg-white/[0.02]"
                      } ${i < rows.length - 1 && confirming !== id ? "border-b border-white/[0.05]" : ""}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Sold {r.sell_date}</p>
                      </div>
                      <p className="text-right text-xs text-muted-foreground">{r.gain_type}</p>
                      <p className="text-right text-sm font-mono font-semibold text-foreground">{fmt(amount)}</p>
                      <div className="text-right">
                        <StatusBadge status={paidBadgeStatus(r.paid_status)} />
                      </div>
                      <div>
                        {!isPaid ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPayError(null);
                              setConfirming(confirming === id ? null : id);
                            }}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-amber-400 border border-amber-500/25 hover:bg-amber-500/10 transition-all duration-150 active:scale-95"
                          >
                            Pay Tax
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-1.5">
                            <CheckCircle size={11} className="text-emerald-400" />
                            <span className="text-[10px] text-emerald-400 font-medium">Settled</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {confirming === id && !isPaid && (
                      <div
                        className="px-5 py-4 bg-amber-500/[0.06] border-t border-b border-amber-500/20 flex flex-col gap-3"
                        style={{ animation: "slideUp 0.15s ease-out" }}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Confirm payment of {fmt(amount)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">This will mark &quot;{label}&quot; as paid.</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirming(null);
                                setPayError(null);
                              }}
                              disabled={payingId === id}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground border border-white/[0.08] hover:text-foreground hover:border-white/20 transition-all duration-150 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void confirmPay(r)}
                              disabled={payingId === id}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 transition-all duration-150 active:scale-95 disabled:opacity-50"
                            >
                              {payingId === id ? "Paying…" : "Confirm Payment"}
                            </button>
                          </div>
                        </div>
                        {payError && confirming === id && (
                          <p className="text-xs text-red-400">{payError}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </TableContainer>
          )}
        </div>

        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
              <Receipt size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Tax Breakdown Note</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                LTCG (Long Term Capital Gains) applies to equity held for &gt;1 year at 10% beyond ₹1 lakh.
                STCG applies at 15% for equity held &lt;1 year. Amounts are computed from your sell allocations for this assessment year.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
