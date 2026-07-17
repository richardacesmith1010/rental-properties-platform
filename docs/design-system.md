# Domus Design System — v2 (Evergreen → Meridian Blue)

**Status:** v2 approved 2026-07-17 via 25-question design session with the user. Supersedes v1 (2026-07-08). This is the source of truth for the reskin arc; every UI sprint builds against these tokens. Where v2 is silent, v1's component conventions still apply.

**v2 changes vs v1:** accent evergreen → **deep finance blue**; muted status colors → **conventional bright (WCAG-checked)**; system font stack → **Inter**; scope expanded to **everything** (app + marketing + emails + PDFs) with **parallel mobile**; rollout reordered **owner-first**; gamification removal collapsed to **one dedicated sprint (UI + backend)**; quality bar set to **fintech-tier polish** with mandatory Claude visual walks per phase.

## Direction

A tool people trust with money. Register: Mercury / Stripe Dashboard / Linear — restrained, numbers-forward, status encoded in form, calm. The brand is **neutral fintech with Roman whispers**: the Roman soul survives only in naming (Domus; optional room-names for major surfaces later) — never in decoration, texture, or UI ornament.

- **Wordmark:** "Domus" set in Inter (tight tracking, weight ~640). No mascot anywhere — Dom is fully retired (including favicon, empty states, onboarding).
- **Voice:** plain 6th-grade language everywhere, both tenant and owner surfaces (CLAUDE.md §18 rules unchanged).

## Principles

1. **The number is the hero.** On any money screen the amount is the largest, most confident element (30–38px, tabular numerals everywhere digits appear).
2. **Status ≠ brand.** Blue means interactive. Green means paid/positive. Red/amber mean overdue/attention. Never decorate with semantic color; never use the accent for status.
3. **Summary before detail.** Dashboards lead with a few numbers, then only what needs a decision.
4. **Density is contextual.** Airy where you decide (dashboards, pay screens); compact where you scan (ledgers, tenant lists, tables).
5. **Interactive looks interactive; the rest stays quiet.**
6. **Celebrate quietly.** Success is a plain confirmation ("Rent paid. Receipt sent."), never confetti, XP, or badges.

## Color tokens

CSS custom properties on `:root`. Light default; dark via the three-hook pattern below. Hex values are the contract.

### Light (default)
| Token | Hex | Use |
|---|---|---|
| `--ground` | `#FBFBF9` | app background (warm near-white — kept from v1) |
| `--surface` | `#FFFFFF` | cards, panels |
| `--surface-2` | `#F5F5F1` | insets, icon wells |
| `--surface-3` | `#EFEFE9` | avatars, subtle fills |
| `--ink` | `#191B1E` | primary text (near-black, faint cool bias to sit with blue) |
| `--ink-2` | `#3A3F45` | strong secondary text |
| `--muted` | `#6F757C` | labels, metadata |
| `--faint` | `#9AA0A6` | de-emphasized / axis |
| `--line` | `#E6E6E0` | hairline borders |
| `--line-2` | `#EEEEE8` | inner dividers |
| `--accent` | `#1D4ED8` | **meridian blue** — primary action, active nav, links |
| `--accent-strong` | `#1A3FAE` | accent hover/press |
| `--accent-weak` | `#E8EEFC` | accent tint bg / active-nav pill |
| `--accent-line` | `#C7D6F8` | accent-tinted borders / focus ring base |

### Dark
| Token | Hex |
|---|---|
| `--ground` | `#121316` |
| `--surface` | `#191B1F` |
| `--surface-2` | `#202328` |
| `--surface-3` | `#272B31` |
| `--ink` | `#ECEDEF` |
| `--ink-2` | `#C5C8CE` |
| `--muted` | `#959AA2` |
| `--faint` | `#6C727B` |
| `--line` | `#282C33` |
| `--line-2` | `#222630` |
| `--accent` | `#7E9FF7` |
| `--accent-strong` | `#9DB5F9` |
| `--accent-weak` | `#182238` |
| `--accent-line` | `#2C3B5C` |

On the blue accent button: label is white in light mode (`#1D4ED8` bg → white text = 6.3:1 ✓), near-black `#0C1322` on the lighter dark-mode accent.

### Semantic status (conventional bright, WCAG-checked)
Status pills/rows use a **tint background + deep text tone** pair so bright never means unreadable:

| State | Text/icon (light) | Tint bg (light) | Text (dark) | Tint bg (dark) |
|---|---|---|---|---|
| Overdue / destructive `--crit` | `#B91C1C` | `#FDE8E8` | `#F1867E` | `#2C1615` |
| Due soon / attention `--warn` | `#B45309` | `#FCF0DC` | `#E0A34E` | `#28200F` |
| Paid / positive `--pos` | `#15803D` | `#E4F5E9` | `#6BC98B` | `#14261A` |

