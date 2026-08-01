import type { Holding, Stock, AiRec, MutualFund, FD, GoldETF, Goal, TaxRow, RiskQuestion, GoalStrategy } from "./types";

export const chartData = [
  { month: "Jan", value: 820000 }, { month: "Feb", value: 854000 },
  { month: "Mar", value: 831000 }, { month: "Apr", value: 910000 },
  { month: "May", value: 892000 }, { month: "Jun", value: 965000 },
  { month: "Jul", value: 948000 }, { month: "Aug", value: 1020000 },
  { month: "Sep", value: 1085000 }, { month: "Oct", value: 1062000 },
  { month: "Nov", value: 1140000 }, { month: "Dec", value: 1218450 },
];

export const detailChartData = [
  { day: "Mon", value: 2640 }, { day: "Tue", value: 2700 }, { day: "Wed", value: 2680 },
  { day: "Thu", value: 2750 }, { day: "Fri", value: 2720 }, { day: "Sat", value: 2800 },
  { day: "Sun", value: 2847 },
];

export const holdings: Holding[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", qty: 12, avgBuy: 2310.0, current: 2847.3, sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services", qty: 8, avgBuy: 3650.5, current: 3921.55, sector: "IT" },
  { symbol: "INFY", name: "Infosys Ltd", qty: 25, avgBuy: 1480.0, current: 1562.1, sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", qty: 15, avgBuy: 1720.0, current: 1678.9, sector: "Banking" },
];

