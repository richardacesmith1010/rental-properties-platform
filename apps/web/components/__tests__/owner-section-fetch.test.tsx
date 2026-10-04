import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnerSectionCache, type OwnerSectionCacheProps } from "@/components/dashboard/owner-section-cache";
import { encodeSectionValue } from "@/lib/owner-section-transport";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search)
}));
const ready = () => ({ ok: true, json: async () => ({ status: "ready", data: encodeSectionValue({
  loadedBundles: ["tickets"], tickets: [{ id: "ticket-1" }]
}) }) });
function deferred() {
  let resolve!: (response: ReturnType<typeof ready>) => void;
  const promise = new Promise<ReturnType<typeof ready>>(res => { resolve = res; });
  return { promise, resolve };
}
function props(): OwnerSectionCacheProps {
  return { account: "account-1", property: null, loadedBundles: [],
    requirements: { portfolio: [], maintenance: ["tickets"], charges: ["owner-connected-map"] } };
}
function signal(index: number) {
  return vi.mocked(fetch).mock.calls[index][1]!.signal!;
}

describe("owner section fetch lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ready()));
    window.history.replaceState(null, "", "/owner?section=portfolio");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("uses only GET, updates history and never refreshes or replaces on success", async () => {
    const input = props();
    const { result } = renderHook(() => useOwnerSectionCache(input));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/owner/section-data?section=maintenance&account=account-1", {
      method: "GET", credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal)
    });
    expect(window.location.search).toBe("?section=maintenance");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("supersedes a standalone click by aborting only its fetch and ignores late success", async () => {
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise as never);
    const input = props();
    const { result } = renderHook(() => useOwnerSectionCache(input));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    act(() => result.current.navigate("/owner?section=portfolio", "portfolio"));
    expect(signal(0).aborted).toBe(true);
    await act(async () => pending.resolve(ready()));
    expect(result.current.data).toEqual({});
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("keeps a shared preload alive when its attached click is superseded and never re-preloads it", async () => {
    vi.useFakeTimers();
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise as never);
    const input = props();
    const { result } = renderHook(() => useOwnerSectionCache(input));
    const preload = () => result.current.preloadNeighbours("portfolio", ["portfolio", "maintenance"]);
    act(preload);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("preload=1");
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    expect(fetch).toHaveBeenCalledOnce();
    act(() => result.current.navigate("/owner?section=portfolio", "portfolio"));
    expect(signal(0).aborted).toBe(false);
    await act(async () => pending.resolve(ready()));
    act(preload);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.data.tickets?.[0].id).toBe("ticket-1");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(["scope", "epoch", "unmount"])("aborts both preload and standalone click on %s invalidation", async kind => {
    vi.useFakeTimers();
    const pending = deferred();
    vi.mocked(fetch).mockReturnValue(pending.promise as never);
    const input = props();
    const { result, rerender, unmount } = renderHook(useOwnerSectionCache, { initialProps: input });
    act(() => result.current.preloadNeighbours("portfolio", ["portfolio", "maintenance"]));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.navigate("/owner?section=charges", "charges"));
    expect(fetch).toHaveBeenCalledTimes(2);
    if (kind === "scope") {
      window.history.replaceState(null, "", "/owner?account=account-2");
      rerender(input);
    } else if (kind === "epoch") rerender({ ...input, loadedBundles: [] });
    else unmount();
    expect(signal(0).aborted).toBe(true);
    expect(signal(1).aborted).toBe(true);
    await act(async () => pending.resolve(ready()));
    if (kind !== "unmount") expect(result.current.data).toEqual({});
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(["401", "network", "decode", "status"])("refreshes on click %s failure", async kind => {
    if (kind === "401") vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    if (kind === "network") vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    if (kind === "decode") vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "ready", data: {} }) } as Response);
    if (kind === "status") vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "needs-setup" }) } as Response);
    const input = props();
    const { result } = renderHook(() => useOwnerSectionCache(input));
    act(() => result.current.navigate("/owner?section=maintenance", "maintenance"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each(["network", "decode"])("keeps %s preload failures silent without duplicate re-preloads", async kind => {
    vi.useFakeTimers();
    if (kind === "network") vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    else vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "ready", data: {} }) } as Response);
    const input = props();
    const { result } = renderHook(() => useOwnerSectionCache(input));
    for (let attempt = 0; attempt < 2; attempt++) {
      act(() => result.current.preloadNeighbours("portfolio", ["portfolio", "maintenance"]));
      await act(async () => vi.advanceTimersByTimeAsync(300));
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
