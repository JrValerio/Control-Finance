import { createContext } from "react";

export type Theme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

export interface ThemeContextValue {
  /** Resolved effective theme applied to the document ("light" or "dark"). */
  theme: Theme;
  /** User's explicit preference, including "system" to follow OS. */
  themePreference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