Positive/paid is **green, not the accent** (v2 change): blue = interactive, green = money-good. Charts and non-status UI never borrow these.

## Theming

Light on `:root`; dark at token level in three hooks so OS preference and the in-app toggle both win in both directions:

```css
:root { /* light tokens */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark tokens */ } }
:root[data-theme="dark"] { /* dark tokens */ }
```

Default = follow the device; one-click override in Settings persists to localStorage. Exactly two themes — the Atlas Light / Noctis Neon / Imperium Night machinery is deleted during the arc.

## Type

**Inter everywhere** (v2 change), loaded via `next/font` (self-hosted, `display: swap`, zero external request, no CLS). `font-variant-numeric: tabular-nums` wherever digits appear.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Screen title | 22px | 640 | -0.02em |
| Hero money | 30–38px | 660 | -0.03em (tabular) |
| KPI value | 25px | 660 | -0.025em (tabular) |
| Body | 14–15px | 400–520 | — |
| Control label | 13.5–15px | 590–620 | — |
| Micro-label | 11px | 600 | .07em, uppercase, `--muted` |
| Table/data | 13–14px | 440–520 | -0.01em (tabular) |

## Shape, spacing, elevation

- Radii: cards `16px`, controls/tiles `12px`, chips `9px`, pills `999px` (kept from v1).
- Borders: 1px hairline `--line`; interactive hover shifts to `--accent-line`.
- Shadows: barely-there resting (`--shadow-sm`); real elevation reserved for modals/popovers.
- **Density:** dashboards/pay screens airy (24–32px section gaps, 20px card padding); data tables compact (10–12px row padding, more rows per screen).
- Layout via flex/grid `gap`; wide content scrolls in its own `overflow-x:auto` container.

## Component conventions

- **Primary button:** accent fill, white label, 12px radius, subtle press. One primary per view.
- **Ghost button:** `--surface` bg, `--line` border, `--ink-2` label.
- **KPI tile:** micro-label / big tabular number / ONE quiet meta line (delta in `--pos`/`--crit` as semantically true). No sparklines.
- **Status pill:** dot + label, tint bg + deep text tone from the semantic table. Paid = green, never blue.
- **Sidebar:** thin neutral rail (surface bg, hairline edge), text-forward items, the single active item gets `--accent-weak` bg + accent glyph. No gradients, no filled blocks.
- **Charts:** single-accent monochrome — one emphasized series in `--accent`, comparisons in lighter tints, area fills at ~0.15 opacity, single faint baseline. No categorical rainbow.
- **Empty states:** one plain sentence + the primary action. No illustration, no icon art, no mascot.
- **Ledgers/history:** plain fact tables — date, amount, method, receipt. On-time-ness is data, never a score.
- **Confirmations:** inline plain success ("Rent paid. Receipt sent."), green check allowed, zero motion beyond a standard fade.

## De-gamification (one-shot sprint)

All gamification dies in a single dedicated sprint (v2 change): UI (XP widgets, levels, streak flames, achievements page, celebration toasts, AchievementChecker) **and** backend (achievements/user_achievements/user_gamification/xp_events tables, award_xp/update_streak RPCs, gamification cron + API route). Schema drops = migration work owned by Claude; treat the sprint as L3.

## Scope & rollout (v2)

Everything gets the new skin: web app, marketing/landing, transactional emails, PDF receipts/invoices. **Mobile (Expo) reskins in parallel** — each web phase is followed by its mobile mirror where the surface exists on mobile.

Order (owner-first — v2 change), one or more sprints each, **each phase ships live**:

1. **Phase 0 — Tokens + primitives:** Inter via next/font, token system installed, Button/Card/Pill/Input/nav-shell primitives restyled, three-theme machinery replaced by light+dark. No screen logic. Mobile token port follows immediately.
2. **Phase 1 — Owner surface:** dashboard shell, KPI command center, all owner sections, property drill-down, reports.
3. **Phase 2 — Tenant surface:** pay rent, problems, lease, messages, history ledger.
4. **Phase 3 — Manager surface.**
5. **Phase 4 — Auth + onboarding + settings + connect flows.**
6. **Phase 5 — De-gamification (one-shot, L3).**
7. **Phase 6 — Marketing/landing.**
8. **Phase 7 — Emails + PDFs.**

## Quality bar (hard rule for the arc)

**Fintech-tier polish.** Every phase must stand next to Mercury/Ramp without embarrassment. Per CLAUDE.md §4.5/§19, Claude walks every changed screen post-deploy in BOTH themes (plus 375px mobile width), checks WCAG contrast, tabular alignment of money columns, spacing rhythm, and rejects the sprint for pixel-level sloppiness: drifting paddings, misaligned numbers, wrong-weight text, unthemed corners. The smoke suite's zero-console-error gate runs on every deploy; visual walks are additional, not replaced.
