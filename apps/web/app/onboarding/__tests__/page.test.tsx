import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTenantInviteOnboardingContextMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/actions", () => ({ completeOnboarding: vi.fn() }));
vi.mock("@/components/gamification/dom-mascot", () => ({
  DomMascot: () => <div>Domus welcome</div>
}));
vi.mock("@/components/onboarding/onboarding-form", () => ({
  OnboardingForm: () => <div>Onboarding form</div>
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({
    id: "tenant-1",
    email: "tenant@example.com",
    user_metadata: {}
  }),
  getCurrentUserRole: vi.fn().mockResolvedValue("tenant"),
  getRoleHomePath: vi.fn().mockReturnValue("/tenant")
}));
vi.mock("@/lib/invitations", () => ({
  getTenantInviteOnboardingContext: getTenantInviteOnboardingContextMock
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { full_name: "Smoke Tenant", onboarding_completed_at: null }
          })
        })
      })
    })
  })
}));

import OnboardingPage from "@/app/onboarding/page";

const baseInviteContext = {
  invitationId: "invite-1",
  tenantName: "Smoke Tenant",
  propertyAddress: null,
  unitLabel: "Unit S",
  monthlyRentLabel: null,
  leaseStartDate: null,
  leaseEndDate: null,
  status: "pending" as const
};

describe("tenant onboarding invite context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders inviter and property names from invite metadata context", async () => {
    getTenantInviteOnboardingContextMock.mockResolvedValue({
      ...baseInviteContext,
      ownerName: "Smoke Owner",
      propertyName: "Smoke Test Property"
    });

    const html = renderToStaticMarkup(await OnboardingPage());

    expect(html).toContain("Smoke Owner");
    expect(html).toContain("Smoke Test Property");
    expect(html).toContain("Unit S");
  });

  it("renders graceful fallbacks for legacy invite metadata", async () => {
    getTenantInviteOnboardingContextMock.mockResolvedValue({
      ...baseInviteContext,
      ownerName: null,
      propertyName: null
    });

    const html = renderToStaticMarkup(await OnboardingPage());

    expect(html).toContain("Your landlord");
    expect(html).toContain("Your rental home");
  });
});
