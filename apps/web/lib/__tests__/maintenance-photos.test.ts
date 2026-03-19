import { describe, expect, it } from "vitest";
import {
  MAX_MAINTENANCE_PHOTOS,
  buildMaintenancePhotoUrl,
  isAcceptedMaintenancePhotoType,
  normalizeMaintenancePhotoRecord,
  validateMaintenancePhotoSelection
} from "@/lib/maintenance-photos";

describe("maintenance photo helpers", () => {
  it("rejects files larger than 10MB", () => {
    const error = validateMaintenancePhotoSelection([
      { name: "kitchen.jpg", type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }
    ]);

    expect(error).toBe("Each photo must be under 10MB.");
  });

  it("accepts supported image types", () => {
    expect(isAcceptedMaintenancePhotoType("image/jpeg")).toBe(true);
    expect(isAcceptedMaintenancePhotoType("image/png")).toBe(true);
    expect(isAcceptedMaintenancePhotoType("image/webp")).toBe(true);
    expect(isAcceptedMaintenancePhotoType("image/heic")).toBe(true);
  });

  it("rejects unsupported file types", () => {
    const error = validateMaintenancePhotoSelection([
      { name: "invoice.pdf", type: "application/pdf", size: 1024 }
    ]);

    expect(error).toBe("Photos must be JPEG, PNG, WebP, or HEIC.");
  });

  it("enforces the max photo count", () => {
    const files = Array.from({ length: 2 }, (_, index) => ({
      name: `photo-${index}.jpg`,
      type: "image/jpeg",
      size: 1024
    }));

    const error = validateMaintenancePhotoSelection(files, MAX_MAINTENANCE_PHOTOS - 1);
    expect(error).toBe(`You can attach up to ${MAX_MAINTENANCE_PHOTOS} photos per ticket.`);
  });

  it("normalizes a maintenance photo dto", () => {
    const dto = normalizeMaintenancePhotoRecord({
      id: "photo-1",
      ticket_id: "ticket-1",
      uploaded_by_profile_id: "profile-1",
      storage_path: "ticket-1/leak-photo.jpg",
      created_at: "2026-03-19T00:00:00.000Z",
      caption: "Under the sink"
    });

    expect(dto).toEqual({
      id: "photo-1",
      ticketId: "ticket-1",
      uploadedBy: "profile-1",
      fileName: "leak-photo.jpg",
      fileType: "",
      fileSizeBytes: 0,
      createdAt: "2026-03-19T00:00:00.000Z",
      caption: "Under the sink",
      url: buildMaintenancePhotoUrl("photo-1")
    });
  });
});
