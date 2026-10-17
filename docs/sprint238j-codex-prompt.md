# Sprint 238j — Big uploads: shrink photos, check bytes, never crash (L3) — rev 3 (critic panel → rev 2; ChatGPT AWC: 5 REQUIRED adopted)

## 1. Objective
Real-iPhone finding **F1** (2026-10-16): a tenant sent a repair with a camera photo and got "We couldn't load your tenant
dashboard"; nothing was saved. Vercel log 03:23:56Z `POST /tenant`: `Body exceeded 1 MB limit` (413). Every file upload in
Domus goes through a server action. Next.js 15.5.27 rejects server-action bodies over 1 MB by default, and Vercel caps request
bodies near 4.5 MB. iPhone photos are 2–6 MB. This sprint:
- shrinks every **image** in the browser before it is sent, inside the same `try` as the action call;
- raises the server-action body limit to 4 MB;
- checks real file bytes on the server, with an allowlist per upload path;
- turns every upload failure into a plain message instead of a crash.

Large PDFs and documents get a clear "too big" message now. Direct-to-Storage uploads for them are a later sprint (238j-2).
The user should never need to read instructions to complete this flow.

## 2. Context (rev 1: 5-agent sweep `wf_1291c3c0-101`; rev 2: re-read by Claude at HEAD 47061fc)
All paths are under `apps/web/` unless they start with `node_modules/` (repo root).

**Config and test runner**
- `next.config.mjs:43-48`: `experimental` has only `staleTimes` (`dynamic: 30`, `static: 300`); no `serverActions`. The default
  export is `withSentryConfig(nextConfig, …)`, an object whose `experimental` keeps our keys (Sentry adds `clientTraceMetadata`).
- `vitest.config.ts:11` only collects `**/__tests__/**/*.test.{ts,tsx}`. A test placed beside its source never runs.
- `tsconfig.json`: `allowJs: false`, `strict: true`, so a static `import` of `next.config.mjs` from a `.ts` test has no types.

**Upload paths (client → server)**
1. New repair: `components/dashboard/ticket-form.tsx` `handleSubmit` (`:137-157`) appends `photos` and awaits
   `onCreateTicket` inside `startTransition` with no try/catch → `createMaintenanceTicket`
   (`app/actions/maintenance-ticket-actions.ts:23`). It inserts the repair row (`:77-92`), then calls `uploadPhotosForTicket`
   (`:96-101`). Any photo failure becomes the success message `Maintenance request submitted, but the photo upload did not finish.`
   (`:103-104`). The tenant view always shows `Sent. You'll see updates on Home.` (`ticket-form.tsx:173-176`), so a tenant
   never learns the photo was lost.
2. More photos: `components/dashboard/ticket-photo-upload.tsx:31-52` (raw-file check `:32`, then `startTransition`, no
   try/catch) → `uploadMaintenancePhoto` (`app/actions/maintenance-photo-actions.ts:20`), which returns the helper's error as is.
3. Shared photo helper `uploadPhotosForTicket` (`app/actions/maintenance-queries.ts:101-182`): access check `:112-120`, count
   query `:122-130`, `validateMaintenancePhotoSelection` `:132-135`, extension from the file name `:141`, key `:143`, upload
   `:145-150`. Metadata `file_type` comes from the client `file.type` (`:75`).
4. Receipts: `components/dashboard/expenses/expense-form.tsx` (`saveExpense` `:68-89`, `<form action>` `:253-267`, file input
   `:264`) and `expense-list.tsx` (`updateWithPayer` `:111-121`, `useFormState` `:122`, `<form action>` `:144-173`, file input
   `:160`) → `createExpense` / `updateExpense` (`app/actions/expenses.ts`: `requireAuth("owner")` `:24`/`:116`, admin check
   `:46-49`/`:156-158`) → `uploadExpenseReceiptFile` (`lib/uploads.ts:4-57`: size check `:10-12`, extension from name `:14`,
   key `:15`, `file_type` from `file.type` `:16-20`, upload `:22-25`). No type check today.
5. Document vault: `components/dashboard/documents/signer-flow.tsx` (`useFormState` `:58`, `<form action>` `:149-156`, accept
   `image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt` `:154`, pinned by
   `components/dashboard/__tests__/upload-accept.test.tsx:36-44`) → `uploadPropertyFile` (`app/actions/document-templates.ts`:
   `requireAuth("owner","manager")` `:124`, capability `:128-129`, file present/size `:134-136`, admin check `:139-141`,
   extension from name `:143`, key `:144`, `file_type` `:146`, upload `:148-151`). No type check today.
6. Avatars: `components/settings/profile-settings.tsx` (`useFormState` `:50`, form `:109`, hint `:142`) → `updateProfile`
   (`app/actions/profile.ts:179`); `components/onboarding/onboarding-form.tsx` (pick-time 5 MB check `:14`, `:95-98`,
   `useFormState` `:73`, hint `:202`) → `completeOnboarding` (`profile.ts:143`). Both reach `storeAvatar` (`profile.ts:45`,
   upload `:57-62`) through `applyProfileUpdate` (`:106-107`); `uploadAvatar` (`:218`) also calls it. The zod avatar schema
   (`lib/validations-auth.ts:85`, `:88`) checks size ≤ 5 MB and the client type first. `getAvatarExtension` (`:19-39`) falls
   back to the file name.

**Current storage key templates (this sprint changes only where `${extension}` comes from)**
- Repair photo: `${params.ticketId}/${crypto.randomUUID()}-${safeName}.${extension}` (`maintenance-queries.ts:143`)
- Receipt: `${propertyId}/receipts/${crypto.randomUUID()}.${extension}` (`lib/uploads.ts:15`)
- Vault: `${propertyId}/${crypto.randomUUID()}.${extension}` (`document-templates.ts:144`)
- Avatar: `${userId}/avatar.${extension}` with `upsert: true` (`profile.ts:55`, `:60`)

