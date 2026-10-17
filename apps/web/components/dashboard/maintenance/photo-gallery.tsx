"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { unstable_rethrow, useRouter } from "next/navigation";
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
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const openingThumbnail = useRef<HTMLButtonElement | null>(null);

  const activeIndex = useMemo(
    () => photos.findIndex((photo) => photo.id === activePhotoId),
    [activePhotoId, photos]
  );
  const activePhoto = activeIndex >= 0 ? photos[activeIndex] : null;
  const viewerIconClass = "inline-flex h-11 w-11 items-center justify-center rounded-full " +
    "bg-[var(--surface-2)] text-[var(--ink)] shadow-sm";

  useEffect(() => {
    if (!activePhoto) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePhotoId(null);
        openingThumbnail.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activePhoto]);

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
      unstable_rethrow(error);
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
    setSaveError(null);
  };

  const closeViewer = () => {
    setActivePhotoId(null);
    setSaveError(null);
    openingThumbnail.current?.focus();
  };

  const savePhoto = async () => {
    if (!activePhoto || savingPhotoId) {
      return;
    }

    setSavingPhotoId(activePhoto.id);
    setSaveError(null);
    let blobUrl: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      if (!activePhoto.url) {
        throw new Error("Missing photo URL");
      }
      const response = await fetch(activePhoto.url);
      if (!response.ok) {
        throw new Error("Photo download failed");
      }
      const downloadUrl = URL.createObjectURL(await response.blob());
      blobUrl = downloadUrl;
      link = document.createElement("a");
      link.href = blobUrl;
      link.download = activePhoto.fileName;
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 5_000);
      blobUrl = null;
    } catch {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      setSaveError("Could not save the photo. Try again.");
    } finally {
      link?.remove();
      setSavingPhotoId(null);
    }
  };

  return (
    <>
      <div className="space-y-2">
        {deleteError ? <p className="text-xs text-[var(--crit)]">{deleteError}</p> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => {
            const canDelete = canDeletePhoto?.(photo) ?? false;

            return (
              <div key={photo.id} className="relative overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <button
                  type="button"
                  className="block w-full"
                  onClick={(event) => {
                    openingThumbnail.current = event.currentTarget;
                    setSaveError(null);
                    setActivePhotoId(photo.id);
                  }}
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
                    className={"absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center " +
                      "rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-background"}
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

      {activePhoto && typeof document !== "undefined" ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className={"fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden bg-[var(--surface)] px-4 " +
            "pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[var(--ink)]"}
        >
          <div className="flex h-12 shrink-0 items-center justify-end">
            <button
              type="button"
              className={viewerIconClass}
              onClick={closeViewer}
              title="Close photo viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {photos.length > 1 ? (
              <button
                type="button"
                className={`absolute left-0 z-10 ${viewerIconClass}`}
                onClick={() => showAdjacentPhoto(-1)}
                title="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            <img
              src={activePhoto.url}
              alt={activePhoto.caption ?? activePhoto.fileName}
              className="h-full max-h-full w-full max-w-4xl object-contain"
            />
            {photos.length > 1 ? (
              <button
                type="button"
                className={`absolute right-0 z-10 ${viewerIconClass}`}
                onClick={() => showAdjacentPhoto(1)}
                title="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2 pt-3">
            <p className="max-w-full truncate text-sm font-semibold">{activePhoto.fileName}</p>
            {activePhoto.caption ? <p className="max-w-full truncate text-sm text-[var(--muted)]">{activePhoto.caption}</p> : null}
            <button
              type="button"
              className="domus-card min-h-11 min-w-44 px-5 py-2 text-sm font-semibold text-[var(--ink)]"
              title="Save or share this photo."
              onClick={() => void savePhoto()}
              disabled={savingPhotoId !== null}
            >
              {savingPhotoId ? "Saving..." : "Save photo"}
            </button>
            {saveError ? <p role="alert" className="text-sm text-[var(--crit)]">{saveError}</p> : null}
          </div>
        </div>
      , document.body) : null}
    </>
  );
}
