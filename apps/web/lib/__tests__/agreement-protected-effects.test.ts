import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ role: "tenant", rows: vi.fn(), insert: vi.fn(), upsert: vi.fn(), update: vi.fn(),
  delete: vi.fn(), rpc: vi.fn(), signUp: vi.fn(), storage: vi.fn(), stripe: vi.fn(), email: vi.fn(), enqueue: vi.fn(),
  ai: vi.fn(), aiConstructor: vi.fn(), loader: vi.fn(), getUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-domus-path": "/tenant" }) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { throw error; },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/auth", async (original) => ({ ...await original<typeof import("@/lib/auth")>(),
  getCurrentUserRole: async () => m.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  auth: { getUser: m.getUser, signUp: m.signUp },
  from: () => ({ select: m.rows, insert: m.insert, upsert: m.upsert, update: m.update, delete: m.delete }),
  rpc: m.rpc, storage: { from: m.storage }
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ insert: m.insert, upsert: m.upsert, update: m.update, delete: m.delete }), rpc: m.rpc,
  storage: { from: m.storage }, auth: { signUp: m.signUp }
}) }));
vi.mock("@/lib/autopay", () => ({ createStripeCustomer: m.stripe, createSetupCheckoutSession: m.stripe }));
vi.mock("@/lib/stripe", () => ({ createStripeCheckoutSession: m.stripe }));
vi.mock("@/lib/notifications", () => ({ createNotificationWithDelivery: m.enqueue, notifyPropertyTeam: m.enqueue,
  notifyOwnerOfStripeIssue: m.enqueue }));
vi.mock("@/lib/platform-alerts", () => ({ sendPlatformAlert: m.email }));
vi.mock("@/app/owner/owner-section-data-core", () => ({ loadOwnerSectionDataForUser: m.loader }));
vi.mock("@anthropic-ai/sdk", async (original) => ({ ...await original<typeof import("@anthropic-ai/sdk")>(),
  default: class { constructor() { m.aiConstructor(); } messages = { create: m.ai, stream: m.ai }; }
}));
import { markTaskDone } from "@/app/actions/account-tasks";
import { setExpensePaidBy } from "@/app/actions/partners";
import { initiateStripeConnect } from "@/app/actions/connect";
import { executeApprovedWithdrawal } from "@/app/actions/withdrawals";
import { setupAutopay } from "@/app/actions/autopay";
import { payWithCard } from "@/app/actions/charges";
import { createMaintenanceTicket } from "@/app/actions/maintenance-ticket-actions";
import { updateProperty } from "@/app/actions/properties";
import { GET as ownerSection } from "@/app/api/owner/section-data/route";
import { POST as chat } from "@/app/api/ai/chat/route";
function expectNoEffects() {
  for (const effect of [m.insert, m.upsert, m.update, m.delete, m.rpc, m.signUp, m.storage, m.stripe, m.email,
    m.enqueue, m.ai, m.aiConstructor, m.loader]) expect(effect).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn()); m.role = "tenant";
  m.getUser.mockResolvedValue({ data: { user: { id: "p", email: "p@example.com", created_at: "2026-10-30T12:00:00Z" } }, error: null });
  m.rows.mockResolvedValue({ data: [], error: null });
});
describe("agreement before protected effects", () => {
  it.each([
    ["setupAutopay", () => setupAutopay(null, new FormData()), "tenant"],
    ["rent checkout", () => payWithCard(new FormData()), "tenant"],
    ["maintenance create", () => createMaintenanceTicket(null, new FormData()), "tenant"],
    ["owner update", () => updateProperty(null, new FormData()), "owner"],
    ["task update", () => markTaskDone("task"), "owner"],
    ["partner attribution", () => setExpensePaidBy("expense", null), "owner"],
    ["connect wrapper", () => initiateStripeConnect(), "owner"],
    ["withdrawal wrapper", () => executeApprovedWithdrawal(null, new FormData()), "owner"]
  ] as const)("N2 %s redirects before any protected effect", async (_name, invoke, role) => {
    m.role = role; await expect(invoke()).rejects.toThrow("REDIRECT:/agree?next=%2Ftenant"); expectNoEffects();
  });
  it.each([
    ["owner section", () => ownerSection(new Request("https://domusbase.com/api/owner/section-data?section=daily-ops-home"))],
    ["AI chat", () => chat(new Request("https://domusbase.com/api/ai/chat", {
      method: "POST", body: JSON.stringify({ message: "hello" }) }))]
  ] as const)("N2 %s returns 403 before any protected effect", async (_name, invoke) => {
    m.role = "owner"; const response = await invoke(); expect(response.status).toEqual(403);
    expect(await response.json()).toEqual({ error: "Please agree to the Terms first." }); expectNoEffects();
  });
  it("G12 owner route returns its normal response after current agreement", async () => {
    m.rows.mockResolvedValue({ data: [{ profile_id: "p", terms_version: "2026-10-30", privacy_version: "2026-10-30" }], error: null });
    m.loader.mockResolvedValue({ status: "ready", data: {} });
    const response = await ownerSection(new Request("https://domusbase.com/api/owner/section-data?section=daily-ops-home"));
    expect(response.status).toEqual(200); expect(m.loader).toHaveBeenCalledTimes(1);
  });
});
