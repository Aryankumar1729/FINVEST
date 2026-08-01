import type { GoalVariantType } from "./api-types";

export type GoalStatus = "On Track" | "At Risk" | "Achieved";

/** Same thresholds as Dashboard: Achieved at 100%+, On Track at ≥40%, else At Risk. */
export function goalStatus(saved: number, target: number): GoalStatus {
  if (target > 0 && saved >= target) return "Achieved";
  const pct = target > 0 ? saved / target : 0;
  return pct >= 0.4 ? "On Track" : "At Risk";
}

export function capitalizeVariant(variant: GoalVariantType | null | undefined): string {
  if (!variant) return "Goal";
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

/** Card title when API has no goal name — e.g. "Moderate Plan", or "Goal" if null. */
export function goalPlanLabel(variant: GoalVariantType | null | undefined): string {
  if (!variant) return "Goal";
  return `${capitalizeVariant(variant)} Plan`;
}
