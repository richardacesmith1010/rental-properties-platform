# Domus design system — "Registry in graphite" (adopted 2026-10-18)

Owner decision 2026-10-18: "Go with B + C in graphite." Mock-ups: canvas "Domus Visual Directions"
(https://claude.ai/artifact/DP3NYT3Thaaycw7WvyUkue), board **B + C · Registry in graphite**.

**Goal (owner's words):** official, professional, clean — "a serious app with no frivolity."
**Scope:** the look only. No feature, flow, layout, navigation or copy changes. The Wallet structure (tab bar, home pass
card, More drawer) stays exactly as it is.

## 1. Principles
1. **Ink on steel.** Graphite text and actions on a cool steel-grey ground. Color is rare and always means something.
2. **One accent, used sparingly.** Cobalt is only for links, focus rings and "needs a look" markers — never decoration.
3. **Records, not cards.** Sections are separated by hairline rules and small uppercase labels, like a ledger or deed.
   Corners are nearly square. Shadows are almost invisible.
4. **Serif for what matters.** Page titles and money amounts use the serif; everything else uses the sans.
5. **No ornament.** No gradients, glows, emoji, illustrations or bouncy motion. Motion is short fades only.

## 2. Color tokens (`apps/web/app/globals.css`)
Names are the existing tokens; only values change, plus the new `action` and `hero` groups.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#F3F4F6` | `#0E0F11` | page background |
| `--surface` | `#FFFFFF` | `#17191C` | cards, sheets, inputs |
| `--surface-2` | `#F7F8F9` | `#1F2226` | hover, inset boxes |
| `--surface-3` | `#ECEEF1` | `#2A2D32` | skeletons, pressed |
| `--ink` | `#0B0C0E` | `#F2F3F5` | body text, headings |
| `--ink-2` | `#2E3238` | `#C9CDD3` | secondary text |
| `--muted` | `#4D535C` | `#A3A9B2` | labels, captions |
| `--faint` | `#6B717B` | `#8A9099` | meta text (≥12 px) |
| `--line` | `#D9DCE1` | `#2A2D32` | hairline rules, borders |
| `--line-2` | `#C2C7CE` | `#383C42` | input borders |
| `--accent` | `#2442B8` | `#8DA2F0` | links, focus, "check" markers |
| `--accent-strong` | `#182F8A` | `#B0BFF6` | link hover |
| `--accent-weak` | `#E8ECFA` | `#1A2140` | selected row, info box |
| `--accent-line` | `#BAC5EE` | `#2E3A70` | focus outline, selected border |
| `--accent-contrast` | `#FFFFFF` | `#0B0C0E` | text on accent |
| `--action` (new) | `#0B0C0E` | `#F2F3F5` | primary button fill, Add button |
| `--action-strong` (new) | `#2E3238` | `#FFFFFF` | primary button hover |
| `--action-contrast` (new) | `#FFFFFF` | `#0B0C0E` | text on primary button |
| `--hero` (new) | `#0B0C0E` | `#1F2226` | owner home pass card |
| `--hero-ink` (new) | `#FFFFFF` | `#F2F3F5` | text on the pass card |
| `--hero-muted` (new) | `#A5ABB4` | `#A3A9B2` | secondary text on the pass card |
| `--hero-line` (new) | `#2A2D33` | `#383C42` | rule inside the pass card |
| `--crit` / `--crit-bg` | `#B4232A` / `#FBE7E7` | `#FF7A70` / `#33100F` | owed, late, errors |
| `--warn` / `--warn-bg` / `--warn-line` | `#7A4B00` / `#FFF1D6` / `#F2D49B` | unchanged | "rent late" tag, cautions |
| `--pos` / `--pos-bg` | `#0E7A3E` / `#DDF3E6` | unchanged | paid, success |

Every pair in `lib/__tests__/theme-contrast-tokens.test.ts` must still pass (text 4.5:1, faint 3:1); add
`action-contrast` on `action` and `hero-ink` / `hero-muted` on `hero` (4.5:1) in both themes.

## 3. Type
- **Sans (body, UI):** Public Sans 400/500/600 via `next/font/google` (`Public_Sans`), variable `--font-sans`. Replaces Geist.
- **Serif (display):** Source Serif 4 600 via `next/font/google` (`Source_Serif_4`), variable `--font-display`,
  Tailwind `font-display`. Used for: page titles (`h1`, the large screen title), the pass-card home name, and the big
  money figures (pass card amount, stat tiles, rent due, receipt totals). Nowhere else.
- **Numbers:** `font-variant-numeric: tabular-nums` on every amount (already common in the code).
- **Section labels:** 12 px, 600, uppercase, letter-spacing 0.1em, `--muted` (e.g. "RENT DUE", "2026 SO FAR").
- Sizes unchanged from today except page titles (30 → 32 px) and the pass-card amount (stays ~40 px, now serif).

## 4. Shape and depth
| Token | New value | Was |
|---|---|---|
| `--radius-control` | `4px` | 12px |
| `--radius-card` | `4px` | 16px |
| `--radius-pass` | `6px` | 22px |
| `--radius-pill` | `999px` (avatars, toggles only) | 999px |
| `--shadow-sm` | `0 1px 2px rgba(11,12,14,.05)` | .06 |
| `--shadow-md` | `0 1px 3px rgba(11,12,14,.08)` | 16 px blur |
| `--shadow-lg` | `0 8px 24px -12px rgba(11,12,14,.25)` (sheets, menus only) | .35 |

- Status tags ("RENT LATE", "LATE", "CHECK") are square tags: 11 px, 600, uppercase, 2 px radius, 1 px border in the
  status color, no fill. Not pills.
- Screen headers get a 2 px `--ink` rule under the title. The tab bar gets a 1 px `--ink` top rule.
- Lists inside a card use 1 px `--line` rules between rows (no gaps, no per-row cards).

## 5. Buttons and inputs
- **Primary:** `--action` fill, `--action-contrast` text, 4 px radius, 48–50 px tall. (Was blue.)
- **Secondary:** transparent, 1 px `--ink` border, `--ink` text.
- **Quiet / tertiary:** text only, `--accent`.
- **Danger:** `--crit` fill, white text (unchanged meaning).
- **Inputs:** `--surface` fill, 1 px `--line-2` border, 4 px radius; focus = 2 px `--accent-line` ring.
- **Labels:** keep the existing visible labels; style per §3 (form labels stay sentence case 14 px 500; only section
  labels are uppercase).

## 6. Brand mark
- **Doorway:** an arched door outline on a baseline, white on graphite, with a small cobalt door knob (`#8DA2F0`) at
  large sizes only (≥120 px). Master art: `apps/ios/resources/icon.svg` (1024×1024, no rounding; iOS masks it).
- App icon background `#0B0C0E`; splash light = doorway in `#0B0C0E` on `#F3F4F6`; splash dark = white on `#0E0F11`.
- Wordmark: "Domus" in Source Serif 4 600 next to the doorway tile.
- Web: favicon, apple-touch, PWA icons and Open Graph image all from the same master.

## 7. Email
Same palette in `lib/email/shell.ts`: steel ground, white card, graphite button, Public Sans with system fallbacks
(email clients won't load web fonts reliably; serif title falls back to Georgia).

## 8. Out of scope (do not change)
Layouts, spacing scale, component structure, copy, tab order, any behavior. Charts keep their structure; only their
colors move to tokens.
