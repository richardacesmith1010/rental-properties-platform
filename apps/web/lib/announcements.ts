export const ANNOUNCEMENT_SCOPES = [
  "all_administered",
  "specific_properties"
] as const;

export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export const ANNOUNCEMENT_NOTIFICATION_TYPE = "announcement" as const;
export const ANNOUNCEMENT_ENTITY_TYPE = "announcement" as const;

export interface AnnouncementPropertyOption {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

export function formatAnnouncementPropertyLabel(property: AnnouncementPropertyOption) {
  const addressParts = [
    property.addressLine1.trim(),
    [property.city.trim(), property.state.trim()].filter(Boolean).join(", "),
    property.postalCode.trim()
  ].filter(Boolean);

  if (addressParts.length === 0) {
    return property.name;
  }

  return `${property.name} - ${addressParts.join(" ")}`;
}
