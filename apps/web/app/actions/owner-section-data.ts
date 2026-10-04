"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, getUserProfileSummary } from "@/lib/auth";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { logPerfEvent } from "@/lib/logger";
import {
  OWNER_SECTION_IDS, OWNER_SHARED_BUNDLES, buildOwnerBundlePlan,
  buildOwnerSectionAvailability, loadOwnerSectionBundles, resolveOwnerPageRequest,
  type OwnerBundleId
} from "@/app/owner/owner-page-data";

// Kept with this fetch-style action: this input is not a mutation form.
const inputSchema = z.object({
  section: z.string().refine(value => OWNER_SECTION_IDS.includes(value)),
  account: z.string().optional(),
  property: z.string().optional(),
  mode: z.string().optional()
}).strict();
export type OwnerSectionInput = z.infer<typeof inputSchema>;
export type OwnerSectionData = Partial<Awaited<ReturnType<typeof loadOwnerSectionBundles>>> & {
  loadedBundles: OwnerBundleId[];
};
export type OwnerSectionResult =
  | { status: "ready"; data: OwnerSectionData }
  | { status: "role-mismatch" | "needs-onboarding" | "needs-setup" }
  | { error: string };

export async function loadOwnerSectionData(input: OwnerSectionInput): Promise<OwnerSectionResult> {
  const startedAt = performance.now();
  // requireAuth redirects and checks role before validation, so cannot serve this fetch contract.
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Authentication required." };
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return { error: "Invalid section request." };
    const role = await getCurrentUserRole(user.id);
    if (role !== "owner") return { status: "role-mismatch" };
    const [profile, ownershipAccounts, capabilities] = await Promise.all([
      getUserProfileSummary(user.id), getOwnershipAccountsForUser(user.id), getFeatureCapabilities()
    ]);
    if (!profile.onboardingCompletedAt) return { status: "needs-onboarding" };
    if (!ownershipAccounts.length) return { status: "needs-setup" };
    const request = resolveOwnerPageRequest({
      ...parsed.data,
      section: parsed.data.section === "daily-ops-home" ? undefined : parsed.data.section
    }, ownershipAccounts);
    const propertyIds = await getAdministeredPropertyIdsForAccount(user.id, request.activeAccountId!);
    if (!propertyIds.includes(request.requestedPropertyId ?? "")) {
      request.requestedPropertyId = null;
      request.initialPropertyId = null;
    }
    const isLlcAccount = ownershipAccounts.find(account => account.id === request.activeAccountId)?.accountType === "llc";
    const { bundles } = buildOwnerBundlePlan({
      capabilities, initialOwnerHomePage: request.initialOwnerHomePage,
      initialSectionId: request.initialSectionId, isLlcAccount,
      sectionAvailability: buildOwnerSectionAvailability({
        capabilities, isLlcAccount, hasManagedProperties: propertyIds.length > 0,
        hasManagerPaymentsSection: false
      })
    });
    OWNER_SHARED_BUNDLES.forEach(bundle => bundles.delete(bundle));
    const sectionData = await loadOwnerSectionBundles({
      userId: user.id, userEmail: user.email ?? "", request, ownershipAccounts, capabilities,
      bundles, connectedPropertyIds: Promise.resolve(propertyIds),
      // Log only fixed operation names/timing, including failures; never raw DB errors or identifiers.
      measure: async (name, work) => {
        const start = performance.now();
        try { return await work(); }
        finally {
          logPerfEvent({ scope: "owner", name, durationMs: performance.now() - start,
            meta: { route: "owner-section-action" } });
        }
      }
    });
    return { status: "ready", data: {
      ...Object.fromEntries(Object.entries(sectionData).filter(([, value]) => value !== undefined)),
      loadedBundles: Array.from(bundles)
    } };
  } catch {
    return { error: "Unable to load this section." };
  } finally {
    logPerfEvent({ scope: "owner", name: "data-assembly.total", durationMs: performance.now() - startedAt,
      meta: { route: "owner-section-action" } });
  }
}
