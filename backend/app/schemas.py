from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


GoalVariantType = Literal["conservative", "moderate", "aggressive", "situational"]
SortOrder = Literal["asc", "desc"]
TaxRegime = Literal["old", "new"]
RiskTier = Literal["conservative", "moderate", "aggressive"]
JournalEntryType = Literal[
    "user_authored",
    "onboarding_self_reported",
    "exit_timing_insight",
    "strategy_deviation",
    "risk_tier_change",
]


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class GoalCreateRequest(APIModel):
    target_amount: Decimal | None = None
    timeframe_years: int | None = None


class StrategyVariant(APIModel):
    variant_id: int | None = None
    goal_id: int | None = None
    variant_type: GoalVariantType
    allocation_pct: dict[str, Any]
    stock_picks: list[Any]
    mf_split: dict[str, Any] = Field(alias="mf_debt_equity_split")
    rationale: str | None = None
    target_allocation_pct: dict[str, Any]
    target_monthly_expense_ceiling: Decimal | None = None
    target_cash_reserve_balance: Decimal | None = None
    is_selected: bool | None = None


class MarketCapWeightage(APIModel):
    # Accept FinAPI camelCase on ingest; always serialize snake_case for the frontend.
    large_cap: Decimal | None = Field(
        default=None, validation_alias=AliasChoices("large_cap", "largeCap")
    )
    mid_cap: Decimal | None = Field(
        default=None, validation_alias=AliasChoices("mid_cap", "midCap")
    )
    small_cap: Decimal | None = Field(
        default=None, validation_alias=AliasChoices("small_cap", "smallCap")
    )
    others: Decimal | None = None


class AssetAllocation(APIModel):
    equity: float | None = None
    debt: float | None = None
    cash: float | None = None
    other: float | None = None


class SectorWeight(APIModel):
    sector: str
    weightage: float | None = None


class GoalCreateResponse(APIModel):
    goal_id: int
    variants: list[StrategyVariant]


class GoalListItem(APIModel):
    goal_id: int
    target_amount: Decimal
    target_date: date
    selected_variant_id: int | None = None
    variant_type: GoalVariantType | None = None
    saved_amount: Decimal
    created_at: datetime
    updated_at: datetime


class GoalListResponse(APIModel):
    goals: list[GoalListItem]


class GoalSelectRequest(APIModel):
    goal_id: int
    variant_id: int


class InvestQueryParams(APIModel):
    search: str | None = None
    sort_by: str | None = None
    sort_order: SortOrder = "asc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=15, ge=1, le=100)


