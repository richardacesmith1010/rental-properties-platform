import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstallDomusSettingsCard, InstallPromptBanner } from "../install-prompt";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function browser(userAgent: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  Object.defineProperty(window, "matchMedia", {
    configurable: true, value: vi.fn().mockReturnValue({ matches: false })
  });
  Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const register = vi.fn().mockResolvedValue({});
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  return register;
}

it("never registers a worker or shows either install surface in the app", () => {
  const register = browser("iPhone DomusApp/1");
  const { container } = render(<><InstallPromptBanner /><InstallDomusSettingsCard /></>);
  expect(container).toBeEmptyDOMElement();
  expect(register).not.toHaveBeenCalled();
});

it("retains service-worker registration and installation in a normal mobile browser", () => {
  const register = browser("iPhone Safari");
  render(<><InstallPromptBanner /><InstallDomusSettingsCard /></>);
  expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js", { scope: "/" });
  expect(screen.getByText("Install Domus for quick access")).toBeInTheDocument();
  expect(screen.getByText("Install Domus App")).toBeInTheDocument();
});
