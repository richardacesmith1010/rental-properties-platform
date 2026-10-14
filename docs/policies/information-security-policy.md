# Domus Information Security Policy

**Owner:** Richard Ace Smith, Owner — richard.ace.smith@gmail.com
**Version:** 1.0 (draft) · **Adopted:** ____ · **Next review:** 12 months after adoption, or sooner after any security incident or major change

## 1. Purpose and scope
This policy explains how Domus protects the data of property owners, managers, and tenants. That includes bank data received from Plaid and payment data handled through Stripe. It covers:
- every Domus system: the web app at domusbase.com, the iPhone app, the database, file storage, and background jobs;
- every account that can reach those systems.

## 2. Roles
- **Security owner:** Richard Ace Smith. He approves this policy, owns all production access, and handles incidents.
- **AI coding tools** (Claude, Codex) write and review code under the owner's direction. They never hold production passwords. Every change is reviewed and tested before release (§7).
- Anyone given access later must read this policy first, and gets only the access their job needs.

## 3. Data we handle
| Data | Where it lives | Sensitivity |
|---|---|---|
| Names, emails, phone numbers, addresses | Supabase Postgres | Personal |
| Leases, rent, payments, home expenses | Supabase Postgres | Financial |
| Lease documents, repair photos, home files, avatars | Supabase Storage (private buckets) | Personal / financial |
| Bank access tokens (Plaid) | `bank_connection_secrets` table, AES-256-GCM encrypted by the app | Secret |
| Bank transactions (rental items only) | Supabase Postgres | Financial |
| Card and bank payment details | **Stripe only** (Domus never stores card numbers) | Secret (held by Stripe) |
| API keys and secrets | Vercel encrypted environment variables | Secret |

## 4. Access control
1. **Least privilege, by role.** Users are owners, managers, or tenants. Database row-level security (RLS) limits every table to the rows each role is allowed to see.
   - Tables start with **all access revoked**, and only the needed privileges are granted back.
   - Sensitive columns are written only by trusted database functions or triggers.
2. **Secrets tables** are readable only by the server's service role and never by app users. This includes bank tokens.
3. **Service-to-service access** uses API keys or signed tokens:
   - Plaid webhooks are checked with Plaid's signed JWT (ES256);
   - cron jobs need a shared secret;
   - Stripe webhooks are signature-checked.
4. **Admin accounts** are the only way into production: Supabase, Vercel, GitHub, Plaid, Stripe, Sentry, and the Google account used to sign in to them.
   - All of them must use **two-step login**, with an authenticator app or passkey preferred. *Status: being turned on for every account before public launch.*
5. **Access review:** every 6 months, the owner lists who can reach each admin account and removes anyone who no longer needs it. Access is removed the same day a person leaves.

## 5. Authentication for users
- Users sign in with email and password through Supabase Auth. Sessions are kept in secure, HTTP-only cookies.
- Only a signed-in owner can open Plaid Link.
- **Planned before public launch:** a second step (Face ID on the iPhone app).

## 6. Encryption
- **In transit:** all traffic uses HTTPS (TLS 1.2 or higher) through Vercel, Supabase, Plaid, and Stripe. HSTS and a Content Security Policy are set on every page.
- **At rest:** Supabase encrypts the whole database and file storage (AES-256). Plaid access tokens are also encrypted by the app with AES-256-GCM, using a key kept only in Vercel's encrypted environment.

## 7. Secure development
1. Every change has a written plan and is reviewed before release.
2. **Database changes:** before release, the change is tested by acting as an attacker with SQL that is undone afterward. The test confirms that other users cannot read or change data they shouldn't.
3. **Automated checks on every change:** lint, type check, the full test suite (2,000+ tests), and a build, run in GitHub Actions CI. A red CI run blocks the next release.
4. **After every release:** live smoke tests sign in as each role and confirm the pages load with no errors.
5. **Secrets** are never committed to git, written to logs, or pasted into chats or tickets.

## 8. Vulnerability and patch management
- **Software kept current:** frameworks and runtimes are kept on supported versions (for example, Next.js 15 and Node 20). Software nearing end of life is upgraded before support ends.
- **Dependency alerts:** GitHub dependency alerts are reviewed at least monthly. Dependabot opens monthly update proposals (`.github/dependabot.yml`); each one passes the normal checks before it is merged.
- **Patch deadlines** (from when a fix is available):
  - critical: within 7 days;
  - high: within 30 days;
  - others: at the next planned update.
- **Owner devices:** the computer and phone used for admin work must have automatic operating-system updates, a screen lock, and disk encryption (FileVault on Mac).

## 9. Logging and monitoring
- **Where errors go:** production errors go to Sentry, and request logs go to Vercel.
- **What logs must not contain:** passwords, tokens, bank account numbers, or full transaction descriptions. Error logs carry only an error code, a short message, and the step that failed.
- **Bank sync:** sync failures are logged, then retried by the bank-sync cron.

## 10. Vendors
Domus relies on these vendors:
- Supabase (database and storage);
- Vercel (hosting);
- Plaid (bank data);
- Stripe (payments);
- Sentry (error tracking);
- GitHub (code).

Each one is chosen partly for its own security program (SOC 2 or similar). Vendor accounts follow §4. Before a new vendor that touches user data is added, the owner reviews its security and privacy terms.

## 11. Incident response
1. **Find and contain.** Revoke or rotate any exposed key right away: Plaid, Stripe, Supabase, Vercel, or the bank-token key. If needed, pause the affected feature.
2. **Assess.** Use logs to work out what data was affected and whose.
3. **Notify.**
   - Tell affected users, and Plaid or Stripe if their data was involved, without undue delay. Follow any timeline the law or the vendor contract requires.
   - Tell Plaid within the time its agreement requires if Plaid data may have been exposed.
4. **Fix and learn.** Fix the cause, write down what happened, and update this policy or the code checks so it can't happen again.

## 12. Business continuity
- **Backups:** Supabase takes daily database backups.
- **Code:** the code lives in GitHub, and any past release can be rolled back in Vercel.

## 13. Exceptions and changes
The owner must approve any exception in writing (a dated note in this file is enough). This policy is reviewed every year.