**Platform facts**
- `@supabase/storage-js` 2.7.1 ignores `options.contentType` for a `Blob`/`File` body; it appends the body to `FormData`, so the
  part's type is the Blob's own `type` (`node_modules/@supabase/storage-js/dist/main/packages/StorageFileApi.js:49-55` vs `:67`).
- React 19.2.8: a `<form action={fn}>` is reset after every action, success or error (`startHostTransition` →
  `requestFormReset$1`, `node_modules/react-dom/cjs/react-dom-client.development.js:8940-8958`; `form.reset()` at `:15152`).
  File inputs clear. A controlled `<select>` never sets `defaultSelected` (`updateOptions`, `:1775-1797`), so the reset moves it
  to its first option. `SubmitButton` gets `pending` from `useFormStatus` (`components/shared/submit-button.tsx:25`), which only
  tracks form actions.
- Plain-language guard (`lib/plain-language/scan.ts:12-18`) bans `CSV`, `ticket(s)`, `submit(s)`, `charge(s)` in shown copy.
- Pickers must offer only what the server accepts (ChatGPT review). New `accept` lists: receipts (`expense-form.tsx:264`,
  `expense-list.tsx:160`) `image/jpeg,image/png,image/webp,application/pdf`; vault (`signer-flow.tsx:154`)
  `image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt`. Without `image/heic` in the list, iOS
  hands over JPEG. Update `upload-accept.test.tsx` to pin the new lists (its other assertions stay).
- Tests that must stay green **unchanged**: `components/__tests__/expense-partners.test.tsx`
  (clicks the title `Save updates to this expense.`), `components/__tests__/onboarding-form.test.tsx`,
  `app/actions/__tests__/maintenance-ticket-history.test.ts` and `maintenance-ticket-notifications.test.ts` (both stub
  `uploadPhotosForTicket`). No test runs the real code of any upload path today.
- HEIC: `lib/maintenance-photos.ts:9-10` accepts `image/heic`/`image/heif`; copy `:35` and tests
  `lib/__tests__/maintenance-photos.test.ts:23`, `:31` and `tests/e2e/maintenance-photos.spec.ts:75` assert HEIC. On iPhone, if
  `image/heic` is not in `accept`, iOS converts library HEIC picks to JPEG; the camera input returns one JPEG of about 2–5 MB.

## 3. In scope
Browser image shrinking for every image upload; the 4 MB body limit; per-path server byte allowlists with safe extensions and
content types; size guards for non-image files; try/catch with exact copy at all 7 client call sites; the tenant "photo did
not go through" notice; raising the onboarding pick-time avatar limit; named tests, including L-014 pin tests per server path.

## 4. Out of scope
Direct-to-Storage signed uploads and a retry idempotency key (both 238j-2); Storage policies (238k); bucket limits; avatar
display (`getPublicUrl` on a private bucket); cleanup of old `avatar.png`/`avatar.webp` objects; the bank CSV import (JSON
rows); raising any server size check or the shared 10 MB `validateMaintenancePhotoSelection` limit; any SQL.

## 5. Exact files expected to change
App code:
1. `apps/web/next.config.mjs` (add `experimental.serverActions.bodySizeLimit: "4mb"` only)
2. `apps/web/lib/image-compress.ts` (new: browser shrinking, budget, error classes, copy, error-to-copy helper)
3. `apps/web/lib/file-signature.ts` (new: byte sniffing and the per-path type table)
4. `apps/web/lib/maintenance-photos.ts` (accept list, copy `:35`, new exported message constant)
5. `apps/web/components/dashboard/maintenance/photo-upload.tsx` (copy `:91` only)
6. `apps/web/components/dashboard/ticket-form.tsx`
7. `apps/web/components/dashboard/ticket-photo-upload.tsx`
8. `apps/web/components/dashboard/expenses/expense-form.tsx`
9. `apps/web/components/dashboard/expenses/expense-list.tsx`
10. `apps/web/components/dashboard/documents/signer-flow.tsx`
11. `apps/web/components/settings/profile-settings.tsx`
12. `apps/web/components/onboarding/onboarding-form.tsx`
13. `apps/web/app/actions/maintenance-queries.ts` (byte check, extension, content type only)
14. `apps/web/app/actions/maintenance-ticket-actions.ts` (use the constant at `:104` only; returned text unchanged)
15. `apps/web/lib/uploads.ts`, `apps/web/app/actions/document-templates.ts`, `apps/web/app/actions/profile.ts`
    (byte check, extension, content type only)

Tests (all inside `__tests__` folders except the e2e spec):
16. `apps/web/lib/__tests__/image-compress.test.ts` (new)
17. `apps/web/lib/__tests__/file-signature.test.ts` (new)
18. `apps/web/lib/__tests__/maintenance-photos.test.ts` (edit `:23`, `:31`; add HEIF)
19. `apps/web/lib/__tests__/next-config.test.ts` (new)
20. `apps/web/components/__tests__/ticket-form.test.tsx` (edit: replace the `PhotoUpload: () => null` stub)
21. `apps/web/components/__tests__/ticket-photo-upload.test.tsx` (new)
22. `apps/web/components/dashboard/__tests__/upload-budget.test.tsx` (new: expense form, expense list, signer flow)
23. `apps/web/components/__tests__/avatar-upload.test.tsx` (new: profile settings and onboarding, real `useFormState`)
24. `apps/web/app/actions/__tests__/maintenance-photo-upload.test.ts` (new: real `uploadPhotosForTicket`)
25. `apps/web/app/actions/__tests__/maintenance-ticket-photo-result.test.ts` (new: `createMaintenanceTicket` photo failure)
26. `apps/web/app/actions/__tests__/expense-receipt-upload.test.ts` (new: real `createExpense`/`updateExpense` + `lib/uploads`)
27. `apps/web/app/actions/__tests__/upload-property-file.test.ts` (new: real `uploadPropertyFile`)
28. `apps/web/app/actions/__tests__/profile-avatar.test.ts` (new: real `updateProfile`/`completeOnboarding` + `storeAvatar`)
29. `apps/web/tests/e2e/maintenance-photos.spec.ts` (edit `:75`; add the portrait-orientation case below)
30. `apps/web/components/dashboard/__tests__/upload-accept.test.tsx` (edit: pin the narrowed accept lists)
31. `apps/web/tests/fixtures/portrait-exif6.jpg` (new, < 50 KB: stored 400×300 with EXIF Orientation 6; build it with a
    small Node script from bytes, no new dependency) and `apps/web/tests/fixtures/README.md` (how it was made)

