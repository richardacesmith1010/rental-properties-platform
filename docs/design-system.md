# Domus Design System — v1 (Evergreen)

**Status:** Direction approved 2026-07-08. This is the source of truth for the redesign. Every UI sprint from here builds against these tokens. Concept it derives from: `scratchpad/domus-redesign-concept.html` (published artifact).

## Direction

A tool people trust with money — not a game. Same tested features, new surface. The register is Mercury / Ramp / Stripe Dashboard / Linear: restrained palette, numbers-forward, status encoded in form, calm.

**Removed:** mascot ("Dom"), XP & levels, streak heatmap, achievements, celebration toasts, the three named themes (Atlas Light / Noctis Neon / Imperium Night).
**Kept & sharpened:** plain language, light + dark mode (only), the tested logic/data layer, payment history shown as a plain fact, speed.

## Principles

1. **The number is the hero.** On any money screen, the amount is the largest, most confident element. Tabular numerals everywhere digits appear.
2. **Status ≠ brand.** Semantic color (critical / warning / positive) is separate from the accent and carries meaning. Never decorate with it.
3. **Summary before detail.** Dashboards lead with a few numbers, then only what needs a decision.
4. **One accent, used sparingly.** Evergreen marks primary action and positive/paid state — nothing else.
5. **Interactive looks interactive; the rest stays quiet.**

## Color tokens

Defined as CSS custom properties on `:root`. Theme via token-level overrides (see Theming). Hex values are the contract; component CSS references tokens only.

### Light (default)
| Token | Hex | Use |
|---|---|---|
| `--ground` | `#FBFBF9` | app background (warm near-white, not clinical) |
| `--surface` | `#FFFFFF` | cards, panels |
| `--surface-2` | `#F5F5F1` | insets, icon wells |
| `--surface-3` | `#EFEFE9` | avatars, subtle fills |
| `--ink` | `#191C1A` | primary text (near-black, faint green-slate bias) |
| `--ink-2` | `#3B403C` | strong secondary text |
| `--muted` | `#71766F` | labels, metadata |
| `--faint` | `#9BA09A` | de-emphasized / axis |
| `--line` | `#E6E6E0` | borders (warm hairline) |
| `--line-2` | `#EEEEE8` | inner dividers |
| `--accent` | `#15683F` | **evergreen** — primary action, positive/paid |
| `--accent-strong` | `#0F4E2F` | accent hover |
| `--accent-weak` | `#E7F0E9` | accent tint bg / pills |
| `--accent-line` | `#CDE1D3` | accent-tinted borders |

### Dark
| Token | Hex |
|---|---|
| `--ground` | `#121412` |
| `--surface` | `#191D19` |
| `--surface-2` | `#20241F` |
| `--surface-3` | `#272C25` |
| `--ink` | `#ECEEE7` |
| `--ink-2` | `#C6CABF` |
| `--muted` | `#969C92` |
| `--faint` | `#6D746B` |
| `--line` | `#282D27` |
| `--line-2` | `#22271F` |
| `--accent` | `#5AAB7C` |
| `--accent-strong` | `#7FC79D` |
| `--accent-weak` | `#182619` |
| `--accent-line` | `#2B3D30` |

### Semantic (both themes — separate from accent)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--crit` / `--crit-weak` | `#A5341F` / `#F5E3DE` | `#D06C55` / `#2A1913` | past due, destructive, errors |
| `--warn` / `--warn-weak` | `#9C5B12` / `#F5EBDC` | `#CB8B41` / `#271F13` | due soon, needs attention |
| positive | uses `--accent` / `--accent-weak` | — | paid, on-time, healthy |

On the evergreen accent button, label text is white in light mode and `#0B1A11` (near-black) in dark mode for contrast.

## Theming

Light on `:root`. Dark applied at token level in three places so both the OS preference and the in-app toggle win in both directions:

```css
:root { /* light tokens */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark tokens */ } }
:root[data-theme="dark"] { /* dark tokens */ }
```

Only two themes. Delete the Atlas/Noctis/Imperium theme machinery.

## Type

Native system stack — for a product UI this is the correct premium choice (what Linear/Ramp ship) and avoids webfont-fallback risk. Hierarchy comes from scale, weight, tracking, and tabular numerals, not from a display face.

```
--font: ui-sans-serif,-apple-system,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
```

| Role | Size | Weight | Tracking | Notes |
|---|---|---|---|---|
| Screen title | 22px | 640 | -0.02em | |
| Hero money | 30–38px | 660–670 | -0.03em | tabular |
| KPI value | 25px | 660 | -0.025em | tabular |
| Body | 14–15px | 400–520 | — | |
| Control label | 13.5–15px | 590–620 | — | |
| Micro-label | 11px | 600 | .07–.09em | uppercase, `--muted` |
| Data/money | — | — | -0.01em | `font-variant-numeric: tabular-nums` |

## Shape, spacing, elevation

- Radii: cards `16px`, controls/tiles `12px`, chips/small `9px`, pills `999px`.
- Borders: 1px hairline in `--line`; interactive hover shifts border to `--accent-line`.
- Shadows: barely-there. `--shadow-sm` for resting cards; `--shadow`/`--shadow-lg` reserved for elevated frames/modals only. No heavy drop shadows.
- Layout via flex/grid `gap`, never per-element margins. Wide content scrolls in its own `overflow-x:auto` container.

## Component conventions

- **Primary button:** evergreen fill, white label (near-black in dark), `12px` radius, subtle press.
- **Ghost button:** `--surface` bg, `--line` border, `--ink-2` label — for secondary/inline actions.
- **KPI tile:** micro-label / big tabular value / one metadata line (delta in accent, or crit for past-due).
- **Status pill:** dot + label, tinted weak bg + semantic color. Never the accent unless positive.
- **Attention row:** severity dot (crit/warn/info) + title + metadata + amount + one action. Info uses accent.
- **Method selector:** radio-card pattern; recommended/free option leads; fees stated plainly, never buried.
- **Sidebar nav:** thin, neutral, text-forward; single active item gets `--accent-weak` bg + accent glyph. No large filled blocks.
- **Charts:** area fill from accent at ~0.2 opacity → transparent; 2px accent stroke; emphasized endpoint dot; single faint baseline. Give them the same care as type.

## Voice

Unchanged from CLAUDE.md §18 plain-language rules. A control says exactly what happens ("Connect bank" → toast "Bank connected"). Errors say what went wrong and how to fix it. No jargon reaches the user ("connected account", "invalid_request_error" never shown).

## Rollout phases (proposed)

Reskin over tested code, screen by screen, visual-check each. Do NOT rebuild.

1. **Tokens + primitives** — install the token system; restyle Button, Card, Pill/Badge, Input, nav shell. No screen logic touched.
2. **Tenant surface** — Pay Rent, Problems, Lease, Messages. (Highest trust payoff; simplest.)
3. **Owner surface** — Overview/KPIs, Properties, Tenants, Rent, Reports, Maintenance.
4. **Manager surface** — mirrors owner.
5. **De-gamify UI** — remove mascot, XP widget, streaks, achievements, celebration toasts from all views; replace with plain facts.
6. **Backend cleanup (separate sprint)** — once the gamification UI is gone, remove now-dead tables/cron/XP logic. Lower priority; purely maintenance debt.
7. **Theme cleanup** — delete Atlas/Noctis/Imperium; ship light + dark only.

Each phase is one or more Codex sprints with the standard gate + real-session render check (L-009).
