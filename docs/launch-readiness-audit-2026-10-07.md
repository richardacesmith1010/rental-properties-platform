# Launch-readiness audit — 2026-10-07

Method: Claude checked public routes (curl), DNS (two public resolvers), env health (`/api/health`), Terms/Privacy text, settings/role gating in code, feedback/alert routing, and screenshots of `/` and `/login` at 1280 px and 375 px. No data changed.

## Working
- Home page: clear plain copy, "Start free", "Free while Domus is in early access. No credit card.", FAQ, Terms/Privacy links; robots.txt + sitemap; `/manifest.json`; branded 404; `/api/health` all services OK.
- Outgoing email set up: Resend SPF + DKIM on `send.domusbase.com`.
- In-app "Send feedback" stores to `feedback` and emails the owner's Gmail (works).
- Owners can delete data (Settings → Account & Data: per-type deletes + full wipe).

## Blockers (must fix before real users)
| # | Area | Finding | Who |
|---|---|---|---|
| B1 | Email in | **domusbase.com has no MX records** (verified via 8.8.8.8 and 1.1.1.1). `support@`, `privacy@` (and `ops@`, `alerts@`, etc.) cannot receive mail. Terms, Privacy and the footer "Help" link (`mailto:support@domusbase.com`) all point there. | User: Cloudflare → Email Routing (free) → forward `support@` + `privacy@` to the owner's Gmail. Claude can open the page and fill everything except the final confirm. |
| B2 | Alerts | `PLATFORM_ALERT_EMAIL` is unset, so platform alerts (failed payouts, bank problems) fall back to `RESEND_FROM_EMAIL`, a send-only address. **Ops alerts reach no one.** | User approves → set the Vercel env var to the owner's Gmail (Claude can do it with approval). |
| B3 | Legal text | Terms/Privacy are dated 2026-03-04, before Stripe payments, bank-file import, Plaid and the AI assistant (Anthropic) shipped. Privacy doesn't name payment/bank/AI processors, bank-transaction data, retention or state rights. Terms say "Paid plans are billed…" while the site says "Free while in early access". There's no legal entity, governing law or dispute terms. | User decision. Claude can draft plain-language updates, but **a lawyer should review** before launch. |
| B4 | Privacy rights | Tenants and managers have no self-service data deletion (Account & Data is owner-only), and the only route (`privacy@`) is dead (B1). No data export for any role, although Privacy promises "access, correct, export, or delete". | Code sprint after B1 (request-deletion/export flow), or at minimum a working privacy@ inbox. |

## Should fix
| # | Area | Finding |
|---|---|---|
| S1 | Sign-in (phone) | At 375 px `/login` repeats a marketing header ("Manage your rentals like a pro…"), so the role choice and form start **below the first screen**. CLAUDE.md lists a primary action that isn't visible without scrolling as production-breaking. |
| S2 | Deliverability | No DMARC record (`_dmarc.domusbase.com`); Gmail/Yahoo expect one from senders. A simple `p=none` record with a report address is a DNS change. |
| S3 | Sitemap | Lists both `/` and `/marketing` (same page, duplicate content). |
| S4 | Pricing | No `/pricing`; fine during early access, but the Terms contradiction (B3) must be resolved. |
