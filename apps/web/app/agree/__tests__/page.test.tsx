import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), rows: vi.fn(), destination: vi.fn(), redirect: vi.fn(), form: vi.fn(),
  authState: vi.fn(), invite: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: m.user, getCurrentUserRole: m.role, getAuthState: m.authState,
  getRoleHomePath: (role: string) => `/${role}` }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: () => ({ select: m.rows }) }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/app/actions/legal-acceptance", () => ({ agreeToTerms: vi.fn(), recordInviteAgreement: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/components/legal/agree-form", () => ({ AgreeForm: () => <button>Continue</button> }));
vi.mock("@/components/settings/your-data-settings", () => ({ YourDataSettings: () => <div>Download my data</div> }));
vi.mock("@/components/settings/delete-account-section", () => ({ DeleteAccountSection: () => <div>Delete my account</div> }));
vi.mock("@/components/auth/complete-profile-form", () => ({ CompleteProfileForm: (props: unknown) => {
  m.form(props); return <div>Complete Setup</div>;
} }));
vi.mock("@/lib/invitations", () => ({ getTenantInviteOnboardingContext: m.invite }));
import AgreePage from "../page";
import CompleteProfilePage from "@/app/complete-profile/page";
import { DeclineOptions } from "@/components/legal/decline-options";
const current = { profile_id: "p", terms_version: "2026-10-30", privacy_version: "2026-10-30" };
beforeEach(() => {
  vi.clearAllMocks(); m.user.mockResolvedValue({ id: "p", email: "person@example.com" }); m.role.mockResolvedValue("tenant");
  m.rows.mockResolvedValue({ data: [], error: null });
  m.authState.mockResolvedValue({ hasProfile: true, role: "tenant", onboardingComplete: false, needsPasswordSet: true });
  m.invite.mockResolvedValue(null); m.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});
afterEach(cleanup);
describe("agreement page and declines", () => {
  it("P1,P3 first-time tenant copy and skip authentication", async () => {
    render(await AgreePage({ searchParams: Promise.resolve({ next: "/tenant" }) }));
    expect(screen.getByRole("heading").textContent).toEqual("Please agree to our Terms");
    expect(screen.getByText("Please read our Terms and Privacy Policy. Then check the box to keep going.")).toBeInTheDocument();
    expect(screen.getByText("Our Terms do not change your lease.")).toBeInTheDocument();
    expect(m.user.mock.calls).toEqual([[{ legal: "skip" }]]);
  });
  it("P2 owner update copy and no tenant lease line", async () => {
    m.rows.mockResolvedValue({ data: [{ ...current, terms_version: "old" }], error: null }); m.role.mockResolvedValue("owner");
    render(await AgreePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading").textContent).toEqual("We updated our Terms");
    expect(screen.getByText("Please read the new Terms and Privacy Policy. Then check the box to keep using Domus.")).toBeInTheDocument();
    expect(screen.queryByText("Our Terms do not change your lease.")).toBeNull();
  });
  it("P4 current acceptance redirects through onboarding state", async () => {
    m.rows.mockResolvedValue({ data: [current], error: null });
    await expect(AgreePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/complete-profile");
  });
  it.each(["owner", "manager", "tenant"] as const)("P5 %s retains the specified exits", (role) => {
    render(<DeclineOptions role={role} />);
    expect(screen.getByText("Don't want to agree?")).toBeInTheDocument();
    expect(screen.getByText("You can sign out, or ask us to delete your account.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute("type", "submit");
    if (role === "owner") {
      expect(screen.getByText("Email privacy@domusbase.com for your data.")).toBeInTheDocument();
      expect(screen.getByText("Delete my account")).toBeInTheDocument(); expect(screen.queryByText("Download my data")).toBeNull();
    } else expect(screen.getByText("Download my data")).toBeInTheDocument();
    if (role === "tenant") {
      expect(screen.getByText("Not ready? Ask your landlord about other ways to pay rent.")).toBeInTheDocument();
      expect(screen.getByText("Deleting your account does not end your lease. Download your data first.")).toBeInTheDocument();
    }
  });
  it.each([false, true])("F2d complete-profile reload passes needsAgreement=%s from persisted rows", async (needsAgreement) => {
    m.rows.mockResolvedValue({ data: needsAgreement ? [] : [current], error: null });
    render(await CompleteProfilePage()); expect(m.form.mock.calls[0][0].needsAgreement).toEqual(needsAgreement);
  });
});
