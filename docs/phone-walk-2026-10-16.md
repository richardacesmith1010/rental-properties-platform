# iPhone Simulator walk — 2026-10-16 (iPhone 18 Pro, iOS 27, Debug build of `apps/ios`, production web)

Sign-in without passwords: a test-only helper generated a one-time magic link (service role, `+walk` accounts only) and
set it as the startup URL of the **built** app bundle in the scratchpad (repo untouched). Fresh installs between roles.

| # | Sev | Where | Finding |
|---|---|---|---|
| A1 | **Blocker (App Store 5.1.1(v))** | Settings | No in-app account deletion. `Account & Data` tab is owner-only (`components/settings/settings-layout.tsx:34`), the wipe actions refuse non-owners (`app/actions/account-wipe.ts:53-56`), and no path deletes the sign-in (`auth.admin.deleteUser` absent). Tenants/managers only get "Your data" (download). |
| P1 | High (review risk) | Launch | Black (cold) / white (warm) screen ~8–15 s before the first page; splash hides after 1.5 s (`capacitor.config.ts` `launchShowDuration: 1500`, `launchAutoHide: true`). |
| P3 | High | Money, Settings | Page title/buttons sit under the status bar (no top safe-area inset on these layouts); Home/Homes/Messages are fine. |
| P9 | Medium | Manager (phone) | No bottom tab bar for managers (owner and tenant have one); old layout (M4). |
| P2 | Medium | All roles | Floating "?" help button covers content ("See all", "Start conversation", rent progress). |
| P7 | Medium | Tenant | Still says "Report a problem", "Your problems", tab "Problems" — owner decision 2026-10-16: **Repair**. |
| P4 | Low | Owner | Tab "Inbox" opens a page titled "Messages"; drawer uses a bell icon for Messages. |
| P5 | Low | Messages | Conversation count pill "1 msg" wraps and clips. |
| P8 | Low | Tenant Home | "Next rent" label followed by "Next rent: $1,200 on Nov 15." (repeated words). |
| P10 | Low | Settings | "Back to Workspace" (jargon); no tab bar on Settings. |
| — | Info | Callback | `next=/settings` on the magic-link callback is ignored (lands on the role home) — fine for users. |
| — | Info | Face ID | Lock persisted from earlier test runs on this simulator; "Sign in with password" works; fresh install shows no lock. |

Passed: owner Home (Wallet), Money totals, Homes cards, Messages lists, tenant Home "Paid Oct 15, 2026. Thank you!",
manager Home "Needs you today"; sign-in via callback works inside the app web view.
