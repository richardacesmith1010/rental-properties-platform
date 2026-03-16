"use client";

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
  if (properties.length === 0) {
    return null;
  }

  return (
    <div className="w-full sm:max-w-sm">
      <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <Building2 className="h-3.5 w-3.5" />
        Property Scope
      </label>
      <Select
        value={selectedPropertyId ?? ""}
        onChange={(event) => onSelect(event.target.value || null)}
        title="Choose a property to scope the dashboard."
      >
        <option value="">All Properties</option>
        {properties.map((property) => (
          <option key={property.id} value={property.id}>
            {property.address ? `${property.name} - ${property.address}` : property.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
