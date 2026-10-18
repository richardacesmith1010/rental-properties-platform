# Early-access Terms and Privacy — exact live text (2026-10-18)

Source: `docs/legal-draft-terms-privacy-2026-10.md` with the owner's 2026-10-18 decisions. Every [LAWYER]/[DECISION]
note is removed (those go to the lawyer, not the page). Sections that were only a lawyer note ("Law and disputes",
mailing address) are left out until the lawyer answers. Changes from the draft, for accuracy against the live app:
deletion is a request finished within 30 days (Sprint 238b), not "right away"; owners have no self-serve download yet
(`lib/account-export.ts:33` covers tenant/manager), so they ask privacy@ (verified 2026-10-18).

Both pages show, under the title:
- `Last updated: October 18, 2026`
- Banner: `Early access version. A lawyer is reviewing these terms. We will tell you before a final version takes effect.`

---

## Terms of Service

**Who we are.** Domus ("we") is run by Richard Smith, an individual. You can reach us at support@domusbase.com.

**What Domus does.** Domus helps landlords, property managers, and tenants handle rent, repairs, leases, documents, and messages in one place.

**Your account.**
- Keep your sign-in details safe. You are responsible for what happens in your account.
- Give true, current information.
- Only add homes, tenants, or managers you have the right to manage.

**Early access and price.** Domus is free while it is in early access. We will tell you at least 30 days before we start charging. You can stop using Domus before any charge starts.

**Payments.** Online rent payments are handled by Stripe. Stripe's terms apply to those payments. Domus does not hold your money. Fees shown before you pay are the fees you pay.

**Bank data.** If you link a bank (through Plaid) or upload a bank file, you allow Domus to read those transactions to sort your rental money. You can delete them at any time.

**AI helper.** Some features use an AI helper (Anthropic's Claude) to answer questions about your data. Its answers can be wrong. Check anything important before you act on it.

**Rules.** Don't use Domus to break the law, harm others, send spam or harmful code, or get into data that isn't yours.

**Ending your account.** You can ask to delete your account at any time in Settings. We can pause or close accounts that break these terms.

**No guarantees.** Domus is provided "as is". We work to keep it running and correct, but we can't promise it will always be available or error-free.

**Changes.** If we change these terms in a way that matters, we will tell you in the app or by email before the change takes effect.

---

## Privacy Policy

**What we collect.**
- **Account details:** name, email, phone (optional), role, profile photo (optional).
- **Rental records:** homes, units, leases, rent amounts, due dates, payments, late fees, repairs (with photos), documents, and messages.
- **Money data:** payment records from Stripe; bank transactions you upload as a file or link through Plaid. We do not store full card or bank account numbers.
- **Use and device data:** sign-in times, pages used, and error reports (to fix problems).

**How we use it.** To run Domus: sign you in, show the right records to the right people, process payments, sort bank transactions, send emails you need (like invites and receipts), keep Domus secure, and fix errors. We do not sell your data. We do not use it for ads.

**Who sees it.**
- **People in your rental:** an owner and their managers see the records for their homes; a tenant sees their own lease, rent, repairs, and messages.
- **Services we use to run Domus** (each only gets what it needs):
  - Supabase: database, sign-in, and file storage
  - Vercel: website hosting
  - Stripe: payments and payouts
  - Plaid: bank linking, if you choose it
  - Anthropic: the AI helper, which receives only the data needed to answer your question
  - Resend: email delivery
  - Sentry: error reports, with personal data removed where possible
  - Cloudflare: domain and email routing
- **The law:** if a valid legal request requires it.

**How long we keep it.** While your account is open. If you ask us to delete your account, we remove your login and personal details within 30 days. Shared rental records (rent, payments, repairs, messages) stay for the other people in that rental, with your name removed, because they need them for their records and taxes. Financial records (rent, payments, expenses) are kept for 7 years after the tax year they belong to.

**Your choices and rights.**
- **Download your data:** Settings → Your data → Download my data. Owners: email privacy@domusbase.com and we send it within 30 days.
- **Delete your account:** Settings → Your data → Delete my account. Owners: Settings → Account & Data → Delete my account.
- **Fix your details:** Settings → Profile.
- **Ask us anything:** privacy@domusbase.com. We answer within 30 days.
- Some states (for example California, Colorado, Virginia) give extra rights. We honor those requests through the same steps.

**Cookies.** We use cookies only to keep you signed in and keep Domus secure. We don't use ad cookies.

**Security.** Data is encrypted in transit. Access is limited by role. Payment card data is handled by Stripe, not Domus.

**Children.** Domus is for adults. We don't knowingly collect data from anyone under 18.

**Changes.** If we change this policy in a way that matters, we will tell you in the app or by email first.

**Contact.** privacy@domusbase.com
