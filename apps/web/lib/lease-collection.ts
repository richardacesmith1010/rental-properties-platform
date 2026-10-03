export interface LeaseCollectionPreference {
  collects_outside_domus?: boolean | null;
  collectsOutsideDomus?: boolean | null;
}

export function isCollectedOutsideDomus(
  lease: LeaseCollectionPreference | null | undefined
): boolean {
  return lease?.collects_outside_domus === true || lease?.collectsOutsideDomus === true;
}
