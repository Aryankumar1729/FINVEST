import { NavLink } from "react-router";
import { LayoutDashboard, TrendingUp, Target, Receipt, User, Wallet, Bot } from "lucide-react";
import { cn } from "../../lib/utils";

const navItems: { to: string; label: string; icon: React.ReactNode; isAi?: boolean }[] = [
  { to: "/",        label: "Dashboard",    icon: <LayoutDashboard size={16} /> },
  { to: "/invest",  label: "Invest",       icon: <TrendingUp size={16} /> },
  { to: "/goals",   label: "Goals",        icon: <Target size={16} /> },
  { to: "/tax",     label: "Tax",          icon: <Receipt size={16} /> },
  { to: "/profile", label: "Profile",      icon: <User size={16} /> },
  { to: "/ai",      label: "AI Assistant", icon: <Bot size={16} />, isAi: true },
];

export function Sidebar() {
  return (
    <aside
      className="w-[220px] shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/[0.05]"
      style={{ background: "rgba(10,13,20,0.95)" }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-[0_0_12px_rgba(0,201,122,0.4)]">
            <Wallet size={15} className="text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground tracking-tight">Finvest</span>
            <span className="block text-[9px] text-muted-foreground tracking-[0.12em] uppercase">OS · Alpha</span>
          </div>
        </div>
      </div>

      {/* Nav label */}
      <div className="px-5 mb-2">
        <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-[0.2em]">Navigation</p>
      </div>

      {/* Nav items */}
      <nav className="px-3 flex flex-col gap-0.5 flex-1">
        {navItems.map((item) => (
          <div key={item.to}>
            {item.isAi && <div className="h-px bg-white/[0.06] my-2 mx-1" />}
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-all duration-150",
                  isActive && !item.isAi ? "bg-primary/10 text-primary" :
                  isActive && item.isAi  ? "bg-primary/10 text-primary" :
                  item.isAi             ? "text-muted-foreground hover:text-primary/80 hover:bg-primary/[0.05]" :
                                          "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                  )}
                  <span className={cn(
                    isActive ? "text-primary" : item.isAi ? "text-primary/60" : "text-muted-foreground"
                  )}>
                    {item.icon}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="mx-3 mb-5 mt-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">AR</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">Arjun Rathi</p>
            <p className="text-[10px] text-muted-foreground">Moderate · FY 2024–25</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