## 6. Implementation requirements
**R1. `lib/image-compress.ts` (browser only; no new dependencies)**
- Constants: `UPLOAD_BUDGET_BYTES = 3.5 * 1024 * 1024` (3,670,016); `PHOTO_MAX_BYTES = 900 * 1024` (921,600);
  `PHOTO_STEPS = [{ maxEdge: 2048, quality: 0.8 }, { maxEdge: 1600, quality: 0.7 }, { maxEdge: 1280, quality: 0.6 }]`;
  `AVATAR_STEPS = [{ maxEdge: 512, quality: 0.85 }]`.
- Error classes: `PhotoTooLargeError`, `FileTooLargeError`.
- Test seam: export a mutable `imageCodec = { decode, encode }`. Production code always calls `imageCodec.decode/encode`, so
  tests can `vi.spyOn(imageCodec, …)` while the real `compressImage`/`preparePhotos` run.
  - `decode(file)` → `{ width, height, source, release() }`. It uses `URL.createObjectURL`, `new Image()` and `img.decode()`.
    It does not use `createImageBitmap` resize options. `release()` sets `img.src = ""`, drops the
    reference and revokes the object URL, so decoded pixels can be freed at once. Do not rotate by hand; the browser
    applies EXIF orientation when drawing.
  - `encode(decoded, { width, height, quality })` → `Blob | null`. It creates a canvas of exactly `width × height`. If
    `getContext("2d")` is `null`, it returns `null`. It fills white (`#ffffff`) before `drawImage`, so transparent PNG/WebP
    pixels do not turn black. It calls `canvas.toBlob(cb, "image/jpeg", quality)`. In a `finally`, it sets canvas width and
    height to `0`.
- `compressImage(file, { targetBytes, steps })` → `File`:
  1. Decode. For each step, scale so the long edge is `min(step.maxEdge, original long edge)`, keeping aspect (round to
     whole pixels; never upscale), then encode.
  2. The first blob with `size <= targetBytes` wins. Return `new File([blob], "<base>.jpg", { type: "image/jpeg" })`, where
     `<base>` is the name without its last extension, or `photo` if empty.
  3. If every step is still over `targetBytes`, throw `PhotoTooLargeError`.
  4. If decode throws, encode throws, or encode returns `null`: return the original file when `file.size <= targetBytes`,
     else throw `PhotoTooLargeError`.
  5. Always call `release()` in a `finally`. Process files one at a time.
- `preparePhotos(files)` → `File[]`, in order. For photo `i` of `n`:
  `target = Math.min(PHOTO_MAX_BYTES, Math.floor((UPLOAD_BUDGET_BYTES - bytesAlreadyChosen) / (n - i)))`, then
  `compressImage(file, { targetBytes: target, steps: PHOTO_STEPS })`. So the total is always ≤ `UPLOAD_BUDGET_BYTES`.
- `prepareUploadFile(file, kind: "receipt" | "document" | "avatar")` → `File`:
  - `avatar`: `compressImage(file, { targetBytes: PHOTO_MAX_BYTES, steps: AVATAR_STEPS })`;
  - else if `file.type.startsWith("image/")`: `compressImage(file, { targetBytes: PHOTO_MAX_BYTES, steps: PHOTO_STEPS })`;
  - else if `file.size > UPLOAD_BUDGET_BYTES`: throw `FileTooLargeError`;
  - else return the same `File` object.
- Exact copy constants, and `uploadErrorCopy(error, { photoCount?: number; formFile?: boolean })` that maps errors to them:

| Case | Exact copy |
|---|---|
| `PhotoTooLargeError`, `photoCount` ≥ 2 | `These photos are too big. Try fewer photos.` |
| `PhotoTooLargeError`, otherwise | `This photo is too big. Try a different photo.` |
| `FileTooLargeError` | `This file is too big. Use a file under 3.5 MB.` |
| Anything else (including a 413), `formFile: true` | `We could not send that. Please choose the file again.` |
| Anything else, otherwise | `We could not send that. Please try again.` |

**R2. Client call sites (all 7).** The `try` wraps the shrinking **and** the action call. A caught error never reaches an error
boundary. If a form's file field is missing or has `size === 0`, send the `FormData` unchanged.
1. `ticket-form.tsx` `handleSubmit`: inside the `startTransition` callback,
   `try { const photos = await preparePhotos(photoFiles); …build FormData…; const result = await onCreateTicket(null, formData);
   setState(result); …existing refresh… } catch (error) { setState({ success: false, error: uploadErrorCopy(error,
   { photoCount: photoFiles.length }) }); … }`. In the catch, call `router.refresh()` unless the error is a
   `PhotoTooLargeError` or `FileTooLargeError` (a thrown action may already have saved; the refresh shows it). `draft` and
   `photoFiles` stay as they were.
   **Tenant view only:** when `state.success` and `state.message === PHOTO_UPLOAD_UNFINISHED_MESSAGE`, show
   `<Alert variant="warning">Sent. Your photos did not go through. Add them to the repair again.</Alert>` in place of the
   success alert. The owner/manager view stays as is (it already shows `state.message`).
