import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const initiateStripeConnectMock = vi.hoisted(() => vi.fn());
const initiateAccountStripeConnectMock = vi.hoisted(() => vi.fn());
const initiateMemberPayoutConnectMock = vi.hoisted(() => vi.fn());
const getActiveLlcMembershipsForUserMock = vi.hoisted(() => vi.fn());
const getAuthenticatedUserMock = vi.hoisted(() => vi.fn());
const getCurrentUserRoleMock = vi.hoisted(() => vi.fn());
const getRoleHomePathMock = vi.hoisted(() => vi.fn());
const isStripeConfiguredMock = vi.hoisted(() => vi.fn());
const getRentCollectionConnectStatusMock = vi.hoisted(() => vi.fn());
const hasRentCollectionAuthorityForAccountMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/app/actions", () => ({
  initiateStripeConnect: initiateStripeConnectMock,
  initiateAccountStripeConnect: initiateAccountStripeConnectMock,
  initiateMemberPayoutConnect: initiateMemberPayoutConnectMock
}));

vi.mock("@/lib/ownership", () => ({
  getActiveLlcMembershipsForUser: getActiveLlcMembershipsForUserMock
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
  getCurrentUserRole: getCurrentUserRoleMock,
  getRoleHomePath: getRoleHomePathMock
}));

vi.mock("@/lib/env", () => ({
  isStripeConfigured: isStripeConfiguredMock
}));

vi.mock("@/lib/stripe-connect", () => ({
  getRentCollectionConnectStatus: getRentCollectionConnectStatusMock,
  hasRentCollectionAuthorityForAccount: hasRentCollectionAuthorityForAccountMock
}));

const ACCOUNT_1_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_2_ID = "550e8400-e29b-41d4-a716-446655440002";

function buildStatus(
  overrides: Partial<{
    ok: boolean;
    connected: boolean;
    accounts: Array<{
      accountId: string;
      accountName: string;
      isConnected: boolean;
      activePropertyCount: number;
      propertyNames: string[];
    }>;
    legacyProfileTarget: boolean;
    profileConnected: boolean;
    targets: Array<{ kind: "account"; accountId: string } | { kind: "profile" }>;
    primaryTarget: { kind: "account"; accountId: string } | { kind: "profile" } | null;
  }> = {}
) {
  return {
    ok: true,
    connected: false,
    accounts: [],
    legacyProfileTarget: false,
    profileConnected: false,
    targets: [],
    primaryTarget: null,
    ...overrides
  };
}

function getSubmittedAccountId(mockFn: ReturnType<typeof vi.fn>) {
  const formData = mockFn.mock.calls[0]?.[1] as FormData | undefined;
  return formData?.get("accountId");
}

async function loadPage() {
  const pageModule = await import("@/app/connect/onboard/page");
  return pageModule.default;
}

