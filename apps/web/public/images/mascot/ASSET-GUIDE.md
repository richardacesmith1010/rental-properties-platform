# Domus Mascot Asset Guide

## Directory Structure

```
public/images/mascot/
├── ASSET-GUIDE.md        ← this file
├── poses/                ← full character poses (PNG, 512x512 or larger)
│   ├── happy.png         ← default/greeting pose
│   ├── thinking.png      ← loading/processing states
│   ├── celebrating.png   ← achievement unlocked, payment received
│   ├── waving.png        ← onboarding welcome, first visit
│   ├── sleeping.png      ← error page, offline fallback
│   └── pointing.png      ← empty states, call-to-action prompts
├── icons/
│   └── head.png          ← shared favicon/PWA/apple touch source image
```

## Where Assets Are Used

| Asset | Used In | Purpose |
|-------|---------|---------|
| `poses/happy.png` | `components/gamification/dom-mascot.tsx` | Dashboard greeting, success states |
| `poses/thinking.png` | `dom-mascot.tsx` | Loading states |
| `poses/celebrating.png` | `dom-mascot.tsx` | Achievements, milestones |
| `poses/waving.png` | `components/dashboard/welcome-card.tsx` | Onboarding welcome |
| `poses/sleeping.png` | `public/offline.html`, `app/error.tsx` | Error/offline pages |
| `poses/pointing.png` | `components/shared/empty-state.tsx` | Empty states, CTAs |
| `icons/head.png` | `public/manifest.json`, `app/layout.tsx` | Favicon, PWA icon, Apple touch icon |
| Mascot in email | `lib/email-templates.ts` | Email header branding |

## Legacy Asset

- The original mascot asset has been retired and removed from the app.

## Design Requirements for ChatGPT Prompt

The mascot must:
1. **Read at 32px** — simple enough to be recognizable as a tiny icon
2. **Scale to 512px** — detailed enough to be charming at full size
3. **Use Domus brand colors** — purple (#7c3aed), green (#10b981), white, dark slate (#1e293b)
4. **Be consistent across poses** — same character, same proportions, different expressions/positions
5. **Work on dark AND light backgrounds** — no hard edges that only work on one
6. **Be PNG with transparent background** — no white box around the character
7. **Be friendly and approachable** — this is a family rental app, not enterprise software

## Integration Steps (After Assets Are Created)

1. Drop pose PNGs into `poses/` directory
2. Use `icons/head.png` for favicon, manifest, and Apple touch metadata
3. Update `dom-mascot.tsx` to use pose-specific images based on `mood` prop
4. Update `manifest.json` icon paths to point to `images/mascot/icons/`
5. Update `layout.tsx` icon metadata
6. Update `email-templates.ts` to use the new mascot URL
7. Update `offline.html` to use sleeping pose
8. Update `error.tsx` / `global-error.tsx` to use sleeping pose
9. Delete the retired mascot asset and old SVG PWA icons
