import { createClient } from "@/lib/supabase/server";
import { getAdministeredPropertyIds } from "@/lib/property-access";

export type ListingStatus = "draft" | "published" | "paused" | "archived";

export interface RentalListingDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  status: ListingStatus;
  headline: string;
  description: string | null;
  askingRentCents: number;
  availableOn: string | null;
  bedroomCount: number | null;
  bathroomCount: number | null;
  createdAt: string;
  updatedAt: string;
}

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

export async function getRentalListingsForUser(userId: string): Promise<RentalListingDTO[]> {
  const supabase = createClient();
  const propertyIds = await getAdministeredPropertyIds(userId);
  if (propertyIds.length === 0) {
    return [];
  }

  const [{ data: listings, error: listingError }, { data: properties }] = await Promise.all([
    supabase
      .from("rental_listings")
      .select(
        "id, property_id, status, headline, description, asking_rent_cents, available_on, bedroom_count, bathroom_count, created_at, updated_at"
      )
      .in("property_id", propertyIds)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("properties")
      .select("id, name")
      .in("id", propertyIds)
  ]);

  if (listingError && isMissingSchemaError(listingError)) {
    return [];
  }

  const propertyNameById = new Map((properties ?? []).map((property) => [property.id, property.name]));

  return (listings ?? []).map((listing) => ({
    id: listing.id,
    propertyId: listing.property_id,
    propertyName: propertyNameById.get(listing.property_id) ?? "Property",
    status: listing.status as ListingStatus,
    headline: listing.headline,
    description: listing.description,
    askingRentCents: listing.asking_rent_cents,
    availableOn: listing.available_on,
    bedroomCount:
      listing.bedroom_count === null || listing.bedroom_count === undefined
        ? null
        : Number(listing.bedroom_count),
    bathroomCount:
      listing.bathroom_count === null || listing.bathroom_count === undefined
        ? null
        : Number(listing.bathroom_count),
    createdAt: listing.created_at,
    updatedAt: listing.updated_at
  }));
}
