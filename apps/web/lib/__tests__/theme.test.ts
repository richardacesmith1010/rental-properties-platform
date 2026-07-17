import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  DOMUS_THEME_ATTRIBUTE,
  DOMUS_THEME_KEY,
  getStoredTheme,
  isDarkTheme,
  normalizeTheme,
  onSystemThemeChange,
  resolveTheme,
  setTheme
} from "../theme";

function installMatchMediaMock(matches = false) {
  let currentMatch = matches;
  type ListenerKey = EventListenerOrEventListenerObject | ((event: MediaQueryListEvent) => void);
  const listeners = new Map<ListenerKey, (event: MediaQueryListEvent) => void>();

  const wrapListener = (listener: ListenerKey | null) => {
    if (!listener) {
      return null;
    }

    if (typeof listener === "function") {
      return listener as (event: MediaQueryListEvent) => void;
    }

    return (event: MediaQueryListEvent) => listener.handleEvent(event);
  };

  const mediaQuery = {
    get matches() {
      return currentMatch;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_event: string, listener: EventListenerOrEventListenerObject | null) => {
      const wrappedListener = wrapListener(listener);
      if (!listener || !wrappedListener) {
        return;
      }
      listeners.set(listener, wrappedListener);
    },
    removeEventListener: (_event: string, listener: EventListenerOrEventListenerObject | null) => {
      if (!listener) {
        return;
      }
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.set(listener, listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: vi.fn()
  } satisfies MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => mediaQuery)
  });

  return {
    setMatches(nextMatch: boolean) {
      currentMatch = nextMatch;
      listeners.forEach((listener) => listener({ matches: nextMatch } as MediaQueryListEvent));
    }
  };
}

describe("theme utilities", () => {
  let matchMediaController: ReturnType<typeof installMatchMediaMock>;

  beforeEach(() => {
    matchMediaController = installMatchMediaMock(false);
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(DOMUS_THEME_ATTRIBUTE);
  });

  it("normalizes unknown values to system", () => {
    expect(normalizeTheme("mystery-theme")).toBe("system");
  });

  it("normalizes an empty string to system", () => {
    expect(normalizeTheme("")).toBe("system");
  });

  it("normalizes null values to system", () => {
    expect(normalizeTheme(null)).toBe("system");
  });

  it("normalizes undefined values to system", () => {
    expect(normalizeTheme(undefined)).toBe("system");
  });

  it("maps the legacy light value to light", () => {
    expect(normalizeTheme(["atlas", "light"].join("-"))).toBe("light");
  });

  it("maps the first legacy dark value to dark", () => {
    expect(normalizeTheme(["noctis", "neon"].join("-"))).toBe("dark");
  });

  it("maps the second legacy dark value to dark", () => {
    expect(normalizeTheme(["imperium", "night"].join("-"))).toBe("dark");
  });

  it("returns system when no stored theme exists", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("reads the stored theme from localStorage", () => {
    window.localStorage.setItem(DOMUS_THEME_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("migrates legacy stored themes", () => {
    window.localStorage.setItem(DOMUS_THEME_KEY, ["imperium", "night"].join("-"));
    expect(getStoredTheme()).toBe("dark");
  });

  it("normalizes invalid stored themes to system", () => {
    window.localStorage.setItem(DOMUS_THEME_KEY, "garbage");
    expect(getStoredTheme()).toBe("system");
  });

  it("identifies the light preference as non-dark", () => {
    expect(isDarkTheme("light")).toBe(false);
  });

  it("identifies the dark preference as dark", () => {
    expect(isDarkTheme("dark")).toBe(true);
  });

  it("resolves system from matchMedia", () => {
    expect(resolveTheme("system")).toBe("light");
    matchMediaController.setMatches(true);
    expect(resolveTheme("system")).toBe("dark");
  });

  it("identifies system as dark when the device prefers dark mode", () => {
    matchMediaController.setMatches(true);
    expect(isDarkTheme("system")).toBe(true);
  });

  it("applies explicit light mode to the document element", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute(DOMUS_THEME_ATTRIBUTE)).toBe("light");
  });

  it("applies explicit dark mode to the document element", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute(DOMUS_THEME_ATTRIBUTE)).toBe("dark");
  });

  it("clears the document attribute for system mode", () => {
    document.documentElement.setAttribute(DOMUS_THEME_ATTRIBUTE, "dark");
    applyTheme("system");
    expect(document.documentElement.getAttribute(DOMUS_THEME_ATTRIBUTE)).toBeNull();
  });

  it("persists and applies the selected theme", () => {
    setTheme("dark");
    expect(window.localStorage.getItem(DOMUS_THEME_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute(DOMUS_THEME_ATTRIBUTE)).toBe("dark");
  });

  it("notifies listeners when the system theme changes", () => {
    const onChange = vi.fn();
    const unsubscribe = onSystemThemeChange(onChange);

    matchMediaController.setMatches(true);
    expect(onChange).toHaveBeenCalledWith("dark");

    unsubscribe();
  });
});
