"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerMemberOfProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseFormData, updatePropertyTaxYearSchema } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

export async function savePropertyTaxYear(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`savePropertyTaxYear:${user.id}`, 30, 60 * 60 * 1000).allowed) {
    return { success: false, error: "Could not save. Please try again." };
  }
  const parsed = parseFormData(updatePropertyTaxYearSchema, formData);
  if (!parsed.success) return parsed;
  const { propertyId, taxYear, mortgageInterest, escrowPropertyTax, escrowInsurance, depreciation } = parsed.data;
  try {
    if (!await isOwnerMemberOfProperty(user.id, propertyId)) {
      return { success: false, error: "You can't edit this home." };
    }
    const admin = createAdminClient();
    const { error } = await admin.from("property_tax_years").upsert({
      property_id: propertyId,
      tax_year: taxYear,
      mortgage_interest_cents: mortgageInterest,
      escrow_property_tax_cents: escrowPropertyTax,
      escrow_insurance_cents: escrowInsurance,
      depreciation_cents: depreciation,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: "property_id,tax_year" });
    if (error) throw error;
    revalidatePath("/owner/reports");
    return { success: true, message: "Saved." };
  } catch (error) {
    console.error("savePropertyTaxYear failed", error);
    return { success: false, error: "Could not save. Please try again." };
  }
}
