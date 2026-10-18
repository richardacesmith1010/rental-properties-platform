import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildManagerInviteEmail } from "@/lib/email-templates";
import { canSendBrandedManagerInvite, sendManagerInviteEmail } from "@/lib/invite-email";
import { scanSource } from "@/lib/plain-language/scan";
const email = "listed@example.com";
const params = { email, inviterName: "Ace", homeNames: ["Oak Home"], inviteUrl: "fake-link:u1:1" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("A31 branded manager gate", () => {
  it.each([
    { allowlist: "", enabled: "", address: email, expected: false },
    { allowlist: "", enabled: "true", address: email, expected: false },
    { allowlist: "listed@example.com", enabled: "", address: " Listed@Example.com ", expected: true },
    { allowlist: "listed@example.com", enabled: "", address: "other@example.com", expected: false },
    { allowlist: "not-an-email", enabled: "", address: email, expected: false }
  ])("only test+listed opens: $allowlist / $enabled / $address", ({ allowlist, enabled, address, expected }) => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", allowlist);
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", enabled);
    expect(canSendBrandedManagerInvite(address)).toBe(expected);
  });
});

describe("A31 throwing switch", () => {
  it("closes the gate when the switch throws", async () => {
    vi.resetModules();
    vi.doMock("@/lib/notifications-switch", () => ({ notificationMode: () => { throw new Error("test failure"); },
      notificationAllowlist: () => [email], isNotificationRecipientAllowed: () => true }));
    const fresh = await import("@/lib/invite-email");
    expect(fresh.canSendBrandedManagerInvite(email)).toBe(false);
    vi.doUnmock("@/lib/notifications-switch"); vi.resetModules();
  });
});

describe("A32 branded email builder", () => {
  it("uses approved one-home copy and the shell", () => {
    const message = buildManagerInviteEmail(params);
    expect(message.subject).toBe("Ace added you to Domus");
    expect(message.text).toBe([
      "Manage homes on Domus",
      "Ace wants you to manage Oak Home on Domus.",
      "Set up your account: fake-link:u1:1",
      "If you were not expecting this, you can ignore it."
    ].join("\n"));
    expect(message.html).toContain('<p style="margin:0;">Ace wants you to manage Oak Home on Domus.</p>');
    expect(message.html).toContain('<p style="margin:16px 0 0 0;">If you were not expecting this, you can ignore it.</p>');
    expect(message.html).toContain("Manage homes on Domus");
    expect(message.html).toContain("Set up your account");
    expect(message.html).toContain('href="fake-link:u1:1"');
  });
  it("uses a count for two homes and escapes names once", () => {
    const message = buildManagerInviteEmail({ ...params, inviterName: "<script>Ace</script>",
      homeNames: ["Oak <script>", "Pine Home"] });
    expect(message.subject).toBe("<script>Ace</script> added you to Domus");
    expect(message.html).toContain("&lt;script&gt;Ace&lt;/script&gt; wants you to manage 2 homes");
    const oneHome = buildManagerInviteEmail({ ...params, homeNames: ["Oak <script>"] });
    expect(oneHome.html).toContain("Oak &lt;script&gt;");
    expect(oneHome.html).not.toContain("&amp;lt;");
  });
  it("keeps every approved sentence within twelve words", () => {
    const file = path.resolve(__dirname, "../email/invites.ts");
    const all = fs.readFileSync(file, "utf8");
    const source = all.slice(all.indexOf("export function buildManagerInviteEmail"),
      all.indexOf("export function buildTenantInviteEmail"));
    expect(scanSource(source, "apps/web/lib/manager-invite-email.ts")).toEqual([]);
  });
});

describe("A33 sender gate and transport", () => {
  it("does not fetch when closed or Resend is missing", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "");
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
    expect(await sendManagerInviteEmail(params)).toBe(false);
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendManagerInviteEmail(params)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends once when open and reports non-OK and throws", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error("test failure"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendManagerInviteEmail(params)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    expect(await sendManagerInviteEmail(params)).toBe(false);
    expect(await sendManagerInviteEmail(params)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
