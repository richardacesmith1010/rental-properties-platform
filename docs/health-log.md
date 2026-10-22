# Domus Weekly Health Log

- 2026-10-05 — ALL PASS. HEAD 67e2168 (uncommitted: docs/sprint166b-codex-prompt.md); vercel ok; codex 0.160.0 logged in (0.160.1 available); smoke 3+11 passed; stripe ok; last cron 18:49Z today, 2 payments/7d, 5 open charges.
- 2026-10-21 — PASS (1 watch). HEAD 96b476b; vercel ok (6 prod deploys today); codex 0.160.0; prod smoke 3+11+11+2
  passed; CI gate success; charges cron last 08:19Z success; pg_cron failures 48 h: 0; 7 payments/7d; 9 open charges;
  failed emails 7d: 0; retention report 11 rows, 0 eligible. Sentry (7d): WEB-7/WEB-8 RangeError on /tenant resolved
  (fixed by 243a); WEB-6 body > 1 MB resolved (238j photo shrink); WEB-5 "Load failed" ignored until escalating
  (Claude's WebKit walks); **watch WEB-3** (tenant server-render digest, iPhone WKWebView, Oct 7 + Oct 17, no stack).
- 2026-10-22 — WEB-3 explained and resolved: the 10-17 event shares Sentry trace 951b48b0… with WEB-6 (repair photo
  > 1 MB, fixed by 238j); the 10-07 event matches WEB-4 (Supabase 504, retried since 197) — both resolved. Vercel Hobby
  keeps runtime logs 1 h only, so Sentry trace ids are the way to pair client and server errors.
