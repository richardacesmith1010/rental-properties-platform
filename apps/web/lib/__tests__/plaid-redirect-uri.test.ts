import { afterEach, describe, expect, it, vi } from "vitest";
const { linkTokenCreate } = vi.hoisted(() => ({ linkTokenCreate: vi.fn() }));
vi.mock("plaid", async (original) => ({ ...await original<typeof import("plaid")>(),
  PlaidApi: class { linkTokenCreate = linkTokenCreate; } }));
import { createLinkToken, validRedirectUri } from "../plaid";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("§8.1 validRedirectUri", () => {
  it.each(["https://domusbase.com/owner/bank/oauth", "http://localhost:3000/owner/bank/oauth"])
    ("accepts %s", (uri) => expect(validRedirectUri(uri)).toBe(true));
  it.each([
    "http://domusbase.com/owner/bank/oauth", "https://evil.com/owner/bank/oauth",
    "https://domusbase.com:8443/owner/bank/oauth", "https://domusbase.com:443/owner/bank/oauth",
    "https://domusbase.com/owner/bank", "https://domusbase.com/owner/bank/oauth/x", "http://localhost:3000/other",
    "https://user:pass@domusbase.com/owner/bank/oauth", "http://user:pass@localhost:3000/owner/bank/oauth",
    "https://domusbase.com/owner/bank/oauth?x=1", "https://domusbase.com/owner/bank/oauth#a",
    "https://domusbase.com/owner/bank/oauth?", "https://domusbase.com/owner/bank/oauth#",
    "https://domusbase.com/owner/bank/*", "garbage"
  ])("rejects %s", (uri) => expect(validRedirectUri(uri)).toBe(false));
  it.each(["https://evil.com/owner/bank/oauth", "https://domusbase.com/owner/bank/oauth", undefined])
    ("createLinkToken validates env %s before sending the request", async (uri) => {
      vi.stubEnv("PLAID_CLIENT_ID", "synthetic-client"); vi.stubEnv("PLAID_SECRET", "synthetic-secret");
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://domusbase.com"); vi.stubEnv("PLAID_REDIRECT_URI", uri);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      linkTokenCreate.mockResolvedValue({ data: { link_token: "synthetic-link" } });
      await expect(createLinkToken({ userId: "synthetic-owner", mode: "create" }))
        .resolves.toEqual({ linkToken: "synthetic-link" });
      const body = linkTokenCreate.mock.lastCall?.[0];
      if (uri && validRedirectUri(uri)) expect(body.redirect_uri).toBe(uri);
      else expect(body).not.toHaveProperty("redirect_uri");
      if (uri && !validRedirectUri(uri)) expect(log.mock.calls).toEqual([["plaid_redirect_uri_invalid"]]);
      else expect(log).not.toHaveBeenCalled();
    });
});
