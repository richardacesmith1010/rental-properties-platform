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
const getUserProfileSummaryMock = vi.hoisted(() => vi.fn());
const isStripeConfiguredMock = vi.hoisted(() => vi.fn());

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
  getRoleHomePath: getRoleHomePathMock,
  getUserProfileSummary: getUserProfileSummaryMock
}));

vi.mock("@/lib/env", () => ({
  isStripeConfigured: isStripeConfiguredMock
}));

describe("ConnectOnboardPage", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    getAuthenticatedUserMock.mockResolvedValue({ id: "user-1" });
    getCurrentUserRoleMock.mockResolvedValue("owner");
    getRoleHomePathMock.mockReturnValue("/owner");
    getUserProfileSummaryMock.mockResolvedValue({ stripeOnboardingComplete: false });
    getActiveLlcMembershipsForUserMock.mockResolvedValue([]);
    isStripeConfiguredMock.mockReturnValue(true);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders the unavailable copy when the start action returns a raw platform-profile error", async () => {
    initiateStripeConnectMock.mockResolvedValue({
      success: false,
      error:
        'Unable to start payout onboarding. (Stripe Connect request failed: 400 - {"error":{"message":"You must complete your platform profile to use Connect and create live connected accounts","type":"invalid_request_error"}})'
    });

    const { default: ConnectOnboardPage } = await import("@/app/connect/onboard/page");
    render(await ConnectOnboardPage({}));

    expect(screen.getByRole("heading", { name: "Bank connections aren't available yet" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "We're still finishing setup with our payment provider. This usually takes up to one business day. Please check back soon — you'll be able to connect your bank once it's ready."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/invalid_request_error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{/)).not.toBeInTheDocument();
  });

  it("renders the generic friendly copy for other onboarding errors", async () => {
    initiateStripeConnectMock.mockResolvedValue({
      success: false,
      error:
        'Unable to start Stripe onboarding right now. (Stripe Connect request failed: 500 - {"error":{"message":"Unexpected failure","type":"api_error"}})'
    });

    const { default: ConnectOnboardPage } = await import("@/app/connect/onboard/page");
    render(await ConnectOnboardPage({}));

    expect(screen.getByRole("heading", { name: "We couldn't start your bank setup" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Something went wrong on our end. Please try again in a little while. If it keeps happening, contact support."
      )
    ).toBeInTheDocument();
  });

  it("logs the real error and still renders friendly copy when the start action throws", async () => {
    const error = new Error(
      'Stripe Connect request failed: 400 - {"error":{"message":"Please review the responsibilities of managing losses for connected accounts","type":"invalid_request_error"}}'
    );
    initiateStripeConnectMock.mockRejectedValue(error);

    const { default: ConnectOnboardPage } = await import("@/app/connect/onboard/page");
    render(await ConnectOnboardPage({}));

    expect(consoleErrorSpy).toHaveBeenCalledWith("connect onboard page error:", error);
    expect(screen.getByRole("heading", { name: "Bank connections aren't available yet" })).toBeInTheDocument();
    expect(screen.queryByText(/invalid_request_error/i)).not.toBeInTheDocument();
  });

  it("preserves the Stripe redirect on success", async () => {
    initiateStripeConnectMock.mockResolvedValue({
      success: true,
      url: "https://connect.stripe.com/setup/s/acct_123"
    });

    const { default: ConnectOnboardPage } = await import("@/app/connect/onboard/page");

    await expect(ConnectOnboardPage({})).rejects.toThrow("REDIRECT:https://connect.stripe.com/setup/s/acct_123");
    expect(redirectMock).toHaveBeenCalledWith("https://connect.stripe.com/setup/s/acct_123");
  });
});
