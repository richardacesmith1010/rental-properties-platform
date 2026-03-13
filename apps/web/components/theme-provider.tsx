"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  applyTheme,
  getStoredTheme,
  isDarkTheme,
  setTheme as persistTheme,
  type DomusTheme
} from "@/lib/theme";

interface ThemeContextValue {
  theme: DomusTheme;
  isDark: boolean;
  setTheme: (theme: DomusTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DomusTheme>("atlas-light");

  useEffect(() => {
    const storedTheme = getStoredTheme();
    applyTheme(storedTheme);
    setThemeState(storedTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: isDarkTheme(theme),
      setTheme: (nextTheme) => {
        persistTheme(nextTheme);
        setThemeState(nextTheme);
      }
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDomusTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useDomusTheme must be used within ThemeProvider.");
  }
  return context;
}
