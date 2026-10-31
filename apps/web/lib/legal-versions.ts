// Never edit a published archive file or its hash; publish a new version instead.
export const LEGAL_DOCUMENTS = {
  terms: { current: "2026-10-30", versions: { "2026-10-30": "d9f5bae5103bae8db4851a6d30f0283f3c92017ba045d813b4b3c388bcb95b7d" } },
  privacy: { current: "2026-10-30", versions: { "2026-10-30": "e698a76b026206ae3d8553fcef451dd867d06cc80fbe0734b647dc60d2f865c3" } }
} as const;
export const AGREEMENT_REQUIRED_FROM = "2026-10-30T00:00:00.000Z";
export const LEGAL_RECORD_HMAC_KEY_VERSION = 1;
export function formatLegalDate(version: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC"
  }).format(new Date(`${version}T00:00:00Z`));
}
