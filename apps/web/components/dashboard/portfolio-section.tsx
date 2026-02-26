import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import type { PropertyListItem } from "@/lib/portfolio";

interface PortfolioSectionProps {
  properties: PropertyListItem[];
}

export function PortfolioSection({ properties }: PortfolioSectionProps) {
  return (
    <Card id="portfolio">
      <CardHeader>
        <CardTitle>Your Portfolio</CardTitle>
      </CardHeader>
      <CardContent>
        {properties.length === 0 ? (
          <EmptyState message="Start by adding your first property." />
        ) : (
          <div>
            {properties.map((property, i) => (
              <DataRow key={property.id} last={i === properties.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{property.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {property.city}, {property.state} {property.postalCode}
                  </p>
                </div>
                <p className="text-xs text-zinc-500">{property.unitCount} units</p>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
