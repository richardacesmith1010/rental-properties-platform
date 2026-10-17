import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoGallery } from "../photo-gallery";
import type { MaintenancePhotoDTO } from "@/lib/maintenance";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  unstable_rethrow: vi.fn(),
}));

const photos: MaintenancePhotoDTO[] = [
  {
    id: "photo-1", ticketId: "repair-1", uploadedBy: "tenant-1", fileName: "sink.jpg",
    fileType: "image/jpeg", fileSizeBytes: 123, createdAt: "2026-10-16", url: "https://example.com/sink.jpg",
  },
  {
    id: "photo-2", ticketId: "repair-1", uploadedBy: "tenant-1", fileName: "pipe.jpg",
    fileType: "image/jpeg", fileSizeBytes: 456, createdAt: "2026-10-16", url: "https://example.com/pipe.jpg",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
  document.body.style.overflow = "";
});

describe("PhotoGallery", () => {
  it("1 portals the viewer, locks scroll, and restores focus after X and Escape", () => {
    document.body.style.overflow = "auto";
    const { container } = render(<PhotoGallery photos={photos} />);
    const thumbnail = screen.getByTitle("Open sink.jpg");

    fireEvent.click(thumbnail);
    const dialog = screen.getByRole("dialog", { name: "Photo viewer" });
    expect(dialog.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByAltText("sink.jpg")).toHaveClass("object-contain");

    fireEvent.click(within(dialog).getByTitle("Close photo viewer"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
    expect(thumbnail).toHaveFocus();

    fireEvent.click(thumbnail);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
    expect(thumbnail).toHaveFocus();
  });

  it("2 fetches once, downloads the named blob, and revokes it", async () => {
    const fetchPhoto = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(["image"])) });
    vi.stubGlobal("fetch", fetchPhoto);
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo-1");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickedLinks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push(this);
    });
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getByTitle("Open sink.jpg"));
    const saveButton = screen.getByRole("button", { name: "Save photo" });
    expect(saveButton).toHaveAttribute("title", "Save or share this photo.");
    fireEvent.click(saveButton);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await waitFor(() => expect(clickedLinks).toHaveLength(1));
    expect(fetchPhoto).toHaveBeenCalledExactlyOnceWith(photos[0].url);
    expect(createUrl).toHaveBeenCalledOnce();
    expect(clickedLinks[0].download).toBe("sink.jpg");
    expect(clickedLinks[0].href).toMatch(/^blob:/);
    expect(clickedLinks[0].isConnected).toBe(false);
    expect(saveButton).toBeEnabled();
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:photo-1"), { timeout: 6_000 });
  }, 7_000);

  it("2 shows a retry message and enables Save photo after a failed fetch", async () => {
    const fetchPhoto = vi.fn().mockRejectedValue(new Error("Network failed"));
    vi.stubGlobal("fetch", fetchPhoto);
    render(<PhotoGallery photos={[photos[0]]} />);
    fireEvent.click(screen.getByTitle("Open sink.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the photo. Try again.");
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
  });

  it("3 keeps thumbnail navigation and the allowed delete action", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<PhotoGallery photos={photos} canDeletePhoto={(photo) => photo.id === "photo-1"} onDelete={onDelete} />);
    expect(screen.getAllByTitle(/^Open /)).toHaveLength(2);
    expect(screen.getByTitle("Delete sink.jpg")).toBeInTheDocument();
    expect(screen.queryByTitle("Delete pipe.jpg")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Open sink.jpg"));
    fireEvent.click(screen.getByTitle("Next photo"));
    expect(within(screen.getByRole("dialog")).getByAltText("pipe.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Previous photo"));
    expect(within(screen.getByRole("dialog")).getByAltText("sink.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Close photo viewer"));

    fireEvent.click(screen.getByTitle("Delete sink.jpg"));
    await waitFor(() => expect(onDelete).toHaveBeenCalledExactlyOnceWith("photo-1"));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
