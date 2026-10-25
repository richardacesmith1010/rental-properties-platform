# Domus rules map

Every outside rule that governs a Domus behavior: law, card-network rule, platform rule, tax rule or vendor term.
Status: **OK** (complies) · **GAP** (doesn't comply; fix planned) · **SAFE** (risky behavior switched off while a
decision waits) · **UNKNOWN** (not researched, or verified more than 6 months ago). Seeded 2026-10-24 from the
independent legal research (https://claude.ai/artifact/C64vE2Co62CkpZPpPCSac8). Update in the same commit as any change.

States with users' homes (live data, 2026-10-24): **Colorado, South Carolina.**

| Area | Rule (source) | Domus today | Status | Fix | Verified |
| --- | --- | --- | --- | --- | --- |
| Late fees — CO | C.R.S. 38-12-105 (SB21-173): ≥7 days late; cap greater of $50 or 5% of past-due rent; rent only; disclosed in lease; no eviction for fees | 5-day default grace; flat lease amount, no cap | GAP | Per-state late-fee rules | 2026-10-24 |
| Late fees — SC | No statutory cap or grace; lease must disclose; must be reasonable (secondary sources) | One SC lease: 5% ($117.50), grace 5, collected outside Domus | OK | Keep lease terms | 2026-10-24 (secondary) |
| Late fees — other states | Vary (NY ≥5 days, lesser of $50/5%; TX ≥2 days, 10–12%; MA none before 30 days) | Same flat logic everywhere | GAP | No automatic fee where no state rule is set up | 2026-10-24 |
| Rental fees — CO | C.R.S. 6-1-737 (HB25-1090, eff. 2026-01-01): processing fee only if a free way to pay exists, ≤ cost, disclose who gets it | Card fee ≈3% to tenant; free bank option exists | GAP | Landlord pays card cost (owner decision 2026-10-24) | 2026-10-24 |
| Card surcharge | Visa Core Rules 5.5.1.x (credit only, ≤3% and ≤ cost, 30-day notice, disclosure); Mastercard; C.R.S. 5-2-212 (≤2% or actual cost, no debit) | Fee on any card incl. debit; gross-up; no notices; Domus is merchant (no on_behalf_of) | GAP | Remove tenant fee; landlord pays | 2026-10-24 |
| Money transmission | 31 CFR 1010.100(ff)(5)(ii)(B) + FIN-2014-R009; C.R.S. 11-110-301 agent-of-payee (HB25-1201) | Stripe holds funds; no agent-of-payee terms; "Domus does not hold your money" inaccurate for ACH | GAP | Landlord agent terms; rent paid on success; accurate wording | 2026-10-24 |
| Disputes / ACH returns | Stripe Connect defaults (platform liable); NACHA R10/R11 60 days; Reg E 1005.10 autopay notice | No dispute/refund webhooks; no transfer reversals | GAP | Dispute + refund + return handling | 2026-10-24 |
| LLC withdrawals | Stripe transfers from platform balance | Pays members from Domus's own balance (0 ever run) | GAP | Pause; redesign | 2026-10-24 |
| 1099-K | 26 CFR 1.6050W-1; IRS IR-2025-107 ($20,000 and 200, restored 2025); Stripe files only if connected account pays fees | Domus pays fees → Domus must file; not set up | GAP | Turn on Stripe 1099 reporting before Jan 31 | 2026-10-24 |
| Contract formation | Clickwrap enforceability (Meyer v. Uber; Hancock v. AT&T, 10th Cir.; Jovel v. TeamSnap, D. Colo. 2025) | Terms links only; no "I agree"; no acceptance record; invite flow shows none | GAP | Checkbox + acceptance record | 2026-10-24 |
| Disputes clause | Owner decision 2026-10-24: Colorado law, Denver courts, small claims | No clause | GAP | Terms rewrite | 2026-10-24 |
| Liability / indemnity | Jones v. Dressel (Colo. 1981); Core-Mark v. Sonitrol (2012); CCPA-CO 6-1-113 not waivable | None | GAP | Terms rewrite | 2026-10-24 |
| Notices | 13-40-104 (10-day demand, delivered); 38-12-701 (rent increase once/12 months); HB24-1098 (for-cause after 12 months) | Reminders only, no disclaimer | GAP | Disclaimers; wording; 12-month block | 2026-10-24 |
| Deposits — CO | 38-12-103 + HB25-1249 (30/60 days, itemized, 3×, caps 2 months; pet $300) | Return date only | GAP | Deadline, itemization, cap checks | 2026-10-24 |
| Lease copy — CO | 38-12-801(1): copy to tenant within 7 days; must be retainable (UETA 24-71.3-108) | In-app view only | GAP | Email signed PDF; paper-copy request | 2026-10-24 |
| E-signatures | UETA C.R.S. 24-71.3; ESIGN 15 U.S.C. 7001 | Typed name + Sign; no consent; no hash | GAP | Consent, audit log, hash, copies | 2026-10-24 |
| Screening — CO | 38-12-902 to -905; HB26-1196 (disclosures from 2027-01-01); FCRA 1681m | Manual score; no denial flow | GAP | Disclosures, portable-report notice, denial flow | 2026-10-24 |
| Fair housing ads | 42 U.S.C. 3604(c); C.R.S. 24-34-502 (source of income) | Private listings, no phrase checks | GAP | Phrase flags | 2026-10-24 |
| Privacy policy content | CalOPPA B&P 22575; Nevada NRS 603A.340; Apple 5.1.1; Plaid developer terms | Missing DNT, tracking, effective date, vendor-protection line, 3 data types, Plaid link, retention periods, consent withdrawal | GAP | Privacy rewrite | 2026-10-24 |
| CCPA / Colorado Privacy Act | Thresholds not met (Cal. Civ. 1798.140(d); C.R.S. 6-1-1304) | Voluntary rights honored | OK | Re-check at $26.6M revenue or 100,000 consumers | 2026-10-24 |
| Data security — CO | C.R.S. 6-1-713, 6-1-713.5, 6-1-716 (disposal policy, vendor security, 30-day breach notice) | Policies exist; Sentry DPA not accepted; Vercel DPA needs Pro | GAP | Accept Sentry DPA; Vercel Pro; policy wording | 2026-10-24 |
| Hosting plan | Vercel Terms §4 + fair use (Hobby non-commercial; payments = commercial) | Hobby | GAP | Vercel Pro (owner) | 2026-10-24 |
| Backups claim | Supabase Free: no automatic backups | Security policy claims daily backups | GAP | Supabase Pro or reword | 2026-10-24 |
| App Store entity | Apple 5.1.1(ix) (financial apps from a legal entity) | Individual account | GAP | LLC + D-U-N-S + Apple org (owner) | 2026-10-24 |
| Account deletion | Apple 5.1.1(v) (confirmation when complete) | No completion message | GAP | Send confirmation | 2026-10-24 |
| Trademark | DOMUSO Reg. 5180719 (incontestable, rental payments) | Name "Domus" | GAP | Rename (round 2 in progress) | 2026-10-24 |
| Email | CAN-SPAM 15 U.S.C. 7704 (address only in commercial email) | Transactional only | OK | Add PO box before any marketing | 2026-10-24 |
| Retention | IRS record periods; C.R.S. 13-80-103.5 (6 years for rent debts) | 7 years financial, 7 years after lease end | OK | Add property-records rule | 2026-10-24 |
