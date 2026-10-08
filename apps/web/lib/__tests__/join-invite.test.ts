import { describe, expect, it } from "vitest";
import { isJoinInviteActive, INACTIVE_INVITE_MESSAGE } from "@/lib/join-invite";
import { maskEmail } from "@/lib/mask-email";
import { resendFromJoinLinkSchema } from "@/lib/validations";

describe("join invite helpers", () => {
  it.each([
    ["john@gmail.com", "j***@g***.com"],
    ["a@b.co", "a***@b***.co"],
    ["x@mail.example.org", "x***@m***.org"],
    ["JOHN@GMAIL.COM", "j***@g***.com"],
    ["bad", "***"], ["@gmail.com", "***"], ["a@", "***"], [null, "***"]
  ])("masks %s safely", (input, output) => expect(maskEmail(input)).toBe(output));

  const now = new Date("2026-10-07T00:00:00.000Z");
  const invite = (ageMs: number) => ({ role: "tenant", status: "pending", created_at: new Date(now.getTime() - ageMs).toISOString() });
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  it("accepts 30 days minus one millisecond", () => expect(isJoinInviteActive(invite(thirtyDays - 1), now)).toBe(true));
  it("rejects exactly 30 days", () => expect(isJoinInviteActive(invite(thirtyDays), now)).toBe(false));
  it("rejects 30 days plus one millisecond", () => expect(isJoinInviteActive(invite(thirtyDays + 1), now)).toBe(false));
  it("rejects unsupported roles and statuses", () => {
    expect(isJoinInviteActive({ ...invite(1), role: "owner" }, now)).toBe(false);
    expect(isJoinInviteActive({ ...invite(1), status: "revoked" }, now)).toBe(false);
  });
  it("accepts only an invite ID in the schema", () => {
    const inviteId = "2e7bd787-5518-4fce-b9b0-4fa19c2ff324";
    expect(resendFromJoinLinkSchema.safeParse({ inviteId }).success).toBe(true);
    expect(resendFromJoinLinkSchema.safeParse({ inviteId, email: "attacker@example.com" }).success).toBe(false);
    expect(INACTIVE_INVITE_MESSAGE).toBe("This invite is no longer active. Ask the person who invited you for a new one.");
  });
});
