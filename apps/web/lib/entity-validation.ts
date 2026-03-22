export type EditableFieldType = "text" | "number" | "date" | "email" | "tel" | "select" | "textarea";

export interface EditableFieldOption {
  value: string;
  label: string;
}

export interface EditableField {
  key: string;
  label: string;
  value: string | number | null;
  type: EditableFieldType;
  options?: EditableFieldOption[];
  required?: boolean;
  placeholder?: string;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  description?: string;
  validate?: (value: string) => string | null;
  visibleWhen?: (values: Record<string, string>) => boolean;
}

export type EditableDraftValues = Record<string, string>;
export type EditableChangeSet = Record<string, string | number | null>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeStringValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createEditableDraft(fields: EditableField[]): EditableDraftValues {
  return Object.fromEntries(
    fields.map((field) => [field.key, field.value == null ? "" : String(field.value)])
  );
}

export function normalizeEditableFieldValue(
  field: EditableField,
  rawValue: string
): string | number | null {
  if (field.type === "number") {
    const trimmed = rawValue.trim();
    if (!trimmed.length) {
      return null;
    }
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : trimmed;
  }

  return normalizeStringValue(rawValue);
}

export function validateEditableField(field: EditableField, rawValue: string): string | null {
  const normalizedValue = normalizeEditableFieldValue(field, rawValue);

  if (field.required && (normalizedValue == null || normalizedValue === "")) {
    return `${field.label} is required.`;
  }

  if (normalizedValue == null) {
    return null;
  }

  if (field.type === "email" && typeof normalizedValue === "string" && !EMAIL_REGEX.test(normalizedValue)) {
    return `Enter a valid ${field.label.toLowerCase()}.`;
  }

  if (field.type === "date" && typeof normalizedValue === "string") {
    if (!ISO_DATE_REGEX.test(normalizedValue)) {
      return `Enter a valid ${field.label.toLowerCase()}.`;
    }
    const parsed = new Date(`${normalizedValue}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalizedValue) {
      return `Enter a valid ${field.label.toLowerCase()}.`;
    }
  }

  if (field.type === "number") {
    if (typeof normalizedValue !== "number" || Number.isNaN(normalizedValue)) {
      return `${field.label} must be a number.`;
    }
    if (field.min != null && normalizedValue < field.min) {
      return `${field.label} must be ${field.min} or more.`;
    }
    if (field.max != null && normalizedValue > field.max) {
      return `${field.label} must be ${field.max} or less.`;
    }
  }

  if (field.validate) {
    return field.validate(rawValue.trim());
  }

  return null;
}

export function buildChangedEntityValues(
  fields: EditableField[],
  draftValues: EditableDraftValues
): EditableChangeSet {
  return fields.reduce<EditableChangeSet>((updates, field) => {
    const currentValue = field.value;
    const nextValue = normalizeEditableFieldValue(field, draftValues[field.key] ?? "");

    if (field.type === "number") {
      const normalizedCurrent = currentValue == null ? null : Number(currentValue);
      if (normalizedCurrent !== nextValue) {
        updates[field.key] = nextValue;
      }
      return updates;
    }

    const normalizedCurrent = currentValue == null ? null : String(currentValue).trim() || null;
    if (normalizedCurrent !== nextValue) {
      updates[field.key] = nextValue;
    }
    return updates;
  }, {});
}
