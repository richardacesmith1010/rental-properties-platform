import "server-only";
import type { User } from "@supabase/supabase-js";
import type { OwnerSectionResult } from "@/lib/owner-section-transport";

import { z } from "zod";
import { getCurrentUserRole, getUserProfileSummary } from "@/lib/auth";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { logPerfEvent, measureQueryCount } from "@/lib/logger";
import {
  OWNER_SECTION_IDS, OWNER_SHARED_BUNDLES, buildOwnerBundlePlan,
  buildOwnerSectionAvailability, loadOwnerSectionBundles, resolveOwnerPageRequest
} from "@/app/owner/owner-page-data";

// Section reads share this strict validation after session authentication.
const inputSchema = z.object({
  section: z.string().refine(value => OWNER_SECTION_IDS.includes(value)),
  account: z.string().optional(),
  property: z.string().optional(),
  mode: z.string().optional(),
  preload: z.boolean().optional()
}).strict();
export async function loadOwnerSectionDataForUser(user: Pick<User, "id" | "email">, input: unknown): Promise<OwnerSectionResult> {
  const startedAt = performance.now();
  let isPreload = false;
  // requireAuth redirects and checks role before validation, so cannot serve this fetch contract.
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return { error: "Invalid section request." };
    isPreload = parsed.data.preload === true;
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
      measure: (name, work) => {
        const start = performance.now();
        return measureQueryCount(work, queries => {
          logPerfEvent({ scope: "owner", name, durationMs: performance.now() - start,
            meta: { route: "owner-section-data-api", queries, ...(isPreload ? { preload: true } : {}) } });
        });
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
      meta: { route: "owner-section-data-api", ...(isPreload ? { preload: true } : {}) } });
  }
}
