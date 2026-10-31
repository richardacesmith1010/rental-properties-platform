import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ admin: vi.fn(), email: vi.fn(), manage: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/llc-invitation-email", () => ({ sendLLCInvitationEmail: m.email }));
vi.mock("@/lib/llc-invitations", async original => ({ ...await original<typeof import("@/lib/llc-invitations")>(),
  canUserManageLLCInvitations: m.manage }));
vi.mock("@/app/actions/shared", () => ({ ensureCapabilityEnabled: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { sendLLCInvitations, resendLLCInvitation, cancelLLCInvitation } from "../llc-invitations";
import { resetRateLimitState } from "@/lib/rate-limit";
const id = "11111111-1111-4111-8111-111111111111";
const oldToken = `canary-${id}`;
const newToken = `canary-new-${id}`;
const retryToken = `canary-new-22222222-2222-4222-8222-222222222222`;
const joinPath = `/join-llc?token=${oldToken}`;
const agreeUrl = `/agree?next=${encodeURIComponent(joinPath)}`;
const update = vi.fn();
const insert = vi.fn();
type QueryRecord = { table: string; method: string; filters: [string, unknown][] };
let queries: QueryRecord[];
let row: { token: string; status: string; created_at: string };
let losesRace: boolean;
let returnedToken: string | null;
let updateError: { code: string } | null;
let logs: ReturnType<typeof vi.spyOn>[];
function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({ accountId: id, invitationId: id, emails: "invite@example.com" })) f.set(key, value);
  return f;
}
function client() {
  return { from: (table: string) => {
    const record: QueryRecord = { table, method: "select", filters: [] };
    queries.push(record);
    let payload: Partial<typeof row> = {};
    const query = {
      select: () => query, in: () => query,
      eq: (key: string, value: unknown) => { record.filters.push([key, value]); return query; },
      insert: (value: unknown) => { insert(value); record.method = "insert"; return query; },
      update: (value: Partial<typeof row>) => { update(value); payload = value; record.method = "update"; return query; },
      maybeSingle: async () => ({ data: table === "llc_invitations" ? {
        id, ownership_account_id: id, email: "invite@example.com", ...row
      } : table === "ownership_accounts" ? { id, display_name: "LLC" } : { full_name: "Owner" }, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (record.method === "update") {
          if (!losesRace && !updateError) Object.assign(row, payload);
          return Promise.resolve({ data: losesRace ? [] : [{ id, token: returnedToken ?? row.token }], error: updateError }).then(resolve);
        }
        return Promise.resolve({ data: record.method === "insert" ? [{ id, email: "invite@example.com", token: oldToken }] : [],
          error: null }).then(resolve);
      }
    };
    return query;
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState();
  queries = [];
  vi.spyOn(crypto, "randomUUID").mockReturnValue(newToken as `${string}-${string}-${string}-${string}-${string}`);
  row = { token: oldToken, status: "pending", created_at: "2026-01-01" };
  losesRace = false; returnedToken = null; updateError = null;
  m.admin.mockImplementation(client); m.manage.mockResolvedValue(true); m.email.mockResolvedValue(true);
  logs = ["log", "info", "warn", "error", "debug"].map(key =>
    vi.spyOn(console, key as "error").mockImplementation(() => {}));
});
afterEach(() => {
  try {
    for (const log of logs) {
      const text = log.mock.calls.flatMap((args: unknown[]) => args.map(arg => inspect(arg, { depth: 5 }))).join("\n");
      for (const sensitive of ["canary-", joinPath, agreeUrl]) expect(text).not.toContain(sensitive);
    }
  } finally { vi.restoreAllMocks(); }
});
function expectUpdateFilters(count = 1) {
  expect(queries.filter(query => query.method === "update")).toEqual(
    Array.from({ length: count }, () => ({ table: "llc_invitations", method: "update", filters: [["id", id], ["status", "pending"]] }))
  );
}
describe("LLC management through admin reads and conditional writes", () => {
  it("T3,T13 send inserts and emails without serializing its token", async () => {
    const result = await sendLLCInvitations(null, form());
    expect(result).toEqual({ success: true, message: "Sent 1 invitation." });
    expect(insert.mock.calls).toEqual([[[{ ownership_account_id: id, invited_by: "owner", email: "invite@example.com",
      status: "pending" }]]]);
    expect(m.email.mock.calls[0][0].acceptUrl).toEqual(`https://domusbase.com/join-llc?token=${oldToken}`);
    expect(JSON.stringify(result)).not.toContain("canary-");
  });
  it("T4,T13 resend rotates before delivery, using the returned token", async () => {
    returnedToken = `canary-returned-${id}`;
    const result = await resendLLCInvitation(null, form());
    expect(result).toEqual({ success: true, message: "Invitation resent to invite@example.com." });
    expect(update.mock.calls[0][0]).toEqual({ token: newToken, created_at: expect.any(String) });
    expect(row.token).toEqual(newToken);
    expectUpdateFilters();
    expect(m.email.mock.calls[0][0].acceptUrl).toEqual(`https://domusbase.com/join-llc?token=${returnedToken}`);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(m.email.mock.invocationCallOrder[0]);
    expect(JSON.stringify(result)).not.toContain("canary-");
  });
  it("T4 failed delivery leaves the rotated token pending; a retry rotates again and emails", async () => {
    m.email.mockResolvedValueOnce(false);
    expect(await resendLLCInvitation(null, form())).toEqual({ success: false, error: "Unable to resend the invitation email right now." });
    const first = row.token;
    expect(row.status).toEqual("pending"); expect(first).toEqual(newToken);
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(retryToken as `${string}-${string}-${string}-${string}-${string}`);
    expect(await resendLLCInvitation(null, form())).toEqual({ success: true, message: "Invitation resent to invite@example.com." });
    expect(row.status).toEqual("pending"); expect(row.token).toEqual(retryToken);
    expectUpdateFilters(2);
    expect(m.email.mock.calls.map(call => call[0].acceptUrl)).toEqual([
      `https://domusbase.com/join-llc?token=${first}`, `https://domusbase.com/join-llc?token=${row.token}`
    ]);
  });
  it.each(["resend", "cancel"])("T4,T11 %s loses a pending-status race and exposes no token", async kind => {
    losesRace = true;
    const invoke = kind === "resend" ? resendLLCInvitation : cancelLLCInvitation;
    const result = await invoke(null, form());
    expect(result).toEqual({ success: false, error: `Only pending invitations can be ${kind === "resend" ? "resent" : "cancelled"}.` });
    expectUpdateFilters();
    expect(m.email).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("canary-");
  });
  it("T13 cancel returns only public copy and updates only pending invitations", async () => {
    const result = await cancelLLCInvitation(null, form());
    expect(result).toEqual({ success: true, message: "Invitation cancelled for invite@example.com." });
    expect(update.mock.calls).toEqual([[{ status: "cancelled" }]]);
    expectUpdateFilters();
    expect(row.status).toEqual("cancelled"); expect(JSON.stringify(result)).not.toContain("canary-");
  });
  it.each(["resend", "cancel"])("T13 %s update errors return safe owner-facing copy", async kind => {
    updateError = { code: "failed" };
    const result = await (kind === "resend" ? resendLLCInvitation : cancelLLCInvitation)(null, form());
    expect(result).toEqual({ success: false, error: kind === "resend" ?
      "Unable to resend the invitation email right now." : "Unable to cancel that invitation right now." });
    expect(JSON.stringify(result)).not.toContain("canary-"); expect(m.email).not.toHaveBeenCalled();
  });
});
