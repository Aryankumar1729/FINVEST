export type InvestTab = "stocks" | "mutual-funds" | "gold" | "fd";
export type ModalType = null | "buy" | "sell" | "create-goal";
export type RiskTier = "Low" | "Moderate" | "High";

export interface Holding {
  symbol: string;
  name: string;
  qty: number;
  avgBuy: number;
  current: number;
  sector: string;
}

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  high52w: number;
  risk: "Low" | "Moderate" | "High";
  sector: string;
}

export interface AiRec {
  symbol: string;
  name: string;
  price: number;
  change: number;
  confidence: "High" | "Moderate";
  reason: string;
}

export interface MutualFund {
  name: string;
  category: string;
  risk: "Low" | "Moderate" | "High";
  nav: number;
  return1y: number;
  return3y: number;
  minSip: number;
}

export interface FD {
  bank: string;
  type: string;
  minDeposit: number;
  rates: { tenure: string; rate: number }[];
}

export interface GoldETF {
  symbol: string;
  name: string;
  price: number;
  change: number;
  expenseRatio: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  monthly: number;
  date: string;
  status: "On Track" | "At Risk" | "Achieved";
  strategy?: string;
}

export interface TaxRow {
  id: string;
  description: string;
  type: string;
  due: string;
  amount: number;
  status: "Paid" | "Unpaid";
}

export interface RiskQuestion {
  question: string;
  description: string;
  options: string[];
}

export interface GoalStrategy {
  name: string;
  sip: number;
  expectedReturn: number;
  description: string;
  activeBorder: string;
  activeBg: string;
  activeText: string;
}

export interface PanelItem {
  type: "stock" | "mutual-fund" | "gold";
  data: any;
}

export interface AppContextType {
  modal: ModalType;
  setModal: (m: ModalType) => void;
  modalSymbol: string | undefined;
  setModalSymbol: (s: string | undefined) => void;
  modalPrice: number | undefined;
  setModalPrice: (p: number | undefined) => void;
  panel: PanelItem | null;
  setPanel: (p: PanelItem | null) => void;
  openBuy: (symbol?: string, price?: number) => void;
  openSell: (symbol?: string) => void;
  /** Bumped after buy/sell so Dashboard re-fetches. */
  portfolioVersion: number;
  refreshPortfolio: () => void;
  /** Bumped after goal create/select so Goals (and Dashboard goals) re-fetch. */
  goalsVersion: number;
  refreshGoals: () => void;
}
