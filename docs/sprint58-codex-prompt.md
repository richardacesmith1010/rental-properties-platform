# Sprint 58 — Codex Implementation Prompt

## 1. Objective

Enable tenants to attach photos to maintenance tickets using camera or file picker. Photos upload to the existing `maintenance-photos` Supabase storage bucket with secure access.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 57)
- **Production URL**: `https://domusbase.com`
- **Existing infrastructure**:
  - `maintenance-photos` Supabase storage bucket already exists
  - `lib/assets.ts` — signed URL generation for maintenance photos (line ~107), `SIGNED_URL_TTL_SECONDS`
  - `app/api/assets/` — asset authorization routes for property files and document packets (pattern exists to follow)
  - `app/actions/maintenance.ts` — `createMaintenanceTicket()`, `updateMaintenanceTicket()` actions exist
  - `components/dashboard/maintenance-section.tsx` — owner/manager maintenance UI
  - Tenant maintenance UI exists (tenant can submit tickets)
  - File upload pattern exists in `app/actions/documents.ts` → `uploadPropertyFile()` (20MB limit, Supabase storage upload)

## 3. In Scope

### Part A: Photo Upload on Ticket Creation
- Add photo attachment field to the tenant maintenance ticket creation form
- Accept multiple photos (up to 5 per ticket)
- Accept camera capture on mobile (via `capture="environment"` attribute)
- Accept gallery selection
- Max file size: 10MB per photo
- Accepted formats: JPEG, PNG, WebP, HEIC

### Part B: Photo Storage & Linking
- Upload photos to `maintenance-photos` bucket with path: `{ticketId}/{filename}`
- Store photo metadata in a new `maintenance_ticket_photos` table (or use existing schema if available)
- Link photos to tickets via ticket ID

### Part C: Photo Display
- Show photo thumbnails on ticket cards (owner, manager, and tenant views)
- Click thumbnail to view full-size photo (lightbox or modal)
- Secure access via signed URLs (follow existing asset authorization pattern)

### Part D: Photo API Route
- New API route: `app/api/assets/maintenance-photo/[photoId]/route.ts`
- Authorization: user must be ticket creator, property owner, or property manager
- Returns signed URL for the photo

### Part E: Photo Upload During Ticket Updates
- Allow adding photos to existing tickets (tenant adds follow-up photos)
- Owner/manager can also attach photos (e.g., repair completion photos)

## 4. Out of Scope

- Photo editing/cropping
- Video uploads
- AI-based photo analysis (damage detection)
- Compression/optimization (use as-is)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (4-5)
1. `supabase/migrations/20260316_sprint58_maintenance_photos.sql` — maintenance_ticket_photos table
2. `apps/web/components/dashboard/maintenance/photo-upload.tsx` — photo upload component with camera/gallery picker
3. `apps/web/components/dashboard/maintenance/photo-gallery.tsx` — photo display grid with lightbox
4. `apps/web/app/api/assets/maintenance-photo/[photoId]/route.ts` — secure photo access route
5. `apps/web/lib/__tests__/maintenance-photos.test.ts` — unit tests

### Modified Files (3-5)
1. `apps/web/app/actions/maintenance.ts` — add photo upload/delete actions, modify createMaintenanceTicket to accept photos
2. `apps/web/components/dashboard/maintenance-section.tsx` — add photo gallery to ticket cards, photo upload to create form
3. `apps/web/lib/assets.ts` — add maintenance photo authorization helper
4. `apps/web/lib/maintenance.ts` — add photo DTOs
5. Tenant maintenance component (wherever tenant creates tickets) — add photo upload field

## 6. Implementation Requirements

### Part A: Migration

**File: `supabase/migrations/20260316_sprint58_maintenance_photos.sql`**

```sql
CREATE TABLE IF NOT EXISTS maintenance_ticket_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE maintenance_ticket_photos ENABLE ROW LEVEL SECURITY;

-- Ticket participants can view photos
CREATE POLICY "Ticket participants can view photos" ON maintenance_ticket_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM maintenance_tickets t
      WHERE t.id = ticket_id
      AND (
        t.submitted_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id = t.property_id
          AND (
            p.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM property_managers pm
              WHERE pm.property_id = p.id
              AND pm.profile_id = auth.uid()
            )
          )
        )
      )
    )
  );

-- Authenticated users can upload photos to their own tickets or managed properties
CREATE POLICY "Users can upload photos" ON maintenance_ticket_photos
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM maintenance_tickets t
      WHERE t.id = ticket_id
      AND (
        t.submitted_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id = t.property_id
          AND (
            p.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM property_managers pm
              WHERE pm.property_id = p.id
              AND pm.profile_id = auth.uid()
            )
          )
        )
      )
    )
  );

-- Photo uploader or property owner can delete
CREATE POLICY "Uploader or owner can delete photos" ON maintenance_ticket_photos
  FOR DELETE USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM maintenance_tickets t
      JOIN properties p ON p.id = t.property_id
      WHERE t.id = ticket_id AND p.owner_id = auth.uid()
    )
  );
```