2. `ticket-photo-upload.tsx`: keep the raw-file check at `:32` before the transition (L-014). Inside the transition, use the
   same try/catch shape with `{ photoCount: selectedPhotos.length }` and the same `router.refresh()` rule. `selectedPhotos`
   stays on failure.
3. `expense-form.tsx` `saveExpense`: wrap only the receipt prep and the `onCreateExpense` call:
   `prepareUploadFile(file, "receipt")`, then `formData.set("receiptFile", prepared)`. On catch, return
   `{ success: false, error: uploadErrorCopy(error, { formFile: hadFile }) }`. The payer and bill-tenant logic after a
   successful create is unchanged.
4. `expense-list.tsx` (typed edits must survive; see §2 platform facts):
   - Remove `action={updateAction}` from the update `<form>`. Add `onSubmit` that calls `event.preventDefault()`, reads
     `new FormData(event.currentTarget)`, and runs `startTransition(() => updateAction(formData))`.
   - Keep every **named** field uncontrolled with the same `name`, `defaultValue` and `defaultChecked`, so the sent
     `FormData` is identical. With no form action, React never resets them. The "Who paid?" `<Select value={payerId}>`
     (`expense-list.tsx:155`) has no `name` and stays controlled exactly as today.
   - Switch this one form to React 19's `useActionState` (from `react`): `const [state, updateAction, isPending] =
     useActionState(updateWithPayer, initialState)`, and dispatch with `startTransition(() => updateAction(formData))`.
     (`useFormState` has no third value; ChatGPT review.) The Save button stays `type="submit"`, label `Save Expense`, title
     `Save updates to this expense.`. Use `Button` with `loading={isPending}` and `disabled={isPending}`, because
     `SubmitButton`'s `useFormStatus` no longer sees a pending form action.
   - `updateWithPayer` gains the same receipt prep and try/catch around `onUpdateExpense` (`formFile: false`: the file stays
     picked). Payer saving, `Expense updated.`, and closing on success are unchanged. The delete form is unchanged.
5. `signer-flow.tsx`: pass a wrapper to `useFormState` when `onUploadPropertyFile` is set (keep `unavailableAction`
   otherwise). The wrapper does `prepareUploadFile(file, "document")` and the try/catch with `formFile: true`.
6. `profile-settings.tsx` and 7. `onboarding-form.tsx`: wrap `onUpdateProfile` / `onCompleteOnboarding` the same way for
   `avatarFile` (`prepareUploadFile(file, "avatar")`, `formFile: hadFile`). In the catch path also clear the preview
   (`setPreviewUrl(null)`) and reset the file input (bump its `key`), so the screen never shows a photo that will not
   send. In onboarding, change `MAX_AVATAR_SIZE_BYTES` to
   `15 * 1024 * 1024` and the pick-time copy to `Image must be under 15 MB.`. Change both hints (`profile-settings.tsx:142`,
   `onboarding-form.tsx:202`) to `JPG, PNG, or WebP.`.

**R3. Body limit.** `next.config.mjs`: `experimental: { staleTimes: { dynamic: 30, static: 300 }, serverActions:
{ bodySizeLimit: "4mb" } }`. "4mb" = 4,194,304 bytes. That leaves 524,288 bytes above the budget for multipart overhead and
text fields, and stays under Vercel's cap. Nothing else changes in this file.

**R4. HEIC removal and copy.** `ACCEPTED_MAINTENANCE_PHOTO_TYPES` = `image/jpeg`, `image/png`, `image/webp`. `:35` copy becomes
`Photos must be JPEG, PNG, or WebP.`. `photo-upload.tsx:91` becomes `Up to {maxPhotos} photos.` (renders `Up to 5 photos.`).
Add `export const PHOTO_UPLOAD_UNFINISHED_MESSAGE = "Maintenance request submitted, but the photo upload did not finish.";` to
`lib/maintenance-photos.ts`. `maintenance-ticket-actions.ts:104` uses it; the returned text is unchanged. (A `"use server"`
file may only export async functions, so the constant cannot live there.)

**R5. Server byte checks (`lib/file-signature.ts`).**
- `sniffFileType(bytes: Uint8Array)` returns one of these, or `null`:
  - `"jpeg"`: `FF D8 FF` at offset 0;
  - `"png"`: `89 50 4E 47 0D 0A 1A 0A`;
  - `"webp"`: `RIFF` at 0 and `WEBP` at 8;
  - `"pdf"`: `%PDF-` within the first 1024 bytes;
  - `"zip"`: `50 4B 03 04`;
  - `"ole"`: `D0 CF 11 E0 A1 B1 1A E1`.
- `isPlainText(bytes)`: true when `sniffFileType` is `null` and there is no `0x00` byte in the first 4096 bytes.
- `resolveUploadType(path: "maintenance" | "avatar" | "receipt" | "vault", bytes, fileName)` returns
  `{ extension, contentType, category } | null`. `category` is `"image" | "pdf" | "document"`. The name's extension is
  lowercased and used **only** to choose within a sniffed family from the fixed lists below; it is never stored raw.

| Sniffed bytes | Name ext needed | Stored ext | contentType | category | Paths |
|---|---|---|---|---|---|
| jpeg | any | `jpg` | `image/jpeg` | image | all four |
| png | any | `png` | `image/png` | image | all four |
| webp | any | `webp` | `image/webp` | image | all four |
| pdf | any | `pdf` | `application/pdf` | pdf | receipt, vault |
| zip | `docx` | `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | document | vault |
| zip | `xlsx` | `xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | document | vault |
| ole | `doc` | `doc` | `application/msword` | document | vault |
| ole | `xls` | `xls` | `application/vnd.ms-excel` | document | vault |
| plain text | `csv` | `csv` | `text/csv` | document | vault |
| plain text | `txt` | `txt` | `text/plain` | document | vault |

  **OOXML check (ChatGPT review):** a `zip` is accepted as `docx` only if the bytes contain the ASCII entry names
  `[Content_Types].xml` and `word/document.xml`, and as `xlsx` only with `[Content_Types].xml` and `xl/workbook.xml` (scan the
  whole buffer; ZIP local and central-directory headers store names as plain bytes). Any other ZIP → `null`. `ole`
  (`.doc`/`.xls`) is a container check plus the name only; say so in a code comment ("not proof of Word/Excel").
  `isPlainText` is a weak check ("no known binary signature and no NUL in 4 KB"); these files are only stored and
  downloaded, never parsed by the server. Name it in a comment the same way.
  Anything else → `null`. HTML or SVG saved as `.txt`/`.csv` is accepted but stored as inert text; that is intended. GIF,
  HEIC or SVG originals that reach the server without being shrunk are refused (the browser normally turns them into JPEG).
- Placement in each server path. The check runs **after** every existing auth, role, rate-limit, capability, parse, count and
  size check, and **before** the first `storage.upload`. Read `new Uint8Array(await file.arrayBuffer())`. On `null`, return
  the path's copy below with zero `storage.upload` calls and zero DB inserts/updates. On success, build
  `new File([bytes], file.name, { type: contentType })` and pass that object to `storage.upload` and to the metadata code.
  Set the `contentType` option to the same value. Do not rely on the option alone (§2: storage-js ignores it for File bodies).

  Per path (the key keeps its current template; only `${ext}` changes, and it now comes from the sniff):
  - **Repair photos** (`"maintenance"`), in `uploadPhotosForTicket`: check **all** files after `:132-135`, before the loop.
    - Mismatch copy: `Photos must be JPEG, PNG, or WebP.`
    - Key: `${params.ticketId}/${crypto.randomUUID()}-${safeName}.${ext}` (`safeName` is built as today).
    - `maintenance_photos.file_type` = contentType.
  - **Receipts** (`"receipt"`), in `uploadExpenseReceiptFile`, after `:10-12`.
    - Mismatch copy: `Receipt must be a photo or a PDF.`
    - Key: `${propertyId}/receipts/${crypto.randomUUID()}.${ext}`. `property_files.file_type` = category.
  - **Vault** (`"vault"`), in `uploadPropertyFile`, after `:139-141`.
    - Mismatch copy: `This file type is not allowed. Use a photo, PDF, Word, Excel, or text file.`
    - Key: `${propertyId}/${crypto.randomUUID()}.${ext}`. `property_files.file_type` = category.
  - **Avatars** (`"avatar"`), in `storeAvatar`: the sniff replaces `getAvatarExtension` (delete it; nothing else uses it).
    - Mismatch copy: `Profile photo must be a JPG, PNG, or WebP image.`
    - Key: `${userId}/avatar.${ext}` with `upsert: true`. The `profiles.avatar_url` update is unchanged.

- `createMaintenanceTicket` keeps saving the repair first and returning `PHOTO_UPLOAD_UNFINISHED_MESSAGE` on any photo
  failure. Do not move the byte check ahead of the repair insert. `file_name` columns keep `file.name`.

**R6. General.** Plain language: at most 12 words per sentence, and no banned words (§2). Lines ≤ 140 characters, files ≤ 500
lines. Every Supabase error is checked. No new dependencies. Keep every auth, role, permission, rate-limit, capability, count
and server-side size check, and its order, exactly as is (L-014). The one client-side change is the onboarding pick-time
limit in R2.7 (`onboarding-form.tsx:14`, `:95-98`).

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or Playwright. Claude runs the gate, the e2e spec (Chromium, real canvas: the
portrait-orientation case must store a JPEG whose decoded size is taller than wide), an iPhone Simulator walk with large
photos (`xcrun simctl addmedia`, including a 48 MP sample), and then the owner's one batched real-iPhone check on TestFlight
build 3 (one camera photo and one large library photo on a repair; WKWebView memory on a real device).

## 8. Acceptance criteria
Each item names its file. "Exact copy" means the string from §6.
1. `lib/__tests__/image-compress.test.ts` (spies on `imageCodec`; real `compressImage`, `preparePhotos`, `prepareUploadFile`,
   `uploadErrorCopy`):
   a. A 4000×3000 decode is encoded at 2048×1536. Output is `image/jpeg` and named `IMG_1.jpg` for input `IMG_1.HEIC`.
   b. Step order: over target at 2048/0.8 → 1600/0.7 → 1280/0.6. Over target at all three → `PhotoTooLargeError`.
   c. An 800×600 decode is encoded at 800×600 (never upscales).
   d. Decode throws, or encode returns `null`: the original is returned when `size <= targetBytes`; otherwise
      `PhotoTooLargeError`. `release()` is called in every case.
   - (optional, adopted) a JPEG `File` with an empty `type` is detected by its first bytes on the client and shrunk like any
     photo (not sent raw on the non-image path).
   e. `preparePhotos` with five 3 MB inputs, where encode returns 819,200 bytes at step 1 and 614,400 at step 2: returns 5 JPEG
      files, each ≤ 921,600, summing ≤ 3,670,016. With one input, its target is 921,600.
   f. `prepareUploadFile`: a 3,670,017-byte PDF → `FileTooLargeError`; a 1 MB PDF → the same `File` object; `avatar` encodes at
      most 512 px on the long edge.
   g. Default codec, with stubbed `getContext`/`toBlob`/`decode`/`createObjectURL`: fills `#ffffff` before `drawImage`; the
      canvas is 0×0 after encode; `getContext` returning `null` → `encode` returns `null`; `revokeObjectURL` runs on release.
   h. `uploadErrorCopy` returns each of the 5 exact strings for its case.