describe("ConnectOnboardPage", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      const error = new Error(`REDIRECT:${path}`) as Error & { digest?: string };
      error.digest = `NEXT_REDIRECT;replace;${path};307;`;
      throw error;
    });
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-1" });
    getCurrentUserRoleMock.mockResolvedValue("owner");
    getRoleHomePathMock.mockReturnValue("/owner");
    getActiveLlcMembershipsForUserMock.mockResolvedValue([]);
    getRentCollectionConnectStatusMock.mockResolvedValue(buildStatus());
    hasRentCollectionAuthorityForAccountMock.mockResolvedValue(true);
    isStripeConfiguredMock.mockReturnValue(true);
    initiateStripeConnectMock.mockResolvedValue({
      success: true,
      url: "https://connect.stripe.com/setup/s/profile"
    });
    initiateAccountStripeConnectMock.mockResolvedValue({
      success: true,
      url: "https://connect.stripe.com/setup/s/account"
    });
    initiateMemberPayoutConnectMock.mockResolvedValue({
      success: true,
      url: "https://connect.stripe.com/setup/s/member"
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("routes a single unconnected property-owning account to account onboarding", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [
          {
            accountId: ACCOUNT_1_ID,
            accountName: "Atlas Holdings",
            isConnected: false,
            activePropertyCount: 2,
            propertyNames: ["Domus One", "Domus Two"]
          }
        ],
        targets: [{ kind: "account", accountId: ACCOUNT_1_ID }],
        primaryTarget: { kind: "account", accountId: ACCOUNT_1_ID }
      })
    );

    const ConnectOnboardPage = await loadPage();

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/account");
    expect(initiateAccountStripeConnectMock).toHaveBeenCalledTimes(1);
    expect(getSubmittedAccountId(initiateAccountStripeConnectMock)).toBe(ACCOUNT_1_ID);
    expect(initiateMemberPayoutConnectMock).not.toHaveBeenCalled();
  });

  it("does not let LLC payout membership hijack the default owner route", async () => {
    getActiveLlcMembershipsForUserMock.mockResolvedValue([
      {
        accountId: ACCOUNT_2_ID,
        accountName: "Legacy LLC",
        payoutStripeConnected: false
      }
    ]);
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [
          {
            accountId: ACCOUNT_1_ID,
            accountName: "Rent Account",
            isConnected: false,
            activePropertyCount: 1,
            propertyNames: ["Domus One"]
          }
        ],
        targets: [{ kind: "account", accountId: ACCOUNT_1_ID }],
        primaryTarget: { kind: "account", accountId: ACCOUNT_1_ID }
      })
    );

    const ConnectOnboardPage = await loadPage();

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/account");
    expect(initiateAccountStripeConnectMock).toHaveBeenCalledTimes(1);
    expect(getSubmittedAccountId(initiateAccountStripeConnectMock)).toBe(ACCOUNT_1_ID);
    expect(getActiveLlcMembershipsForUserMock).not.toHaveBeenCalled();
    expect(initiateMemberPayoutConnectMock).not.toHaveBeenCalled();
  });

  it("shows a chooser when an account target and a legacy profile target are both unconnected", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [
          {
            accountId: ACCOUNT_1_ID,
            accountName: "Atlas Holdings",
            isConnected: false,
            activePropertyCount: 1,
            propertyNames: ["Domus One"]
          }
        ],
        legacyProfileTarget: true,
        targets: [{ kind: "account", accountId: ACCOUNT_1_ID }, { kind: "profile" }],
        primaryTarget: { kind: "account", accountId: ACCOUNT_1_ID }
      })
    );

    const ConnectOnboardPage = await loadPage();
    render(await ConnectOnboardPage({}));

    expect(screen.getByRole("heading", { name: "Which account should receive rent?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Atlas Holdings/i })).toHaveAttribute(
      "href",
      `/connect/onboard?accountId=${ACCOUNT_1_ID}`
    );
    expect(screen.getByRole("link", { name: /Your personal properties/i })).toHaveAttribute(
      "href",
      "/connect/onboard?profile=true"
    );
    expect(screen.getByRole("link", { name: /Atlas Holdings/i }).getAttribute("href")).not.toContain("memberPayout");
  });

  it("shows a chooser with accountId and profile routes, never memberPayout, for multiple owner targets", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [
          {
            accountId: ACCOUNT_1_ID,
            accountName: "Atlas Holdings",
            isConnected: false,
            activePropertyCount: 2,
            propertyNames: ["Domus One", "Domus Two"]
          },
          {
            accountId: ACCOUNT_2_ID,
            accountName: "Mars Ridge LLC",
            isConnected: false,
            activePropertyCount: 0,
            propertyNames: []
          }
        ],
        legacyProfileTarget: true,
        targets: [
          { kind: "account", accountId: ACCOUNT_1_ID },
          { kind: "account", accountId: ACCOUNT_2_ID },
          { kind: "profile" }
        ],
        primaryTarget: { kind: "account", accountId: ACCOUNT_1_ID }
      })
    );

    const ConnectOnboardPage = await loadPage();
    render(await ConnectOnboardPage({}));

    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === `/connect/onboard?accountId=${ACCOUNT_1_ID}`)).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === `/connect/onboard?accountId=${ACCOUNT_2_ID}`)).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === "/connect/onboard?profile=true")).toBe(true);
    expect(links.every((link) => !(link.getAttribute("href") ?? "").includes("memberPayout"))).toBe(true);
  });

  it("routes an unconnected zero-property account instead of dead-ending", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [
          {
            accountId: ACCOUNT_1_ID,
            accountName: "Atlas Holdings",
            isConnected: false,
            activePropertyCount: 0,
            propertyNames: []
          }
        ],
        targets: [{ kind: "account", accountId: ACCOUNT_1_ID }],
        primaryTarget: { kind: "account", accountId: ACCOUNT_1_ID }
      })
    );

    const ConnectOnboardPage = await loadPage();

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/account");
    expect(getSubmittedAccountId(initiateAccountStripeConnectMock)).toBe(ACCOUNT_1_ID);
  });

  it("redirects ready when all owner targets are already connected", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        connected: true,
        accounts: [
          {
            accountId: ACCOUNT_1_ID,
            accountName: "Atlas Holdings",
            isConnected: true,
            activePropertyCount: 1,
            propertyNames: ["Domus One"]
          }
        ]
      })
    );

    const ConnectOnboardPage = await loadPage();

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:/settings?connect=ready");
    expect(initiateStripeConnectMock).not.toHaveBeenCalled();
    expect(initiateAccountStripeConnectMock).not.toHaveBeenCalled();
    expect(initiateMemberPayoutConnectMock).not.toHaveBeenCalled();
  });

  it("preserves the profile flow for a new owner with no accounts and no legacy properties", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [],
        legacyProfileTarget: false,
        profileConnected: false,
        targets: [],
        primaryTarget: null
      })
    );

    const ConnectOnboardPage = await loadPage();

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/profile");
    expect(initiateStripeConnectMock).toHaveBeenCalledTimes(1);
    expect(initiateAccountStripeConnectMock).not.toHaveBeenCalled();
  });

  it("keeps managers on the profile-level flow", async () => {
    getCurrentUserRoleMock.mockResolvedValue("manager");

    const ConnectOnboardPage = await loadPage();

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/profile");
    expect(initiateStripeConnectMock).toHaveBeenCalledTimes(1);
    expect(getRentCollectionConnectStatusMock).not.toHaveBeenCalled();
  });

  it("fails closed when the rent-collection status cannot be determined", async () => {
    getRentCollectionConnectStatusMock.mockResolvedValue(buildStatus({ ok: false }));

    const ConnectOnboardPage = await loadPage();
    render(await ConnectOnboardPage({}));

    expect(screen.getByText("We can't check your payment setup right now. Please try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/connect/onboard");
    expect(initiateStripeConnectMock).not.toHaveBeenCalled();
    expect(initiateAccountStripeConnectMock).not.toHaveBeenCalled();
    expect(initiateMemberPayoutConnectMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "malformed accountId",
      searchParams: { accountId: "not-a-uuid" },
      role: "owner"
    },
    {
      label: "array-valued accountId",
      searchParams: { accountId: [ACCOUNT_1_ID, ACCOUNT_2_ID] },
      role: "owner"
    },
    {
      label: "unauthorized owner accountId",
      searchParams: { accountId: ACCOUNT_1_ID },
      role: "owner",
      authority: false
    },
    {
      label: "manager accountId access",
      searchParams: { accountId: ACCOUNT_1_ID },
      role: "manager"
    }
  ])("shows the safe error state for $label", async ({ searchParams, role, authority }) => {
    getCurrentUserRoleMock.mockResolvedValue(role);
    hasRentCollectionAuthorityForAccountMock.mockResolvedValue(authority ?? true);

    const ConnectOnboardPage = await loadPage();
    render(await ConnectOnboardPage({ searchParams }));

    expect(screen.getByText("We can't check your payment setup right now. Please try again in a minute.")).toBeInTheDocument();
    expect(initiateStripeConnectMock).not.toHaveBeenCalled();
    expect(initiateAccountStripeConnectMock).not.toHaveBeenCalled();
    expect(initiateMemberPayoutConnectMock).not.toHaveBeenCalled();
  });

  it("keeps the explicit member payout path intact", async () => {
    const ConnectOnboardPage = await loadPage();

    await expect(
      ConnectOnboardPage({
        searchParams: { accountId: ACCOUNT_1_ID, memberPayout: "true" }
      })
    ).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/member");
    expect(initiateMemberPayoutConnectMock).toHaveBeenCalledTimes(1);
    expect(initiateAccountStripeConnectMock).not.toHaveBeenCalled();
    expect(getActiveLlcMembershipsForUserMock).not.toHaveBeenCalled();
  });

  it("renders the unavailable copy when the start action returns a raw platform-profile error", async () => {
    initiateStripeConnectMock.mockResolvedValue({
      success: false,
      error:
        'Unable to start payout onboarding. (Stripe Connect request failed: 400 - {"error":{"message":"You must complete your platform profile to use Connect and create live connected accounts","type":"invalid_request_error"}})'
    });
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [],
        legacyProfileTarget: false,
        profileConnected: false,
        targets: [],
        primaryTarget: null
      })
    );

    const ConnectOnboardPage = await loadPage();
    render(await ConnectOnboardPage({}));

    expect(screen.getByRole("heading", { name: "Bank connections aren't available yet" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "We're still finishing setup with our payment provider. This usually takes up to one business day. Please check back soon — you'll be able to connect your bank once it's ready."
      )
    ).toBeInTheDocument();
  });

  it("logs the real error and still renders friendly copy when the start action throws", async () => {
    const error = new Error(
      'Stripe Connect request failed: 400 - {"error":{"message":"Please review the responsibilities of managing losses for connected accounts","type":"invalid_request_error"}}'
    );
    initiateStripeConnectMock.mockRejectedValue(error);
    getRentCollectionConnectStatusMock.mockResolvedValue(
      buildStatus({
        accounts: [],
        legacyProfileTarget: false,
        profileConnected: false,
        targets: [],
        primaryTarget: null
      })
    );

    const ConnectOnboardPage = await loadPage();
    render(await ConnectOnboardPage({}));

    expect(consoleErrorSpy).toHaveBeenCalledWith("connect onboard page error:", error);
    expect(screen.getByRole("heading", { name: "Bank connections aren't available yet" })).toBeInTheDocument();
  });
});
