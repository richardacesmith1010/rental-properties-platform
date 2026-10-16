# Sprint 238c — App Store requirements in the web app: Privacy/Terms links, Ask Domus consent, /support, upload types (L3: privacy + schema) — rev 1

## 1. Objective
Close the web-side App Store findings from the readiness audit (`docs/phone-readiness-plan-2026-10-16.md` Sprint B):
1. Privacy and Terms links reachable in the app (login, sign-up, Settings for every role, help menu).
2. "Ask Domus" (AI, sends questions and account context to Anthropic) asks for consent once before anything is sent;
   consent stored on the server; the API refuses without it; a Settings switch turns it off. Stop sending the user's
   email as their name.
3. A public `/support` page (App Store Connect needs an https Support URL).
4. Upload inputs that only accept images/PDF/documents (stops iOS offering "Take Video", which needs the microphone).

## 2. Context
- HEAD after 238b packet. Audit IDs: ASR-03/PRIV-8 (links), PRIV-3/ASR-05/ASC-08 (AI consent), ASC-05/ASR-10 (support),
  IOS-2/PRIV-6 (accept). Vercel Analytics is **already off in production** (`app/layout.tsx:125` renders it only when
  `NEXT_PUBLIC_ENABLE_ANALYTICS === "true"`; that variable is not set in production) — no analytics change in this sprint.
- `apps/web/app/login/page.tsx:169-171` footer shows only "© {year} Domus. All rights reserved.";
  `apps/web/components/auth/create-account-form.tsx:84-124` sign-up form; `apps/web/components/settings/your-data-settings.tsx`
  (tenant/manager "Your data"); `apps/web/components/settings/account-data-settings.tsx` (owner); `apps/web/components/help-menu.tsx:96-107`.
  Pages exist: `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`.
- Ask Domus: `apps/web/components/dashboard/ai-assistant.tsx` (send at :238, :260, :267 incl. starter-prompt taps),
  `apps/web/app/api/ai/chat/route.ts:167-207` (calls Anthropic; `:191` passes `user.email` as a name fallback),
  `apps/web/lib/ai-assistant.ts:53` `getFirstName`, `:150` system prompt.
- `profiles` writes are service-role only since Sprint 237e (L-025): a consent server action must use the admin client
  after `requireAuth`. Claude adds `profiles.ai_consent_at timestamptz null` (migration; Codex writes no SQL).
- Upload inputs without `accept`: `components/dashboard/expenses/expense-list.tsx:160`, `expense-form.tsx:264`,
  `components/dashboard/documents/signer-flow.tsx:154`.
- `apps/web/app/sitemap.ts`, `apps/web/components/marketing/landing-page.tsx:110` (footer links).

## 3. In scope
Links, consent (UI + server action + API gate + Settings switch), `/support` page, `accept` attributes, tests.

## 4. Out of scope
Privacy/Terms **text** changes (owner/lawyer); analytics; account deletion (238b); any other AI behavior.

## 5. Exact files expected to change
1. `apps/web/app/login/page.tsx` (footer links)
2. `apps/web/components/auth/create-account-form.tsx` (links under the button; no "you agree" sentence)
3. `apps/web/components/settings/your-data-settings.tsx` and `account-data-settings.tsx` (links block)
4. `apps/web/components/help-menu.tsx` (Privacy, Terms, Support items)
5. `apps/web/components/dashboard/ai-assistant.tsx` (consent sheet before the first send, incl. starter prompts)
6. `apps/web/app/api/ai/chat/route.ts` (403 without consent; no email as name)
7. `apps/web/lib/ai-assistant.ts` (`getFirstName` never returns an email-like value)
8. `apps/web/app/actions/ai-consent.ts` (new: `setAskDomusConsent(enabled)`) + re-export if conventional
9. `apps/web/components/settings/ask-domus-settings.tsx` (new switch) + wiring in `components/settings/settings-layout.tsx`
   and `app/settings/page.tsx` (one new nav item `askDomus` "Ask Domus", roles that can use Ask Domus)
10. `apps/web/app/support/page.tsx` (new), `apps/web/app/sitemap.ts`, `apps/web/components/marketing/landing-page.tsx`
11. `apps/web/components/dashboard/expenses/expense-form.tsx`, `expense-list.tsx`, `components/dashboard/documents/signer-flow.tsx`
12. Tests: extend `lib/__tests__/ai-assistant.test.ts`; new `app/actions/__tests__/ai-consent.test.ts`,
    `app/api/ai/chat/__tests__/consent.test.ts` (or the repo's route-test location), component tests for the sheet,
    links and `/support`.

## 6. Implementation requirements
1. **Links:** text links `Privacy` → `/privacy`, `Terms` → `/terms` (and `Support` → `/support` in the help menu and
   landing footer). Visible at 375 px; same style as nearby small text; no "you agree" wording.
2. **Consent sheet:** before the first message (typed or a starter prompt), if the user has not consented, show a sheet:
   title `Ask Domus uses AI`; body `Your question and your Domus info go to Anthropic, our AI provider.` and `They use it
   only to answer you.`; buttons `Allow` and `Not now`. `Not now` sends nothing and closes. `Allow` calls the server action,
   then sends the pending message.
3. **Server action `setAskDomusConsent`:** `requireAuth()` (any role allowed to use Ask Domus); rate limit; input
   `enabled` boolean only; admin client updates **only the session user's own** `profiles.ai_consent_at` (now or null);
   every error checked → `We could not save this. Please try again.`
4. **API gate:** `POST /api/ai/chat` loads the session user's `ai_consent_at`; null → HTTP 403 JSON
   `{ error: "Turn on Ask Domus in Settings first." }` and **no** Anthropic call.
5. **Settings switch:** `Ask Domus` panel with a toggle `Let Ask Domus answer my questions` and helper `Your questions go to
   Anthropic to get an answer.`; turning it off clears consent; the next request returns 403.
6. **Name:** the system prompt uses nickname or first name only; never an email or anything containing `@`.
7. **/support page (public, signed-out OK):** heading `Get help`; short FAQ (5 items max: sign-in help → Forgot password,
   paying rent, reporting a repair, deleting your account → Settings, privacy questions); contact lines
   `support@domusbase.com` and `privacy@domusbase.com` as mailto links. Add to the sitemap and the landing footer.
8. **accept:** expense receipts `accept="image/*,application/pdf"`; signer upload
   `accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"`.
9. Plain language (6th grade, ≤ 12 words per sentence), lines ≤ 140, files ≤ 500, every Supabase error checked. The user
   should never need to read instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or write/apply SQL. Claude applies the migration first.

## 8. Acceptance criteria
1. No consent → `POST /api/ai/chat` returns 403 with the exact JSON and the Anthropic SDK mock records zero calls; with
   consent → unchanged behavior.
2. Sheet appears before the first send, including a starter-prompt tap; `Not now` sends nothing; `Allow` calls the action
   then sends.
3. Action updates only the session user's profile (forged ids ignored); switch off clears consent and the next request
   is 403.
4. System prompt never contains the user's email (test with nickname null, full name null, email set).
5. Privacy/Terms links render on `/login`, sign-up, Settings (all roles) and the help menu; `/support` renders
   signed-out with both emails and is in the sitemap.
6. `accept` attributes asserted on all three inputs.
7. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No SQL from Codex. Do not edit Privacy/Terms page text.
