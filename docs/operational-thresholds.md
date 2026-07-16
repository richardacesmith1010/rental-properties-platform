# Operational Thresholds

This document tracks decisions that should be revisited when Domus reaches a usage threshold. Use this to avoid premature optimization while maintaining a clear plan for when to invest.

## Supabase Pro Upgrade ($25/mo)

**Current state:** Free tier (auto-pauses after 7 days of inactivity).

**What free tier costs us:**
- Project paused on 2026-04-13 — site returned 504 errors until restore
- No daily backups (only 2-day retention)
- 500MB DB / 1GB file storage / 2GB bandwidth / 50K MAU caps

**Mitigation in place:**
- Keep-alive cron (Sprint 106 — to be added) — daily pings to Supabase
- This addresses the auto-pause symptom but NOT the underlying limits

**Trigger to upgrade — any one of these:**

1. **Real money flowing:** $5,000+ in monthly rent processed through Domus
2. **Multi-tenant production use:** 5+ active tenants paying rent
3. **First incident:** Site goes down a second time due to free tier limits
4. **Database approaching limits:** DB > 400MB OR storage > 800MB OR bandwidth > 1.5GB/mo
5. **External user trust:** Onboarding a non-family customer who expects 99.9% uptime

**When triggered:** Upgrade Supabase organization to Pro plan. Update `docs/agent-handoff.md` to reflect new tier.

---

## Vercel Pro Upgrade ($20/mo per seat)

**Current state:** Hobby tier.

**What Hobby tier costs us:**
- 2 cron jobs max (currently using 1, will be 2 after keep-alive)
- 100GB bandwidth/mo
- 6,000 build minutes/mo
- No support SLA

**Trigger to upgrade — any one of these:**
1. Need more than 2 daily cron jobs
2. Bandwidth exceeds 80GB/mo
3. Build minutes exceed 5,000/mo

---

## Plaid Production Mode

**Current state:** Sandbox.

**Trigger to switch:** When you want owners/managers to view live bank balances. Requires Plaid production approval (application review).

**Currently NOT blocking anything** — bank balance viewing is a nice-to-have, not core to rent collection (Stripe handles that).

---

## Stripe Tax / 1099 Reporting

**Current state:** Not configured.

**Trigger:** End of tax year OR when total payment volume per recipient exceeds $600/year. Stripe Connect must report 1099-K for high-volume connected accounts.

**Action when triggered:** Enable Stripe Connect 1099-K generation, verify owner Stripe accounts have correct tax info.