class StockInvestResponse(APIModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    price: float | None = None
    pct_change: float | None = Field(default=None, alias="pct_change_today")
    pe_ratio: float | None = None
    market_cap: float | None = None
    eps: float | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    is_gold_etf: bool
    confidence: str | None = None
    reason: str | None = None


class MutualFundInvestResponse(APIModel):
    scheme_id: int
    name: str
    risk_category: str
    latest_nav: Decimal | None = None
    previous_nav: Decimal | None = None
    nav_change: Decimal | None = None
    pct_change: Decimal | None = None
    market_cap_weightage: MarketCapWeightage | None = None
    cagr: float | None = None
    scheme_category: str | None = None
    scheme_category_label: str | None = None
    cagr_returns: dict[str, float] | None = None
    asset_allocation: AssetAllocation | None = None
    sectors: list[SectorWeight] | None = None
    amfi_scheme_code: str | None = None


class StockInvestListResponse(APIModel):
    items: list[StockInvestResponse]
    page: int
    page_size: int
    total: int
    has_prev: bool
    has_next: bool


class MutualFundInvestListResponse(APIModel):
    items: list[MutualFundInvestResponse]
    page: int
    page_size: int
    total: int
    has_prev: bool
    has_next: bool


class HistoryPoint(APIModel):
    date: str
    value: float


class PriceHistoryResponse(APIModel):
    points: list[HistoryPoint]


class FixedDepositInvestResponse(APIModel):
    bank: str
    rate: float
    tenure: int


class GoldInvestResponse(APIModel):
    ticker: str
    price: float | None = None


class ChatRequest(APIModel):
    message: str
    conversation_id: str | None = None


class ChatResponse(APIModel):
    conversation_id: str
    reply: str
    tool_calls_made: list[str] = Field(default_factory=list)


class OverlapDetail(APIModel):
    scheme_name: str | None
    overlap_pct: float
    weighted_value: float


class FlaggedLot(APIModel):
    lot_id: int
    reason: str
    stock_symbol: str | None = None
    mutual_fund_id: int | None = None


class PricedLot(APIModel):
    lot_id: int
    stock_symbol: str | None = None
    mutual_fund_id: int | None = None
    scheme_name: str | None = None
    remaining_quantity: float
    value: float
    is_stale: bool
    buy_price: float
    unrealized_gain: float


class PortfolioResponse(APIModel):
    stock_open_value: float
    stock_sector_concentration_pct: dict[str, float]
    mutual_fund_open_value: float
    mutual_fund_overlap_pct: float
    mutual_fund_overlap_details: list[OverlapDetail]
    unpriced_lots: list[FlaggedLot]
    stale_lots: list[FlaggedLot]
    priced_lots: list[PricedLot]


class BuyRequest(APIModel):
    stock_symbol: str | None = None
    mutual_fund_id: int | None = None
    buy_price: Decimal
    buy_date: date
    quantity: Decimal = Field(gt=0)
    goal_id: int | None = None

    @model_validator(mode="after")
    def _exactly_one_asset(self) -> BuyRequest:
        if (self.stock_symbol is None) == (self.mutual_fund_id is None):
            raise ValueError("Exactly one of stock_symbol or mutual_fund_id must be set")
        return self


class SellRequest(APIModel):
    stock_symbol: str | None = None
    mutual_fund_id: int | None = None
    sell_price: Decimal
    sell_date: date
    quantity: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def _exactly_one_asset(self) -> SellRequest:
        if (self.stock_symbol is None) == (self.mutual_fund_id is None):
            raise ValueError("Exactly one of stock_symbol or mutual_fund_id must be set")
        return self


class TaxResponse(APIModel):
    assessment_year: int
    salary_tax: float
    unpaid_capital_gains_tax: float
    total_liability: float


class SellAllocationItem(APIModel):
    # Rows from get_sell_allocations include sa.* (e.g. user_id) plus joins — ignore extras.
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    sell_allocation_id: int
    lot_id: int
    sold_quantity: Decimal
    sell_price: Decimal
    sell_date: date
    holding_period_days: int
    gain_type: Literal["LTCG", "STCG"]
    computed_tax: Decimal
    assessment_year: int
    paid_status: Literal["unpaid", "paid"]
    created_at: datetime
    updated_at: datetime
    buy_price: Decimal | None = None
    stock_symbol: str | None = None
    scheme_name: str | None = None
    mutual_fund_id: int | None = None
    is_gold_etf: bool | None = None
    risk_category: str | None = None


class SellAllocationListResponse(APIModel):
    allocations: list[SellAllocationItem]


class PayRequest(APIModel):
    sell_allocation_id: int


class LotResponse(APIModel):
    lot_id: int
    user_id: str
    goal_id: int | None
    stock_symbol: str | None
    mutual_fund_id: int | None
    buy_date: date
    buy_price: Decimal
    quantity: Decimal
    remaining_quantity: Decimal


class SellAllocationResult(APIModel):
    sell_allocation_id: int
    lot_id: int
    sold_quantity: Decimal
    holding_period_days: int
    gain_type: str
    computed_tax: Decimal


class SellResponse(APIModel):
    assessment_year: int
    total_gross_tax: float
    allocations: list[SellAllocationResult]


class JournalEntryResponse(APIModel):
    journal_id: int
    entry_type: JournalEntryType
    linked_ref_type: str
    linked_ref_id: str | None
    text_snapshot: str | None
    created_at: datetime


class JournalCreateRequest(APIModel):
    text: str


class SalaryUpdateRequest(APIModel):
    salary: Decimal
    tax_regime: TaxRegime
    current_expense_estimate: Decimal
    current_cash_balance: Decimal


class LiabilityItem(APIModel):
    loan_type: str
    principal: Decimal
    remaining_balance: Decimal
    interest_rate: Decimal
    tenure_months: int
    monthly_emi: Decimal


class LiabilitiesUpdateRequest(APIModel):
    liabilities: list[LiabilityItem]


class RiskAdjustRequest(APIModel):
    risk_tier: RiskTier


class RiskQuestionnaireRequest(APIModel):
    answers: dict[str, int]


class RiskQuestionnaireResponse(APIModel):
    user_id: str
    risk_tier: RiskTier
    created_at: datetime
    updated_at: datetime


class ProfileResponse(APIModel):
    user_id: str
    salary: Decimal | None
    current_expense_estimate: Decimal | None
    current_cash_balance: Decimal | None
    tax_regime: TaxRegime | None
    risk_tier: RiskTier | None
    created_at: datetime
    updated_at: datetime


class LiabilityResponse(APIModel):
    liability_id: int
    loan_type: str
    principal: Decimal
    remaining_balance: Decimal
    interest_rate: Decimal
    tenure_months: int
    monthly_emi: Decimal
    created_at: datetime
    updated_at: datetime


class OnboardingSelfReportItem(APIModel):
    question: str
    answer: str


class OnboardingRequest(APIModel):
    salary: float
    tax_regime: TaxRegime
    current_expense_estimate: float
    current_cash_balance: float
    liabilities: list[LiabilityItem]
    self_report_answers: list[OnboardingSelfReportItem]
    risk_answers: dict[str, int] | None = None


class OnboardingResponse(APIModel):
    user_id: str
    salary: float
    tax_regime: TaxRegime
    current_expense_estimate: float
    current_cash_balance: float
    liabilities: list[LiabilityResponse]
    journal_entries_created: int
    risk_tier: RiskTier | None = None
