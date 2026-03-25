/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext } from "react";
import { useState } from "react";
import type { ReactNode } from "react";
import { formatCurrency } from "../utils/formatCurrency";

const STORAGE_KEY = "cf.discreet_mode";
const MASK = "R$ ••••";

interface DiscreetModeContextValue {
  isDiscreetMode: boolean;
  toggleDiscreetMode: () => void;
}

const DiscreetModeContext = createContext<DiscreetModeContextValue>({
  isDiscreetMode: false,
  toggleDiscreetMode: () => {},
});

export const DiscreetModeProvider = ({ children }: { children: ReactNode }) => {
  const [isDiscreetMode, setIsDiscreetMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleDiscreetMode = useCallback(() => {
    setIsDiscreetMode((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(STORAGE_KEY, "1");
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors (private mode / quota)
      }
      return next;
    });
  }, []);

  return (
    <DiscreetModeContext.Provider value={{ isDiscreetMode, toggleDiscreetMode }}>
      {children}
    </DiscreetModeContext.Provider>
  );
};

export const useDiscreetMode = () => useContext(DiscreetModeContext);

/**
 * Returns a formatter function that masks monetary values when discreet mode is active.
 * Usage: const money = useMaskedCurrency(); ... {money(value)}
 */
export const useMaskedCurrency = () => {
  const { isDiscreetMode } = useDiscreetMode();
  return useCallback(
    (value: unknown) => (isDiscreetMode ? MASK : formatCurrency(value)),
    [isDiscreetMode],
  );
};
