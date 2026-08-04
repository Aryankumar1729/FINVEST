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
import { auth } from "./firebase";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "http://localhost:8000";

async function buildHeaders(init?: RequestInit): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function redirectToLoginOn401(res: Response): Promise<void> {
  if (res.status !== 401) return;
  await auth.signOut();
  // Dynamic import avoids a circular module graph (routes → pages → api → routes).
  const { router } = await import("../app/routes");
  router.navigate("/login");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: await buildHeaders(init),
  });

  await redirectToLoginOn401(res);

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

export function getPortfolio(): Promise<PortfolioResponse> {
  return apiFetch("/portfolio");
}

export function getPortfolioHistory(period: string = "1y"): Promise<PriceHistoryResponse> {
  const q = new URLSearchParams({ period });
  return apiFetch(`/portfolio/history?${q.toString()}`);
}

export function getGoals(): Promise<GoalListResponse> {
  return apiFetch("/goal");
}

export function createGoal(
  targetAmount: number | null,
  timeframeYears: number | null,
): Promise<GoalCreateResponse> {
  return apiFetch("/goal", {
    method: "POST",
    body: JSON.stringify({
      target_amount: targetAmount,
      timeframe_years: timeframeYears,
    }),
  });
}

export function selectGoalVariant(
  goalId: number,
  variantId: number,
): Promise<GoalCreateResponse> {
  return apiFetch("/goal/select", {
    method: "POST",
    body: JSON.stringify({
      goal_id: goalId,
      variant_id: variantId,
    }),
  });
}

export function buyLot(payload: Omit<BuyLotPayload, "user_id">): Promise<LotResponse> {
  return apiFetch("/portfolio/buy", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sellLot(payload: Omit<SellLotPayload, "user_id">): Promise<SellResponse> {
  return apiFetch("/portfolio/sell", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStocks(params?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<StockInvestResponse>> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
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

export function getTax(assessmentYear?: number): Promise<TaxResponse> {
  const q = new URLSearchParams();
  if (assessmentYear != null) q.set("assessment_year", String(assessmentYear));
  const qs = q.toString();
  return apiFetch(`/tax${qs ? `?${qs}` : ""}`);
}

export function getTaxAllocations(
  assessmentYear?: number,
  paidStatus?: "unpaid" | "paid",
): Promise<SellAllocationListResponse> {
  const q = new URLSearchParams();
  if (assessmentYear != null) q.set("assessment_year", String(assessmentYear));
  if (paidStatus) q.set("paid_status", paidStatus);
  const qs = q.toString();
  return apiFetch(`/tax/allocations${qs ? `?${qs}` : ""}`);
}

export function payTax(sellAllocationId: number): Promise<Record<string, unknown>> {
  return apiFetch("/tax/pay", {
    method: "POST",
    body: JSON.stringify({
      sell_allocation_id: sellAllocationId,
    }),
  });
}

/** Keeps custom 404→null handling; duplicates token attach + 401 redirect (not via apiFetch). */
export async function getProfile(): Promise<ProfileResponse | null> {
  const res = await fetch(`${BASE_URL}/profile`, {
    headers: await buildHeaders(),
  });

  await redirectToLoginOn401(res);

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

export function getLiabilities(): Promise<LiabilityResponse[]> {
  return apiFetch("/profile/liabilities");
}

export function updateSalary(
  salary: number | string,
  taxRegime: TaxRegime,
  currentExpenseEstimate: number | string,
  currentCashBalance: number | string,
): Promise<ProfileResponse> {
  return apiFetch("/profile/salary", {
    method: "PUT",
    body: JSON.stringify({
      salary,
      tax_regime: taxRegime,
      current_expense_estimate: currentExpenseEstimate,
      current_cash_balance: currentCashBalance,
    }),
  });
}

export function updateLiabilities(
  liabilities: LiabilityItem[],
): Promise<LiabilityResponse[]> {
  return apiFetch("/profile/liabilities", {
    method: "PUT",
    body: JSON.stringify({
      liabilities,
    }),
  });
}

export function submitRiskQuestionnaire(
  answers: Record<string, number>,
): Promise<RiskQuestionnaireResponse> {
  return apiFetch("/profile/risk/questionnaire", {
    method: "POST",
    body: JSON.stringify({
      answers,
    }),
  });
}

export function adjustRiskTier(
  riskTier: ProfileRiskTier,
): Promise<ProfileResponse> {
  return apiFetch("/profile/risk/adjust", {
    method: "PUT",
    body: JSON.stringify({
      risk_tier: riskTier,
    }),
  });
}

export function postChat(
  message: string,
  conversationId?: string | null,
): Promise<ChatResponse> {
  return apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? null,
    }),
  });
}

export function submitOnboarding(
  payload: Omit<OnboardingRequest, "user_id">,
): Promise<OnboardingResponse> {
  return apiFetch("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
