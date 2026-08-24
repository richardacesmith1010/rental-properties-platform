import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTenantInviteEmail } from "@/lib/email-templates";
import { sendTenantInviteEmail } from "@/lib/invite-email";

describe("tenant invite email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds branded invite email content with property, owner, and CTA", () => {
    const result = buildTenantInviteEmail({
      tenantName: "Alex Tenant",
      ownerName: "Courtney Smith",
      propertyName: "Oak Street Duplex",
      propertyAddress: "123 Oak Street, Denver CO 80203",
      unitLabel: "Unit B",
      monthlyRent: "$1,850.00",
      leaseStartDate: "2026-04-01",
      leaseEndDate: "2027-03-31",
      inviteUrl: "https://domusbase.com/auth/callback"
    });

    expect(result.subject).toBe("Courtney Smith invited you to Domus");
    expect(result.html).toContain("Accept Invitation &amp; Set Up Your Account");
    expect(result.html).toContain("Oak Street Duplex");
    expect(result.html).toContain("123 Oak Street, Denver CO 80203");
    expect(result.html).toContain("Unit B");
    expect(result.text).toContain("Monthly rent: $1,850.00");
    expect(result.html).toContain("border:1px solid #E6E6E0");
    expect(result.html).toContain("color:#1D4ED8");
    expect(result.html).not.toContain("mascot");
  });

  it("handles missing optional rent and unit details", () => {
    const result = buildTenantInviteEmail({
      tenantName: "Alex Tenant",
      ownerName: "Courtney Smith",
      propertyAddress: "123 Oak Street, Denver CO 80203",
      inviteUrl: "https://domusbase.com/auth/callback"
    });

    expect(result.html).not.toContain("Monthly rent is");
    expect(result.text).not.toContain("Monthly rent:");
    expect(result.text).toContain("Courtney Smith invited you to Domus");
  });

  it("returns false when resend configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const sent = await sendTenantInviteEmail({
      tenantName: "Alex Tenant",
      tenantEmail: "alex@example.com",
      ownerName: "Courtney Smith",
      propertyAddress: "123 Oak Street, Denver CO 80203",
      inviteUrl: "https://domusbase.com/auth/callback"
    });

    expect(sent).toBe(false);
  });

  it("returns true when Resend accepts the invite email", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@domusbase.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendTenantInviteEmail({
      tenantName: "Alex Tenant",
      tenantEmail: "alex@example.com",
      ownerName: "Courtney Smith",
      propertyAddress: "123 Oak Street, Denver CO 80203",
      inviteUrl: "https://domusbase.com/auth/callback"
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns false when the Resend API rejects the invite email", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@domusbase.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const sent = await sendTenantInviteEmail({
      tenantName: "Alex Tenant",
      tenantEmail: "alex@example.com",
      ownerName: "Courtney Smith",
      propertyAddress: "123 Oak Street, Denver CO 80203",
      inviteUrl: "https://domusbase.com/auth/callback"
    });

    expect(sent).toBe(false);
  });
});
