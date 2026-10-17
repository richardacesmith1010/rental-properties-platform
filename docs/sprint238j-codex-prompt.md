# Sprint 238j — Uploads over 1 MB: shrink photos in the browser, guard sizes, never crash the page (L3: prod config + upload validation) — rev 1

## 1. Objective
Real-iPhone finding **F1** (2026-10-16): a tenant sent a repair with a camera photo and got "We couldn't load your tenant
dashboard"; nothing was saved. Vercel log 03:23:56Z `POST /tenant`: `Body exceeded 1 MB limit` (413). Every file upload in
Domus goes through a server action, and Next.js 15.5.27 rejects server-action bodies over 1 MB by default; Vercel also caps
request bodies near 4.5 MB. iPhone photos are 2–6 MB. This sprint makes every **image** upload work by resizing it in the
browser first, raises the server-action limit to fit, checks file bytes on the server, and turns any upload failure into a
plain message instead of a crash. Large PDFs/documents get a clear "too big" message now; direct-to-Storage uploads for
them are a later sprint (238j-2). The user should never need to read instructions to complete this flow.

## 2. Context (verified by a 5-agent sweep, workflow `wf_1291c3c0-101`, and live checks)
- `apps/web/next.config.mjs:43-48`: `experimental` has only `staleTimes`; no `serverActions.bodySizeLimit` (default 1 MB,
  enforced while the multipart body streams, before the action runs). The thrown 413 reaches the route error boundary
  (`app/tenant/error.tsx`, `app/owner/error.tsx`, `app/manager/error.tsx`, `app/error.tsx`).
- No client code resizes or compresses anything. `lib/maintenance-photos.ts:3-11`: 5 photos, 10 MB each, accepts JPEG,
  PNG, WebP, **HEIC, HEIF**; validation trusts the client `file.type` (no byte check).
- Upload paths (all server actions, all break at 1 MB):
  1. New repair + photos: `components/dashboard/ticket-form.tsx` `handleSubmit` (`:137-157`, appends `photos`, awaits the
     action in `startTransition` with no try/catch) → `createMaintenanceTicket` → `app/actions/maintenance-queries.ts`
     (`uploadPhotosForTicket :101-182`, validation `:132`, path `:143`, upload `:145`).
  2. More photos on an existing repair: `components/dashboard/ticket-photo-upload.tsx:31-52` → `uploadMaintenancePhoto`
     (`app/actions/maintenance-photo-actions.ts:20`).
  3. Expense receipt on create/edit: `components/dashboard/expenses/expense-form.tsx` (`:70`) and `expense-list.tsx`
     (`:112-122`) → `app/actions/expenses.ts` (`:20`, `:112`) → `lib/uploads.ts:14-52`.
  4. Document vault upload: `components/dashboard/documents/signer-flow.tsx` (`:58`) → `uploadPropertyFile`
     (`app/actions/document-templates.ts:123-170`).
  5. Profile photo: `components/settings/profile-settings.tsx` (`:50`) → `updateProfile` and
     `components/onboarding/onboarding-form.tsx` (`:73`) → `completeOnboarding` (`app/actions/profile.ts:143,179`,
     `storeAvatar` `:57`).
- File extensions come straight from the user's file name (`maintenance-queries.ts:142`, `lib/uploads.ts:14`,
  `document-templates.ts:143`).
- Copy today: `photo-upload.tsx:91` "Up to 5 photos, 10MB each. JPEG, PNG, WebP, and HEIC are supported."
- iPhone: the camera input (`capture="environment"`) returns one JPEG of about 2–5 MB. If `image/heic` is not in `accept`,
  iOS converts library HEIC picks to JPEG before handing them over.

## 3. In scope
Browser-side image resizing for every image upload; server-action body limit; server byte checks and safe extensions;
size guards for non-image files; try/catch around every upload call with plain error copy; tests.

## 4. Out of scope
Direct-to-Storage signed uploads (238j-2); Storage policies (Claude, Sprint 238k); bucket limits; avatar display
(`getPublicUrl` on a private bucket); the bank CSV import (JSON rows, not a file); any SQL.

