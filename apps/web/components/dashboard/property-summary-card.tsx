"use client";

import type { ReactNode } from "react";
import { Building2, MapPin, Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PropertySummaryCardProps {
  property: {
    id: string;
    name: string;
    address?: string;
  };
  unitCount: number;
  occupiedUnits: number;
  monthlyRentCents: number;
  openTickets: number;
  onViewDetails: () => void;
}

export function PropertySummaryCard({
  property,
  unitCount,
  occupiedUnits,
  monthlyRentCents,
  openTickets,
  onViewDetails
}: PropertySummaryCardProps) {
  const occupancy = unitCount > 0 ? Math.round((occupiedUnits / unitCount) * 100) : 0;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-foreground">{property.name}</h3>
              {property.address ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{property.address}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-3xl">
          <SummaryMetric label="Occupancy" value={`${occupancy}%`} />
          <SummaryMetric label="Units" value={String(unitCount)} />
          <SummaryMetric label="Monthly Rent" value={formatCurrency(monthlyRentCents)} />
          <SummaryMetric
            label="Open Tickets"
            value={String(openTickets)}
            icon={<Wrench className="h-3.5 w-3.5 text-amber-500" />}
          />
        </div>

        <div className="flex items-center lg:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onViewDetails}
            title={`Open the portfolio details for ${property.name}.`}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryMetric({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/80 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
