"use client";

import type { ActionState } from "@/app/actions";
import type { ChargeRowData } from "../charge-row";

export type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type Charge = ChargeRowData;

export interface ChargeLeaseOption {
  id: string;
  tenantLabel: string;
  propertyLabel: string;
}

export interface AutopayEnrollmentView {
  id: string;
  leaseId: string;
  propertyLabel: string;
  last4: string;
  brand: string | null;
  paymentMethodType: string;
  enabled: boolean;
  retryCount: number;
}

export interface ChargesSectionProps {
  charges: Charge[];
  onPayCharge: (formData: FormData) => Promise<void>;
  onPayWithACH?: (formData: FormData) => Promise<void>;
  onDeletePendingCharge?: StatefulAction;
  onEditCharge?: StatefulAction;
  onCreateManualCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onRecordManualPayment?: StatefulAction;
  onSendMessageToTenant?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onGenerateChargesHref?: string;
  showManualPayment?: boolean;
  ownerConnectedMap?: Map<string, boolean>;
  stripeConnected?: boolean;
  isTenantView?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
  onDisableAutopay?: StatefulAction;
  tenantPayState?: "can_pay" | "not_ready" | "outside" | "paid" | "not_posted";
  previewCount?: number;
  availableLeases?: ChargeLeaseOption[];
  /** @deprecated Use simpleRentView. Kept for existing owner component tests. */
  isOwnerView?: boolean;
  simpleRentView?: boolean;
  showBankConnectionNotice?: boolean;
  bankConnected?: boolean;
  hideTenantPaymentControls?: boolean;
}
