import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ admin: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/ownership", () => ({ canUserAdministerOwnershipAccount: m.access,
  getOwnershipMembersForAccount: async () => [] }));
import { loadOwnerSectionBundles } from "@/app/owner/page-data/section-bundles";
import { buildLLCInviteEmail } from "@/lib/email-templates";
import {
  getPendingLLCInvitationsForAccount,
  LLC_INVITATION_EXPIRY_MS,
  isInvitationExpired,
  normalizeInvitationEmail,
  parseInvitationEmails
} from "@/lib/llc-invitations";

describe("parseInvitationEmails", () => {
  it("parses comma-separated emails", () => {
    expect(parseInvitationEmails("one@example.com, two@example.com")).toEqual({
      emails: ["one@example.com", "two@example.com"],
      invalidEmails: []
    });
  });

  it("parses newline-separated emails", () => {
    expect(parseInvitationEmails("one@example.com\ntwo@example.com")).toEqual({
      emails: ["one@example.com", "two@example.com"],
      invalidEmails: []
    });
  });

  it("deduplicates and normalizes email casing", () => {
    expect(parseInvitationEmails("One@Example.com, one@example.com")).toEqual({
      emails: ["one@example.com"],
      invalidEmails: []
    });
  });

  it("reports invalid email fragments", () => {
    expect(parseInvitationEmails("valid@example.com, nope")).toEqual({
      emails: ["valid@example.com"],
      invalidEmails: ["nope"]
    });
  });
});

describe("llc invitation expiry", () => {
  it("treats invitations newer than 7 days as valid", () => {
    const now = new Date("2026-03-24T12:00:00.000Z");
    const createdAt = new Date(now.getTime() - LLC_INVITATION_EXPIRY_MS + 60_000).toISOString();
    expect(isInvitationExpired(createdAt, now)).toBe(false);
  });

  it("treats invitations older than 7 days as expired", () => {
    const now = new Date("2026-03-24T12:00:00.000Z");
    const createdAt = new Date(now.getTime() - LLC_INVITATION_EXPIRY_MS - 60_000).toISOString();
    expect(isInvitationExpired(createdAt, now)).toBe(true);
  });
});

describe("buildLLCInviteEmail", () => {
  it("builds the branded LLC invite email", () => {
    const template = buildLLCInviteEmail({
      llcName: "J&MSP",
      inviterName: "Richard Smith",
      acceptUrl: "https://domusbase.com/join-llc?token=abc"
    });

    expect(template.subject).toContain("J&MSP");
    expect(template.html).toContain("Accept Invitation");
    expect(template.text).toContain("This invitation expires in 7 days.");
  });
});

describe("normalizeInvitationEmail", () => {
  it("trims and lowercases invitation emails", () => {
    expect(normalizeInvitationEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });
});


describe("invitation DTO serialization", () => {
  const row = { id: "invitation", ownership_account_id: "account", invited_by: "owner", email: "invite@example.com",
    token: "canary-11111111-1111-4111-8111-111111111111", status: "pending", created_at: "2026-10-30", accepted_at: null };
  const dto = { id: "invitation", ownershipAccountId: "account", invitedBy: "owner", email: "invite@example.com",
    status: "pending", createdAt: "2026-10-30", acceptedAt: null };
  const select = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks(); m.access.mockResolvedValue(true);
    const query = { select, eq: () => query, order: async () => ({ data: [row], error: null }) };
    select.mockReturnValue(query); m.admin.mockReturnValue({ from: () => query });
  });
  it("T1 exactly selects public columns and maps a token-free DTO", async () => {
    expect(await getPendingLLCInvitationsForAccount("owner", "account")).toEqual([dto]);
    expect(select.mock.calls).toEqual([["id, ownership_account_id, invited_by, email, status, created_at, accepted_at"]]);
  });
  it("T2,T13 real LLC administrator section bundle serializes no token at any depth", async () => {
    const params: Parameters<typeof loadOwnerSectionBundles>[0] = {
      userId: "owner", userEmail: "owner@example.com",
      request: { activeAccountId: "account", accountParam: "account", generatedMessage: null, hasExplicitSection: true,
        initialOwnerHomePage: false, initialPropertyId: null, initialSectionId: "members", requestedMode: null,
        requestedPropertyId: null, requestedSectionId: "members" },
      ownershipAccounts: [{ id: "account", accountType: "llc", displayName: "LLC", memberCount: 1, joinCode: null,
        stripeConnected: false, distributionMode: "equal", plaidConnected: false, bankName: null, bankMask: null,
        balanceCents: null, balanceUpdatedAt: null }],
      capabilities: { documentsEnabled: false, documentAssetAccessEnabled: false, notificationsEnabled: false,
        vendorWorkflowEnabled: false, photoWorkflowEnabled: false, ownershipEnabled: true, leasingPipelineEnabled: false,
        inboxThreadsEnabled: false, automationsEnabled: false, warnings: {} },
      bundles: new Set(["ownership-members"]), connectedPropertyIds: Promise.resolve([]),
      measure: async <T>(_name: string, work: () => Promise<T>) => work()
    };
    const bundle = await loadOwnerSectionBundles(params);
    expect(m.access.mock.calls).toEqual([["owner", "account"]]);
    expect(bundle.pendingLlcInvitations).toEqual([dto]);
    function keys(value: unknown): string[] {
      return value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
    }
    expect(keys(bundle)).not.toContain("token");
    expect(JSON.stringify(bundle)).not.toContain("canary-");
  });
});


it("T14 admin reads use a sessionless service client without request cookies", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("[]", { headers: { "content-type": "application/json" } }));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubGlobal("fetch", fetcher);
  try {
    const { createAdminClient } = await vi.importActual<typeof import("@/lib/supabase/admin")>("@/lib/supabase/admin");
    const admin = createAdminClient();
    const result = await admin.from("llc_invitations").select("id");
    expect(result.error).toEqual(null); expect(result.data).toEqual([]);
    expect(Reflect.get(admin.auth, "persistSession")).toEqual(false);
    expect(Reflect.get(admin.auth, "autoRefreshToken")).toEqual(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetcher.mock.calls[0][1].headers);
    expect(headers.get("authorization")).toEqual("Bearer test-service-role-key");
    expect(headers.get("cookie")).toEqual(null);
  } finally {
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  }
});
