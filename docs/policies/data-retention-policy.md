# Domus Data Retention and Deletion Policy

**Owner:** Richard Ace Smith, Owner — privacy@domusbase.com
**Version:** 1.0 · **Adopted:** 2026-10-18 (owner approved 7 years; lawyer to confirm) · **Next review:** 12 months after adoption, or when laws or vendors change

## 1. Purpose
This policy covers how long Domus keeps each kind of data, how it is deleted, and how people can ask for their data to be deleted. It follows our [privacy policy](https://domusbase.com/privacy) and applicable U.S. privacy laws, including the California Consumer Privacy Act (CCPA/CPRA) where it applies. It also follows our agreements with Plaid and Stripe.

## 2. Principles
- **Collect only what we need:** we keep only the data needed to run Domus.
- **Bank data:** we store rental bank items only. Personal transactions are **not stored**. We keep a one-way fingerprint so we don't ask about the same item twice; the fingerprint has no amount or description.
- **Delete when done:** when data is no longer needed, we delete it, unless the law or an active dispute requires us to keep it.

## 3. Retention schedule
| Data | Kept for | Then |
|---|---|---|
| Account profile (name, email, phone) | While the account is open | Deleted within 30 days of account closure |
| **Plaid access token** | While the bank is connected | **Deleted when the bank is disconnected or the account is closed.** We also call Plaid's `/item/remove`. |
| Bank items waiting for an answer (review queue) | Until answered, at most 90 days | Answered items are filed as rental or dropped (fingerprint only). Unanswered items are deleted after 90 days. |
| Rental bank items, rent payments, expenses, ledgers | 7 years after the tax year they belong to (tax and accounting records) | Deleted, or kept only with no personal details |
| Leases and lease documents | 7 years after the lease ends | Deleted |
| Repair requests and photos | 3 years after the request is closed | Deleted |
| Home files and avatars | While the account is open | Deleted within 30 days of account closure |
| Stripe payment records | Held by Stripe under Stripe's own policy; Domus keeps only IDs and amounts, as above | — |
| Server and error logs (Vercel, Sentry) | Each vendor's default, 90 days at most | Expire automatically |
| Database backups (Supabase) | Supabase's backup window | Expire on a rolling basis; deleted data leaves backups as they expire |
| Fingerprints for skipped (personal) bank items | While the bank is connected | Deleted when the bank is disconnected |

*If a law, court order, or open dispute requires a record, we keep it longer, but only that record and only for as long as required.*

## 4. Disconnecting a bank
When a user disconnects a bank in Domus:
1. Domus calls Plaid `/item/remove`, so Plaid stops sharing data.
2. The encrypted access token and the connection records are deleted right away.
3. Rental items already filed stay in the owner's records, because they are the owner's bookkeeping. They follow the 7-year rule in §3.

## 5. Requests to see or delete data
- **How to ask:** anyone can email **privacy@domusbase.com** to see, correct, export, or delete their data.
- **Checking it's you:** we confirm the request comes from the account's email address.
- **Response time:** we reply within 45 days, as CCPA requires.
- **What gets deleted:** everything in §3 that isn't covered by a legal duty to keep it. If we must keep a record, we explain why.
- **Shared records:** some records belong to more than one person, such as a lease between an owner and a tenant. For those, we remove the requester's personal details and keep the rest for the other party.

## 6. How deletion is done
- **Database rows:** deleted for good, or stripped of personal details.
- **Files:** removed from storage.
- **Tokens:** deleted, and revoked at the provider.
- **Backups:** expire on their own schedule. They are not restored except to recover from a disaster. If one is restored, deletions made since that backup are applied again.

## 7. Roles and review
- **Owner's duties:** the owner enforces this policy and reviews it every year.
- **Automation:** steps marked automatic are done by code. The 90-day review-queue cleanup runs every day on its own (since 2026-10-14). Since 2026-10-21 a daily **retention report** (09:45 UTC) counts what the 7-year and 3-year rules in §3 would make eligible, and what would block a safe delete; it deletes nothing. Nothing is old enough yet (earliest records are from 2026). Automatic deletion will be switched on only after the lawyer confirms the periods and the owner approves; until then no records are deleted under these rules.
