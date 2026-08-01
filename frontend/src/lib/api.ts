import type {
  BuyLotPayload,
  GoalCreateResponse,
  GoalListResponse,
  GoldInvestResponse,
  FixedDepositInvestResponse,
  LiabilityItem,
  LiabilityResponse,
  LotResponse,
  MutualFundInvestResponse,
  PaginatedResponse,
  PortfolioResponse,
  PriceHistoryResponse,
  ProfileResponse,
  ProfileRiskTier,
  RiskQuestionnaireResponse,
  SellAllocationListResponse,
  SellLotPayload,
  SellResponse,
  StockInvestResponse,
  TaxRegime,
  TaxResponse,
  ChatResponse,
  OnboardingRequest,
  OnboardingResponse,
} from "./api-types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body?.detail)) {
        message = body.detail
          .map((d: { msg?: string } | string) => (typeof d === "string" ? d : d.msg ?? JSON.stringify(d)))
          .join("; ");
      } else if (typeof body?.message === "string") {
        message = body.message;
      }
    } catch {
      // ignore JSON parse errors — keep status message
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function getPortfolio(userId: string): Promise<PortfolioResponse> {
  return apiFetch(`/portfolio?user_id=${encodeURIComponent(userId)}`);
}

export function getPortfolioHistory(
  userId: string,
  period: string = "1y",
): Promise<PriceHistoryResponse> {
  const q = new URLSearchParams({
    user_id: userId,
    period,
  });
  return apiFetch(`/portfolio/history?${q.toString()}`);
}

export function getGoals(userId: string): Promise<GoalListResponse> {
  return apiFetch(`/goal?user_id=${encodeURIComponent(userId)}`);
}

export function createGoal(
  userId: string,
  targetAmount: number | null,
  timeframeYears: number | null,
): Promise<GoalCreateResponse> {
  return apiFetch("/goal", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      target_amount: targetAmount,
      timeframe_years: timeframeYears,
    }),
  });
}

export function selectGoalVariant(
  userId: string,
  goalId: number,
  variantId: number,
): Promise<GoalCreateResponse> {
  return apiFetch("/goal/select", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      goal_id: goalId,
      variant_id: variantId,
    }),
  });
}

export function buyLot(payload: BuyLotPayload): Promise<LotResponse> {
  return apiFetch("/portfolio/buy", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sellLot(payload: SellLotPayload): Promise<SellResponse> {
  return apiFetch("/portfolio/sell", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStocks(params?: {
  search?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<StockInvestResponse>> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.userId) q.set("user_id", params.userId);
  q.set("page", String(params?.page ?? 1));
  q.set("page_size", String(params?.pageSize ?? 15));
  return apiFetch(`/invest/stocks?${q.toString()}`);
}

export function getStockDetail(symbol: string): Promise<StockInvestResponse> {
  return apiFetch(`/invest/stocks/${encodeURIComponent(symbol)}`);
}

export function getStockHistory(
  symbol: string,
  period?: string,
): Promise<PriceHistoryResponse> {
  const q = new URLSearchParams();
  if (period) q.set("period", period);
  const qs = q.toString();
  return apiFetch(
    `/invest/stocks/${encodeURIComponent(symbol)}/history${qs ? `?${qs}` : ""}`,
  );
}

export function getMutualFunds(params?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<MutualFundInvestResponse>> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  q.set("page", String(params?.page ?? 1));
  q.set("page_size", String(params?.pageSize ?? 15));
  return apiFetch(`/invest/mf?${q.toString()}`);
}

export function getMutualFundDetail(name: string): Promise<MutualFundInvestResponse> {
  return apiFetch(`/invest/mf/${encodeURIComponent(name)}`);
}

export function getMfHistory(
  schemeCode: string,
  period?: string,
): Promise<PriceHistoryResponse> {
  const q = new URLSearchParams();
  if (period) q.set("period", period);
  const qs = q.toString();
  return apiFetch(
    `/invest/mf/${encodeURIComponent(schemeCode)}/history${qs ? `?${qs}` : ""}`,
  );
}

export function getGoldList(params?: { search?: string }): Promise<GoldInvestResponse[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch(`/invest/gold${qs ? `?${qs}` : ""}`);
}

export function getFDs(params?: { search?: string }): Promise<FixedDepositInvestResponse[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch(`/invest/fd${qs ? `?${qs}` : ""}`);
}

export function getTax(userId: string, assessmentYear?: number): Promise<TaxResponse> {
  const q = new URLSearchParams({ user_id: userId });
  if (assessmentYear != null) q.set("assessment_year", String(assessmentYear));
  return apiFetch(`/tax?${q.toString()}`);
}

export function getTaxAllocations(
  userId: string,
  assessmentYear?: number,
  paidStatus?: "unpaid" | "paid",
): Promise<SellAllocationListResponse> {
  const q = new URLSearchParams({ user_id: userId });
  if (assessmentYear != null) q.set("assessment_year", String(assessmentYear));
  if (paidStatus) q.set("paid_status", paidStatus);
  return apiFetch(`/tax/allocations?${q.toString()}`);
}

export function payTax(userId: string, sellAllocationId: number): Promise<Record<string, unknown>> {
  return apiFetch("/tax/pay", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      sell_allocation_id: sellAllocationId,
    }),
  });
}

export async function getProfile(userId: string): Promise<ProfileResponse | null> {
  const q = new URLSearchParams({ user_id: userId });
  const res = await fetch(`${BASE_URL}/profile?${q.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // keep status message
    }
    throw new Error(message);
  }
  return res.json() as Promise<ProfileResponse>;
}

export function getLiabilities(userId: string): Promise<LiabilityResponse[]> {
  const q = new URLSearchParams({ user_id: userId });
  return apiFetch(`/profile/liabilities?${q.toString()}`);
}

export function updateSalary(
  userId: string,
  salary: number | string,
  taxRegime: TaxRegime,
  currentExpenseEstimate: number | string,
  currentCashBalance: number | string,
): Promise<ProfileResponse> {
  return apiFetch("/profile/salary", {
    method: "PUT",
    body: JSON.stringify({
      user_id: userId,
      salary,
      tax_regime: taxRegime,
      current_expense_estimate: currentExpenseEstimate,
      current_cash_balance: currentCashBalance,
    }),
  });
}

export function updateLiabilities(
  userId: string,
  liabilities: LiabilityItem[],
): Promise<LiabilityResponse[]> {
  return apiFetch("/profile/liabilities", {
    method: "PUT",
    body: JSON.stringify({
      user_id: userId,
      liabilities,
    }),
  });
}

export function submitRiskQuestionnaire(
  userId: string,
  answers: Record<string, number>,
): Promise<RiskQuestionnaireResponse> {
  return apiFetch("/profile/risk/questionnaire", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      answers,
    }),
  });
}

export function adjustRiskTier(
  userId: string,
  riskTier: ProfileRiskTier,
): Promise<ProfileResponse> {
  return apiFetch("/profile/risk/adjust", {
    method: "PUT",
    body: JSON.stringify({
      user_id: userId,
      risk_tier: riskTier,
    }),
  });
}

export function postChat(
  userId: string,
  message: string,
  conversationId?: string | null,
): Promise<ChatResponse> {
  return apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      message,
      conversation_id: conversationId ?? null,
    }),
  });
}

export function submitOnboarding(payload: OnboardingRequest): Promise<OnboardingResponse> {
  return apiFetch("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
