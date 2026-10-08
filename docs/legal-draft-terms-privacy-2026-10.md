# DRAFT — Domus Terms of Service and Privacy Policy (for owner + lawyer review)

> **Status:** draft, not published. Written by Claude on 2026-10-07 from what the app does today (launch audit B3). **Not legal advice.** A lawyer licensed where Domus operates should review it before it replaces `/terms` and `/privacy`. Items marked **[DECISION]** need the owner's answer; items marked **[LAWYER]** need legal review.
>
> **Main changes from the March 4 versions:** names the services Domus uses; covers bank-file and bank-link data, payments and the AI helper; removes "Paid plans are billed…" (Domus is free in early access); adds retention, deletion/export and state-rights wording; adds a real contact path (needs the support@/privacy@ inboxes, launch audit B1).

---

## Terms of Service

**Last updated:** [DATE OF PUBLISHING]

**Who we are.** Domus ("we") is run by **[DECISION: legal name of the person or company, e.g. "Domus LLC, a Colorado limited liability company"]**. You can reach us at support@domusbase.com.

**What Domus does.** Domus helps landlords, property managers, and tenants handle rent, repairs, leases, documents, and messages in one place.

**Your account.**
- Keep your sign-in details safe. You are responsible for what happens in your account.
- Give true, current information.
- Only add homes, tenants, or managers you have the right to manage.

**Early access and price.** Domus is free while it is in early access. We will tell you at least **[DECISION: e.g. 30] days** before we start charging. You can stop using Domus before any charge starts.

**Payments.** Online rent payments are handled by Stripe. Stripe's terms apply to those payments. Domus does not hold your money. Fees shown before you pay are the fees you pay. **[LAWYER: confirm wording on refunds, chargebacks and failed bank payments.]**

**Bank data.** If you link a bank (through Plaid) or upload a bank file, you allow Domus to read those transactions to sort your rental money. You can delete them at any time.

**AI helper.** Some features use an AI helper (Anthropic's Claude) to answer questions about your data. Its answers can be wrong. Check anything important before you act on it.

**Rules.** Don't use Domus to break the law, harm others, send spam or harmful code, or get into data that isn't yours.

**Ending your account.** You can delete your account at any time in Settings. We can pause or close accounts that break these terms. **[DECISION: notice period, if any.]**

**No guarantees.** Domus is provided "as is". We work to keep it running and correct, but we can't promise it will always be available or error-free. **[LAWYER: limitation of liability, damages cap, indemnity.]**

**Changes.** If we change these terms in a way that matters, we will tell you in the app or by email before the change takes effect.

**Law and disputes.** **[LAWYER + DECISION: governing state law, venue, any arbitration clause.]**

---

## Privacy Policy

**Last updated:** [DATE OF PUBLISHING]

**What we collect.**
- **Account details:** name, email, phone (optional), role, profile photo (optional).
- **Rental records:** homes, units, leases, rent amounts, due dates, payments, late fees, repairs (with photos), documents, and messages.
- **Money data:** payment records from Stripe; bank transactions you upload as a file or link through Plaid. We do not store full card or bank account numbers.
- **Use and device data:** sign-in times, pages used, and error reports (to fix problems).

**How we use it.** To run Domus: sign you in, show the right records to the right people, process payments, sort bank transactions, send emails you need (like invites and receipts), keep Domus secure, and fix errors. We do **not** sell your data. We do **not** use it for ads.

**Who sees it.**
- **People in your rental:** an owner and their managers see the records for their homes; a tenant sees their own lease, rent, repairs, and messages.
- **Services we use to run Domus** (each only gets what it needs):
  - Supabase: database, sign-in, and file storage
  - Vercel: website hosting
  - Stripe: payments and payouts
  - Plaid: bank linking, if you choose it
  - Anthropic: the AI helper, which receives only the data needed to answer your question **[DECISION/LAWYER: confirm Anthropic data-use settings, e.g. no training on API data]**
  - Resend: email delivery
  - Sentry: error reports, with personal data removed where possible
  - Cloudflare: domain and email routing
- **The law:** if a valid legal request requires it.

**How long we keep it.** While your account is open. If you delete your account, we remove your login and personal details right away. Shared rental records (rent, payments, repairs, messages) stay for the other people in that rental, with your name removed, because they need them for their records and taxes. **[LAWYER/DECISION: retention period for financial records, e.g. 7 years; backup deletion window, e.g. 30 days.]**

**Your choices and rights.**
- **Download your data:** Settings → Your data → Download my data.
- **Delete your account:** Settings → Your data → Delete my account. (Owners: Settings → Account & Data.)
- **Fix your details:** Settings → Profile.
- **Ask us anything:** privacy@domusbase.com. We answer within **[DECISION: e.g. 30] days**.
- Some states (for example California, Colorado, Virginia) give extra rights. We honor those requests through the same steps. **[LAWYER: confirm whether CCPA/CPRA or state laws apply at Domus's size, and any required wording.]**

**Cookies.** We use cookies only to keep you signed in and keep Domus secure. We don't use ad cookies.

**Security.** Data is encrypted in transit. Access is limited by role. Payment card data is handled by Stripe, not Domus.

**Children.** Domus is for adults. We don't knowingly collect data from anyone under 18.

**Changes.** If we change this policy in a way that matters, we will tell you in the app or by email first.

**Contact.** privacy@domusbase.com · **[DECISION: mailing address, if required]**

---

### Owner decisions needed (summary)
1. Legal name/entity and (if required) a mailing address.
2. Notice period before any future pricing (suggest 30 days).
3. Response time for privacy requests (suggest 30 days).
4. Financial-record retention period (ask the lawyer; 7 years is common for tax records).
5. Governing law / disputes (lawyer).
6. Confirm Anthropic API data settings (no training on API data).

### Before publishing
- support@ and privacy@ must receive mail (launch audit B1: Cloudflare Email Routing, waiting on the owner at the Mac).
- Sprint 199 (tenant/manager export + delete) should be live, because the policy points to it.
