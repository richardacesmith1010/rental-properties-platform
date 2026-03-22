"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { FieldLabel } from "@/components/dashboard/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import {
  buildChangedEntityValues,
  createEditableDraft,
  type EditableChangeSet,
  type EditableDraftValues,
  type EditableField,
  validateEditableField
} from "@/lib/entity-validation";

interface EntityEditModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  entityType: string;
  fields: EditableField[];
  onSave: (updates: EditableChangeSet) => Promise<{ error?: string; message?: string } | void>;
  submitLabel?: string;
}

function renderFieldInput(
  field: EditableField,
  value: string,
  error: string | null,
  onChange: (nextValue: string) => void
) {
  const commonProps = {
    id: `${field.key}-input`,
    name: field.key,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(event.target.value),
    placeholder: field.placeholder,
    title: `Edit ${field.label.toLowerCase()}`,
    error: Boolean(error)
  };

  if (field.type === "textarea") {
    return <Textarea {...commonProps} rows={field.rows ?? 4} />;
  }

  if (field.type === "select") {
    return (
      <Select {...commonProps}>
        <option value="">Select an option</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <div className="relative">
      {field.prefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {field.prefix}
        </span>
      ) : null}
      <Input
        {...commonProps}
        type={field.type}
        min={field.min}
        max={field.max}
        step={field.step ?? (field.type === "number" ? "0.01" : undefined)}
        className={field.prefix ? "pl-8" : undefined}
      />
    </div>
  );
}

export function EntityEditModal({
  open,
  onClose,
  title,
  entityType,
  fields,
  onSave,
  submitLabel = "Save Changes"
}: EntityEditModalProps) {
  const previousOpenRef = useRef(false);
  const [draftValues, setDraftValues] = useState<EditableDraftValues>(() => createEditableDraft(fields));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nextDraft = createEditableDraft(fields);
    if (open && !previousOpenRef.current) {
      setDraftValues(nextDraft);
      setErrors({});
      setFormError(null);
    }
    previousOpenRef.current = open;
  }, [fields, open]);

  const renderedFields = fields.filter((field) => !field.visibleWhen || field.visibleWhen(draftValues));

  const handleChange = (fieldKey: string, nextValue: string) => {
    setDraftValues((current) => ({ ...current, [fieldKey]: nextValue }));
    setErrors((current) => ({ ...current, [fieldKey]: null }));
    setFormError(null);
  };

  const handleSubmit = async () => {
    const nextErrors = Object.fromEntries(
      renderedFields.map((field) => [field.key, validateEditableField(field, draftValues[field.key] ?? "")])
    );
    setErrors(nextErrors);
    const firstError = Object.values(nextErrors).find(Boolean) ?? null;
    if (firstError) {
      setFormError(firstError);
      toast.error(firstError);
      return;
    }

    const updates = buildChangedEntityValues(fields, draftValues);
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const result = await onSave(updates);
      if (result?.error) {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(result?.message ?? `${title} saved.`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to update this ${entityType}.`;
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalOverlay open={open} onClose={isSaving ? undefined : onClose}>
      <div className="mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Pencil className="h-3.5 w-3.5" />
              Edit {entityType}
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{title}</h3>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={onClose}
            disabled={isSaving}
            title={`Close ${title.toLowerCase()}`}
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 scroll-smooth [-webkit-overflow-scrolling:touch]">
          <div className="space-y-5">
            {formError ? <Alert variant="error">{formError}</Alert> : null}
            {renderedFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <FieldLabel htmlFor={`${field.key}-input`} required={field.required}>
                  {field.label}
                </FieldLabel>
                {field.description ? <p className="text-sm text-muted-foreground">{field.description}</p> : null}
                {renderFieldInput(field, draftValues[field.key] ?? "", errors[field.key] ?? null, (nextValue) =>
                  handleChange(field.key, nextValue)
                )}
                {errors[field.key] ? <p className="text-sm text-red-600">{errors[field.key]}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            title={`Cancel editing ${entityType}`}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            loading={isSaving}
            title={`Save ${entityType} changes`}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  );
}
