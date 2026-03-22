import type { LeaseListItem, PropertyListItem, UnitListItem } from "@/lib/portfolio";
import type { ManagerPaymentConfigDTO } from "@/lib/manager-payments";
import type { EditableChangeSet, EditableField } from "@/lib/entity-validation";

export function buildPropertyEditFields(property: Pick<PropertyListItem, "name" | "addressLine1" | "city" | "state" | "postalCode">): EditableField[] {
  return [
    {
      key: "name",
      label: "Property Name",
      value: property.name,
      type: "text",
      required: true,
      placeholder: "Oak Street Duplex"
    },
    {
      key: "addressLine1",
      label: "Street Address",
      value: property.addressLine1,
      type: "text",
      required: true,
      placeholder: "131 Chaste Tree Circle"
    },
    {
      key: "city",
      label: "City",
      value: property.city,
      type: "text",
      required: true,
      placeholder: "Austin"
    },
    {
      key: "state",
      label: "State",
      value: property.state,
      type: "text",
      required: true,
      placeholder: "TX"
    },
    {
      key: "postalCode",
      label: "ZIP Code",
      value: property.postalCode,
      type: "text",
      required: true,
      placeholder: "78701",
      validate: (value) => (/^\d{5}(-\d{4})?$/.test(value) ? null : "Enter a valid 5-digit ZIP code.")
    }
  ];
}

export function buildUnitEditFields(unit: Pick<UnitListItem, "unitNumber" | "bedrooms" | "bathrooms" | "monthlyRentCents" | "squareFeet">): EditableField[] {
  return [
    {
      key: "unitNumber",
      label: "Unit Name",
      value: unit.unitNumber,
      type: "text",
      required: true,
      placeholder: "Unit A or Master Suite"
    },
    {
      key: "bedrooms",
      label: "Bedrooms",
      value: unit.bedrooms,
      type: "number",
      min: 0,
      step: 1
    },
    {
      key: "bathrooms",
      label: "Bathrooms",
      value: unit.bathrooms,
      type: "number",
      min: 0,
      step: 0.5
    },
    {
      key: "squareFeet",
      label: "Square Footage",
      value: unit.squareFeet,
      type: "number",
      min: 0,
      step: 1,
      placeholder: "Optional"
    },
    {
      key: "monthlyRentDollars",
      label: "Monthly Rent",
      value: unit.monthlyRentCents / 100,
      type: "number",
      prefix: "$",
      min: 0,
      step: 0.01
    }
  ];
}

export function buildLeaseEditFields(lease: Pick<LeaseListItem, "startDate" | "endDate" | "monthlyRentCents" | "notes">): EditableField[] {
  return [
    {
      key: "startDate",
      label: "Start Date",
      value: lease.startDate,
      type: "date",
      required: true
    },
    {
      key: "endDate",
      label: "End Date",
      value: lease.endDate,
      type: "date",
      required: true
    },
    {
      key: "monthlyRentDollars",
      label: "Monthly Rent",
      value: lease.monthlyRentCents / 100,
      type: "number",
      prefix: "$",
      required: true,
      min: 0.01,
      step: 0.01
    },
    {
      key: "notes",
      label: "Notes / Terms",
      value: lease.notes,
      type: "textarea",
      placeholder: "Add owner-side lease notes or reminders.",
      rows: 5
    }
  ];
}

export function buildTenantEditFields(tenant: {
  fullName: string;
  email: string;
  phone: string | null;
}): EditableField[] {
  return [
    {
      key: "fullName",
      label: "Tenant Name",
      value: tenant.fullName,
      type: "text",
      required: true,
      placeholder: "Alex Tenant"
    },
    {
      key: "email",
      label: "Display Email",
      value: tenant.email,
      type: "email",
      required: true,
      placeholder: "tenant@example.com",
      description: "This updates the owner-facing record only, not the tenant's login email."
    },
    {
      key: "phone",
      label: "Phone",
      value: tenant.phone,
      type: "tel",
      placeholder: "Optional"
    }
  ];
}

export function buildManagerEditFields(config: Pick<ManagerPaymentConfigDTO, "managerName" | "managerEmail" | "label" | "paymentType" | "percentageRate" | "flatAmountCents" | "baseRentCents" | "frequency">): EditableField[] {
  return [
    {
      key: "fullName",
      label: "Manager Name",
      value: config.managerName,
      type: "text",
      required: true,
      placeholder: "Morgan Manager"
    },
    {
      key: "email",
      label: "Display Email",
      value: config.managerEmail,
      type: "email",
      required: true,
      placeholder: "manager@example.com"
    },
    {
      key: "label",
      label: "Payment Label",
      value: config.label,
      type: "text",
      required: true,
      placeholder: "Property Management Fee"
    },
    {
      key: "paymentType",
      label: "Payment Type",
      value: config.paymentType,
      type: "select",
      required: true,
      options: [
        { value: "percentage", label: "Percentage of Rent" },
        { value: "flat", label: "Flat Fee" }
      ]
    },
    {
      key: "percentageRate",
      label: "Percentage Rate",
      value: config.percentageRate,
      type: "number",
      min: 0,
      max: 100,
      step: 0.01,
      visibleWhen: (values) => (values.paymentType ?? config.paymentType) === "percentage"
    },
    {
      key: "flatAmountDollars",
      label: "Flat Fee",
      value: config.flatAmountCents != null ? config.flatAmountCents / 100 : null,
      type: "number",
      prefix: "$",
      min: 0,
      step: 0.01,
      visibleWhen: (values) => (values.paymentType ?? config.paymentType) === "flat"
    },
    {
      key: "baseRentDollars",
      label: "Base Rent",
      value: config.baseRentCents != null ? config.baseRentCents / 100 : null,
      type: "number",
      prefix: "$",
      min: 0,
      step: 0.01
    },
    {
      key: "frequency",
      label: "Payment Schedule",
      value: config.frequency,
      type: "select",
      required: true,
      options: [
        { value: "monthly", label: "Monthly" },
        { value: "biweekly", label: "Biweekly" },
        { value: "weekly", label: "Weekly" }
      ]
    }
  ];
}

export function buildEntityUpdateFormData(
  identityValues: Record<string, string>,
  updates: EditableChangeSet
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(identityValues)) {
    formData.set(key, value);
  }

  for (const [key, value] of Object.entries(updates)) {
    formData.set(key, value == null ? "" : String(value));
  }

  return formData;
}