## 5. Exact files expected to change
1. `apps/web/next.config.mjs` (`experimental.serverActions.bodySizeLimit: "4mb"` only)
2. `apps/web/lib/image-compress.ts` (new) and `apps/web/lib/__tests__/image-compress.test.ts` (new)
3. `apps/web/lib/file-signature.ts` (new: byte sniffing + safe extension) and `apps/web/lib/__tests__/file-signature.test.ts`
4. `apps/web/lib/maintenance-photos.ts` (accept list without HEIC/HEIF; per-request byte budget constant)
5. `apps/web/components/dashboard/maintenance/photo-upload.tsx` (accept list, copy)
6. `apps/web/components/dashboard/ticket-form.tsx`, `apps/web/components/dashboard/ticket-photo-upload.tsx`
7. `apps/web/components/dashboard/expenses/expense-form.tsx`, `apps/web/components/dashboard/expenses/expense-list.tsx`
8. `apps/web/components/dashboard/documents/signer-flow.tsx`
9. `apps/web/components/settings/profile-settings.tsx`, `apps/web/components/onboarding/onboarding-form.tsx`
10. `apps/web/app/actions/maintenance-queries.ts`, `apps/web/lib/uploads.ts`, `apps/web/app/actions/document-templates.ts`,
    `apps/web/app/actions/profile.ts` (byte checks + safe extensions only)
11. Tests next to each changed component/action (name them in the report)

## 6. Implementation requirements
1. **`compressImage(file, { maxEdge, quality })`** in `lib/image-compress.ts`: decode with `new Image()` + `img.decode()`
   from an object URL (no `createImageBitmap` resize options); draw to a canvas no larger than `maxEdge` on the long edge
   (keep aspect, never upscale); `canvas.toBlob("image/jpeg", quality)`; return a `File` named `<base>.jpg`, type
   `image/jpeg`. Defaults: photos `maxEdge 2048, quality 0.8`; if the result is still over 900 KB retry once at
   `1600 / 0.7`. Avatars: `maxEdge 512, quality 0.85`. Process files one at a time and release each canvas/object URL.
   PNG/WebP inputs are converted to JPEG too. If decoding fails, return the original file only if it is ≤ 900 KB, else throw
   `PhotoTooLargeError`. Inject the decode/encode steps so tests can run without a real canvas.
2. **Per-request budget:** before calling any upload action, the sum of file sizes must be ≤ 3.5 MB (constant in
   `lib/maintenance-photos.ts`). Over budget → do not send; show `These photos are too big. Try fewer photos.` (repair) or
   `This file is too big. Use a file under 3 MB.` (receipts, documents, PDFs).
3. **Body limit:** `experimental.serverActions.bodySizeLimit: "4mb"` (below Vercel's cap; nothing else in next.config).
4. **Accept lists:** remove `image/heic` and `image/heif` from `ACCEPTED_MAINTENANCE_PHOTO_TYPES`; copy at
   `photo-upload.tsx:91` becomes `Up to 5 photos.`
5. **Server byte checks (`lib/file-signature.ts`):** `sniffFileType(bytes)` recognizes JPEG (`FF D8 FF`), PNG
   (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF....WEBP`), PDF (`%PDF-`). Every server upload path checks the first bytes match
   an allowed type for that path and derives the stored extension from the sniffed type (never from the user's file name;
   strip anything but `[a-z0-9]`). Mismatch → the path's existing invalid-type error copy; nothing uploaded. Keep every
   existing auth, role, permission and count check exactly as is (L-014: pin current behavior with tests).
6. **No crash:** wrap every upload action call in try/catch. A thrown error (including a 413) shows
   `We could not send that. Please try again.` in the form and keeps what the user typed. For the repair form, the
   description stays filled in.
7. Plain language (≤ 12 words per sentence), lines ≤ 140, files ≤ 500, every Supabase error checked. No new dependencies.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude walks the iPhone Simulator with large photos (`xcrun simctl addmedia`).

## 8. Acceptance criteria
1. `image-compress.test.ts`: a 4000×3000 input → output long edge 2048, JPEG, named `.jpg`; a still-too-big result retries
   at 1600/0.7; never upscales a 800×600 input; decode failure → original if ≤ 900 KB else `PhotoTooLargeError`.
2. `file-signature.test.ts`: JPEG/PNG/WebP/PDF bytes detected; an HTML file renamed `.jpg` with `type image/jpeg` → rejected;
   extension always from the sniffed type.
3. Repair form test: two 3 MB photos are compressed before the action is called (action receives JPEGs under budget); an
   action that throws → `We could not send that. Please try again.`, description kept, no error boundary.
4. Budget test: files over 3.5 MB total → action not called, exact copy shown (repair and receipt variants).
5. Server tests: each upload path rejects a mismatched signature with its existing invalid-type copy and stores
   `<uuid>.<sniffed ext>`; all existing auth/role/permission/count tests stay green.
6. `next.config.mjs` test or assertion: `experimental.serverActions.bodySizeLimit === "4mb"`.
7. Copy: `Up to 5 photos.`; HEIC/HEIF absent from the accept list.
8. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No SQL. No change to who may upload where.