export const stockList: Stock[] = [
  { symbol: "RELIANCE",   name: "Reliance Industries",        price: 2847.30, change:  1.82, high52w: 3040.0,  risk: "Moderate", sector: "Energy" },
  { symbol: "TCS",        name: "Tata Consultancy Services",  price: 3921.55, change:  0.64, high52w: 4218.0,  risk: "Low",      sector: "IT" },
  { symbol: "INFY",       name: "Infosys Ltd",                price: 1562.10, change:  2.17, high52w: 1780.0,  risk: "Low",      sector: "IT" },
  { symbol: "HDFCBANK",   name: "HDFC Bank Ltd",              price: 1678.90, change: -0.43, high52w: 1880.0,  risk: "Low",      sector: "Banking" },
  { symbol: "ICICIBANK",  name: "ICICI Bank Ltd",             price: 1203.75, change:  1.05, high52w: 1340.0,  risk: "Moderate", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd",          price: 1729.40, change: -1.22, high52w: 1950.0,  risk: "Moderate", sector: "Telecom" },
  { symbol: "LT",         name: "Larsen & Toubro Ltd",        price: 3612.80, change:  0.88, high52w: 3900.0,  risk: "Moderate", sector: "Infra" },
  { symbol: "WIPRO",      name: "Wipro Ltd",                  price:  487.25, change:  1.34, high52w:  580.0,  risk: "Moderate", sector: "IT" },
];

export const aiRecs: AiRec[] = [
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd",      price:  924.5,  change: 3.1,  confidence: "High",     reason: "Strong EV growth outlook" },
  { symbol: "SUNPHARMA",  name: "Sun Pharma Industries", price: 1678.0,  change: 1.8,  confidence: "High",     reason: "Positive FDA approvals" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ",    price: 1342.0,  change: 2.4,  confidence: "Moderate", reason: "Infra cycle tailwind" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd",    price: 7210.0,  change: -0.6, confidence: "Moderate", reason: "Attractive valuation entry" },
];

export const mutualFundList: MutualFund[] = [
  { name: "Parag Parikh Flexi Cap Fund",    category: "Flexi Cap",  risk: "Moderate", nav:  76.82, return1y: 28.3, return3y: 22.1, minSip:  1000 },
  { name: "Mirae Asset Large Cap Fund",     category: "Large Cap",  risk: "Low",      nav: 112.34, return1y: 18.4, return3y: 14.8, minSip:  5000 },
  { name: "SBI Small Cap Fund",             category: "Small Cap",  risk: "High",     nav: 148.91, return1y: 35.8, return3y: 29.4, minSip:  5000 },
  { name: "HDFC Mid-Cap Opportunities",     category: "Mid Cap",    risk: "Moderate", nav: 134.67, return1y: 32.2, return3y: 25.6, minSip:  5000 },
  { name: "DSP Nifty 50 Index Fund",        category: "Index",      risk: "Low",      nav:  42.88, return1y: 17.6, return3y: 13.2, minSip:   500 },
  { name: "Nippon India Tax Saver ELSS",    category: "ELSS",       risk: "Moderate", nav:  98.11, return1y: 24.9, return3y: 18.7, minSip:  1500 },
];

export const fdList: FD[] = [
  {
    bank: "Shriram Finance", type: "Corporate FD", minDeposit: 5000,
    rates: [{ tenure: "1 Year", rate: 8.25 }, { tenure: "2 Years", rate: 8.75 }, { tenure: "5 Years", rate: 9.0 }],
  },
  {
    bank: "Bajaj Finance", type: "Corporate FD", minDeposit: 25000,
    rates: [{ tenure: "1 Year", rate: 7.85 }, { tenure: "2 Years", rate: 8.35 }, { tenure: "44 Months", rate: 8.85 }],
  },
  {
    bank: "Post Office TD", type: "Govt Scheme", minDeposit: 1000,
    rates: [{ tenure: "1 Year", rate: 6.9 }, { tenure: "2 Years", rate: 7.0 }, { tenure: "5 Years", rate: 7.5 }],
  },
  {
    bank: "HDFC Bank", type: "Bank FD", minDeposit: 5000,
    rates: [{ tenure: "6 Months", rate: 5.75 }, { tenure: "1 Year", rate: 6.6 }, { tenure: "2 Years", rate: 7.4 }],
  },
  {
    bank: "SBI", type: "Bank FD", minDeposit: 1000,
    rates: [{ tenure: "6 Months", rate: 5.5 }, { tenure: "1 Year", rate: 6.8 }, { tenure: "2 Years", rate: 7.25 }],
  },
  {
    bank: "ICICI Bank", type: "Bank FD", minDeposit: 10000,
    rates: [{ tenure: "6 Months", rate: 5.5 }, { tenure: "1 Year", rate: 6.7 }, { tenure: "2 Years", rate: 7.25 }],
  },
];

export const goldList: GoldETF[] = [
  { symbol: "GOLDBEES",   name: "Nippon India Gold ETF", price: 61.42, change: 0.74, expenseRatio: 0.52 },
  { symbol: "SGOLD",      name: "SBI Gold ETF",          price: 60.87, change: 0.68, expenseRatio: 0.65 },
  { symbol: "HDFCMFGETF", name: "HDFC Gold ETF",         price: 62.11, change: 0.81, expenseRatio: 0.59 },
  { symbol: "AXISGOLD",   name: "Axis Gold ETF",         price: 61.05, change: 0.72, expenseRatio: 0.61 },
];

export const goals: Goal[] = [
  { id: "1", name: "House Down Payment", target: 2500000, saved: 1650000, monthly: 28000, date: "Dec 2026", status: "On Track",  strategy: "Balanced" },
  { id: "2", name: "Child Education Fund", target: 5000000, saved: 820000, monthly: 12500, date: "Mar 2032", status: "At Risk",   strategy: "Conservative" },
  { id: "3", name: "Emergency Corpus",   target:  600000, saved:  600000, monthly: 0,     date: "Achieved", status: "Achieved", strategy: "Conservative" },
];

export const taxRows: TaxRow[] = [
  { id: "t1", description: "INFY — 25 shares sold",      type: "STCG",  due: "Due Mar 31, 2025", amount:  4820,  status: "Unpaid" },
  { id: "t2", description: "SBI Small Cap Fund exit",     type: "LTCG",  due: "Due Mar 31, 2025", amount: 11340,  status: "Unpaid" },
  { id: "t3", description: "GOLDBEES — 50 units sold",   type: "STCG",  due: "Paid Nov 2024",    amount:  2150,  status: "Paid" },
  { id: "t4", description: "HDFC Mid-Cap MF redemption", type: "LTCG",  due: "Paid Sep 2024",    amount:  7600,  status: "Paid" },
];

export const riskQuestions: RiskQuestion[] = [
  {
    question: "How long can you stay invested without needing the money?",
    description: "Choose the investment horizon that best fits your financial plans.",
    options: ["Less than 1 year", "1 – 3 years", "3 – 7 years", "More than 7 years"],
  },
  {
    question: "If your portfolio dropped 20% in a month, what would you do?",
    description: "This reveals how you respond to short-term market volatility.",
    options: ["Sell everything immediately", "Sell some to reduce exposure", "Hold and wait it out", "Buy more — great discount"],
  },
  {
    question: "What is your primary investment objective?",
    description: "Your goal shapes the right asset allocation strategy.",
    options: ["Protect capital at all costs", "Steady income with low risk", "Balanced growth over time", "Maximum returns — high risk is fine"],
  },
  {
    question: "What share of your monthly income do you invest?",
    description: "Higher savings rate generally supports more risk-taking.",
    options: ["Less than 10%", "10% – 25%", "25% – 50%", "More than 50%"],
  },
];

export const goalStrategies: GoalStrategy[] = [
  {
    name: "Conservative",
    sip: 12400,
    expectedReturn: 9,
    description: "20% Equity · 60% Debt · 20% Gold. Lower risk, longer timeline to target. Suitable if your goal date is close.",
    activeBorder: "border-emerald-500/40",
    activeBg: "bg-emerald-500/[0.06]",
    activeText: "text-emerald-400",
  },
  {
    name: "Balanced",
    sip: 9800,
    expectedReturn: 12,
    description: "50% Equity · 35% Debt · 15% Gold. Moderate risk with steady growth. Best for 3–7 year horizons.",
    activeBorder: "border-amber-500/40",
    activeBg: "bg-amber-500/[0.06]",
    activeText: "text-amber-400",
  },
  {
    name: "Aggressive",
    sip: 7200,
    expectedReturn: 16,
    description: "80% Equity · 15% Debt · 5% Gold. Higher risk, faster capital accumulation. Ideal for 7+ year horizons.",
    activeBorder: "border-red-500/40",
    activeBg: "bg-red-500/[0.06]",
    activeText: "text-red-400",
  },
];
