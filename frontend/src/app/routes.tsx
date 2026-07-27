import { createBrowserRouter, Navigate, Outlet, redirect } from "react-router";
import { Sidebar } from "../components/layout/Sidebar";
import { DetailPanel } from "../components/panels/DetailPanel";
import { BuyModal } from "../components/modals/BuyModal";
import { SellModal } from "../components/modals/SellModal";
import { CreateGoalModal } from "../components/modals/CreateGoalModal";
import { Dashboard } from "../pages/Dashboard";
import { InvestScreen } from "../pages/InvestScreen";
import { GoalsScreen } from "../pages/GoalsScreen";
import { TaxScreen } from "../pages/TaxScreen";
import { ProfileScreen } from "../pages/ProfileScreen";
import { AIScreen } from "../pages/AIScreen";
import { Onboarding } from "../pages/Onboarding";
import { StockDetailRoute, MutualFundDetailRoute } from "../pages/InvestDetailView";
import { hasCompletedOnboarding } from "../lib/onboarding";

// ─── App Shell Layout ─────────────────────────────────────────────────────────
function AppLayout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden relative">
        <Outlet />
        <DetailPanel />
      </main>
      <BuyModal />
      <SellModal />
      <CreateGoalModal />
    </div>
  );
}

function requireOnboardingComplete() {
  if (!hasCompletedOnboarding()) {
    return redirect("/onboarding");
  }
  return null;
}

function requireOnboardingIncomplete() {
  if (hasCompletedOnboarding()) {
    return redirect("/");
  }
  return null;
}

export const router = createBrowserRouter([
  {
    path: "/onboarding",
    Component: Onboarding,
    loader: requireOnboardingIncomplete,
  },
  {
    path: "/",
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
      { path: "goals",       Component: GoalsScreen },
      { path: "tax",         Component: TaxScreen },
      { path: "profile",     Component: ProfileScreen },
      { path: "ai",          Component: AIScreen },
      { path: "*",           element: <Navigate to="/" replace /> },
    ],
  },
]);
