"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/format";

interface InlineEditResult {
  error?: string;
  message?: string;
}

interface InlineEditProps {
  value: string;
  displayValue?: string;
  onSave: (newValue: string) => Promise<InlineEditResult | void>;
  className?: string;
  inputType?: "text" | "number";
  prefix?: string;
  placeholder?: string;
  validate?: (value: string) => string | null;
  successMessage?: string;
  title?: string;
}

export function InlineEdit({
  value,
  displayValue,
  onSave,
  className,
  inputType = "text",
  prefix,
  placeholder,
  validate,
  successMessage = "Saved.",
  title = "Click to edit"
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const saveTriggeredRef = useRef(false);
  const ignoreBlurRef = useRef(false);

  const restoreTriggerFocus = () => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    setEditValue(value);
    setError(null);
  }, [value]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const cancelEdit = () => {
    ignoreBlurRef.current = true;
    saveTriggeredRef.current = false;
    setEditing(false);
    setEditValue(value);
    setError(null);
    restoreTriggerFocus();
  };

  const handleSave = async () => {
    if (saveTriggeredRef.current || saving) {
      return;
    }

    const nextValue = editValue.trim();
    if (nextValue === value) {
      setEditing(false);
      setError(null);
      restoreTriggerFocus();
      return;
    }

    if (validate) {
      const validationError = validate(nextValue);
      if (validationError) {
        setError(validationError);
        toast.error(validationError);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
    }

    saveTriggeredRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const result = await onSave(nextValue);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      setEditing(false);
      toast.success(result?.message ?? successMessage);
      restoreTriggerFocus();
    } finally {
      saveTriggeredRef.current = false;
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
          setEditValue(value);
          setError(null);
        }}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          className
        )}
        title={title}
        aria-label={title}
      >
        {prefix ? <span className="text-muted-foreground">{prefix}</span> : null}
        <span className="truncate">{(displayValue ?? value) || placeholder || "—"}</span>
      </button>
    );
  }

  return (
    <div
      className="inline-flex max-w-full flex-col gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 shadow-sm">
        {prefix ? <span className="text-sm text-muted-foreground">{prefix}</span> : null}
        <input
          ref={inputRef}
          type={inputType}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEdit();
            }
          }}
          onBlur={() => {
            if (ignoreBlurRef.current) {
              ignoreBlurRef.current = false;
              return;
            }
            void handleSave();
          }}
          disabled={saving}
          className="min-w-[72px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          placeholder={placeholder}
          aria-label={title}
          step={inputType === "number" ? "0.01" : undefined}
        />
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
