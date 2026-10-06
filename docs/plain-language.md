# Plain language in Domus

Write UI and email text for a sixth-grade reader. Use common verbs.
Keep each sentence to **12 words or fewer**. Split longer thoughts into short sentences.

| Avoid | Say instead |
| --- | --- |
| charge | rent, payment, or amount owed |
| submit | send |
| delinquency, delinquent | overdue |
| disbursement, remittance | payout or payment |
| reconciliation, reconcile | match payments to records |
| acknowledgment, acknowledgement | confirmation |
| terminate, commence | end, start |
| pursuant, herein | based on, here |
| utilize, facilitate | use, help |
| subsequent, prior to | next, before |
| inquire, endeavor | ask, try |
| transaction, ledger | payment, payment history |
| CSV, ACH | spreadsheet, bank transfer |
| onboard, onboarding | set up, setup |
| command center, premium | one place, better |

Run the guard from `apps/web`:

```bash
npx vitest run lib/__tests__/plain-language.test.ts
```

The guard checks display text in the app, components, and email templates.
If a term must stay, add `"file:exact text": "specific reason"` to
`apps/web/lib/plain-language/exceptions.json`.
Exceptions must name one exact string and explain why it must remain.
Keep the file at 25 entries or fewer.
Legal, privacy, and internal ops pages are outside the guard.
