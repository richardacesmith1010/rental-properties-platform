"use client";

import { useId, useState } from "react";
import { Building2 } from "lucide-react";
import { Select } from "@/components/ui/select";

interface PropertySelectorOption {
  id: string;
  name: string;
  address?: string;
}

interface PropertySelectorProps {
  properties: PropertySelectorOption[];
  selectedPropertyId: string | null;
  onSelect: (propertyId: string | null) => void;
}

export function PropertySelector({
  properties,
  selectedPropertyId,
  onSelect
}: PropertySelectorProps) {
  const selectId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? null;

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
        Property Scope
      </label>
      <Select
        id={selectId}
        value={selectedPropertyId ?? ""}
        onChange={(event) => onSelect(event.target.value || null)}
        onFocus={() => setIsExpanded(true)}
        onBlur={() => setIsExpanded(false)}
        title={
          selectedProperty?.address
            ? `${selectedProperty.name} — ${selectedProperty.address}`
            : "Choose a property to scope the dashboard."
        }
        aria-haspopup="listbox"
        aria-expanded={isExpanded}
        className="truncate"
      >
        <option value="">All Properties</option>
        {properties.map((property) => (
          <option key={property.id} value={property.id}>
            {property.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
