# Dependabot triage — 2026-10-30 (Stage 1 side item, read-only)

By the linked Stage 1 session. Nothing was changed: no lockfile edit, no install, no Codex run. The fix below is for the
session that drives the checkout to schedule (L-041).

## Where the alerts come from
GitHub's "15 vulnerabilities (10 high)" comes from the `git push` banner; the alert list itself needs a GitHub login
(no `gh` or token on this Mac). So the list was rebuilt with `npm audit --json --package-lock-only` on each lockfile
(npm reads the same GitHub advisory database). Counts differ from Dependabot's because npm lists every advisory per
package; the sources and the conclusion are the same.

| Lockfile | Advisories | Packages | Reaches production? |
| --- | --- | --- | --- |
| `package-lock.json` (root workspace, `apps/web`) | 11 (4 high, 7 moderate) | `undici`, `vitest` / `@vitest/mocker`, `postcss-selector-parser` | **No** — test and build tools |
| `apps/ios/package-lock.json` | 16 (1 critical, 11 high, 4 moderate) | `tar`, `sharp`, `uuid` (and the tools that pull them in) | **No** — iPhone build tooling |
| `apps/ios/.../swiftpm/Package.resolved` | not checked by npm | `capacitor-swift-pm` 8.5.3, `plaid-link-ios-spm` 7.2.2 | these are the only native libraries in the app |

## Root lockfile (dev/build only)
- **`undici` 7.30.0** — 4 high (GHSA-xjj6-f33q-929c, GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm) and
  4 moderate. `npm explain undici`: only `jsdom` 28.1.0 → vitest's test DOM (dev). Production never loads it: Next.js
  ships its own compiled undici, and Vercel functions use Node's built-in fetch.
- **`vitest` 4.1.11 / `@vitest/mocker`** — 2 moderate (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp). Dev only.
- **`postcss-selector-parser` 6.1.4** — 1 moderate (GHSA-rj75-hqrm-r3gf), via `tailwindcss` 3.4.19 and
  `postcss-nested` at build time. Our own CSS only; no user can feed it input.
- **Safe fix, all inside existing version ranges:** `npm audit fix` at the repo root (no `--force`) → lockfile only:
  undici 7.30.1, vitest 4.1.12 or later 4.x, postcss-selector-parser 6.1.5. Then `npm ci`, `npm run gate:web`, commit,
  push. No deploy is needed (no runtime change), though a normal ship is harmless. **L1.** Run it only when no other
  gate or Codex run is using the shared `node_modules`.

## iPhone lockfile (build tooling only; nothing ships in the app)
- **`tar` 6.2.1** — 1 critical (GHSA-23hp-3jrh-7fpw) + 10 high/moderate. It sits inside `@capacitor/assets` 3.0.5, which
  bundles its own `@capacitor/cli` 5.7.8. The direct `@capacitor/cli` 8.5.3 uses `tar` 7.5.22 (not affected).
- **`sharp` 0.32.6 (nested) and 0.34.5 (direct)** — 3 high (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c,
  GHSA-wq5f-xc86-pv6w). Used only by `npm run assets` (icon and splash generation on this Mac).
- **`uuid` 7.0.3** — 1 moderate (GHSA-w5hq-g745-h8pq), via `xcode` 3.0.1 (used by `cap sync` and `@trapezedev/project`).
- The app binary holds only Capacitor's Swift runtime, its plugins' native code and the offline page; it loads
  domusbase.com for everything else. None of these npm packages run on a phone or on Vercel.
- **Fix (needs care, it touches `apps/ios`):** remove `@capacitor/assets` (a one-time generator; the icons are committed;
  run `npx @capacitor/assets@<fixed>` when icons change) → clears `tar` and the nested `sharp`; bump direct `sharp` to
  ^0.35.5 and re-run `npm run assets` to compare the generated icons; add an `overrides` entry `uuid: ^11.1.1` for
  `xcode`. Under the iPhone rule (CLAUDE.md §3a, memory "Phone app = top tier"), fold this into the Ingle rename's iPhone
  sprint, which needs a ChatGPT review and a Simulator build anyway.

## Recommendation
1. Ship the root fix as a tiny L1 sprint between other sprints (clears the root alerts, no runtime change).
2. Do the iPhone tooling fix inside the Ingle rename iPhone sprint.
3. No emergency: no alert affects the live site, the database, or the app on a phone.
