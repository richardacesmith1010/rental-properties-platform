import type { ChangeEventHandler } from "react";
import { Badge } from "@/components/ui/badge";

interface LeaseCollectionSettingProps {
  checked?: boolean;
  defaultChecked?: boolean;
  id?: string;
  name?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

export function LeaseCollectionSetting({
  checked,
  defaultChecked,
  id = "lease-collects-outside-domus",
  name,
  onChange
}: LeaseCollectionSettingProps) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
      {name ? <input type="hidden" name={name} value="false" /> : null}
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          value="true"
          checked={checked}
          defaultChecked={checked === undefined ? defaultChecked : undefined}
          onChange={onChange}
          className="mt-0.5 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
          title="Choose whether this tenant pays outside Domus."
        />
        <span>
          <span className="block text-sm font-medium text-[var(--ink)]">
            Tenant pays outside Domus
          </span>
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Domus won&apos;t mark rent late or add late fees. You can still mark rent paid.
          </span>
        </span>
      </label>
    </div>
  );
}

export function PaysOutsideDomusBadge() {
  return (
    <Badge
      variant="outline"
      className="border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]"
    >
      Pays outside Domus
    </Badge>
  );
}
