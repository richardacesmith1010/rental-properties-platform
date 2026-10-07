export interface LeaseDraft {
  propertyId: string;
  unitId: string;
  tenantProfileId: string;
  startDate: string;
  endDate: string;
  dueDayOfMonth: string;
  monthlyRentDollars: string;
  depositDollars: string;
  gracePeriodDays: string;
  lateFeeDollars: string;
  collectsOutsideDomus: boolean;
}

