import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTransientNetworkError } from "@/components/ui/use-network-error-retry";
import RootError from "@/app/error";
import OwnerError from "@/app/owner/error";
import ManagerError from "@/app/manager/error";
import TenantError from "@/app/tenant/error";

const { refresh, captureException } = vi.hoisted(() => ({ refresh: vi.fn(), captureException: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/owner" }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

const networkError = () => new TypeError("network error");
const boundaries = [
  { name: "root", component: RootError, heading: "Something went wrong" },
  { name: "owner", component: OwnerError, heading: "Owner dashboard error" },
  { name: "manager", component: ManagerError, heading: "Manager dashboard error" },
  { name: "tenant", component: TenantError, heading: "We couldn't load your tenant dashboard" }
];

beforeEach(() => {
  sessionStorage.clear();
  refresh.mockClear();
  captureException.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("network error retry", () => {
  it("N1 recognizes only transient client network errors", () => {
    const chunk = new Error("chunk could not load");
    chunk.name = "ChunkLoadError";
    const transient = [networkError(), new Error("Load failed"), new Error("Failed to fetch"),
      new Error("NETWORK ERROR"), chunk, new Error("Loading chunk 123 failed.")];
    for (const error of transient) expect(isTransientNetworkError(error)).toBe(true);

    const persistent = [new Error("Network error while saving"), new Error("Cannot read properties of null"),
      new Error("")];
    for (const error of persistent) expect(isTransientNetworkError(error)).toBe(false);
    for (const error of transient) {
      expect(isTransientNetworkError(Object.assign(error, { digest: "server-render" }))).toBe(false);
    }
  });

  it("N2 retries the owner dashboard once and reports a warning", () => {
    const error = networkError();
    const reset = vi.fn();
    render(<OwnerError error={error} reset={reset} />);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading again…");
    expect(screen.queryByRole("heading", { name: "Owner dashboard error" })).not.toBeInTheDocument();
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
      level: "warning", tags: { auto_retry: "started" }
    });
  });

  it("N3 shows the card and reports an error after a retry within 30 seconds", () => {
    sessionStorage.setItem("domus-auto-retry:/owner", String(Date.now()));
    const error = networkError();
    const reset = vi.fn();
    render(<OwnerError error={error} reset={reset} />);
    expect(refresh).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Owner dashboard error" })).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("N3 shows the card when the same boundary receives the next failure", () => {
    const reset = vi.fn();
    const view = render(<OwnerError error={networkError()} reset={reset} />);
    view.rerender(<OwnerError error={networkError()} reset={reset} />);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Owner dashboard error" })).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenLastCalledWith(expect.any(TypeError));
  });

  it("N4 retries again after 31 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T20:35:31Z"));
    sessionStorage.setItem("domus-auto-retry:/owner", String(Date.now() - 31_000));
    const reset = vi.fn();
    render(<OwnerError error={networkError()} reset={reset} />);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("domus-auto-retry:/owner")).toBe(String(Date.now()));
  });

  for (const { name, component: Boundary, heading } of boundaries) {
    it(`N5 ${name} keeps server errors on the card`, () => {
      const error = Object.assign(networkError(), { digest: "server-render" });
      const reset = vi.fn();
      render(<Boundary error={error} reset={reset} />);
      expect(refresh).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    });

    it(`N5 ${name} keeps other errors on the card`, () => {
      const error = new Error("Cannot read properties of null");
      const reset = vi.fn();
      render(<Boundary error={error} reset={reset} />);
      expect(refresh).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    });
  }

  it.each(["getItem", "setItem"] as const)("N6 retries when sessionStorage.%s throws", (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("storage blocked"); });
    const reset = vi.fn();
    render(<OwnerError error={networkError()} reset={reset} />);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading again…");
  });
});
