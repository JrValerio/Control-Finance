import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ThemeContext } from "./theme-context";
import type { Theme, ThemePreference } from "./theme-context";

const STORAGE_KEY = "cf-theme";

const getStoredPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    // localStorage unavailable (tests, SSR)
  }
  return "system";
};

const resolveTheme = (preference: ThemePreference): Theme => {
  if (preference === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  return preference;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    getStoredPreference,
  );
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() =>
    resolveTheme(getStoredPreference()),
  );

  // Apply .dark class to <html> and persist preference on every change
  useEffect(() => {
    const resolved = resolveTheme(themePreference);
    setResolvedTheme(resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, themePreference);
    } catch {
      // ignore
    }
  }, [themePreference]);

  // React to OS-level dark/light changes when preference is "system"
  useEffect(() => {
    if (themePreference !== "system") return;
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        const resolved: Theme = e.matches ? "dark" : "light";
        setResolvedTheme(resolved);
        document.documentElement.classList.toggle("dark", resolved === "dark");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } catch {
      // matchMedia unavailable (tests)
    }
  }, [themePreference]);

  const setThemePreference = useCallback((p: ThemePreference) => {
    setThemePreferenceState(p);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme: resolvedTheme, themePreference, setThemePreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
