# Launch readiness review — 2026-10-05 (code read, not live)

Sources: two read-only code reviews (owner/tenant/login journeys; manager + invite emails). Claude verified the top items in code.

## Proposed fix order
- **Sprint 171 — Tenant can pay (L3):** autopay success shows error (redirect inside try/catch, `app/autopay/return/page.tsx:91-93`, VERIFIED); pay buttons drop errors (`pay-rent-card.tsx` form actions without state, VERIFIED); autopay banner never shows (redirect lacks `?section=charges`); no-lease tenant sees "$0.00" + greyed actions with no reason (`tenant-overview.tsx:61`, `tenant-rent-card.tsx:62,92`, `ticket-form.tsx`, `inbox-section.tsx:224`); tenant copy promising notices/receipts that are not sent.
- **Sprint 172 — Honest invites (L3, auth):** "Invitation sent" shown when no email went out (`tenant-invite-wizard-support.tsx:348`, `invite-manager-form.tsx:59`); no "Copy invite link" fallback; manager/co-owner invites lack `redirectTo`; manager 0-home dead end + "Section not found" header; resend-confirmation button; invited tenant who tries Sign up gets a dead end.
- **Sprint 173 — Owner first touch (L2):** "Start free" lands on "Welcome back" + signup form may be clipped (`role-selector.tsx:39,103-107`); fake login stats ("500+ Landlords", `login/page.tsx:25-29`); landing promises reminders; dead "2-minute tour" link; setup wizard asks for "Tenant Profile ID" UUID (`add-lease-step.tsx:71-82`); raw Account ID; placeholders look like the owner's real address (`unified-property-wizard.tsx:436,440`).
- **Polish:** jargon (ledger, ACH badge, "charge" in reminder email and checklist), long email sentences, invite-email footer to /settings, auth callback raw errors, "Send reminder" button while notifications are off.

## Note on invite emails
Invite, signup-confirmation and password-reset emails send regardless of the notifications switch. That is expected for owner-initiated actions (the owner clicked Invite), but the UI must tell the truth about whether an email was sent, and offer a copy-link fallback.

## Full findings
Owner/tenant/login: 3 BLOCKER, 12 CONFUSING, 5 POLISH. Manager/invites: 3 BLOCKER, 8 CONFUSING, 8 POLISH. (Detailed lists in the session transcript; file:line refs above.)
