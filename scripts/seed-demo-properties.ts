export interface DemoProperty {
  id: string;
  name: string;
}

export function buildDemoPropertyRows(
  properties: DemoProperty[],
  ownerProfileId: string,
  ownerAccountId: string
) {
  return [
    {
      id: properties[0]?.id ?? "",
      owner_profile_id: ownerProfileId,
      owner_account_id: ownerAccountId,
      name: properties[0]?.name ?? "Riverside Apartments",
      address_line1: "123 River St",
      city: "Denver",
      state: "CO",
      postal_code: "80205",
      active: true
    },
    {
      id: properties[1]?.id ?? "",
      owner_profile_id: ownerProfileId,
      owner_account_id: ownerAccountId,
      name: properties[1]?.name ?? "Oak Park Duplex",
      address_line1: "456 Oak Ave",
      city: "Lakewood",
      state: "CO",
      postal_code: "80214",
      active: true
    }
  ];
}

export function buildDemoManagerPaymentConfigRows(
  properties: DemoProperty[],
  managerProfileId: string
) {
  return [
    {
      property_id: properties[0]?.id ?? "",
      manager_profile_id: managerProfileId,
      payment_type: "flat",
      flat_amount_cents: 12000,
      label: "Property Management Fee",
      active: true
    },
    {
      property_id: properties[1]?.id ?? "",
      manager_profile_id: managerProfileId,
      payment_type: "flat",
      flat_amount_cents: 9000,
      label: "Property Management Fee",
      active: true
    }
  ];
}
