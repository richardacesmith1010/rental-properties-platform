import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("../join-invite-form", () => ({ JoinInviteForm: () => <button>Email me a new link</button> }));
import JoinPage, { dynamic, metadata, revalidate } from "../page";

const inviteId = "2e7bd787-5518-4fce-b9b0-4fa19c2ff324";
const row = {
  id: inviteId, email: "john@gmail.com", full_name: "Hidden Invitee", role: "tenant", status: "pending",
  created_at: new Date().toISOString(), property_id: "property-id", invited_by: "inviter-id"
};
function setup(invite: typeof row | null) {
  const query = (data: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
  const from = vi.fn((table: string) => {
    if (table === "invitations") return query(invite);
    if (table === "properties") return query({ name: "Maple Home" });
    return query({ full_name: "Courtney Smith" });
  });
  mocks.admin.mockReturnValue({ from });
  return from;
}
async function html(id = inviteId) {
  return renderToStaticMarkup(await JoinPage({ params: Promise.resolve({ inviteId: id }) }));
}
beforeEach(() => vi.clearAllMocks());

describe("public join page", () => {
  it("renders only masked active details", async () => {
    const from = setup(row);
    const output = await html();
    expect(output).toContain("You&#x27;re invited to Domus");
    expect(output).toContain("Courtney invited you to Maple Home.");
    expect(output).toContain("j***@g***.com");
    expect(output).toContain("Check your spam or junk folder. The email comes from Domus.");
    for (const secret of [row.email, row.full_name, row.id, row.invited_by, row.property_id, "Smith"]) {
      expect(output).not.toContain(secret);
    }
    expect(from).toHaveBeenCalledWith("properties");
  });

  it("renders an accepted invite with sign in", async () => {
    setup({ ...row, status: "accepted" });
    const output = await html();
    expect(output).toContain("This invite was already used.");
    expect(output).toContain('href="/login"');
    expect(output).not.toContain(row.email);
  });

  it("renders identical, undisclosing inactive cases", async () => {
    const cases = [
      { ...row, status: "revoked" }, { ...row, status: "expired" },
      { ...row, role: "owner" },
      { ...row, created_at: new Date(Date.now() - 31 * 86400000).toISOString() }, null
    ];
    const outputs = [];
    for (const invite of cases) {
      setup(invite);
      outputs.push(await html());
    }
    setup(row);
    outputs.push(await html("bad-id"));
    for (const output of outputs) {
      expect(output).toBe(outputs[0]);
      expect(output).toContain("This invite is no longer active. Ask the person who invited you for a new one.");
      for (const secret of [row.email, "j***@g***.com", "Maple Home", "Courtney", row.id, row.full_name]) {
        expect(output).not.toContain(secret);
      }
    }
  });

  it("disables indexing and caching", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
  });
});
