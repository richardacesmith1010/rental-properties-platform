import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface ApplicationEventDTO {
  id: string;
  eventType: string;
  actorEmail: string | null;
  message: string | null;
  createdAt: string;
}

export interface ApplicationDTO {
  id: string;
  listingId: string;
  propertyId: string;
  propertyName: string;
  listingHeadline: string;
  applicantEmail: string;
  applicantName: string | null;
  applicantPhone: string | null;
  status: "submitted" | "in_review" | "approved" | "rejected" | "withdrawn";
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  notes: string | null;
  source: string | null;
  screeningScore: number | null;
  screeningStatus: "pending" | "completed" | "failed" | null;
  events: ApplicationEventDTO[];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export async function getApplicationsForUser(
  userId: string,
  accountId?: string | null
): Promise<ApplicationDTO[]> {
  const supabase = createClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return [];
  }

  const { data: applications, error: applicationsError } = await supabase
    .from("rental_applications")
    .select(
      "id, listing_id, property_id, applicant_email, applicant_name, applicant_phone, status, submitted_at, reviewed_at, reviewed_by_profile_id, notes, source"
    )
    .in("property_id", propertyIds)
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (applicationsError && isMissingSchemaError(applicationsError)) {
    return [];
  }

  if (applicationsError) {
    console.error("Failed to fetch rental applications:", applicationsError.message);
    return [];
  }

  const applicationRows = applications ?? [];
  if (applicationRows.length === 0) {
    return [];
  }

  const applicationIds = applicationRows.map((application) => application.id);
  const listingIds = unique(
    applicationRows.map((application) => application.listing_id).filter((value): value is string => Boolean(value))
  );
  const reviewerIds = unique(
    applicationRows
      .map((application) => application.reviewed_by_profile_id)
      .filter((value): value is string => Boolean(value))
  );

  const [
    { data: listings, error: listingsError },
    { data: properties, error: propertiesError },
    { data: screeningReports, error: screeningError },
    { data: events, error: eventsError }
  ] = await Promise.all([
    listingIds.length
      ? supabase.from("rental_listings").select("id, headline").in("id", listingIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("properties").select("id, name").in("id", propertyIds),
    supabase
      .from("screening_reports")
      .select("id, application_id, score, status, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("application_events")
      .select("id, application_id, event_type, actor_profile_id, message, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false })
  ]);

  if (listingsError && isMissingSchemaError(listingsError)) {
    return [];
  }
  if (propertiesError && isMissingSchemaError(propertiesError)) {
    return [];
  }
  if (screeningError && isMissingSchemaError(screeningError)) {
    return [];
  }
  if (eventsError && isMissingSchemaError(eventsError)) {
    return [];
  }

  if (listingsError) {
    console.error("Failed to fetch rental listings for applications:", listingsError.message);
  }
  if (propertiesError) {
    console.error("Failed to fetch properties for applications:", propertiesError.message);
  }
  if (screeningError) {
    console.error("Failed to fetch screening reports:", screeningError.message);
  }
  if (eventsError) {
    console.error("Failed to fetch application events:", eventsError.message);
  }

  const actorIds = unique(
    [
      ...reviewerIds,
      ...((events ?? [])
        .map((event) => event.actor_profile_id)
        .filter((value): value is string => Boolean(value)))
    ]
  );

  const { data: profiles, error: profilesError } = actorIds.length
    ? await supabase.from("profiles").select("id, email").in("id", actorIds)
    : { data: [], error: null };

  if (profilesError && isMissingSchemaError(profilesError)) {
    return [];
  }

  if (profilesError) {
    console.error("Failed to resolve profile emails for applications:", profilesError.message);
  }

  const listingHeadlineById = new Map((listings ?? []).map((listing) => [listing.id, listing.headline]));
  const propertyNameById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const profileEmailById = new Map((profiles ?? []).map((profile) => [profile.id, profile.email]));

  const latestScreeningByApplicationId = new Map<
    string,
    { score: number | null; status: "pending" | "completed" | "failed" | null }
  >();

  for (const report of screeningReports ?? []) {
    if (latestScreeningByApplicationId.has(report.application_id)) {
      continue;
    }

    latestScreeningByApplicationId.set(report.application_id, {
      score: report.score === null || report.score === undefined ? null : Number(report.score),
      status: (report.status as "pending" | "completed" | "failed" | null) ?? null
    });
  }

  const eventsByApplicationId = new Map<string, ApplicationEventDTO[]>();
  for (const event of events ?? []) {
    const current = eventsByApplicationId.get(event.application_id) ?? [];
    current.push({
      id: event.id,
      eventType: event.event_type,
      actorEmail: event.actor_profile_id ? profileEmailById.get(event.actor_profile_id) ?? null : null,
      message: event.message,
      createdAt: event.created_at
    });
    eventsByApplicationId.set(event.application_id, current);
  }

  return applicationRows.map((application) => {
    const screening = latestScreeningByApplicationId.get(application.id);

    return {
      id: application.id,
      listingId: application.listing_id,
      propertyId: application.property_id,
      propertyName: propertyNameById.get(application.property_id) ?? "Property",
      listingHeadline: listingHeadlineById.get(application.listing_id) ?? "Listing",
      applicantEmail: application.applicant_email,
      applicantName: application.applicant_name,
      applicantPhone: application.applicant_phone,
      status: application.status as ApplicationDTO["status"],
      submittedAt: application.submitted_at,
      reviewedAt: application.reviewed_at,
      reviewedByEmail: application.reviewed_by_profile_id
        ? profileEmailById.get(application.reviewed_by_profile_id) ?? null
        : null,
      notes: application.notes,
      source: application.source,
      screeningScore: screening?.score ?? null,
      screeningStatus: screening?.status ?? null,
      events: eventsByApplicationId.get(application.id) ?? []
    };
  });
}
