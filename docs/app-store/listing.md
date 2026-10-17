# Domus App Store listing (draft)

Draft by Claude, 2026-10-16. Nothing is entered in App Store Connect yet.
Sources: `docs/phone-readiness-plan-2026-10-16.md` (decisions table, sections 1 and 3), `apps/ios/PRIVACY-AUDIT.md`,
`apps/web/components/marketing/landing-content.tsx`, `apps/web/components/dashboard/ai-assistant.tsx` (starter prompt).

Counts are exact `len()` of the text inside each code block (Python, Unicode characters, newlines included).
Re-count after any edit. Search for `OWNER:` to find every item that waits on the owner.

## Fields at a glance

| Field | Value | Count / limit |
|---|---|---|
| Name | Domus: Rent & Repairs | 21 / 30 |
| Subtitle | For landlords and tenants | 25 / 30 |
| Promotional text | see section 4 | 125 / 170 |
| Description | see section 5 | 1790 / 4000 |
| Keywords | see section 6 | 97 / 100 |
| Support URL | https://domusbase.com/support | 29 |
| Marketing URL | https://domusbase.com | 21 |
| Privacy Policy URL | https://domusbase.com/privacy | 29 |
| Primary category | Business | n/a |
| Secondary category | Productivity | n/a |
| Copyright | 2026 `OWNER: legal entity name` | 5 + name |
| Price | Free | n/a |
| Availability | United States only | n/a |
| Content rights | No third-party content | n/a |
| Age rating | Draft 18+ (`OWNER:` confirm, Q8) | n/a |

## 1. App record (New App form, owner clicks Create)

**Created 2026-10-16** by the owner (Claude filled the form). Apple ID **6823839749**; iOS 1.0 "Prepare for Submission".
App page: https://appstoreconnect.apple.com/apps/6823839749

| Field | Value |
|---|---|
| Platform | iOS |
| Name | Domus: Rent & Repairs |
| Primary language | English (U.S.) |
| Bundle ID | com.domusbase.app |
| SKU | domus-ios |
| User access | Full access |

## 2. Name (21 / 30)

```text
Domus: Rent & Repairs
```

- "Domus" alone is taken twice in the US store (ASC-03, Q1).
- The home-screen name under the icon stays "Domus".

## 3. Subtitle (25 / 30)

```text
For landlords and tenants
```

- Picked so no word repeats the name. Apple already indexes "Rent" and "Repairs" from the name.
- Alternate from the plan: `Rent, repairs and leases` (24 / 30). It reads well but repeats two name words.
- If the alternate is used, add `landlord,tenant` to keywords and drop `owner`, `unit` and `apartment`.
  Dropping only `owner` and `unit` gives 102, over the limit. Use this exact string (92 / 100):
  `property,manager,lease,maintenance,autopay,expense,receipt,tax,LLC,screening,landlord,tenant`

## 4. Promotional text (125 / 170)

```text
Collect rent, track repairs, and keep leases in one place. Tenants pay by bank or card. Domus is free. No credit card needed.
```

- Can change any time without a new build.

## 5. Description (1790 / 4000)

App Store shows plain text only. Paste the block as is, bullets included.

```text
Domus helps you run your rental homes.
Rent, repairs, and leases live in one place.
Owners, managers, and tenants each get their own view.
Domus is free. You don't need a credit card.

FOR OWNERS
• See who paid and who is late at a glance.
• Tenants pay rent by bank or card through Stripe.
• The money goes to your bank.
• Track money in and money out. Be ready for tax time.
• Connect your bank to bring in costs. Or upload a bank file.
• Get applications from people who want to rent.
• Make a lease, sign it, and keep every receipt.
• Give a manager only the homes they run.
• Share homes held in an LLC (a type of business) with co-owners.

FOR MANAGERS
• See only the homes you run.
• Keep track of rent and repairs for each home.

FOR TENANTS
• Pay rent online. Turn on autopay with one tap.
• Report a repair with photos. See where it stands.
• Read your lease and past payments any time.
• Message your landlord in the app.

MADE FOR IPHONE
• Lock Domus with Face ID or Touch ID.
• Connect your bank in a safe Plaid window.
• Save or share reports as PDF or spreadsheet files.
• Take photos of repairs and receipts with your camera.

ASK DOMUS
Owners and managers can ask questions about their homes.
Try "Who hasn't paid this month?"
Ask Domus is an AI helper.
It asks for your OK before it uses your data.
You can turn it off in Settings.

YOUR DATA
• Each person sees only what they should.
• Connections are encrypted. Changes are logged.
• Domus has no ads.
• Tenants and managers can download their data in Settings.
• Want to leave? Ask to delete your account in Settings.
• We finish deleting it within 30 days.

NEED HELP?
Email support@domusbase.com.
Or visit https://domusbase.com/support.
Privacy policy: https://domusbase.com/privacy
Terms: https://domusbase.com/terms
```

Lines that depend on unshipped work (do not submit until each is true):

| Line | Needs |
|---|---|
| "It asks for your OK before it uses your data." / "You can turn it off in Settings." | Sprint 238c (Ask Domus consent sheet and Settings switch) live |
| "Or visit https://domusbase.com/support." | Sprint 238c (`/support` page) live. Until then, use `https://domusbase.com`. |
| "Ask to delete your account in Settings." / "within 30 days" | Sprint 238b live: Settings → Your data / Account & Data → Delete my account |
| "Privacy policy: https://domusbase.com/privacy" | Page is live today; the updated legal text waits on Q9 |