### Part B: Photo Upload Component

**File: `components/dashboard/maintenance/photo-upload.tsx`**

```tsx
"use client";

interface PhotoUploadProps {
  onPhotosSelected: (files: File[]) => void;
  existingPhotos?: PhotoDTO[];
  maxPhotos?: number;  // default: 5
  disabled?: boolean;
}

// Features:
// 1. File input with accept="image/jpeg,image/png,image/webp,image/heic"
// 2. capture="environment" attribute for mobile camera
// 3. Multiple selection support
// 4. Preview thumbnails of selected files before upload
// 5. Remove button on each preview
// 6. File size validation (10MB max per file)
// 7. Count validation (max 5 photos total including existing)
// 8. Visual drop zone with camera icon
// 9. "Take Photo" button (triggers capture input) + "Choose from Gallery" button
// 10. Show existing photos with delete option
```

### Part C: Photo Gallery Component

**File: `components/dashboard/maintenance/photo-gallery.tsx`**

```tsx
interface PhotoGalleryProps {
  photos: PhotoDTO[];
  canDelete?: boolean;
  onDelete?: (photoId: string) => void;
}

// Features:
// 1. Grid of thumbnail images (3 columns on desktop, 2 on mobile)
// 2. Click thumbnail → modal/lightbox showing full-size image
// 3. Navigation arrows in lightbox (prev/next)
// 4. Delete button (X) on thumbnails when canDelete=true
// 5. Loading skeleton while signed URLs are being fetched
// 6. Photos load via secure API route (/api/assets/maintenance-photo/[photoId])
```

### Part D: Maintenance Action Updates

In `app/actions/maintenance.ts`:

```typescript
// uploadMaintenancePhotos(ticketId: string, formData: FormData)
// 1. Auth check
// 2. Verify user is ticket creator, property owner, or property manager
// 3. Extract files from formData
// 4. Validate each file: type (jpeg/png/webp/heic), size (<10MB)
// 5. Upload each to Supabase storage: maintenance-photos/{ticketId}/{uuid}-{filename}
// 6. Insert metadata row per photo in maintenance_ticket_photos
// 7. Return { success: true, photoIds: string[] }

// deleteMaintenancePhoto(photoId: string)
// 1. Auth check
// 2. Fetch photo record, verify ownership
// 3. Delete from Supabase storage
// 4. Delete metadata row
// 5. Return { success: true }
```

### Part E: Asset Route

**File: `app/api/assets/maintenance-photo/[photoId]/route.ts`**

Follow the exact pattern from `app/api/assets/property-file/[fileId]/route.ts`:
1. Authenticate user
2. Fetch photo record from `maintenance_ticket_photos`
3. Verify user is ticket participant (creator, property owner, or manager)
4. Generate signed URL from `maintenance-photos` bucket
5. Redirect to signed URL

### Part F: Photo DTO

In `lib/maintenance.ts`:
```typescript
export interface MaintenancePhotoDTO {
  id: string;
  ticketId: string;
  uploadedBy: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
  url?: string;  // populated client-side from API route
}
```

### Part G: Unit Tests

Test:
1. File size validation rejects files >10MB
2. File type validation accepts JPEG, PNG, WebP, HEIC
3. File type validation rejects non-image files
4. Max photo count enforced (5 per ticket)
5. Photo DTO shape is correct

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Migration creates `maintenance_ticket_photos` table with RLS
2. [ ] Tenant can attach up to 5 photos when creating a maintenance ticket
3. [ ] Mobile users can capture photos directly from camera
4. [ ] Photos upload to `maintenance-photos` Supabase bucket
5. [ ] Photo thumbnails display on ticket cards (all roles)
6. [ ] Click thumbnail opens full-size view
7. [ ] Photos accessible only to ticket participants (creator, owner, manager)
8. [ ] Users can add photos to existing tickets
9. [ ] Photo uploader or property owner can delete photos
10. [ ] File validation: max 10MB, images only
11. [ ] 5+ unit tests passing
12. [ ] `npm run gate:web` passes
13. [ ] No regressions to existing maintenance functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
PHOTO_UPLOAD: working | broken
PHOTO_GALLERY: working | broken
CAMERA_CAPTURE: working | broken
ASSET_ROUTE: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT apply the migration to Supabase (Claude will apply it)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies (use native file input, no dropzone library)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Follow existing upload patterns from `app/actions/documents.ts` → `uploadPropertyFile()`
- Follow existing asset route patterns from `app/api/assets/property-file/[fileId]/route.ts`
- Photos must use signed URLs — never expose direct storage paths to client