2. `lib/__tests__/file-signature.test.ts`:
   - Each signature in R5 is detected, including `%PDF-` at offset 10.
   - Every row of the R5 table resolves to its exact ext, contentType and category, and only on its listed paths.
   - An HTML file named `x.jpg` → `null` on all four paths.
   - PNG bytes named `a.jpg` → `png`. ZIP bytes named `lease.pdf` → `null`. OLE bytes named `a.docx` → `null`.
   - `Lease.DOCX` (ZIP bytes) → `docx`. Text containing a `0x00` byte named `notes.txt` → `null`.
3. `lib/__tests__/maintenance-photos.test.ts`: `image/heic` and `image/heif` → `false`; a PDF selection →
   `Photos must be JPEG, PNG, or WebP.`; the other existing cases unchanged.
4. `lib/__tests__/next-config.test.ts` (`// @vitest-environment node`): load the config with `await import(configUrl)`, where
   `configUrl` is a `string`, so `tsc` needs no `.mjs` types. Assert `experimental.serverActions.bodySizeLimit === "4mb"` and
   `experimental.staleTimes` equals `{ dynamic: 30, static: 300 }`.
5. `components/__tests__/ticket-form.test.tsx`: the `PhotoUpload` stub gets a button that calls `onPhotosSelected(files)`.
   a. Tenant, two 3 MB JPEGs: the action gets two `photos` Files, each `image/jpeg`, named `.jpg`, summing ≤ 3,670,016.
   b. The action throws → `We could not send that. Please try again.` is shown. The textarea keeps its typed text, the
      `Send to landlord` button is still rendered (no error boundary), and `router.refresh` is called once.
   c. One photo whose encode returns `null` and whose size is 3 MB → `This photo is too big. Try a different photo.`; the action is
      not called; `router.refresh` is not called.
   d. Five 3 MB photos with the 1e encoder → the action is called once with 5 files under budget.
   e. Tenant, the action returns `{ success: true, message: PHOTO_UPLOAD_UNFINISHED_MESSAGE }` →
      `Sent. Your photos did not go through. Add them to the repair again.`, and the success alert is not shown.
   f. Tenant plain success → `Sent. You'll see updates on Home.` (pin). The existing no-lease case is unchanged.
