# Redesign rollout — "Registry in graphite" (planned 2026-10-18)

Spec: `docs/design/domus-design-system.md`. Look only: no feature, layout or copy changes.
Each sprint: Codex packet → review → gate → deploy → light + dark screenshots on web and the iPhone Simulator (L-009,
L-022) → handoff. The app keeps working between sprints; partial states are acceptable for a day or two.

| # | Sprint | What changes | Severity / review | Owner action |
|---|---|---|---|---|
| 242a | **Foundations** | `globals.css` light + dark tokens (§2), new `action`/`hero` tokens, radii and shadows (§4); fonts Public Sans + Source Serif 4 (`layout.tsx`, `tailwind.config.ts`, `font-display`); primitives in `components/ui` (button, input, select, textarea, card, badge, alert) per §5; contrast test extended | L2 | none |
| 242b | **Brand mark** | Doorway `icon.svg`; `apps/ios/scripts/assets.mjs` colors; regenerate iOS icon + splash + web icons; `app/icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`; LaunchScreen background | iPhone tier: ChatGPT review, gpt-6-astra high | none until TestFlight build 4 |
| 242c | **Front door** | Landing page, login / sign-up / reset / confirm, `/terms` `/privacy` `/support`, email shell (§7) | L2 | none |
| 242d | **Owner screens** | Home pass card → `--hero`; screen-title rule; section labels; serif titles and amounts; status tags (§4); Money, Homes, Bank, Reports, Settings; the 7 files with hard-coded hex colors | L2 | none |
| 242e | **Tenant + manager + documents** | Tenant Home/Rent/Repairs/Messages, manager views, receipt page and PDF, join pages | L2 | none |
| 242f | **Finish** | Full walk light + dark (web, Simulator), fix stragglers, new App Store screenshots, TestFlight build 4 | L2 + iPhone build | install build 4 (one tap) |

Order rationale: 242a moves ~80% of the look at once (every screen reads the tokens). 242b is independent and can run
in parallel with 242a. 242c–242e are screen polish on top of the tokens. Nothing ships to phones until 242f's build 4,
except that the web app (which the iPhone app loads) updates as each sprint deploys.

Risks:
- Primary buttons change from blue to graphite: every "default" button changes color at once — intended.
- Dark mode: the pass card can't be black on black; it uses `--hero` = `#1F2226` with a `--line` border.
- Geist → Public Sans changes text width slightly; watch for wrapped buttons and tab labels in the 242a walk.
- PDFs (receipts, reports) use their own styles; covered in 242e.
