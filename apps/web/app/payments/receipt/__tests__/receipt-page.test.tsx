import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ payments: [] as Array<Record<string, unknown>>, calls: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "tenant-1" } } }) },
  from: (table: string) => {
    const rows: Record<string, Array<Record<string, unknown>>> = {
      rent_charges: [{ id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01",
        amount_cents: 120000, category: "rent", deleted_at: null }],
      leases: [{ id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" }],
      units: [{ id: "unit-1", unit_number: "1", property_id: "property-1" }],
      properties: [{ id: "property-1", name: "Forum House" }],
      rent_charge_lines: [], payments: state.payments
    };
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let ascending = false;
    let cap = Infinity;
    const result = () => ({ data: (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
      .sort((a, b) => ascending ? String(a.paid_at).localeCompare(String(b.paid_at))
        : String(b.paid_at).localeCompare(String(a.paid_at))).slice(0, cap), error: null });
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      is: (key: string, value: unknown) => { if (table === "payments") state.calls.push(`is:${key}`);
        filters.push((row) => row[key] === value); return query; },
      not: (key: string) => { filters.push((row) => row[key] !== null); return query; },
      order: (_key: string, options: { ascending: boolean }) => { ascending = options.ascending; return query; },
      limit: (value: number) => { if (table === "payments") state.calls.push(`limit:${value}`);
        cap = value; return query; },
      maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return query;
  }
}) }));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: async () => "tenant",
  getAuthenticatedUser: async () => ({ id: "tenant-1" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: () => { throw new Error("REDIRECT"); }
}));

import ReceiptPage from "@/app/payments/receipt/[chargeId]/page";
import PaymentSuccessPage from "@/app/payments/success/page";

const row = (id: string, paidAt: string, reversedAt: string | null) => ({
  id, rent_charge_id: "charge-1", paid_at: paidAt, amount_cents: 120000,
  method: "ach", reference_note: null, reversed_at: reversedAt
});
const render = async () => renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ chargeId: "charge-1" }) }));

describe("tenant receipt page with reversed payments", () => {
  beforeEach(() => { state.payments = []; state.calls = []; });

  it("renders the active payment receipt", async () => {
    state.payments = [row("active-123", "2026-10-02", null)];
    const html = await render();
    expect(html).toContain("Receipt #ACTIVE-1");
    expect(html).toContain("Download PDF");
  });

  it("shows a plain reversed state when every payment was reversed", async () => {
    state.payments = [row("reversed", "2026-10-03", "2026-10-04")];
    const html = await render();
    expect(html).toContain("This payment was reversed");
    expect(html).toContain("It no longer counts as paid.");
    expect(html).toContain("/tenant?section=charges");
    expect(html).not.toMatch(/Receipt #|Download PDF|Print|Amount Paid|Paid badge/);
  });

  it("uses an older active payment when a newer one was reversed", async () => {
    state.payments = [
      ...Array.from({ length: 11 }, (_, index) => row(`reversed-${index}`,
        `2026-10-${String(index + 10).padStart(2, "0")}`, "2026-10-25")),
      row("active-123", "2026-10-03", null), row("active-456", "2026-10-02", null)
    ];
    const html = await render();
    expect(html).toContain("Receipt #ACTIVE-1");
    expect(html).not.toContain("This payment was reversed");
    expect(state.calls).toEqual(["is:reversed_at", "limit:1"]);
  });

  it("keeps no-payment charges distinct from reversed charges", async () => {
    await expect(render()).rejects.toThrow("NOT_FOUND");
  });
});

describe("payment success page", () => {
  it("does not show success for a reversed session payment", async () => {
    state.payments = [{ ...row("reversed", "2026-10-03", "2026-10-04"),
      stripe_checkout_session_id: "session-1" }];
    const html = renderToStaticMarkup(await PaymentSuccessPage({
      searchParams: Promise.resolve({ session_id: "session-1" })
    }));
    expect(html).toContain("This payment did not go through.");
    expect(html).not.toContain("Payment Received");
  });
});
