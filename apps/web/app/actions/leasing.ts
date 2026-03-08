"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { createNotificationWithDelivery } from "@/lib/notifications";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createRentalListingSchema,
  updateListingStatusSchema,
  createApplicationSchema,
  reviewApplicationSchema,
  addApplicationNoteSchema,
  recordScreeningScoreSchema,
  parseFormData
} from "@/lib/validations";
import {
  ensureCapabilityEnabled,
  isMissingSchemaError,
  type ActionState
} from "./shared";

export async function createRentalListing(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createRentalListingSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    propertyId,
    headline,
    description,
    askingRentDollars,
    availableOn,
    bedroomCount,
    bathroomCount
  } = parsed.data;
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase.from("rental_listings").insert({
    property_id: propertyId,
    created_by_profile_id: user.id,
    status: "draft",
    headline,
    description: description || null,
    asking_rent_cents: Math.round(askingRentDollars * 100),
    available_on: availableOn ? availableOn : null,
    bedroom_count: bedroomCount ?? null,
    bathroom_count: bathroomCount ?? null
  });

  if (error) {
    return { success: false, error: "Failed to create rental listing." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateListingStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(updateListingStatusSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { listingId, status } = parsed.data;
  const { data: listing } = await supabase
    .from("rental_listings")
    .select("id, property_id")
    .eq("id", listingId)
    .single();

  if (!listing) {
    return { success: false, error: "Listing not found." };
  }

  if (!(await canUserAdministerProperty(user.id, listing.property_id))) {
    return { success: false, error: "You do not have access to this listing." };
  }

  const { error } = await supabase
    .from("rental_listings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (error) {
    return { success: false, error: "Failed to update listing status." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function createApplication(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseFormData(createApplicationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const { listingId, propertyId, applicantEmail, applicantName, applicantPhone, source, notes } =
    parsed.data;
  const { data: listing, error: listingError } = await supabase
    .from("rental_listings")
    .select("id, property_id")
    .eq("id", listingId)
    .single();

  if (listingError && await isMissingSchemaError(listingError)) {
    const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
    return capabilityError ?? { success: false, error: "Leasing pipeline is not available." };
  }

  if (!listing) {
    return { success: false, error: "Listing not found." };
  }

  if (listing.property_id !== propertyId) {
    return { success: false, error: "Selected listing does not match the selected property." };
  }

  if (!(await canUserAdministerProperty(user.id, listing.property_id))) {
    return { success: false, error: "You do not have access to this property." };
  }

  const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const { data: application, error: applicationError } = await supabase
    .from("rental_applications")
    .insert({
      listing_id: listing.id,
      property_id: listing.property_id,
      applicant_email: applicantEmail,
      applicant_name: applicantName || null,
      applicant_phone: applicantPhone || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      source: source || null,
      notes: notes || null
    })
    .select("id")
    .single();

  if (applicationError || !application) {
    return { success: false, error: "Failed to create application." };
  }

  const { error: eventError } = await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "submitted",
    actor_profile_id: user.id,
    message: notes || null
  });

  if (eventError) {
    return { success: false, error: "Application created but activity logging failed." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function reviewApplication(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseFormData(reviewApplicationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const { applicationId, status, notes } = parsed.data;
  const { data: application, error: applicationError } = await supabase
    .from("rental_applications")
    .select("id, property_id, applicant_email, listing_id")
    .eq("id", applicationId)
    .single();

  if (applicationError && await isMissingSchemaError(applicationError)) {
    const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
    return capabilityError ?? { success: false, error: "Leasing pipeline is not available." };
  }

  if (!application) {
    return { success: false, error: "Application not found." };
  }

  if (!(await canUserAdministerProperty(user.id, application.property_id))) {
    return { success: false, error: "You do not have access to this application." };
  }

  const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const updatePayload: {
    status: "in_review" | "approved" | "rejected";
    reviewed_by_profile_id: string;
    reviewed_at: string;
    notes?: string;
  } = {
    status,
    reviewed_by_profile_id: user.id,
    reviewed_at: new Date().toISOString()
  };

  if (notes) {
    updatePayload.notes = notes;
  }

  const { error: updateError } = await supabase
    .from("rental_applications")
    .update(updatePayload)
    .eq("id", applicationId);

  if (updateError) {
    return { success: false, error: "Failed to update application review." };
  }

  const { error: eventError } = await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: status,
    actor_profile_id: user.id,
    message: notes || null
  });

  if (eventError) {
    return { success: false, error: "Application updated but event logging failed." };
  }

  if (status === "approved" || status === "rejected") {
    const admin = createAdminClient();
    const [{ data: applicantProfile }, { data: listing }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email")
        .eq("email", application.applicant_email)
        .maybeSingle(),
      admin
        .from("rental_listings")
        .select("headline")
        .eq("id", application.listing_id)
        .maybeSingle()
    ]);

    if (applicantProfile?.id) {
      await createNotificationWithDelivery({
        recipientProfileId: applicantProfile.id,
        recipientEmail: applicantProfile.email,
        type: "application_reviewed",
        title: `Application ${status}`,
        body: `Your application for \"${listing?.headline ?? "the listing"}\" has been ${status}.`,
        entityType: "rental_application",
        entityId: application.id
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function addApplicationNote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseFormData(addApplicationNoteSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const { applicationId, message } = parsed.data;
  const { data: application, error: applicationError } = await supabase
    .from("rental_applications")
    .select("id, property_id")
    .eq("id", applicationId)
    .single();

  if (applicationError && await isMissingSchemaError(applicationError)) {
    const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
    return capabilityError ?? { success: false, error: "Leasing pipeline is not available." };
  }

  if (!application) {
    return { success: false, error: "Application not found." };
  }

  if (!(await canUserAdministerProperty(user.id, application.property_id))) {
    return { success: false, error: "You do not have access to this application." };
  }

  const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const { error } = await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "note",
    actor_profile_id: user.id,
    message
  });

  if (error) {
    return { success: false, error: "Failed to add application note." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function recordScreeningScore(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseFormData(recordScreeningScoreSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const { applicationId, score, summary } = parsed.data;
  const { data: application, error: applicationError } = await supabase
    .from("rental_applications")
    .select("id, property_id")
    .eq("id", applicationId)
    .single();

  if (applicationError && await isMissingSchemaError(applicationError)) {
    const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
    return capabilityError ?? { success: false, error: "Leasing pipeline is not available." };
  }

  if (!application) {
    return { success: false, error: "Application not found." };
  }

  if (!(await canUserAdministerProperty(user.id, application.property_id))) {
    return { success: false, error: "You do not have access to this application." };
  }

  const capabilityError = await ensureCapabilityEnabled("leasingPipelineEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const { error: scoreError } = await supabase.from("screening_reports").insert({
    application_id: application.id,
    provider: "manual",
    status: "completed",
    score,
    summary: summary || null
  });

  if (scoreError) {
    return { success: false, error: "Failed to record screening score." };
  }

  const { error: eventError } = await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "screening_recorded",
    actor_profile_id: user.id,
    message: `Score: ${score}`
  });

  if (eventError) {
    return { success: false, error: "Score recorded but event logging failed." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Documents + E-sign ─── */

