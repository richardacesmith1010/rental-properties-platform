"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import type { MaintenancePhotoDTO } from "@/lib/maintenance";
import {
  ACCEPTED_MAINTENANCE_PHOTO_TYPES,
  MAX_MAINTENANCE_PHOTOS,
  validateMaintenancePhotoSelection
} from "@/lib/maintenance-photos";
import { Button } from "@/components/ui/button";

interface PhotoUploadProps {
  onPhotosSelected: (files: File[]) => void;
  selectedPhotos?: File[];
  existingPhotos?: MaintenancePhotoDTO[];
  maxPhotos?: number;
  disabled?: boolean;
}

export function PhotoUpload({
  onPhotosSelected,
  selectedPhotos = [],
  existingPhotos = [],
  maxPhotos = MAX_MAINTENANCE_PHOTOS,
  disabled = false
}: PhotoUploadProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewUrls = useMemo(
    () => selectedPhotos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedPhotos]
  );

  useEffect(() => {
    return () => {
      for (const preview of previewUrls) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [previewUrls]);

  const handleInput = (files: FileList | null, input: HTMLInputElement | null) => {
    const nextFiles = Array.from(files ?? []);
    if (nextFiles.length === 0) {
      return;
    }

    const merged = [...selectedPhotos, ...nextFiles];
    const validationError = validateMaintenancePhotoSelection(merged, existingPhotos.length);
    if (validationError) {
      setError(validationError);
      if (input) {
        input.value = "";
      }
      return;
    }

    if (existingPhotos.length + merged.length > maxPhotos) {
      setError(`You can attach up to ${maxPhotos} photos per ticket.`);
      if (input) {
        input.value = "";
      }
      return;
    }

    setError(null);
    onPhotosSelected(merged);
    if (input) {
      input.value = "";
    }
  };

  const removeSelectedPhoto = (index: number) => {
    const next = selectedPhotos.filter((_, fileIndex) => fileIndex !== index);
    setError(null);
    onPhotosSelected(next);
  };

  const totalPhotos = existingPhotos.length + selectedPhotos.length;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-muted/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Attach maintenance photos</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Up to {maxPhotos} photos, 10MB each. JPEG, PNG, WebP, and HEIC are supported.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">{totalPhotos}/{maxPhotos} attached</div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={cameraInputRef}
          type="file"
          accept={ACCEPTED_MAINTENANCE_PHOTO_TYPES.join(",")}
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => handleInput(event.target.files, event.currentTarget)}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept={ACCEPTED_MAINTENANCE_PHOTO_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(event) => handleInput(event.target.files, event.currentTarget)}
        />
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          disabled={disabled || totalPhotos >= maxPhotos}
          onClick={() => cameraInputRef.current?.click()}
          title="Open your camera to capture maintenance photos."
        >
          <Camera className="mr-2 h-4 w-4" />
          Take Photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          disabled={disabled || totalPhotos >= maxPhotos}
          onClick={() => galleryInputRef.current?.click()}
          title="Choose existing photos from your device."
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          Choose from Gallery
        </Button>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {selectedPhotos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previewUrls.map((preview, index) => (
            <div key={`${preview.file.name}-${preview.file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <img
                src={preview.url}
                alt={preview.file.name}
                className="h-28 w-full object-cover"
              />
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-background"
                onClick={() => removeSelectedPhoto(index)}
                title={`Remove ${preview.file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-foreground">{preview.file.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {Math.max(1, Math.round(preview.file.size / 1024 / 1024))}MB
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
