"use client";

import { useEffect, useState } from "react";
import type { StatefulAction } from "@/app/actions";
import type { PortfolioData } from "@/lib/portfolio";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { Button } from "@/components/ui/button";
import { AnimatedList } from "@/components/ui/animated-list";
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
  initialTask?: OperationTask;
  initialPropertyId?: string | null;
  onInitialStateConsumed?: () => void;
}

export type OperationTask = "property" | "unit" | "lease" | null;

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
  onLeaseCreated,
  initialTask,
  initialPropertyId = null,
  onInitialStateConsumed
}: OperationsSectionProps) {
  const [task, setTask] = useState<OperationTask>(initialTask ?? "property");
  const [unitPropertyId, setUnitPropertyId] = useState<string | null>(initialPropertyId);

  useEffect(() => {
    if (!initialTask && !initialPropertyId) {
      return;
    }

    setTask(initialTask ?? "property");
    setUnitPropertyId(initialPropertyId ?? null);
    onInitialStateConsumed?.();
  }, [initialPropertyId, initialTask, onInitialStateConsumed]);

  const handlePropertyCreated = () => {
    onPropertyCreated?.();
    setUnitPropertyId(null);
    setTask("unit");
  };

  const handleUnitCreated = () => {
    onUnitCreated?.();
    setUnitPropertyId(null);
    setTask("lease");
  };

  const handleLeaseCreated = () => {
    onLeaseCreated?.();
    setUnitPropertyId(null);
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
              onClick={() => {
                setUnitPropertyId(null);
                setTask(item.id);
              }}
              title={item.description}
            >
              {item.title}
            </Button>
          ))}
        </div>
      </div>

      {task === null ? (
        <AnimatedList className="grid gap-4 md:grid-cols-3">
          {tasks.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setUnitPropertyId(null);
                setTask(item.id);
              }}
              className="domus-card p-5 text-left transition-transform duration-150 hover:-translate-y-0.5"
              title={item.description}
            >
              <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-2 text-sm text-zinc-600">{item.description}</p>
            </button>
          ))}
        </AnimatedList>
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
          initialPropertyId={unitPropertyId}
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
          onCreatePropertyAction={() => {
            setUnitPropertyId(null);
            setTask("property");
          }}
          onAddUnitAction={(propertyId) => {
            setUnitPropertyId(propertyId);
            setTask("unit");
          }}
        />
      ) : null}
    </div>
  );
}
