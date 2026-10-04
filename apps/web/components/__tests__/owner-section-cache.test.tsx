import { useContext } from "react";
import { act, renderHook, waitFor, render, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useOwnerSectionCache, useDashboardNavigation, OwnerSectionCacheContext,
  type OwnerSectionCacheProps
} from "@/components/dashboard/dashboard-section-loaders";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import type { OwnerSectionResult } from "@/app/actions/owner-section-data";
import type { DashboardProps } from "@/components/dashboard/types";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/owner",
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

function deferred() {
  let resolve!: (result: OwnerSectionResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<OwnerSectionResult>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function ready(id: string): OwnerSectionResult {
  return { status: "ready", data: { tickets: [{ id } as never], loadedBundles: ["tickets"] } };
}
function readyBundle(bundle: "tickets" | "owner-connected-map", id: string): OwnerSectionResult {
  return { status: "ready", data: { tickets: [{ id } as never], loadedBundles: [bundle] } };
}
function fixture(): OwnerSectionCacheProps {
  return {
    account: "account-a", property: null, loadedBundles: ["dashboard", "portfolio"],
    requirements: { maintenance: ["tickets"], overview: ["tickets"], portfolio: [], charges: ["owner-connected-map"] },
    loadSection: vi.fn().mockResolvedValue(ready("fetched"))
  };
}


function NavigationContent({ serverTickets }: { serverTickets: string }) {
  const cache = useContext(OwnerSectionCacheContext)!;
  const navigation = useDashboardNavigation({
    data: { profileRole: "owner" }, initialSectionId: "portfolio", initialOwnerWorkflowMode: "daily_ops"
  } as DashboardProps, {
    isOwnerRole: true, isManagerRole: false, hasExpensesSection: true,
    hasAnalyticsSection: true, hasManagerPaymentsSection: true
  } as never);
  return <>
    <button onClick={() => navigation.openSection("maintenance")}>Maintenance</button>
    <button onClick={() => navigation.openSection("expenses")}>Expenses</button>
    <button onClick={() => {
      cache.fullNavigate("/owner?section=portfolio&property=property-b");
      navigation.openSection("maintenance");
    }}>Property then section</button>
    <div data-testid="visible">{navigation.isSectionLoading ? "loading" : cache.data.tickets?.[0].id ?? serverTickets}</div>
    <div data-testid="section">{navigation.activeSection}</div>
    <div data-testid="mode">{navigation.ownerWorkflowMode}|{String(navigation.isOwnerDailyOpsHomePage)}</div>
  </>;
}
function NavigationHarness(props: OwnerSectionCacheProps & { serverTickets: string }) {
  const cache = useOwnerSectionCache(props);
  return <OwnerSectionCacheContext.Provider value={cache}>
    <NavigationContent serverTickets={props.serverTickets} />
  </OwnerSectionCacheContext.Provider>;
}

describe("owner section cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/owner?section=portfolio");
    window.scrollTo = vi.fn();
  });

  it("preloads the next neighbour before the previous with one request in flight", async () => {
    vi.useFakeTimers();
    const next = deferred(), previous = deferred();
    const props = fixture();
    props.requirements = { portfolio: [], maintenance: ["tickets"], charges: ["owner-connected-map"] };
    props.loadSection = vi.fn().mockReturnValueOnce(next.promise).mockReturnValueOnce(previous.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));

    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(props.loadSection).toHaveBeenCalledTimes(1);
    expect(props.loadSection).toHaveBeenNthCalledWith(1, expect.objectContaining({ section: "maintenance", preload: true }));

    await act(async () => next.resolve(readyBundle("tickets", "next")));
    expect(props.loadSection).toHaveBeenCalledTimes(2);
    expect(props.loadSection).toHaveBeenNthCalledWith(2, expect.objectContaining({ section: "charges", preload: true }));
    await act(async () => previous.resolve(readyBundle("owner-connected-map", "previous")));
    vi.useRealTimers();
  });

  it("skips loaded neighbours and respects wrap-around in the supplied available list", async () => {
    vi.useFakeTimers();
    const props = fixture();
    props.requirements = { overview: ["tickets"], portfolio: [], charges: ["owner-connected-map"] };
    props.loadedBundles.push("owner-connected-map");
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.preloadNeighbours("charges", ["overview", "portfolio", "charges"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(props.loadSection).toHaveBeenCalledOnce();
    expect(props.loadSection).toHaveBeenCalledWith(expect.objectContaining({ section: "overview", preload: true }));
    vi.useRealTimers();
  });

  it("does not preload during a click load, with data saver, or while hidden", async () => {
    vi.useFakeTimers();
    const click = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValue(click.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(props.loadSection).toHaveBeenCalledOnce();
    await act(async () => click.resolve(ready("click")));

    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(props.loadSection).toHaveBeenCalledOnce();
    Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(props.loadSection).toHaveBeenCalledOnce();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.useRealTimers();
  });

  it("reuses an in-flight preload when clicked and renders its data", async () => {
    vi.useFakeTimers();
    const preload = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValue(preload.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(props.loadSection).toHaveBeenCalledOnce();
    await act(async () => preload.resolve(ready("preloaded")));
    expect(result.current.data.tickets?.[0].id).toBe("preloaded");
    expect(result.current.loading).toBe(false);
    vi.useRealTimers();
  });

  it("silently discards failed or stale preloads after server props and scope changes", async () => {
    vi.useFakeTimers();
    const stale = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValue(stale.promise);
    const { result, rerender } = renderHook(
      (input: OwnerSectionCacheProps) => useOwnerSectionCache(input), { initialProps: props }
    );
    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    rerender({ ...props, loadedBundles: [...props.loadedBundles] });
    await act(async () => stale.resolve(ready("stale")));
    expect(result.current.data).toEqual({});
    expect(router.refresh).not.toHaveBeenCalled();

    const rejected = deferred();
    const scopedProps = { ...props, loadSection: vi.fn().mockReturnValue(rejected.promise) };
    rerender(scopedProps);
    act(() => result.current.preloadNeighbours("portfolio", ["charges", "portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    window.history.replaceState(null, "", "/owner?account=account-b&section=portfolio");
    rerender(scopedProps);
    await act(async () => rejected.reject(new Error("offline")));
    expect(result.current.data).toEqual({});
    expect(router.refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("uses zero requests for server-loaded bundles", () => {
    const props = fixture();
    props.loadedBundles.push("tickets");
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(props.loadSection).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(window.location.search).toBe("?section=maintenance");
  });

  it("fetches once, displays fetched data, and reuses it on revisit", async () => {
    const props = fixture();
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data.tickets?.[0].id).toBe("fetched"));
    act(() => result.current.navigate("/owner?section=portfolio", "portfolio"));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(props.loadSection).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("discards out-of-order responses", async () => {
    const first = deferred(), second = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    act(() => result.current.navigate("/owner?section=overview", "overview"));
    await act(async () => second.resolve(ready("newer")));
    await act(async () => first.resolve(ready("older")));
    expect(result.current.data.tickets?.[0].id).toBe("newer");
  });

  it("invalidates a pending request when navigating to a cached section", async () => {
    const pending = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    act(() => result.current.navigate("/owner?section=portfolio", "portfolio"));
    await act(async () => pending.resolve(ready("stale")));
    expect(result.current.data).toEqual({});
    expect(result.current.loading).toBe(false);
  });

  it("fresh server props clear the overlay and discard responses from before a mutation refresh", async () => {
    const pending = deferred();
    const props = fixture();
    const load = vi.fn().mockResolvedValueOnce(ready("cached")).mockReturnValueOnce(pending.promise);
    props.loadSection = load;
    const { result, rerender } = renderHook((input: OwnerSectionCacheProps) => useOwnerSectionCache(input), { initialProps: props });
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(result.current.data.tickets?.[0].id).toBe("cached"));
    act(() => result.current.navigate("/owner?section=charges", "charges"));
    act(() => router.refresh());
    rerender({ ...props, loadedBundles: [...props.loadedBundles, "owner-connected-map"] });
    expect(result.current.data).toEqual({});
    await act(async () => pending.resolve(ready("stale")));
    expect(result.current.data).toEqual({});
    expect(result.current.loading).toBe(false);
  });

  it.each([
    "/owner?account=account-b&section=maintenance",
    "/owner?mode=records&section=expenses",
    "/owner?property=property-b&section=maintenance"
  ])("clears synchronously before full navigation to %s and does not reuse bundles", async url => {
    const props = fixture();
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(result.current.data.tickets).toHaveLength(1));
    // Verify invalidation inside router.replace, before any replacement server props arrive.
    const captured = result.current.data;
    expect(captured.tickets).toHaveLength(1);
    act(() => result.current.navigate(url, "maintenance"));
    expect(result.current.data).toEqual({});
    expect(result.current.loading).toBe(true);
    expect(router.replace).toHaveBeenCalledWith(url);
    expect(props.loadSection).toHaveBeenCalledTimes(1);
  });

  it("clears on an externally changed scope before replacement props", async () => {
    const props = fixture();
    const { result, rerender } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(result.current.data.tickets).toHaveLength(1));
    window.history.replaceState(null, "", "/owner?property=property-b&section=maintenance");
    rerender();
    expect(result.current.data).toEqual({});
    act(() => result.current.navigate("/owner?property=property-b&section=maintenance", "maintenance"));
    expect(router.replace).toHaveBeenCalled();
  });

  it.each([{ error: "failed" }, { status: "role-mismatch" }, { status: "needs-onboarding" }, { status: "needs-setup" }])(
    "refreshes the already-requested URL on non-success %j", async failure => {
      const props = fixture();
      props.loadSection = vi.fn().mockResolvedValue(failure);
      const { result } = renderHook(() => useOwnerSectionCache(props));
      act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
      expect(window.location.search).toBe("?section=maintenance");
      expect(router.replace).not.toHaveBeenCalled();
    }
  );

  it("handles rejected requests with refresh", async () => {
    const props = fixture();
    props.loadSection = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });

  it("invalidates in-flight data on browser back/forward and refreshes the target URL", async () => {
    const pending = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    act(() => {
      window.history.replaceState(null, "", "/owner?section=charges");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => pending.resolve(ready("old")));
    expect(result.current.data).toEqual({});
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?section=charges");
  });

  it("renders an unloaded section immediately with a skeleton, then data; server refresh wins", async () => {
    const pending = deferred();
    const props = fixture();
    props.loadSection = vi.fn().mockReturnValue(pending.promise);
    const view = render(<NavigationHarness {...props} serverTickets="server-original" />);
    fireEvent.click(screen.getByRole("button", { name: "Maintenance" }));
    expect(screen.getByTestId("section")).toHaveTextContent("maintenance");
    expect(screen.getByTestId("visible")).toHaveTextContent("loading");
    await act(async () => pending.resolve(ready("fetched")));
    expect(screen.getByTestId("visible")).toHaveTextContent("fetched");
    view.rerender(<NavigationHarness {...props} loadedBundles={[...props.loadedBundles, "tickets"]} serverTickets="fresh-server" />);
    expect(screen.getByTestId("visible")).toHaveTextContent("fresh-server");
    expect(props.loadSection).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps workflow mode changes on full server navigation", () => {
    const props = fixture();
    render(<NavigationHarness {...props} serverTickets="server" />);
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));
    expect(router.replace).toHaveBeenCalledWith("/owner?section=expenses&mode=records");
    expect(props.loadSection).not.toHaveBeenCalled();
    expect(screen.getByTestId("visible")).toHaveTextContent("loading");
  });

  it("uses initial deep-link data without a section action", () => {
    window.history.replaceState(null, "", "/owner?section=maintenance");
    const props = fixture();
    props.loadedBundles.push("tickets");
    render(<NavigationHarness {...props} serverTickets="deep-link-server" />);
    expect(screen.getByTestId("section")).toHaveTextContent("maintenance");
    expect(screen.getByTestId("visible")).toHaveTextContent("deep-link-server");
    expect(props.loadSection).not.toHaveBeenCalled();
  });

  it.each(["daily_ops", "unknown", "__proto__"])("preserves home deep links with mode=%s", mode => {
    window.history.replaceState(null, "", `/owner?mode=${mode}`);
    const props = fixture();
    render(<NavigationHarness {...props} serverTickets="server" />);
    expect(screen.getByTestId("mode")).toHaveTextContent("daily_ops|true");
    expect(props.loadSection).not.toHaveBeenCalled();
  });

  it("preserves a pending property scope when a command also opens a section", () => {
    render(<NavigationHarness {...fixture()} serverTickets="server" />);
    fireEvent.click(screen.getByRole("button", { name: "Property then section" }));
    expect(router.replace).toHaveBeenLastCalledWith("/owner?section=maintenance&property=property-b");
    expect(screen.getByTestId("visible")).toHaveTextContent("loading");
  });

  it("uses full replacement for the real account switcher", () => {
    const navigate = vi.fn();
    render(<AccountSwitcher accounts={[
      { id: "account-a", displayName: "A" }, { id: "account-b", displayName: "B" }
    ] as never} activeAccountId="account-a" onNavigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch ownership account" }));
    fireEvent.click(screen.getByRole("option", { name: "B" }));
    expect(navigate).toHaveBeenCalledWith("/owner?section=portfolio&account=account-b");
    expect(router.push).not.toHaveBeenCalled();
  });
});
