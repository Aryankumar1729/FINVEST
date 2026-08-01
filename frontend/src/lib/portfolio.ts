import type { AggregatedHolding, PricedLot } from "./api-types";

/** Aggregate lot-level priced_lots into symbol/scheme holdings for display. */
export function aggregatePricedLots(lots: PricedLot[]): AggregatedHolding[] {
  const map = new Map<string, {
    kind: "stock" | "mutual_fund";
    stock_symbol: string | null;
    mutual_fund_id: number | null;
    label: string;
    qty: number;
    cost: number;
    value: number;
    unrealized_gain: number;
  }>();

  for (const lot of lots) {
    const qty = Number(lot.remaining_quantity) || 0;
    if (qty <= 0) continue;
    const buy = Number(lot.buy_price) || 0;
    const value = Number(lot.value) || 0;
    const gain = Number(lot.unrealized_gain) || 0;

    let key: string;
    let kind: "stock" | "mutual_fund";
    let label: string;
    if (lot.stock_symbol) {
      key = `stock:${lot.stock_symbol}`;
      kind = "stock";
      label = lot.stock_symbol;
    } else if (lot.mutual_fund_id != null) {
      key = `mf:${lot.mutual_fund_id}`;
      kind = "mutual_fund";
      label = lot.scheme_name || `Fund #${lot.mutual_fund_id}`;
    } else {
      continue;
    }

    const existing = map.get(key);
    if (existing) {
      existing.qty += qty;
      existing.cost += buy * qty;
      existing.value += value;
      existing.unrealized_gain += gain;
    } else {
      map.set(key, {
        kind,
        stock_symbol: lot.stock_symbol ?? null,
        mutual_fund_id: lot.mutual_fund_id ?? null,
        label,
        qty,
        cost: buy * qty,
        value,
        unrealized_gain: gain,
      });
    }
  }

  return Array.from(map.entries()).map(([key, row]) => {
    const avgBuy = row.qty > 0 ? row.cost / row.qty : 0;
    const current = row.qty > 0 ? row.value / row.qty : 0;
    return {
      key,
      kind: row.kind,
      stock_symbol: row.stock_symbol,
      mutual_fund_id: row.mutual_fund_id,
      label: row.label,
      qty: row.qty,
      avgBuy,
      current,
      value: row.value,
      unrealized_gain: row.unrealized_gain,
    };
  });
}

export function todayISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
