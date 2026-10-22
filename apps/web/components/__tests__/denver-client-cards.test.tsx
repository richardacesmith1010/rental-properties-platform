import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as calendar from "@/lib/denver-calendar";
import { PayRentCard } from "@/components/dashboard/pay-rent-card";
import { TenantRentCard } from "@/components/dashboard/tenant-rent-card";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));

const action = async () => ({ success: true as const });
const charge = { id: "rent", leaseId: "lease", propertyId: "home", propertyLabel: "Home",
  propertyName: "Home", unitNumber: "1", dueDate: "2026-11-01", amountCents: 120000,
  status: "pending" as const };
function tenant(todayIso: string, dueDate = charge.dueDate) {
  return <TenantRentCard todayIso={todayIso} charges={[{ ...charge, dueDate }]} payState="can_pay"
    rentDueDate={dueDate} rentAmountCents={120000} lastPaidAt={null}
    onPayCharge={action} onRequestManualPaymentConfirmation={action} />;
}
function pay(todayIso: string) {
  return <PayRentCard todayIso={todayIso} charges={[charge]} onPayCharge={action}
    onRequestManualPaymentConfirmation={action} chargesHref="/tenant?section=charges" />;
}

describe("Denver client cards", () => {
  afterEach(() => {
    vi.useRealTimers();
    refresh.mockClear();
    document.body.innerHTML = "";
  });

  it("D10 reads in 1 day and today from the server prop during render", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
    const todaySpy = vi.spyOn(calendar, "todayDenver");
    expect(renderToString(tenant("2026-10-31"))).toContain("in 1 day");
    expect(renderToString(pay("2026-10-31"))).toContain("in 1 day");
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    expect(renderToString(tenant("2026-11-01"))).toContain("today");
    expect(renderToString(pay("2026-11-01"))).toContain("today");
    expect(todaySpy).not.toHaveBeenCalled();
    todaySpy.mockRestore();
  });

  it("D10h hydrates the server day, then refreshes rent eligibility at Denver midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(tenant("2026-10-31", "2026-11-06"));
    const serverHtml = container.innerHTML;
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, tenant("2026-10-31", "2026-11-06")); });
    expect(container.innerHTML).toEqual(serverHtml);
    expect(container.textContent).toContain("Next rent$1,200 on Nov 6.");
    expect(refresh).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.filter((call) => /hydration|did not match/i.test(String(call[0])))).toEqual([]);
    await act(async () => { root!.render(tenant("2026-11-01", "2026-11-06")); });
    expect(container.textContent).toContain("in 5 days");
    expect(container.querySelector("button")?.textContent).toContain("Pay rent");
    await act(async () => { vi.setSystemTime(new Date("2026-11-02T07:00:00Z")); vi.runOnlyPendingTimers(); });
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => { root!.unmount(); });
    errors.mockRestore();
  });
});