6. `components/__tests__/ticket-photo-upload.test.tsx`: two 3 MB photos → `ticketId` plus two JPEG `photos` under budget; a
   throwing action → `We could not send that. Please try again.`, photos still selected, `router.refresh` called; one photo
   that cannot shrink → `This photo is too big. Try a different photo.` and no call; 4 existing + 2 picked →
   `You can attach up to 5 photos per ticket.` and no call (pin).
7. `components/dashboard/__tests__/upload-budget.test.tsx`:
   a. ExpenseForm: a 3 MB JPEG receipt → `onCreateExpense` gets a `receiptFile` that is `image/jpeg`, ≤ 921,600 bytes and
      named `.jpg`. A 4 MB PDF → `This file is too big. Use a file under 3.5 MB.` and no call. A throw with a receipt picked →
      `We could not send that. Please choose the file again.`; the Save button is still rendered; the hidden `amountDollars`
      still holds the typed amount.
   b. ExpenseList: change the amount to `25` and the description to `New roof`; the action throws →
      `We could not send that. Please try again.`; the amount input is still `25` and the description is still `New roof`.
   c. ExpenseList pin: an unchanged save sends `expenseId`, `category=repair`, `amountDollars=10`, `expenseDate`,
      `description=""`, `recurringFrequency=""`, `vendorId=""`, `receiptFileId=""`, the empty `receiptFile` entry, and no
      `recurring` key. A 4 MB PDF → the file-too-big copy and no call.
   d. SignerFlow: a 4 MB `.docx` → file-too-big copy, no call. A 3 MB JPEG → a JPEG ≤ 921,600 is sent. A throw →
      `We could not send that. Please choose the file again.`, with the hidden `propertyId`/`category` values kept.
8. `components/__tests__/avatar-upload.test.tsx` (real `useFormState`), for ProfileSettings and OnboardingForm:
   - a 3 MB PNG avatar → the action gets a JPEG `avatarFile` encoded at ≤ 512 px;
   - a throw → `We could not send that. Please choose the file again.`, the typed first name is kept, and the avatar
     preview is cleared;
   - an empty file input → the action gets the `FormData` unchanged;
   - onboarding: a 6 MB JPEG is accepted at pick time and a 16 MB file shows `Image must be under 15 MB.`;
   - both hints read `JPG, PNG, or WebP.`.
9. `app/actions/__tests__/maintenance-photo-upload.test.ts` (real `uploadPhotosForTicket`; mocked admin client and
   `canUserAdministerProperty`). Pins:
   - a tenant on another tenant's repair → `You do not have access to this repair.`;
   - an owner without admin rights → the same copy;
   - 4 existing + 2 new → `You can attach up to 5 photos per ticket.`.
   Each pin sends **HTML bytes** (so a byte check moved ahead of the access check would show the wrong copy) and still gets
   the access/count copy above, with zero `storage.upload` calls. Byte checks:
   - HTML bytes named `x.jpg` with type `image/jpeg` → `Photos must be JPEG, PNG, or WebP.`, with zero uploads and inserts;
   - one good and one bad file → zero uploads;
   - JPEG bytes named `Sink Leak.JPG` → key matches `^<ticketId>/[0-9a-f-]{36}-Sink-Leak\.jpg$`, the uploaded body's `.type`
     is `image/jpeg`, and the inserted `file_type` is `image/jpeg`;
   - PNG bytes named `p.jpg` → key ends `-p.png`.
