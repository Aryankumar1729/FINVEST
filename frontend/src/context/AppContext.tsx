import { createContext, useContext, useState, useCallback } from "react";
import type { AppContextType, ModalType, PanelItem } from "../lib/types";

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalType>(null);
  const [modalSymbol, setModalSymbol] = useState<string | undefined>();
  const [modalPrice, setModalPrice] = useState<number | undefined>();
  const [panel, setPanel] = useState<PanelItem | null>(null);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [goalsVersion, setGoalsVersion] = useState(0);

  const openBuy = (symbol?: string, price?: number) => {
    setModalSymbol(symbol);
    setModalPrice(price);
    setModal("buy");
  };

  const openSell = (symbol?: string) => {
    setModalSymbol(symbol);
    setModal("sell");
  };

  const refreshPortfolio = useCallback(() => {
    setPortfolioVersion((v) => v + 1);
  }, []);

  const refreshGoals = useCallback(() => {
    setGoalsVersion((v) => v + 1);
  }, []);

  return (
    <AppContext.Provider value={{
      modal, setModal,
      modalSymbol, setModalSymbol,
      modalPrice, setModalPrice,
      panel, setPanel,
      openBuy, openSell,
      portfolioVersion,
      refreshPortfolio,
      goalsVersion,
      refreshGoals,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
