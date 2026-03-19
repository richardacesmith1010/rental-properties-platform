"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import type { MaintenancePhotoDTO } from "@/lib/maintenance";

interface PhotoGalleryProps {
  photos: MaintenancePhotoDTO[];
  canDeletePhoto?: (photo: MaintenancePhotoDTO) => boolean;
  onDelete?: (photoId: string) => Promise<void> | void;
}

export function PhotoGallery({ photos, canDeletePhoto, onDelete }: PhotoGalleryProps) {
  const router = useRouter();
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeIndex = useMemo(
    () => photos.findIndex((photo) => photo.id === activePhotoId),
    [activePhotoId, photos]
  );
  const activePhoto = activeIndex >= 0 ? photos[activeIndex] : null;

  if (photos.length === 0) {
    return null;
  }

  const handleDelete = async (photoId: string) => {
    if (!onDelete) {
      return;
    }

    setDeletingPhotoId(photoId);
    try {
      await onDelete(photoId);
      setDeleteError(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete this photo right now.");
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const showAdjacentPhoto = (offset: number) => {
    if (!activePhoto) {
      return;
    }

    const nextIndex = (activeIndex + offset + photos.length) % photos.length;
    setActivePhotoId(photos[nextIndex]?.id ?? null);
  };

  return (
    <>
      <div className="space-y-2">
        {deleteError ? <p className="text-xs text-red-600">{deleteError}</p> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => {
            const canDelete = canDeletePhoto?.(photo) ?? false;

            return (
              <div key={photo.id} className="relative overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => setActivePhotoId(photo.id)}
                  title={`Open ${photo.fileName}`}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption ?? photo.fileName}
                    className="h-28 w-full object-cover"
                    loading="lazy"
                  />
                </button>
                {canDelete && onDelete ? (
                  <button
                    type="button"
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-background"
                    onClick={() => void handleDelete(photo.id)}
                    title={`Delete ${photo.fileName}`}
                    disabled={deletingPhotoId === photo.id}
                  >
                    {deletingPhotoId === photo.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-foreground">{photo.fileName}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activePhoto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
            onClick={() => setActivePhotoId(null)}
            title="Close photo viewer"
          >
            <X className="h-5 w-5" />
          </button>
          {photos.length > 1 ? (
            <button
              type="button"
              className="absolute left-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
              onClick={() => showAdjacentPhoto(-1)}
              title="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl">
            <img
              src={activePhoto.url}
              alt={activePhoto.caption ?? activePhoto.fileName}
              className="max-h-[75vh] w-full object-contain bg-black/5"
            />
            <div className="space-y-1 p-4">
              <p className="text-sm font-semibold text-foreground">{activePhoto.fileName}</p>
              {activePhoto.caption ? (
                <p className="text-sm text-muted-foreground">{activePhoto.caption}</p>
              ) : null}
            </div>
          </div>
          {photos.length > 1 ? (
            <button
              type="button"
              className="absolute right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
              onClick={() => showAdjacentPhoto(1)}
              title="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