10. `app/actions/__tests__/maintenance-ticket-photo-result.test.ts`: `createMaintenanceTicket` with one photo, where
    `uploadPhotosForTicket` returns `{ success: false, error: "Photos must be JPEG, PNG, or WebP." }` → `{ success: true,
    message: "Maintenance request submitted, but the photo upload did not finish." }` and the repair insert ran once (pin).
11. `app/actions/__tests__/expense-receipt-upload.test.ts` (real `createExpense`, `updateExpense`, `lib/uploads`):
    - `requireAuth` is called with `"owner"` only;
    - a non-admin on create and on update, sending HTML bytes → `You do not have access to this property.`, zero uploads;
    - HTML bytes as `r.jpg` → `Receipt must be a photo or a PDF.`, with zero uploads, zero `property_files` inserts and zero
      expense inserts;
    - PDF bytes → key matches `^<propertyId>/receipts/[0-9a-f-]{36}\.pdf$`, the body `.type` is `application/pdf`, and
      `file_type` is `pdf` with `category` `receipt`.
12. `app/actions/__tests__/upload-property-file.test.ts` (real `uploadPropertyFile`):
    - `requireAuth` is called with `"owner", "manager"`;
    - a non-admin, sending HTML bytes → `You do not have access to this property.`, zero uploads;
    - HTML bytes named `lease.docx` → the exact vault copy, zero uploads and inserts;
    - a minimal OOXML Word package (bytes containing `PK\x03\x04`, `[Content_Types].xml` and `word/document.xml`) named
      `Lease.DOCX` → key `^<propertyId>/[0-9a-f-]{36}\.docx$`, with the OOXML word contentType and `file_type` `document`;
    - a plain ZIP (`PK\x03\x04` without those entries) named `evil.docx` → the exact vault copy, zero uploads;
    - JPEG bytes typed `application/pdf` named `x.pdf` → stored as `.jpg`, `image/jpeg` (client MIME is ignored);
    - `a,b\n1,2` named `rent.csv` → `.csv`, `text/csv`;
    - JPEG bytes named `scan.png` → `.jpg`, `image/jpeg`, `file_type` `image`.
13. `app/actions/__tests__/profile-avatar.test.ts`:
    - `updateProfile` with PNG bytes → upload key `<userId>/avatar.png` with `upsert: true`, the body `.type` is `image/png`,
      and `profiles.avatar_url` is `profile-avatars/<userId>/avatar.png`;
    - JPEG bytes → `<userId>/avatar.jpg`;
    - HTML bytes typed `image/png` → `Profile photo must be a JPG, PNG, or WebP image.`, with zero uploads and zero `profiles`
      updates;
    - `completeOnboarding` with JPEG bytes → `<userId>/avatar.jpg` and the mocked `redirect` is called.
14. `tests/e2e/maintenance-photos.spec.ts:75` asserts `image/heic` is **not** in the camera `accept`.
15. `next.config.mjs` diff touches only `experimental`. `photo-upload.tsx` shows `Up to 5 photos.`. The tests listed as
    unchanged in §2 pass without edits.
16. The full suite (including `lib/__tests__/plain-language.test.ts`), `tsc` and lint are green.

## 9. Report format
Files changed with line counts, the test file and test name for each acceptance item, and command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No SQL.
- No change to who may upload where, to any auth/role/permission/rate-limit/capability/count or server-side size check or
  its order, to bucket names, or to key templates beyond the extension. (Only exception: the onboarding pick-time limit, R2.7.)
- Do not edit `expense-partners.test.tsx`, `onboarding-form.test.tsx` or the two maintenance-ticket
  action tests.
- Lines ≤ 140 characters; files ≤ 500 lines; every Supabase error checked; exact copy only, with no invented URLs or emails.

