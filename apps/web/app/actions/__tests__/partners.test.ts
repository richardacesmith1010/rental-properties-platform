vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: async () => ({}) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ role: "owner", member: true, accountType: "llc", errorTable: "", errorCode: "XX000", errorOperation: "",
  partnerAccount: "account", partnerActive: true, attribution: null as string | null,
  deleteIds: [] as string[], mutations: [] as string[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: async () => db.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
  rpc: async () => ({ data: db.member, error: null }),
  from: (table: string) => {
    let id = "";
    let operation = "select";
    let payload: Record<string, unknown> = {};
    const row = () => table === "ownership_accounts" ? { account_type: db.accountType }
      : table === "property_expenses" ? { property_id: "home" }
      : table === "properties" ? { owner_account_id: "account" }
      : table === "account_partners" ? db.partnerAccount === "account" && db.partnerActive ? { id: "partner" } : null
      : table === "expense_partner_attributions" ? db.attribution ? { expense_id: "expense", partner_id: db.attribution } : null
      : table === "partner_payments" ? { id: "payment", from_partner_id: other, to_partner_id: null } : null;
    const result = () => {
      db.mutations.push(`${operation}:${table}:${id}`);
      if (table === "expense_partner_attributions" && operation === "insert") db.attribution = payload.partner_id as string;
      if (table === "expense_partner_attributions" && operation === "update") db.attribution = payload.partner_id as string;
      if (table === "expense_partner_attributions" && operation === "delete") db.attribution = null;
      if (table === "partner_payments" && operation === "delete") db.deleteIds.push(id);
      return { data: operation === "insert" ? { id: table === "account_partners" ? "partner" : "payment" } : row(),
        error: db.errorTable === table && (!db.errorOperation || db.errorOperation === operation)
          ? { code: db.errorCode } : null };
    };
    const builder = { select: () => builder, eq: (key: string, value: string) => { if (key === "id") id = value; return builder; },
      in: () => builder, insert: (value: Record<string, unknown>) => { operation = "insert"; payload = value; return builder; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return builder; },
      delete: () => { operation = "delete"; return builder; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => void) => {
        const value = result();
        resolve({ ...value, data: table === "account_partners" ? (value.data ? [value.data] : []) : value.data });
      } };
    return builder;
  }
}) }));
import { addPartner, renamePartner, deactivatePartner, addPartnerPayment,
  updatePartnerPayment, deletePartnerPayment, setExpensePaidBy } from "@/app/actions/partners";
const uuid = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const pay = { accountId: uuid, fromPartnerId: other, toPartnerId: null,
  amountCents: 100, paidOn: "2026-10-12", kind: "settle_up" as const,
  status: "planned" as const, note: null };
beforeEach(() => { db.role = "owner"; db.member = true; db.accountType = "llc"; db.errorTable = "";
  db.partnerAccount = "account"; db.partnerActive = true; db.attribution = null;
  db.errorCode = "XX000"; db.errorOperation = "";
  db.deleteIds = []; db.mutations = []; });
describe("partner actions", () => {
  it("denies a non-owner-member from every mutation", async () => {
    db.member = false;
    const results = await Promise.all([addPartner(uuid, "Alice"), renamePartner(uuid, other, "Bob"),
      deactivatePartner(uuid, other), addPartnerPayment(pay), updatePartnerPayment({ ...pay, id: other }),
      deletePartnerPayment(uuid, other), setExpensePaidBy(uuid, other)]);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(db.mutations.some((call) => call.startsWith("insert:") || call.startsWith("update:")
      || call.startsWith("delete:"))).toBe(false);
  });
  it("rejects manager, personal account, cross-account or inactive partner attribution", async () => {
    db.role = "manager";
    expect((await setExpensePaidBy(uuid, other)).ok).toBe(false);
    db.role = "owner"; db.accountType = "individual";
    expect((await setExpensePaidBy(uuid, other)).ok).toBe(false);
    db.accountType = "llc"; db.partnerAccount = "other";
    expect(await setExpensePaidBy(uuid, other)).toEqual({ ok: false, error: "Pick someone from this LLC." });
    db.partnerAccount = "account"; db.partnerActive = false;
    expect(await setExpensePaidBy(uuid, other)).toEqual({ ok: false, error: "Pick someone from this LLC." });
  });
  it("sets attribution idempotently with one insert and clears it", async () => {
    expect((await setExpensePaidBy(uuid, other)).ok).toBe(true);
    expect((await setExpensePaidBy(uuid, other)).ok).toBe(true);
    expect(db.mutations.filter((call) => call === "insert:expense_partner_attributions:")).toHaveLength(1);
    expect(db.attribution).toBe(other);
    expect((await setExpensePaidBy(uuid, null)).ok).toBe(true);
    expect(db.attribution).toBe(null);
  });
  it("checks attribution insert, update and delete errors", async () => {
    db.errorTable = "expense_partner_attributions";
    db.errorOperation = "insert";
    expect((await setExpensePaidBy(uuid, other)).ok).toBe(false);
    db.attribution = uuid; db.errorOperation = "update";
    expect((await setExpensePaidBy(uuid, other)).ok).toBe(false);
    db.attribution = other; db.errorOperation = "delete";
    expect((await setExpensePaidBy(uuid, null)).ok).toBe(false);
  });
  it("deletes only the requested payment row and checks mutation errors", async () => {
    expect((await deletePartnerPayment(uuid, other)).ok).toBe(true);
    expect(db.deleteIds).toEqual([other]);
    db.errorTable = "partner_payments";
    expect((await deletePartnerPayment(uuid, other)).ok).toBe(false);
  });
  it("adds and updates payments, checking every mutation error", async () => {
    expect((await addPartnerPayment(pay)).ok).toBe(true);
    expect((await updatePartnerPayment({ ...pay, id: other })).ok).toBe(true);
    db.errorTable = "partner_payments";
    expect((await addPartnerPayment(pay)).ok).toBe(false);
    expect((await updatePartnerPayment({ ...pay, id: other })).ok).toBe(false);
  });
  it("checks add, rename and deactivate partner errors", async () => {
    expect((await addPartner(uuid, "Alice")).ok).toBe(true);
    expect((await renamePartner(uuid, other, "Bob")).ok).toBe(true);
    expect((await deactivatePartner(uuid, other)).ok).toBe(true);
    db.errorTable = "account_partners";
    expect((await addPartner(uuid, "Alice")).ok).toBe(false);
    expect((await renamePartner(uuid, other, "Bob")).ok).toBe(false);
    expect((await deactivatePartner(uuid, other)).ok).toBe(false);
  });
  it("returns the exact unique name message", async () => {
    db.errorTable = "account_partners"; db.errorCode = "23505";
    expect(await addPartner(uuid, "Alice")).toEqual({ ok: false,
      error: "Someone in this LLC already has that name." });
  });
});
