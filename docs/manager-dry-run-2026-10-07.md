# Manager dry run — 2026-10-07 (smoke manager, Smoke Test Property)

Method: Claude signed in as `SMOKE_MANAGER` and loaded all 21 manager sections at 1280 px and 375 px, light and dark (84 views). Recorded console errors, error screens, horizontal overflow, load time and page text; spot-checked screenshots; probed suspicious items. No data was changed.

## Clean
- 0 console errors, 0 error screens, 0 horizontal overflow in 84 views. Loads ~2.4–3.7 s (Leases' "network never idle" was a long-lived connection: 0 requests in 10 s after load, not a loop).
- Manager sees S193 "Tenant says paid · Oct 7" badges on Rent; Mark paid works as the close action.

## Findings (ranked)
| # | Severity | Screen | Finding |
|---|---|---|---|
| 1 | High | Messages | Default Timeline tab says "No messages yet / Your landlord can message you here." to managers (tenant copy; `inbox-section.tsx:235` is role-blind). Real messages exist under the Threads tab. |
| 2 | High | Home vs Messages | Home says "4 new messages" and the nav badge says 4, but Messages says "0 unread". The counts come from different sources. |
| 3 | Medium | Home | Manager bank card title uses the owner account's name ("Smoke Owner Account needs one more thing") while the body is about the manager's own fees (`owner-bank-card.tsx:13`). |
| 4 | Medium | Messages | Thread titles are written from the tenant's side ("Messages with your landlord") or are technical ("Manual payment review - …"). |
| 5 | Medium | Repairs, Activity | People shown by raw email (`richard.ace.smith+drytenant@gmail.com`) where a name is known ("Dry Run Tenant"). |
| 6 | Medium | Automations | Jargon the guard misses: "Trigger: Charge becomes late", "SLA", "escalation checkpoints", "Open workflow context", "persisted per property". (Strings live under keys the scanner doesn't check.) |
| 7 | Low | Applications, Documents, Find a tenant | Jargon: "screening outcomes", "review pipeline", "Screening scores are manually recorded (0-1000)", "Template Flow / Packet Flow / File Flow", "Next best action: Tenant Invited", "1 properties". |
| 8 | Low | Autopay | `us_bank_account` with no brand renders "Us_bank_account" (S194 follow-up). |
| 9 | Feature | Rent | Managers have Mark paid but no Remind (scorecard: "reminders with owner permission"). |
