/** Types matching backend Portfolio / Goal list schemas. */

export type GoalVariantType = "conservative" | "moderate" | "aggressive" | "situational";
export type ProfileRiskTier = "conservative" | "moderate" | "aggressive";
export type TaxRegime = "old" | "new";

export interface OverlapDetail {
  scheme_name: string | null;
  overlap_pct: number;
  weighted_value: number;
}

export interface FlaggedLot {
  lot_id: number;
  reason: string;
  stock_symbol?: string | null;
  mutual_fund_id?: number | null;
}

export interface PricedLot {
  lot_id: number;
  stock_symbol?: string | null;
  mutual_fund_id?: number | null;
  scheme_name?: string | null;
  remaining_quantity: number;
  value: number;
  is_stale: boolean;
  buy_price: number;
  unrealized_gain: number;
}

export interface PortfolioResponse {
  stock_open_value: number;
  stock_sector_concentration_pct: Record<string, number>;
  mutual_fund_open_value: number;
  mutual_fund_overlap_pct: number;
  mutual_fund_overlap_details: OverlapDetail[];
  unpriced_lots: FlaggedLot[];
  stale_lots: FlaggedLot[];
  priced_lots: PricedLot[];
}

export interface GoalListItem {
  goal_id: number;
  target_amount: string | number;
  target_date: string;
  selected_variant_id: number | null;
  variant_type: GoalVariantType | null;
  saved_amount: string | number;
  created_at: string;
  updated_at: string;
}

export interface GoalListResponse {
  goals: GoalListItem[];
}

/** Matches backend StrategyVariant (mf_split serializes; alias mf_debt_equity_split on input). */
export interface StrategyVariant {
  variant_id: number | null;
  goal_id: number | null;
  variant_type: GoalVariantType;
  allocation_pct: Record<string, unknown>;
  stock_picks: unknown[];
  mf_split?: Record<string, unknown>;
  mf_debt_equity_split?: Record<string, unknown>;
  rationale: string | null;
  target_allocation_pct: Record<string, unknown>;
  target_monthly_expense_ceiling: string | number | null;
  target_cash_reserve_balance: string | number | null;
  is_selected: boolean | null;
}

export interface GoalCreateResponse {
  goal_id: number;
  variants: StrategyVariant[];
}

export interface GoalCreateRequest {
  user_id: string;
  target_amount?: number | string | null;
  timeframe_years?: number | null;
}

export interface GoalSelectRequest {
  user_id: string;
  goal_id: number;
  variant_id: number;
}

export interface BuyLotPayload {
  user_id: string;
  stock_symbol?: string | null;
  mutual_fund_id?: number | null;
  buy_price: number | string;
  buy_date: string; // YYYY-MM-DD
  quantity: number | string;
  goal_id?: number | null;
}

export interface SellLotPayload {
  user_id: string;
  stock_symbol?: string | null;
  mutual_fund_id?: number | null;
  sell_price: number | string;
  sell_date: string; // YYYY-MM-DD
  quantity: number | string;
}

export interface LotResponse {
  lot_id: number;
  user_id: string;
  goal_id: number | null;
  stock_symbol: string | null;
  mutual_fund_id: number | null;
  buy_date: string;
  buy_price: string | number;
  quantity: string | number;
  remaining_quantity: string | number;
}

export interface SellAllocationResult {
  sell_allocation_id: number;
  lot_id: number;
  sold_quantity: string | number;
  holding_period_days: number;
  gain_type: string;
  computed_tax: string | number;
}

export interface SellResponse {
  assessment_year: number;
  total_gross_tax: number;
  allocations: SellAllocationResult[];
}

export interface TaxResponse {
  assessment_year: number;
  salary_tax: number;
  unpaid_capital_gains_tax: number;
  total_liability: number;
}

/** GET /tax/allocations row — Decimal fields serialize as strings. */
export interface SellAllocationItem {
  sell_allocation_id: number;
  lot_id: number;
  sold_quantity: string;
  sell_price: string;
  sell_date: string;
  holding_period_days: number;
  gain_type: "LTCG" | "STCG";
  computed_tax: string;
  assessment_year: number;
  paid_status: "unpaid" | "paid";
  created_at: string;
  updated_at: string;
  buy_price: string | null;
  stock_symbol: string | null;
  scheme_name: string | null;
  mutual_fund_id: number | null;
  is_gold_etf: boolean | null;
  risk_category: string | null;
}

