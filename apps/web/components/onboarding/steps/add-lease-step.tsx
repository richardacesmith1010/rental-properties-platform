"use client";

import { useEffect } from "react";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface AddLeaseStepProps {
  unitId: string;
  monthlyRentDollars: number;
  onCreateLease: StatefulAction;
  onComplete: () => void;
  onSkip: () => void;
}

// The invite step creates the tenant's profile before a lease can be added.
export function AddLeaseStep({ onSkip }: AddLeaseStepProps) {
  useEffect(() => onSkip(), [onSkip]);
  return null;
}
