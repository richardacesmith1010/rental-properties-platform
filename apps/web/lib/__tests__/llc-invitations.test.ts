import { describe, expect, it } from "vitest";
import { buildLLCInviteEmail } from "@/lib/email-templates";
import {
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