export interface SellAllocationListResponse {
  allocations: SellAllocationItem[];
}

/** Client-side aggregation of priced lots for holdings UI. */
export interface AggregatedHolding {
  key: string;
  kind: "stock" | "mutual_fund";
  stock_symbol: string | null;
  mutual_fund_id: number | null;
  label: string;
  qty: number;
  avgBuy: number;
  current: number;
  value: number;
  unrealized_gain: number;
}

/** Backend invest list/detail — numeric fields may arrive as strings. */
export type ApiNumber = number | string | null;

export interface StockInvestResponse {
  symbol: string;
  name: string | null;
  sector: string | null;
  price: ApiNumber;
  pct_change: ApiNumber;
  pct_change_today: number | null;
  pe_ratio: ApiNumber;
  market_cap: ApiNumber;
  eps: ApiNumber;
  fifty_two_week_high: ApiNumber;
  fifty_two_week_low: ApiNumber;
  is_gold_etf: boolean;
  confidence: string | null;
  reason: string | null;
}

export interface MarketCapWeightage {
  large_cap: ApiNumber;
  mid_cap: ApiNumber;
  small_cap: ApiNumber;
  others: ApiNumber;
}

export interface AssetAllocation {
  equity: number | null;
  debt: number | null;
  cash: number | null;
  other: number | null;
}

export interface SectorWeight {
  sector: string;
  weightage: number | null;
}

export type CagrPeriod = "1y" | "3y" | "5y" | "7y" | "10y";

export interface MutualFundInvestResponse {
  scheme_id: number;
  name: string;
  risk_category: string;
  latest_nav: ApiNumber;
  previous_nav: ApiNumber;
  nav_change: ApiNumber;
  pct_change: ApiNumber;
  market_cap_weightage: MarketCapWeightage | null;
  cagr: number | null;
  scheme_category: string | null;
  scheme_category_label: string | null;
  cagr_returns: Partial<Record<CagrPeriod, number>> | null;
  asset_allocation: AssetAllocation | null;
  sectors: SectorWeight[] | null;
  amfi_scheme_code: string | null;
}

/** Shared point shape for stock Close / MF NAV history charts. */
export interface HistoryPoint {
  date: string;
  value: number;
}

export interface PriceHistoryResponse {
  points: HistoryPoint[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  has_prev: boolean;
  has_next: boolean;
}

export interface GoldInvestResponse {
  ticker: string;
  price: number | null;
}

export interface FixedDepositInvestResponse {
  bank: string;
  rate: number;
  tenure: number;
}

export interface ProfileResponse {
  user_id: string;
  salary: string | null;
  current_expense_estimate: string | null;
  current_cash_balance: string | null;
  tax_regime: TaxRegime | null;
  risk_tier: ProfileRiskTier | null;
  created_at: string;
  updated_at: string;
}

export interface LiabilityItem {
  loan_type: string;
  principal: number | string;
  remaining_balance: number | string;
  interest_rate: number | string;
  tenure_months: number;
  monthly_emi: number | string;
}

export interface LiabilityResponse extends LiabilityItem {
  liability_id: number;
  created_at: string;
  updated_at: string;
}

export interface RiskQuestionnaireResponse {
  user_id: string;
  risk_tier: ProfileRiskTier;
  created_at: string;
  updated_at: string;
}

export interface ChatRequest {
  user_id: string;
  message: string;
  conversation_id?: string | null;
}

export interface ChatResponse {
  conversation_id: string;
  reply: string;
  tool_calls_made: string[];
}

export interface OnboardingSelfReportItem {
  question: string;
  answer: string;
}

export interface OnboardingRequest {
  user_id: string;
  salary: number;
  tax_regime: TaxRegime;
  current_expense_estimate: number;
  current_cash_balance: number;
  liabilities: LiabilityItem[];
  self_report_answers: OnboardingSelfReportItem[];
  risk_answers?: Record<string, number>;
}

export interface OnboardingResponse {
  user_id: string;
  salary: number;
  tax_regime: TaxRegime;
  current_expense_estimate: number;
  current_cash_balance: number;
  liabilities: LiabilityResponse[];
  journal_entries_created: number;
  risk_tier: ProfileRiskTier | null;
}