## Round 2 (Claude review, 2026-10-17 ~04:30) — FAIL: fix these, nothing else
Claude's isolated gate on round 1 is green (317 files / 2,651 tests, lint, tsc, build). Three independent reviews found:
the server byte checks are correct (no changes needed there); one real runtime bug; three tests that can never fail
(proven by mutation: their `expect`s run inside the mocked action, the component's new `catch` swallows the failure);
weak pins; one flaky test; and the 10 MB pick-time photo limit still blocks a large library photo before it is shrunk.
Leave every other file alone, including the uncommitted invitation/owner-statement/client-accounts files (another
sprint's work in the same tree). Same report format as §9.

**Files (all already in §5):** the 7 components below, `apps/web/lib/maintenance-photos.ts`,
`apps/web/components/dashboard/maintenance/photo-upload.tsx`, `apps/web/lib/image-compress.ts`, and the test files named.

**F1 — Next.js redirects are swallowed (BLOCKER, runtime).** In Next 15.5 a server action that calls `redirect()`
rejects the client promise with a redirect error that the RedirectBoundary must receive
(`next/dist/client/components/router-reducer/reducers/server-action-reducer.js`). `completeOnboarding` always ends with
`redirect()` and `requireAuth` redirects to `/login` when the session expired, so today every successful onboarding shows
`We could not send that…` and clears the preview. Fix: `import { unstable_rethrow } from "next/navigation";` and make
`unstable_rethrow(error);` the **first line** of each new catch: `onboarding-form.tsx:80`, `profile-settings.tsx:57`,
`signer-flow.tsx:67`, `expense-form.tsx:77`, `expense-list.tsx:121`, `ticket-form.tsx:160`, `ticket-photo-upload.tsx:54`.
Tests (one per component, 7 total, in the existing test files: `avatar-upload.test.tsx` for onboarding + profile settings,
`upload-budget.test.tsx` for expense form + expense list + signer flow, `ticket-form.test.tsx`,
`ticket-photo-upload.test.tsx`): the mocked action throws the **real** error from `redirect("/x")` (import `redirect` from
`next/navigation` inside the mock). Render inside a small test error boundary and assert: the boundary received an error
whose `digest` starts with `NEXT_REDIRECT`; the upload error copy is **not** shown; for onboarding/profile the preview is
not cleared before the rethrow. Keep a plain `new Error("413")` case per component proving the friendly copy still shows.

**F2 — Tautological tests (BLOCKER, L-017).** No `expect(...)` may run inside a mock implementation in any 238j test.
Capture with `vi.fn(async () => ...)`, then `await waitFor(() => expect(action).toHaveBeenCalledTimes(1))` and assert on
`action.mock.calls[0]` afterwards (as `ticket-form.test.tsx` 5a/5d already do). Fix:
- `ticket-photo-upload.test.tsx:21-38` (compressed send + ticketId: JPEG type, `.jpg`, ≤ 921,600 bytes each, ticketId).
- `upload-budget.test.tsx:60-73` (receipt compressed: JPEG type, `.jpg`, ≤ 921,600) and `:117-123` (key list,
  `category=repair`, `amountDollars=10`, `description=""`).
- `avatar-upload.test.tsx:72-80` (empty file field passes FormData unchanged: `size === 0`), and **add** the same case for
  `OnboardingForm`.
Prove each: in the report, name the production change each fixed test now catches (for example "returning the raw file
from `prepareUploadFile`").

**F3 — Flaky test.** `ticket-form.test.tsx:54` checks the `Send to landlord` button synchronously; it failed 1 of 7
runs. Use `await screen.findByRole("button", { name: "Send to landlord" })`. Run `npx vitest run
components/__tests__/ticket-form.test.tsx` 20 times in a loop; all 20 must pass (report the count).

**F4 — Pick-time photo limit (client only; server unchanged).** A 48 MP library photo that iOS converts to JPEG is
10–20 MB and is refused with `Each photo must be under 10MB.` before it is shrunk. In `lib/maintenance-photos.ts` add
`export const MAX_MAINTENANCE_PHOTO_PICK_BYTES = 50 * 1024 * 1024;` and an optional third parameter
`maxBytes = MAX_MAINTENANCE_PHOTO_BYTES` to `validateMaintenancePhotoSelection`. When `maxBytes` is the default, the
message stays exactly `Each photo must be under 10MB.` (the server call at `maintenance-queries.ts:133` is unchanged);
when it is the pick limit, the message is `Each photo must be under 50 MB.`. The two browser callers
(`photo-upload.tsx:53`, `ticket-photo-upload.tsx:33`) pass `MAX_MAINTENANCE_PHOTO_PICK_BYTES`. Tests:
`maintenance-photos.test.ts` — default rejects 11 MB with the old copy; pick limit accepts 15 MB and rejects 51 MB with
the new copy. `ticket-photo-upload.test.tsx` — a 15 MB JPEG pick is accepted and the action receives a file ≤ 921,600
bytes. `ticket-form.test.tsx` — same for the tenant form (through the real `PhotoUpload` if the test already renders it,
otherwise through the picker callback it uses).

**F5 — Weak pins (SHOULD-FIX).**
- `image-compress.test.ts` (AC1e): an encoder returning 921,601 bytes at step 1 for a single photo must move to step 2;
  921,600 bytes is accepted at step 1. This must fail if `Math.min(PHOTO_MAX_BYTES, …)` is removed.
- `ticket-form.test.tsx:92-97` (AC5e): also assert `Sent. You'll see updates on Home.` is **absent**.
- `expense-receipt-upload.test.ts:60` (AC11): `expect(mocks.auth.mock.calls).toEqual([["owner"], ["owner"]])` (or the
  exact sequence the test drives).
- `maintenance-photo-upload.test.ts` and `profile-avatar.test.ts` (AC9, AC13): in the PNG-bytes-named-`p.jpg` case and
  the JPEG-bytes-typed-`image/png` avatar case, assert the uploaded body's `.type` is the sniffed type (and `file_type`
  for repairs), so uploading the original file instead of the rebuilt one fails.
- `file-signature.test.ts` (AC2): a ZIP with only `[Content_Types].xml` named `.docx` → `null`; a Word package named
  `.xlsx` → `null`.
- `upload-property-file.test.ts:76-77` (AC12): for `scan.png` with JPEG bytes also assert `image/jpeg` and
  `file_type: "image"`.

**F6 — e2e spec without `sharp`.** `tests/e2e/maintenance-photos.spec.ts` imports `sharp`, which no `package.json`
declares. Replace it with a tiny in-spec helper that reads width/height from the JPEG SOF0/SOF2 marker of the captured
bytes; keep the `height > width` assertion. No new dependency.

**F7 — Small fixes.**
- `image-compress.ts:65`: if `edge === 0` (no intrinsic size), treat it like a decode failure (the existing fallback), never
  encode a 1×1 image. Add one test.
- `ticket-form.tsx:141-160` and `ticket-photo-upload.tsx:40-54`: indent the code inside the new `try` blocks.
- New plain-text upload error elements you added (`ticket-photo-upload.tsx`, `expense-list.tsx`, `onboarding-form.tsx`)
  get `role="alert"`.

**Validation (Codex):** `cd apps/web && npx vitest run` (full suite), `npx tsc --noEmit`, `npm run lint:web` from the
repo root, `git diff --check`, plus the F3 loop. Do NOT run `gate:web`, Playwright or `testflight.sh`.
