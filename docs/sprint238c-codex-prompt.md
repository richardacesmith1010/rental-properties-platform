# Sprint 238c — App Store requirements in the web app: Privacy/Terms links, Ask Domus consent, /support, upload types (L3: privacy + schema) — rev 2 (rev 1 ChatGPT APPROVE WITH CHANGES: all REQUIRED adopted)

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
0. **Precondition + call-site audit (do first, report it):** verify `profiles.ai_consent_at timestamptz null` exists (Claude
   applied it; no client write grants — 237e). Search the repo (`Anthropic`, `anthropic`, `@anthropic-ai/sdk`,
   `.messages.create`, any AI wrapper, callers of `/api/ai/chat` and of `lib/ai-assistant.ts`, server actions/cron that
   build AI context). Every production path that can send user or Domus data to Anthropic must go through the gated API
   route or enforce the same server-side consent check itself. List every call site in the report.
2. **Consent sheet:** before the first message from **any** entry (typed message with button or Enter, and every
   starter-prompt handler), if the server says the user has not consented, show a sheet: title `Ask Domus uses AI`; body
   `Your question and rental details go to Anthropic, our AI provider.`, `This includes homes, leases, rent, payments, and
   repairs.` (adjust the list to exactly what the route sends — no more, no less) and `Anthropic uses this to write your
   answer.`; buttons `Allow` and `Not now`. `Not now` sends nothing. `Allow`: one consent save in flight at a time; disable
   Allow, the send controls and starter prompts while saving; keep exactly one pending message; send it exactly once
   **after** the server confirms; on failure send nothing and show the error; no optimistic local "consented".
3. **Server action `setAskDomusConsent`:** `requireAuth` with exactly the roles that can use Ask Domus today (verify in the
   route; enforce the same set server-side); rate limit; the only input is `enabled` (boolean) — no ids, roles or other
   fields are read; admin client `update({ ai_consent_at })` filtered solely by the session user's id, updating only that
   column, with `select("id")` and a postcondition that exactly one row changed; any error or row count ≠ 1 →
   `We could not save this. Please try again.`
4. **API gate (last check before sending):** order = authenticate → validate request → authorize role → build context
   (reads are fine) → **load current `ai_consent_at`** → construct/call Anthropic. Null → HTTP 403 JSON
   `{ error: "Turn on Ask Domus in Settings first." }`, no Anthropic client constructed, no call. Invariant: no request that
   begins after a successful revocation passes the gate (a request already sent cannot be recalled — do not promise that).
5. **Settings switch:** `Ask Domus` panel with a toggle `Let Ask Domus answer my questions` and helper `Your questions and
   rental details go to Anthropic.`; initial value comes from the server (`ai_consent_at` not null), never local storage;
   the UI changes only after the server confirms and reverts on failure; off clears consent; the next request is 403.
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
1. No consent → `POST /api/ai/chat` returns 403 with the exact JSON; the Anthropic constructor and `messages.create` mocks
   record zero calls; with consent → unchanged behavior. Revocation race: consent on → disable action resolves → immediate
   POST → 403, no additional Anthropic calls.
2. Pre-consent, every entry path makes **zero** requests to `/api/ai/chat`: typed + button, Enter key, each distinct
   starter-prompt handler; `Not now` sends nothing; save failure sends nothing; rapid double-tap on `Allow` → one action
   call and exactly one send after success.
3. Action: user A's call changes only profile A (B unchanged); extra form fields (`profile_id`, `role`) are ignored;
   row-count ≠ 1 → failure copy; switch initial state from server; switch off → next request 403.
4. System prompt never contains the user's email (test with nickname null, full name null, email set).
5. Privacy/Terms links render on `/login`, sign-up, Settings (all roles) and the help menu; `/support` renders
   signed-out with both emails and is in the sitemap.
6. `accept` attributes asserted on all three inputs.
7. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 9b. Release item (Claude, outside code)
`docs/app-store/app-privacy-answers.md` must disclose the categories sent to Anthropic (user content + the rental details
above) and the purpose (app functionality), before the App Privacy section is published.

## 10. Constraints
Only the files in §5. No new dependencies. No SQL from Codex. Do not edit Privacy/Terms page text.
