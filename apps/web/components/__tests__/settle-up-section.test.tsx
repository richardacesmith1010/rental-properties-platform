import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettleUpSection } from "@/components/home-money/settle-up-section";
import type { addPartnerPayment } from "@/app/actions/partners";
import type { PartnerLine } from "@/lib/partners";

const row = (id: string, name: string, projectedPutIn: number, active = true) =>
  ({ id, name, projectedPutIn, active } as PartnerLine);
const rows = [row("a", "Alice", 5000), row("b", "Bob", 2000), row("c", "Cara", 2000)];
function show(options: { rows?: PartnerLine[]; period?: string; action?: ReturnType<typeof vi.fn> } = {}) {
  const action = options.action ?? vi.fn(async () => ({ ok: true as const }));
  render(<SettleUpSection accountId="llc" rows={options.rows ?? rows} period={options.period ?? "All time"}
    allTimeHref="/owner/money?period=all" onAddPayment={action as typeof addPartnerPayment} />);
  return action;
}

describe("SettleUpSection", () => {
  it("8 UI a: All time shows exact title, subtitle, payment rows and amount", () => {
    show();
    expect(screen.getByRole("heading", { name: "Even it out" })).toBeInTheDocument();
    expect(screen.getByText("So everyone has put in the same amount.")).toBeInTheDocument();
    expect(screen.getByText(/Bob pays Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Cara pays Alice/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add as planned" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add all as planned" })).toBeInTheDocument();
    expect(screen.getAllByText("$10")).toHaveLength(2);
  });
  it("8 UI b: another period shows only the all-time link line", () => {
    show({ period: "October" });
    expect(screen.getByRole("link", { name: "See how to even things out in All time." }))
      .toHaveAttribute("href", "/owner/money?period=all");
    expect(screen.queryByRole("heading", { name: "Even it out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add as planned" })).toBeNull();
  });
  it("8 UI c: Add as planned sends the correct direction, cents and payment details", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
    const action = show();
    fireEvent.click(screen.getAllByRole("button", { name: "Add as planned" })[0]);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ accountId: "llc", fromPartnerId: "b", toPartnerId: "a",
      amountCents: 1000, paidOn: "2026-10-31", kind: "settle_up",
      status: "planned", note: "Even it out" });
    vi.useRealTimers();
  });
  it("8 UI d: Add all saves in order and stops at the first error", async () => {
    const action = vi.fn().mockResolvedValueOnce({ ok: false, error: "Could not save." });
    show({ action });
    fireEvent.click(screen.getByRole("button", { name: "Add all as planned" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save."));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0].fromPartnerId).toBe("b");
  });
  it("8 UI d: Add all saves every suggestion in order on success", async () => {
    const action = show();
    fireEvent.click(screen.getByRole("button", { name: "Add all as planned" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls.map(([input]) => input.fromPartnerId)).toEqual(["b", "c"]);
  });
  it("8 UI e: no suggestions shows the about-the-same line", () => {
    show({ rows: [row("a", "Alice", 20000), row("b", "Bob", 20000)] });
    expect(screen.getByText("Everyone has put in about the same.")).toBeInTheDocument();
  });
  it("8 UI f: fewer than two active partners renders nothing", () => {
    show({ rows: [row("a", "Alice", 20000), row("b", "Bob", 0, false)] });
    expect(screen.queryByText("Even it out")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
