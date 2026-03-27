import { z } from "zod";
import {
  hasChangedFields,
  optionalNullableNumberUpdateSchema,
  optionalNumberUpdateSchema,
  optionalOwnershipAccountIdSchema,
  optionalPositiveIntegerSchema,
  optionalRequiredStringUpdateSchema
} from "@/lib/validations-auth";

export const createPropertySchema = z.object({
  name: z.string().min(1, "Property name is required."),
  addressLine1: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  postalCode: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code.").optional()
  ),
  propertyType: z
    .enum(["single_family", "duplex", "triplex", "apartment", "condo", "townhouse"])
    .optional(),
  ownerAccountId: optionalOwnershipAccountIdSchema
});

export const createUnitSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  unitNumber: z.string().min(1, "Unit number is required."),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be 0 or more."),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be 0 or more."),
  monthlyRentDollars: z.coerce.number().min(0, "Monthly rent cannot be negative."),
  squareFeet: optionalPositiveIntegerSchema
});

export const updatePropertySchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  name: z.string().min(1, "Property name is required."),
  addressLine1: z.string().min(1, "Street address is required."),
  city: z.string().min(1, "City is required."),
  state: z.string().min(1, "State is required."),
  postalCode: z
    .string()
    .min(1, "ZIP code is required.")
    .regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code.")
});

export const renamePropertySchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  name: z
    .string()
    .min(1, "Property name is required.")
    .max(120, "Property name must be under 120 characters.")
});

export const deletePropertySchema = z.object({
  propertyId: z.string().uuid("Invalid property selection.")
});

export const updateUnitSchema = z.object({
  unitId: z.string().uuid("Invalid unit selection."),
  unitNumber: z.string().min(1, "Unit label is required."),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be 0 or more."),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be 0 or more."),
  monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
  squareFeet: optionalPositiveIntegerSchema
});

export const updatePropertyDetailsSchema = z
  .object({
    propertyId: z.string().uuid("Invalid property selection."),
    name: optionalRequiredStringUpdateSchema(
      "Property name is required.",
      120,
      "Property name must be under 120 characters."
    ),
    addressLine1: optionalRequiredStringUpdateSchema(
      "Street address is required.",
      180,
      "Street address must be under 180 characters."
    ),
    city: optionalRequiredStringUpdateSchema(
      "City is required.",
      120,
      "City must be under 120 characters."
    ),
    state: optionalRequiredStringUpdateSchema(
      "State is required.",
      60,
      "State must be under 60 characters."
    ),
    postalCode: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z
        .string()
        .min(1, "ZIP code is required.")
        .regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code.")
        .optional()
    )
  })
  .refine((data) => hasChangedFields(data, ["propertyId"]), {
    message: "No property changes were provided."
  });

export const updateUnitDetailsSchema = z
  .object({
    unitId: z.string().uuid("Invalid unit selection."),
    unitNumber: optionalRequiredStringUpdateSchema(
      "Unit label is required.",
      80,
      "Unit label must be under 80 characters."
    ),
    bedrooms: optionalNumberUpdateSchema(z.coerce.number().int().min(0, "Bedrooms must be 0 or more.")),
    bathrooms: optionalNumberUpdateSchema(z.coerce.number().min(0, "Bathrooms must be 0 or more.")),
    monthlyRentDollars: optionalNumberUpdateSchema(
      z.coerce.number().min(0, "Monthly rent cannot be negative.")
    ),
    squareFeet: optionalNullableNumberUpdateSchema(
      z.coerce.number().int().min(0, "Square footage must be 0 or more.")
    )
  })
  .refine((data) => hasChangedFields(data, ["unitId"]), {
    message: "No unit changes were provided."
  });

export const updateUnitFieldSchema = z.discriminatedUnion("field", [
  z.object({
    unitId: z.string().uuid("Invalid unit selection."),
    field: z.literal("unitNumber"),
    value: z.string().min(1, "Unit label is required.").max(50, "Unit label must be under 50 characters.")
  }),
  z.object({
    unitId: z.string().uuid("Invalid unit selection."),
    field: z.literal("monthlyRentDollars"),
    value: z.coerce
      .number()
      .min(0, "Monthly rent cannot be negative.")
      .max(100000, "Monthly rent cannot exceed $100,000.")
  })
]);

export const deleteUnitSchema = z.object({
  unitId: z.string().uuid("Invalid unit selection.")
});

export const createVendorSchema = z.object({
  name: z
    .string()
    .min(1, "Vendor name is required.")
    .max(120, "Vendor name must be under 120 characters."),
  email: z.union([z.string().email("Enter a valid email address."), z.literal("")]).optional(),
  phone: z.string().max(30, "Phone must be under 30 characters.").optional(),
  tradeCategory: z.enum(
    [
      "plumbing",
      "electrical",
      "hvac",
      "general",
      "landscaping",
      "cleaning",
      "roofing",
      "painting",
      "appliance",
      "other"
    ],
    { message: "Select a valid trade category." }
  ),
  preferred: z.preprocess((value) => value === "true" || value === "on" || value === true, z.boolean()),
  ownerAccountId: optionalOwnershipAccountIdSchema
});

export const updateVendorSchema = z.object({
  vendorId: z.string().uuid("Invalid vendor."),
  name: z
    .string()
    .min(1, "Vendor name is required.")
    .max(120, "Vendor name must be under 120 characters."),
  email: z.union([z.string().email("Enter a valid email address."), z.literal("")]).optional(),
  phone: z.string().max(30, "Phone must be under 30 characters.").optional(),
  tradeCategory: z.enum(
    [
      "plumbing",
      "electrical",
      "hvac",
      "general",
      "landscaping",
      "cleaning",
      "roofing",
      "painting",
      "appliance",
      "other"
    ],
    { message: "Select a valid trade category." }
  ),
  preferred: z.preprocess((value) => value === "true" || value === "on" || value === true, z.boolean())
});

export const assignVendorSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  vendorId: z.string().uuid("Invalid vendor selection.")
});

export const uploadPropertyFileSchema = z.object({
  propertyId: z.string().uuid("Invalid property."),
  category: z.enum(["lease_agreement", "inspection", "insurance", "tax", "receipt", "other"], {
    message: "Select a valid category."
  }),
  visibility: z.enum(["owner_manager", "all"], { message: "Select a valid visibility option." }),
  description: z.string().max(500, "Description must be under 500 characters.").optional()
});

export const deletePropertyFileSchema = z.object({
  fileId: z.string().uuid("Invalid file.")
});

export const updateFileVisibilitySchema = z.object({
  fileId: z.string().uuid("Invalid file."),
  visibility: z.enum(["owner_manager", "all"], { message: "Select a valid visibility option." })
});
