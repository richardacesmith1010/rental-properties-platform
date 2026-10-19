export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type DomusTheme = ThemePreference;

export const DOMUS_THEME_KEY = "domus-theme";
export const DOMUS_THEME_ATTRIBUTE = "data-theme";

export const THEME_INIT_SCRIPT = `
  try {
    const legacyLight = ['atlas', 'light'].join('-');
    const legacyDarkValues = new Set([
      ['noctis', 'neon'].join('-'),
      ['imperium', 'night'].join('-')
    ]);
    const rawTheme = localStorage.getItem('${DOMUS_THEME_KEY}');
    const theme =
      rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system'
        ? rawTheme
        : rawTheme === legacyLight
          ? 'light'
          : legacyDarkValues.has(rawTheme ?? '')
            ? 'dark'
            : 'system';

    if (theme === 'system') {
      document.documentElement.removeAttribute('${DOMUS_THEME_ATTRIBUTE}');
    } else {
      document.documentElement.setAttribute('${DOMUS_THEME_ATTRIBUTE}', theme);
    }
    window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.domusTheme &&
      window.webkit.messageHandlers.domusTheme.postMessage({ theme: theme });
  } catch (error) {}
`;

const LEGACY_LIGHT_THEME = ["atlas", "light"].join("-");
const LEGACY_DARK_THEMES = new Set([
  ["noctis", "neon"].join("-"),
  ["imperium", "night"].join("-")
]);
const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

function getColorSchemeMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(PREFERS_DARK_QUERY);
}

export function normalizeTheme(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  if (value === LEGACY_LIGHT_THEME) {
    return "light";
  }

  if (value && LEGACY_DARK_THEMES.has(value)) {
    return "dark";
  }

  return "system";
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  return normalizeTheme(window.localStorage.getItem(DOMUS_THEME_KEY));
}

export function getSystemTheme(): ResolvedTheme {
  return getColorSchemeMediaQuery()?.matches ? "dark" : "light";
}

export function resolveTheme(theme: ThemePreference = getStoredTheme()): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

type NativeThemeWindow = Window & {
  webkit?: { messageHandlers?: { domusTheme?: { postMessage: (body: { theme: ThemePreference }) => void } } };
};

export function notifyNativeTheme(theme: ThemePreference): void {
  try {
    if (typeof window !== "undefined") {
      (window as NativeThemeWindow).webkit?.messageHandlers?.domusTheme?.postMessage({ theme });
    }
  } catch {
    // A native bridge failure must not interrupt the page's theme update.
  }
}

export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }

  if (theme === "system") {
    document.documentElement.removeAttribute(DOMUS_THEME_ATTRIBUTE);
  } else {
    document.documentElement.setAttribute(DOMUS_THEME_ATTRIBUTE, theme);
  }

  notifyNativeTheme(theme);
}

export function setTheme(theme: ThemePreference): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DOMUS_THEME_KEY, theme);
  }

  applyTheme(theme);
}

export function onSystemThemeChange(onChange: (theme: ResolvedTheme) => void): () => void {
  const mediaQuery = getColorSchemeMediaQuery();
  if (!mediaQuery) {
    return () => undefined;
  }

  const handleChange = (event: MediaQueryListEvent) => {
    onChange(event.matches ? "dark" : "light");
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }

  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
}

export function isDarkTheme(theme?: ThemePreference | ResolvedTheme): boolean {
  if (theme === "dark") {
    return true;
  }

  if (theme === "light") {
    return false;
  }

  return resolveTheme(theme ?? getStoredTheme()) === "dark";
}
