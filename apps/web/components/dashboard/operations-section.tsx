"use client";

import { useState } from "react";
import type { StatefulAction } from "@/app/actions";
import type { PortfolioData } from "@/lib/portfolio";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { Button } from "@/components/ui/button";
import { PropertyForm, UnitForm, LeaseForm } from "./forms";

export interface OperationsSectionProps {
  portfolio: PortfolioData;
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onPropertyCreated?: () => void;
  onUnitCreated?: () => void;
  onLeaseCreated?: () => void;
}

type OperationTask = "property" | "unit" | "lease" | null;

const tasks = [
  {
    id: "property" as const,
    title: "1. Property",
    description: "Create the property record and assign it to an ownership account."
  },
  {
    id: "unit" as const,
    title: "2. Unit",
    description: "Add the rentable unit with bedrooms, bathrooms, and default rent."
  },
  {
    id: "lease" as const,
    title: "3. Lease",
    description: "Link the unit to a tenant and define lease dates and billing terms."
  }
];

export function OperationsSection({
  portfolio,
  ownershipAccounts,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onPropertyCreated,
  onUnitCreated,
  onLeaseCreated
}: OperationsSectionProps) {
  const [task, setTask] = useState<OperationTask>("property");

  const handlePropertyCreated = () => {
    onPropertyCreated?.();
    setTask("unit");
  };

  const handleUnitCreated = () => {
    onUnitCreated?.();
    setTask("lease");
  };

  const handleLeaseCreated = () => {
    onLeaseCreated?.();
    setTask("lease");
  };

  return (
    <div id="operations" className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Operations Workflow</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tasks.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={task === item.id ? "default" : "outline"}
              onClick={() => setTask(item.id)}
              title={item.description}
            >
              {item.title}
            </Button>
          ))}
        </div>
      </div>

      {task === null ? (
        <div className="grid gap-4 md:grid-cols-3">
          {tasks.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTask(item.id)}
              className="domus-card p-5 text-left transition-transform duration-150 hover:-translate-y-0.5"
              title={item.description}
            >
              <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-2 text-sm text-zinc-600">{item.description}</p>
            </button>
          ))}
        </div>
      ) : null}

      {task === "property" ? (
        <PropertyForm
          ownershipAccounts={ownershipAccounts}
          onCreateProperty={onCreateProperty}
          onPropertyCreated={handlePropertyCreated}
          onBack={() => setTask(null)}
        />
      ) : null}

      {task === "unit" ? (
        <UnitForm
          portfolio={portfolio}
          onCreateUnit={onCreateUnit}
          onUnitCreated={handleUnitCreated}
          onBack={() => setTask(null)}
        />
      ) : null}

      {task === "lease" ? (
        <LeaseForm
          portfolio={portfolio}
          onCreateLease={onCreateLease}
          onLeaseCreated={handleLeaseCreated}
          onBack={() => setTask(null)}
        />
      ) : null}
    </div>
  );
}
