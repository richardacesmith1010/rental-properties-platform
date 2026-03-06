export interface PropertySeed {
  key: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface UnitSeed {
  key: string;
  label: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRentCents: number;
}

export interface TenantSeed {
  key: string;
  email: string;
  fullName: string;
}

export interface VendorSeed {
  key: string;
  name: string;
  tradeCategory:
    | "plumbing"
    | "electrical"
    | "hvac"
    | "general"
    | "landscaping"
    | "cleaning"
    | "roofing"
    | "painting"
    | "appliance"
    | "other";
  email: string;
  phone: string;
  preferred: boolean;
}

export const propertySeeds: PropertySeed[] = [
  {
    key: "sunset-ridge",
    name: "Sunset Ridge Apartments",
    addressLine1: "101 Sunset Ridge Drive",
    city: "Denver",
    state: "CO",
    postalCode: "80205"
  },
  {
    key: "oak-park",
    name: "Oak Park Townhomes",
    addressLine1: "455 Oak Park Lane",
    city: "Aurora",
    state: "CO",
    postalCode: "80012"
  },
  {
    key: "harbor-view",
    name: "Harbor View Complex",
    addressLine1: "220 Harbor View Street",
    city: "Lakewood",
    state: "CO",
    postalCode: "80214"
  }
];

export const unitsPerProperty: UnitSeed[] = [
  { key: "101", label: "101", bedrooms: 2, bathrooms: 1, monthlyRentCents: 150000 },
  { key: "102", label: "102", bedrooms: 3, bathrooms: 2, monthlyRentCents: 180000 }
];

export const tenantSeeds: TenantSeed[] = [
  { key: "tenant-1", email: "tenant1@domus-test.local", fullName: "Taylor Rivera" },
  { key: "tenant-2", email: "tenant2@domus-test.local", fullName: "Jordan Lee" },
  { key: "tenant-3", email: "tenant3@domus-test.local", fullName: "Casey Morgan" }
];

export const vendorSeeds: VendorSeed[] = [
  {
    key: "vendor-plumbing",
    name: "Rapid Plumbing Co.",
    tradeCategory: "plumbing",
    email: "dispatch@rapidplumbing.test",
    phone: "555-301-1000",
    preferred: true
  },
  {
    key: "vendor-electrical",
    name: "Northline Electrical",
    tradeCategory: "electrical",
    email: "ops@northlineelectric.test",
    phone: "555-301-2000",
    preferred: true
  },
  {
    key: "vendor-general",
    name: "Summit Property Services",
    tradeCategory: "general",
    email: "service@summitprops.test",
    phone: "555-301-3000",
    preferred: false
  }
];
