import { submitOnboarding as apiSubmit } from "./api";
import type { OnboardingRequest, OnboardingResponse } from "./api-types";

const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

/** Swap this module later for a backend/profile check without touching routes. */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
  } catch {
    // Ignore quota / private-mode failures; guard will keep sending user to onboarding.
  }
}

export function submitOnboarding(payload: OnboardingRequest): Promise<OnboardingResponse> {
  return apiSubmit(payload);
}
