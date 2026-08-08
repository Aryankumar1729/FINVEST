import { createBrowserRouter, Navigate, Outlet, redirect } from "react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "../components/layout/Sidebar";
import { DetailPanel } from "../components/panels/DetailPanel";
import { BuyModal } from "../components/modals/BuyModal";
import { SellModal } from "../components/modals/SellModal";
import { CreateGoalModal } from "../components/modals/CreateGoalModal";
import { EmailVerificationBanner } from "../components/EmailVerificationBanner";
import { Dashboard } from "../pages/Dashboard";
import { InvestScreen } from "../pages/InvestScreen";
import { GoalsScreen } from "../pages/GoalsScreen";
import { TaxScreen } from "../pages/TaxScreen";
import { ProfileScreen } from "../pages/ProfileScreen";
import { AIScreen } from "../pages/AIScreen";
import { Onboarding } from "../pages/Onboarding";
import { Login } from "../pages/Login";
import { StockDetailRoute, MutualFundDetailRoute } from "../pages/InvestDetailView";
import { hasCompletedOnboarding, markOnboardingComplete } from "../lib/onboarding";
import { useAuth } from "../context/AuthContext";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8000";

const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

// ─── App Shell Layout ─────────────────────────────────────────────────────────
function AppLayout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <EmailVerificationBanner />
        <div className="flex-1 flex overflow-hidden relative min-h-0">
          <Outlet />
          <DetailPanel />
        </div>
      </main>
      <BuyModal />
      <SellModal />
      <CreateGoalModal />
    </div>
  );
}

function AuthLoading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"
      style={{ background: "var(--background)" }}
    >
      Loading…
    </div>
  );
}

async function fetchProfileStatus(getIdToken: () => Promise<string>): Promise<"ok" | "missing"> {
  const attempt = async (): Promise<Response> => {
    const token = await getIdToken();
    return fetch(`${BASE_URL}/profile`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  };

  try {
    let res = await attempt();

    // Fresh Firebase ID tokens can fail verify_id_token with "Token used too early"
    // when the local clock is slightly behind; retry once after a short delay.
    if (res.status === 401) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await attempt();
    }

    if (res.ok) {
      markOnboardingComplete();
      return "ok";
    }

    if (res.status !== 404) {
      console.warn(
        `Profile guard: unexpected /profile status ${res.status}; treating as not onboarded`,
      );
    }

    try {
      localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    } catch {
      // ignore
    }
    return "missing";
  } catch (err) {
    console.warn("Profile guard: /profile check failed; treating as not onboarded", err);
    try {
      localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    } catch {
      // ignore
    }
    return "missing";
  }
}

/** Auth-only gate for /onboarding. If a profile already exists, bounce to "/". */
function RequireAuthForOnboarding() {
  const { user, loading, getIdToken } = useAuth();
  const [profileState, setProfileState] = useState<"checking" | "ok" | "missing">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setProfileState("checking");
      return;
    }

    let cancelled = false;
    setProfileState("checking");

    (async () => {
      const status = await fetchProfileStatus(getIdToken);
      if (!cancelled) setProfileState(status);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, getIdToken]);

  if (loading || (user && profileState === "checking")) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (profileState === "ok") return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Auth + profile-exists gate for the "/" tree.
 * Syncs localStorage onboarding flag with profile so legacy loaders don't conflict.
 */
function RequireAuthAndProfile() {
  const { user, loading, getIdToken } = useAuth();
  const [profileState, setProfileState] = useState<"checking" | "ok" | "missing">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setProfileState("checking");
      return;
    }

    let cancelled = false;
    setProfileState("checking");

    (async () => {
      const status = await fetchProfileStatus(getIdToken);
      if (!cancelled) setProfileState(status);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, getIdToken]);

  if (loading || (user && profileState === "checking")) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (profileState === "missing") return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/**
 * Legacy localStorage loaders — kept in place but neutralized as redirects.
 * They race with async Firebase/profile guards (loaders run before components can
 * sync localStorage from GET /profile). Profile-based guards above are authoritative.
 */
function requireOnboardingComplete() {
  // Previously: redirect("/onboarding") when !hasCompletedOnboarding().
  // Neutralized — see comment above.
  return null;
}

function requireOnboardingIncomplete() {
  // Retained for the planned removal step; profile check on RequireAuthForOnboarding
  // already sends onboarded users to "/". Avoid redirect loops with that guard.
  if (hasCompletedOnboarding()) {
    return redirect("/");
  }
  return null;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/onboarding",
    Component: RequireAuthForOnboarding,
    children: [
      {
        index: true,
        Component: Onboarding,
        loader: requireOnboardingIncomplete,
      },
    ],
  },
  {
    path: "/",
    Component: RequireAuthAndProfile,
    children: [
      {
        Component: AppLayout,
        loader: requireOnboardingComplete,
        children: [
          { index: true, Component: Dashboard },
          {
            path: "invest",
            children: [
              { index: true, Component: InvestScreen },
              { path: "stock/:symbol", Component: StockDetailRoute },
              { path: "fund/:name", Component: MutualFundDetailRoute },
            ],
          },
          { path: "goals", Component: GoalsScreen },
          { path: "tax", Component: TaxScreen },
          { path: "profile", Component: ProfileScreen },
          { path: "ai", Component: AIScreen },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
