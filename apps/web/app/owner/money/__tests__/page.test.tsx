import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), properties: vi.fn(), money: vi.fn(), alerts: vi.fn(), cash: vi.fn(),
  administered: vi.fn(), partner: vi.fn(), error: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/property-access", () => ({ getAdministeredProperties: mocks.administered }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ in: mocks.properties }) })
}) }));
vi.mock("@/lib/home-money", () => ({
  loadHomeMoney: mocks.money, loadHomeAlerts: mocks.alerts, combineHomeMoney: () => ({
    entries: [], totals: { inCents: 0, outCents: 0, leftCents: 0 }
  })
}));
vi.mock("@/lib/cash-on-hand", () => ({ loadCashOnHand: mocks.cash }));
vi.mock("@/lib/partners", () => ({ loadPartnerReport: mocks.partner, singleSelectedAccount: () => null }));
vi.mock("@/app/actions/partners", () => ({
  addPartner: vi.fn(), renamePartner: vi.fn(), deactivatePartner: vi.fn(),
  addPartnerPayment: vi.fn(), updatePartnerPayment: vi.fn(), deletePartnerPayment: vi.fn()
}));
vi.mock("@/components/home-money/home-money-page", () => ({
  HomeMoneyPage: () => <div>Money loaded</div>
}));
vi.mock("@/components/dashboard/owner-bottom-bar", () => ({ OwnerBottomBar: () => null }));

import OwnerMoneyPage from "../page";

describe("OwnerMoneyPage load failures", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(mocks.error);
    mocks.requireRole.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.administered.mockResolvedValue([{ id: "home-1" }]);
    mocks.money.mockResolvedValue({ entries: [], totals: { inCents: 0, outCents: 0, leftCents: 0 } });
    mocks.alerts.mockResolvedValue([]);
    mocks.cash.mockResolvedValue([]);
    mocks.properties.mockResolvedValue({ data: [{ id: "home-1", name: "Home", owner_account_id: null }], error: null });
  });

  it("retries a transient money load and renders the page", async () => {
    mocks.money.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    render(await OwnerMoneyPage({}));
    expect(screen.getByText("Money loaded")).toBeTruthy();
    expect(mocks.money).toHaveBeenCalledTimes(2);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("shows status and logs once after two transient failures", async () => {
    mocks.money.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    render(await OwnerMoneyPage({}));
    expect(screen.getByText("Numbers are not ready. Try again later.")).toBeTruthy();
    expect(mocks.money).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0][0]).toBe("[owner-money-load-failed]");
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "money-alerts", code: "ETIMEDOUT" });
  });

  it("logs a non-transient error without retrying", async () => {
    mocks.money.mockRejectedValue(Object.assign(new Error("bad input"), { code: "22000" }));
    render(await OwnerMoneyPage({}));
    expect(screen.getByText("Numbers are not ready. Try again later.")).toBeTruthy();
    expect(mocks.money).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "money-alerts", code: "22000" });
  });

  it("retries a 500 properties query and logs a final failure", async () => {
    mocks.properties.mockResolvedValue({ data: null, error: { status: 503, code: "server_error" } });
    render(await OwnerMoneyPage({}));
    expect(screen.getByText("Numbers are not ready. Try again later.")).toBeTruthy();
    expect(mocks.properties).toHaveBeenCalledTimes(2);
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "properties", status: 503 });
  });

  it("logs a cash warning while rendering money", async () => {
    mocks.cash.mockRejectedValue(new Error("private@example.com"));
    render(await OwnerMoneyPage({}));
    expect(screen.getByText("Money loaded")).toBeTruthy();
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "cash-on-hand", message: "Request failed" });
  });
});
