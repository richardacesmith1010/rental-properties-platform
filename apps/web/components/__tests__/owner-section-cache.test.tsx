import { useContext } from "react";
import { act, renderHook, waitFor, render, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useOwnerSectionCache, useDashboardNavigation, OwnerSectionCacheContext,
  type OwnerSectionCacheProps
} from "@/components/dashboard/dashboard-section-loaders";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import type { OwnerSectionResult } from "@/lib/owner-section-transport";
import { encodeSectionValue } from "@/lib/owner-section-transport";
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
let sectionLoad = vi.fn();
function fixture(): OwnerSectionCacheProps {
  sectionLoad = vi.fn().mockResolvedValue(ready("fetched"));
  return {
    account: "account-a", property: null, loadedBundles: ["dashboard", "portfolio"],
    requirements: { maintenance: ["tickets"], overview: ["tickets"], portfolio: [], charges: ["owner-connected-map"] }
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
    <div data-testid="mode">{String(navigation.isOwnerDailyOpsHomePage)}</div>
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
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const params = new URL(url, window.location.origin).searchParams;
      const input = Object.fromEntries(params) as Record<string, unknown>;
      if (input.preload === "1") input.preload = true;
      const result = await sectionLoad(input);
      return { ok: true, json: async () => result.status === "ready"
        ? { ...result, data: encodeSectionValue(result.data) } : result };
    }));
    window.history.replaceState(null, "", "/owner?section=portfolio");
    window.scrollTo = vi.fn();
  });

  it("loads missing Home bundles immediately through the section cache and merges the result", async () => {
    const props = fixture();
    props.requirements["daily-ops-home"] = ["tickets", "invitations", "expenses", "manager-payments", "feedback"];
    sectionLoad = vi.fn().mockResolvedValue({ status: "ready", data: {
      tickets: [{ id: "repair-1" }], invitations: [{ id: "invite-1" }],
      expenses: { expenses: [{ id: "expense-1" }] }, loadedBundles: props.requirements["daily-ops-home"]
    } });
    window.history.replaceState(null, "", "/owner");
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => { result.current.loadHome(); result.current.loadHome(); });
    await waitFor(() => expect(result.current.hasBundles("daily-ops-home")).toBe(true));
    expect(sectionLoad).toHaveBeenCalledOnce();
    expect(sectionLoad).toHaveBeenCalledWith(expect.objectContaining({ section: "daily-ops-home" }));
    expect(result.current.data.tickets?.[0].id).toBe("repair-1");
    expect(result.current.data.invitations?.[0].id).toBe("invite-1");
    expect(result.current.homeError).toBe(false);
  });

  it("marks a failed Home request without changing the essential cache", async () => {
    const props = fixture();
    props.requirements["daily-ops-home"] = ["tickets"];
    sectionLoad = vi.fn().mockResolvedValue({ error: "failed" });
    window.history.replaceState(null, "", "/owner");
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.loadHome());
    await waitFor(() => expect(result.current.homeError).toBe(true));
    expect(result.current.hasBundles("daily-ops-home")).toBe(false);
    expect(result.current.data.tickets).toBeUndefined();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("discards a Home response after the account scope changes", async () => {
    const props = fixture();
    props.requirements["daily-ops-home"] = ["tickets"];
    const homeRequest = deferred();
    sectionLoad = vi.fn().mockReturnValue(homeRequest.promise);
    window.history.replaceState(null, "", "/owner");
    const { result, rerender } = renderHook(useOwnerSectionCache, { initialProps: props });
    act(() => result.current.loadHome());
    expect(sectionLoad).toHaveBeenCalledOnce();

    rerender({ ...props, account: "account-b" });
    await act(async () => homeRequest.resolve(ready("stale-repair")));
    expect(result.current.data.tickets).toBeUndefined();
    expect(result.current.homeError).toBe(false);
  });

  it("preloads hovered sections serially with one request in flight", async () => {
    vi.useFakeTimers();
    const next = deferred(), previous = deferred();
    const props = fixture();
    props.requirements = { portfolio: [], maintenance: ["tickets"], charges: ["owner-connected-map"] };
    sectionLoad = vi.fn().mockReturnValueOnce(next.promise).mockReturnValueOnce(previous.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));

    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(sectionLoad).toHaveBeenCalledTimes(1);
    expect(sectionLoad).toHaveBeenNthCalledWith(1, expect.objectContaining({ section: "maintenance", preload: true }));

    act(() => result.current.preloadSection("charges"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(sectionLoad).toHaveBeenCalledTimes(1);
    await act(async () => next.resolve(readyBundle("tickets", "next")));
    expect(sectionLoad).toHaveBeenCalledTimes(2);
    expect(sectionLoad).toHaveBeenNthCalledWith(2, expect.objectContaining({ section: "charges", preload: true }));
    await act(async () => previous.resolve(readyBundle("owner-connected-map", "previous")));
    vi.useRealTimers();
  });

  it("waits 150 ms, cancels a short hover, and deduplicates focus", async () => {
    vi.useFakeTimers();
    const props = fixture();
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(149));
    expect(sectionLoad).not.toHaveBeenCalled();
    act(() => result.current.cancelScheduledPreload());
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(sectionLoad).not.toHaveBeenCalled();
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(150));
    expect(sectionLoad).toHaveBeenCalledOnce();
    act(() => result.current.preloadSection("maintenance"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(sectionLoad).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("cancels a queued focus preload while another request finishes", async () => {
    vi.useFakeTimers();
    const props = fixture();
    const pending = deferred();
    sectionLoad = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.preloadSection("maintenance"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.preloadSection("charges"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.cancelScheduledPreload());
    await act(async () => pending.resolve(ready("preloaded")));
    expect(sectionLoad).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("skips loaded sections and preloads focused Home", async () => {
    vi.useFakeTimers();
    const props = fixture();
    props.requirements = { "daily-ops-home": ["tickets"], portfolio: [], charges: ["owner-connected-map"] };
    props.loadedBundles.push("owner-connected-map");
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.preloadSection("charges"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(sectionLoad).not.toHaveBeenCalled();
    act(() => result.current.preloadSection("overview"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(sectionLoad).toHaveBeenCalledOnce();
    expect(sectionLoad).toHaveBeenCalledWith(expect.objectContaining({ section: "daily-ops-home", preload: true }));
    vi.useRealTimers();
  });

  it("does not preload during a click load, with data saver, or while hidden", async () => {
    vi.useFakeTimers();
    const click = deferred();
    const props = fixture();
    sectionLoad = vi.fn().mockReturnValue(click.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(sectionLoad).toHaveBeenCalledOnce();
    await act(async () => click.resolve(ready("click")));

    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(sectionLoad).toHaveBeenCalledOnce();
    Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(sectionLoad).toHaveBeenCalledOnce();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.useRealTimers();
  });

  it("reuses an in-flight preload when clicked and renders its data", async () => {
    vi.useFakeTimers();
    const preload = deferred();
    const props = fixture();
    sectionLoad = vi.fn().mockReturnValue(preload.promise);
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(sectionLoad).toHaveBeenCalledOnce();
    await act(async () => preload.resolve(ready("preloaded")));
    expect(result.current.data.tickets?.[0].id).toBe("preloaded");
    expect(result.current.loading).toBe(false);
    vi.useRealTimers();
  });

  it("silently discards failed or stale preloads after server props and scope changes", async () => {
    vi.useFakeTimers();
    const stale = deferred();
    const props = fixture();
    sectionLoad = vi.fn().mockReturnValue(stale.promise);
    const { result, rerender } = renderHook(
      (input: OwnerSectionCacheProps) => useOwnerSectionCache(input), { initialProps: props }
    );
    act(() => result.current.preloadSection("maintenance", 150));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    rerender({ ...props, loadedBundles: [...props.loadedBundles] });
    await act(async () => stale.resolve(ready("stale")));
    expect(result.current.data).toEqual({});
    expect(router.refresh).not.toHaveBeenCalled();

    const rejected = deferred();
    sectionLoad = vi.fn().mockReturnValue(rejected.promise);
    const scopedProps = { ...props };
    rerender(scopedProps);
    act(() => result.current.preloadSection("maintenance", 150));
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
    expect(sectionLoad).not.toHaveBeenCalled();
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
    expect(sectionLoad).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("discards out-of-order responses", async () => {
    const first = deferred(), second = deferred();
    const props = fixture();
    sectionLoad = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
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
    sectionLoad = vi.fn().mockReturnValue(pending.promise);
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
    sectionLoad = load;
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
    expect(sectionLoad).toHaveBeenCalledTimes(1);
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
      sectionLoad = vi.fn().mockResolvedValue(failure);
      const { result } = renderHook(() => useOwnerSectionCache(props));
      act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
      expect(window.location.search).toBe("?section=maintenance");
      expect(router.replace).not.toHaveBeenCalled();
    }
  );

  it("handles rejected requests with refresh", async () => {
    const props = fixture();
    sectionLoad = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });

  it("invalidates in-flight data on browser back/forward and refreshes the target URL", async () => {
    const pending = deferred();
    const props = fixture();
    sectionLoad = vi.fn().mockReturnValue(pending.promise);
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
    sectionLoad = vi.fn().mockReturnValue(pending.promise);
    const view = render(<NavigationHarness {...props} serverTickets="server-original" />);
    fireEvent.click(screen.getByRole("button", { name: "Maintenance" }));
    expect(screen.getByTestId("section")).toHaveTextContent("maintenance");
    expect(screen.getByTestId("visible")).toHaveTextContent("loading");
    await act(async () => pending.resolve(ready("fetched")));
    expect(screen.getByTestId("visible")).toHaveTextContent("fetched");
    view.rerender(<NavigationHarness {...props} loadedBundles={[...props.loadedBundles, "tickets"]} serverTickets="fresh-server" />);
    expect(screen.getByTestId("visible")).toHaveTextContent("fresh-server");
    expect(sectionLoad).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("opens Expenses without a mode or full server navigation", async () => {
    const props = fixture();
    render(<NavigationHarness {...props} serverTickets="server" />);
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));
    expect(router.replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?section=expenses");
    await waitFor(() => expect(sectionLoad).toHaveBeenCalledOnce());
  });

  it("uses initial deep-link data without a section action", () => {
    window.history.replaceState(null, "", "/owner?section=maintenance");
    const props = fixture();
    props.loadedBundles.push("tickets");
    render(<NavigationHarness {...props} serverTickets="deep-link-server" />);
    expect(screen.getByTestId("section")).toHaveTextContent("maintenance");
    expect(screen.getByTestId("visible")).toHaveTextContent("deep-link-server");
    expect(sectionLoad).not.toHaveBeenCalled();
  });

  it.each(["new_tenant", "records", "daily_ops", "unknown", "__proto__"])("preserves home deep links with mode=%s", mode => {
    window.history.replaceState(null, "", `/owner?mode=${mode}`);
    const props = fixture();
    render(<NavigationHarness {...props} serverTickets="server" />);
    expect(screen.getByTestId("mode")).toHaveTextContent("true");
    expect(window.location.search).toBe("");
    expect(sectionLoad).not.toHaveBeenCalled();
  });

  it("opens legacy Expenses links and removes only mode", () => {
    window.history.replaceState(null, "", "/owner?mode=records&section=expenses&account=account-a&property=property-a");
    render(<NavigationHarness {...fixture()} serverTickets="server" />);
    expect(screen.getByTestId("section")).toHaveTextContent("expenses");
    expect(window.location.search).toBe("?section=expenses&account=account-a&property=property-a");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("reuses cached bundles when only legacy mode changes", async () => {
    const props = fixture();
    const { result, rerender } = renderHook(() => useOwnerSectionCache(props));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(result.current.data.tickets).toHaveLength(1));
    window.history.replaceState(null, "", "/owner?mode=records&section=maintenance");
    rerender();
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(sectionLoad).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
    expect(result.current.data.tickets).toHaveLength(1);
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
