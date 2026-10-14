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

describe("229 §8.2 iOS redirects", () => {
  const ios = "https://domusbase.com/owner/bank/oauth-app";
  it("accepts only the app Universal Link", () => {
    expect(validRedirectUri(ios, "ios")).toBe(true);
    for (const uri of ["https://domusbase.com/owner/bank/oauth", ios + "/", ios + "?x=1", ios + "#x",
      ios + "?", ios + "#", ios.replace("https:", "http:"), ios.replace(".com", ".com:443"),
      ios.replace(".com", ".com:8443"), ios.replace("domus", "user:pass@domus"),
      ios.replace("oauth-app", "*"), ios.replace("domusbase.com", "localhost"), ios.replace("oauth-app", "other")]) {
      expect(validRedirectUri(uri, "ios"), uri).toBe(false);
    }
  });
  it.each(["ios", "web"] as const)("sends the %s redirect to Plaid", async (platform) => {
    vi.stubEnv("PLAID_CLIENT_ID", "synthetic-client"); vi.stubEnv("PLAID_SECRET", "synthetic-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://domusbase.com");
    vi.stubEnv("PLAID_REDIRECT_URI_IOS", ios); vi.stubEnv("PLAID_REDIRECT_URI", ios.replace("-app", ""));
    linkTokenCreate.mockResolvedValue({ data: { link_token: "link-synthetic" } });
    await createLinkToken({ userId: "owner", mode: "create", platform });
    expect(linkTokenCreate.mock.lastCall?.[0].redirect_uri).toBe(platform === "ios" ? ios : ios.replace("-app", ""));
  });
  it.each([
    ["create", undefined], ["create", "https://evil.test"], ["update", undefined], ["update", "https://evil.test"]
  ] as const)("§8.2b fails closed in %s with %s", async (mode, uri) => {
    linkTokenCreate.mockClear();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://domusbase.com"); vi.stubEnv("PLAID_REDIRECT_URI_IOS", uri);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createLinkToken({ userId: "owner", mode, platform: "ios", accessToken: "synthetic-access" }))
      .rejects.toThrow("Bank connection is not set up yet.");
    expect(linkTokenCreate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("plaid_redirect_uri_invalid");
  });
});
