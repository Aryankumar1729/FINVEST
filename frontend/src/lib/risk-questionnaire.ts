export type RiskSectionId = "goal" | "risk_tolerance" | "capacity" | "experience" | "behaviour";

export interface RiskQuestionDef {
  id: `q${number}`;
  section: RiskSectionId;
  prompt: string;
  lowLabel: string;
  highLabel: string;
}

export const RISK_SECTIONS: { id: RiskSectionId; title: string }[] = [
  { id: "goal", title: "Goal" },
  { id: "risk_tolerance", title: "Risk Tolerance" },
  { id: "capacity", title: "Capacity" },
  { id: "experience", title: "Experience" },
  { id: "behaviour", title: "Behaviour" },
];

/** Locked 18-question Likert bank — keys must match backend q1..q18. */
export const RISK_QUESTIONNAIRE: RiskQuestionDef[] = [
  {
    id: "q1",
    section: "goal",
    prompt: "My main investing goal is...",
    lowLabel: "preserve what I have",
    highLabel: "maximize long-term growth",
  },
  {
    id: "q2",
    section: "goal",
    prompt: "My investment time horizon is...",
    lowLabel: "under 2 years",
    highLabel: "10+ years",
  },
  {
    id: "q3",
    section: "goal",
    prompt: "If my goal's target date could move, I'd rather...",
    lowLabel: "hit the number on time, safely",
    highLabel: "wait longer for a shot at a bigger number",
  },
  {
    id: "q4",
    section: "risk_tolerance",
    prompt: "A 20% drop in my portfolio in one month would make me...",
    lowLabel: "sell immediately",
    highLabel: "buy more",
  },
  {
    id: "q5",
    section: "risk_tolerance",
    prompt: "I'm comfortable with my portfolio's value swinging significantly month to month.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q6",
    section: "risk_tolerance",
    prompt:
      "Between a steady 6% return and a volatile investment averaging 12% but sometimes -15% in bad years, I'd pick...",
    lowLabel: "the steady 6%",
    highLabel: "the volatile 12%",
  },
  {
    id: "q7",
    section: "risk_tolerance",
    prompt: "Thinking about my investments makes me feel calm and confident, even when markets are volatile.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q8",
    section: "capacity",
    prompt: "My current emergency fund covers...",
    lowLabel: "less than 1 month of expenses",
    highLabel: "6+ months",
  },
  {
    id: "q9",
    section: "capacity",
    prompt: "My income is...",
    lowLabel: "irregular/uncertain",
    highLabel: "very stable/secure",
  },
  {
    id: "q10",
    section: "capacity",
    prompt: "If my portfolio lost 30% of its value, my daily life would be...",
    lowLabel: "seriously affected",
    highLabel: "unaffected",
  },
  {
    id: "q11",
    section: "capacity",
    prompt:
      "I have flexibility in my finances — no urgent competing goals or debts pulling on this money.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q12",
    section: "experience",
    prompt: "My experience investing in market-linked instruments (stocks/MFs) is...",
    lowLabel: "none",
    highLabel: "extensive",
  },
  {
    id: "q13",
    section: "experience",
    prompt: "I understand how concepts like volatility, diversification, and drawdowns work.",
    lowLabel: "not at all",
    highLabel: "very well",
  },
  {
    id: "q14",
    section: "experience",
    prompt: "I've been through at least one major market downturn as an investor.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q15",
    section: "behaviour",
    prompt:
      "When I see news about a market crash, I stay calm and see it as an opportunity rather than a reason to sell.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q16",
    section: "behaviour",
    prompt:
      "I stick to my investment strategy regardless of short-term market swings, rather than reacting to them.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q17",
    section: "behaviour",
    prompt:
      "I'm comfortable with complex investments that carry higher potential returns, even if I can't track every detail closely.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
  {
    id: "q18",
    section: "behaviour",
    prompt: "Once I set an investment plan, I stick to it regardless of short-term noise.",
    lowLabel: "strongly disagree",
    highLabel: "strongly agree",
  },
];
