"use client";

import { useId, useState } from "react";
import { Building2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { buildHomeGroups } from "@/lib/home-scope";
import type { PropertyListItem } from "@/lib/portfolio";

interface PropertySelectorOption {
  id: string;
  name: string;
  address?: string;
}

interface PropertySelectorProps {
  properties: PropertySelectorOption[];
  managerProperties?: PropertyListItem[];
  selectedScopeValue?: string;
  onSelectScope?: (value: string) => void;
  selectedPropertyId: string | null;
  onSelect: (propertyId: string | null) => void;
}

export function PropertySelector({
  properties,
  managerProperties,
  selectedScopeValue,
  onSelectScope,
  selectedPropertyId,
  onSelect
}: PropertySelectorProps) {
  const selectId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? null;
  const groups = managerProperties ? buildHomeGroups(managerProperties) : [];

  if (properties.length === 0) {
    return null;
  }

  return (
    <div className="w-full sm:max-w-sm">
      <label
        htmlFor={selectId}
        className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      >
        <Building2 className="h-3.5 w-3.5" />
        Show
      </label>
      <Select
        id={selectId}
        value={managerProperties ? selectedScopeValue ?? "" : selectedPropertyId ?? ""}
        onChange={(event) => managerProperties
          ? onSelectScope?.(event.target.value) : onSelect(event.target.value || null)}
        onFocus={() => setIsExpanded(true)}
        onBlur={() => setIsExpanded(false)}
        title={
          selectedProperty?.address
            ? `${selectedProperty.name} — ${selectedProperty.address}`
            : "Choose which home to show."
        }
        aria-haspopup="listbox"
        aria-expanded={isExpanded}
        className="h-11 truncate"
      >
        <option value="">All homes</option>
        {managerProperties ? groups.map((group) => (
          <optgroup key={group.id} label={`${group.isClient ? "Client" : "Owner"} · ${group.name}`}>
            {group.id.startsWith("unassigned:") ? null : (
              <option value={`account:${group.id}`}>
                All {group.homes.length} {group.name} {group.homes.length === 1 ? "home" : "homes"}
              </option>
            )}
            {group.homes.map((home) => <option key={home.id} value={`property:${home.id}`}>{home.name}</option>)}
          </optgroup>
        )) : properties.map((property) => (
          <option key={property.id} value={property.id}>
            {property.name}
          </option>
        ))}
      </Select>
      {managerProperties ? <p className="mt-2 text-xs text-[var(--muted)]">
        Your choice stays as you move between pages.
      </p> : null}
    </div>
  );
}