Notes:
- Every sentence is 12 words or fewer. Checked by script.
- No push or reminder claims. The app sends no notifications (owner rule).
- "Domus has no ads" matches the audit: no ad SDK or tracking found.
- The download line names tenants and managers only. Owners have no download in Settings yet:
  `apps/web/app/api/account/export/route.ts:25` returns 403 for owners, and "Your data" is tenant and manager only
  (`settings-layout.tsx:35`). If owner export ships, change it back to "Download your data any time in Settings."
- "Domus is free" matches Price = Free. Future paid plans fall under 3.1.1 (ASR-15).
- Apple bars naming other phone platforms (2.3.10). None are named.

## 6. Keywords (97 / 100)

```text
property,manager,lease,maintenance,autopay,apartment,expense,receipt,tax,LLC,screening,unit,owner
```

- Comma-separated, no spaces, 13 words.
- No word from the name (Domus, Rent, Repairs) or the subtitle (landlords, tenants).
- Keywords are hidden search terms, so "maintenance" is fine here. Users search that word.
- No competitor or trademarked names.

## 7. URLs

| Field | Value | Count |
|---|---|---|
| Support URL (required) | `https://domusbase.com/support` | 29 |
| Support URL until Sprint 238c ships | `https://domusbase.com` | 21 |
| Marketing URL (optional) | `https://domusbase.com` | 21 |
| Privacy Policy URL (required) | `https://domusbase.com/privacy` | 29 |

- License agreement: Apple's standard EULA. Domus Terms are at `https://domusbase.com/terms` (in the description).
- Support email for App Review contact and TestFlight feedback: `support@domusbase.com`.
- Privacy questions: `privacy@domusbase.com`.

## 8. Category

| Slot | Value |
|---|---|
| Primary | Business |
| Secondary | Productivity |

- Not Finance (plan decision 11).

## 9. Copyright (OWNER)

```text
2026 OWNER: legal entity name
```

- Apple format: year, then the rights holder. No URL, no © sign needed.
- `OWNER:` replace with your legal name or LLC name (Q9).
- This links to Q3. An individual account shows your personal name as seller.

## 10. Price and availability

| Setting | Value |
|---|---|
| Price | Free (USD 0) |
| In-app purchases | None |
| Availability | United States only |
| Mac (Apple silicon) | Off. Do not make available. |
| Apple Vision Pro | Off. Do not make available. |
| Pre-order | No |
| Version release | Manually release (Claude default; keeps launch in the owner's hands) |

- US only also means no France encryption filing (plan section 3, item 4).

## 11. Content rights

| Question | Answer |
|---|---|
| Does your app contain, show, or access third-party content? | No |

- All content is the user's own: homes, leases, photos, messages and bank records.

## 12. Age rating (OWNER: confirm, Q8, draft 18+)

Draft answers. Apple's question wording may differ. Answer to match these facts.

| Topic | Draft answer | Why |
|---|---|---|
| Parental controls | No | none in app |
| Age assurance | No | none in app |
| Unrestricted web access | No | `NavigationPolicy.swift` limits pages to allowed hosts; Stripe payout setup opens Safari |
| User-generated content | Yes | repair photos, documents, notes; shared only with that home's tenants, owners and managers |
| Messaging and chat | Yes | private threads per home, between its tenants and its owners or managers (`app/actions/inbox.ts`) |
| Advertising | No | no ad SDK (privacy audit) |
| Profanity, horror, drugs, alcohol, tobacco | None | |
| Medical or wellness | None | |
| Sexual content, nudity, suggestive themes | None | |
| Violence, guns, weapons | None | |
| Gambling, contests, loot boxes | None | |
| Made for Kids | No | |

- `OWNER:` confirm 18+ to match the draft Terms line "Domus is for adults" (Q8).
  That line is in `docs/legal-draft-terms-privacy-2026-10.md:80`. It is not on the live `/terms` page yet (waits on Q9).
- If Apple computes a lower rating, choose 18+ with the age-rating override, if offered.
- If no override is offered, keep the computed rating. The Terms say adults only once Q9 publishes.

## 13. App Review sign-in (OWNER)

Sign-in required: Yes. Accounts are the separate fake App Review owner and tenant (Q10, plan section 3 item 8).
Never write real passwords in this file.

| Field | Value |
|---|---|
| User name (demo owner) | `OWNER:` from the `APPREVIEW_*` owner email in `apps/web/.env.local`, after seeding |
| Password (demo owner) | `OWNER:` paste from `apps/web/.env.local` into App Store Connect only |
| Demo tenant login | Apple gives one sign-in slot. Put the tenant login in the Review notes field. |
| Demo tenant user name | `OWNER:` from the `APPREVIEW_*` tenant email in `apps/web/.env.local`, after seeding |
| Demo tenant password | `OWNER:` paste from `apps/web/.env.local` into the Review notes only |
| Contact first and last name | `OWNER:` |
| Contact phone | `OWNER:` type it in App Store Connect (owner step 9) |
| Contact email | support@domusbase.com |
| Review notes | Drafted separately (plan section 3, item 2) |

## 14. Before submitting

1. Sprint 238b live (delete request in Settings).
2. Sprint 238c live (`/support`, Ask Domus consent, Privacy and Terms links in app).
3. Swap the Support URL to `https://domusbase.com/support`.
4. `OWNER:` Q3 (account type), Q8 (age rating), Q9 (legal name, legal text).
5. `OWNER:` Q10 yes, then demo accounts seeded and passwords pasted.
6. Re-count every field after any edit.
