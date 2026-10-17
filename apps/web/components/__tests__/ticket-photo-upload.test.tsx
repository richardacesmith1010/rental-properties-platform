import { Component, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketPhotoUpload } from "@/components/dashboard/ticket-photo-upload";
import { imageCodec, UPLOAD_BUDGET_BYTES } from "@/lib/image-compress";


let redirectCaught: Error | null = null;
class RedirectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { redirectCaught = error; }
  render() { return this.state.failed ? <div>Redirect reached boundary</div> : this.props.children; }
}

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(), useRouter: () => ({ refresh })
}));
vi.mock("@/components/dashboard/maintenance/photo-upload", () => ({
  PhotoUpload: ({ onPhotosSelected, selectedPhotos }: {
    onPhotosSelected: (files: File[]) => void; selectedPhotos: File[]
  }) => <><button type="button" onClick={() => onPhotosSelected(picked)}>Pick photos</button>
    <span>{selectedPhotos.length} picked</span></>
}));
let picked: File[] = [];
const photo = () => new File([new Uint8Array(3_000_000)], "leak.jpg", { type: "image/jpeg" });
const existing = Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index}` }));

afterEach(() => { vi.restoreAllMocks(); refresh.mockClear(); });

describe("follow-up repair photos", () => {
  it("sends compressed photos and the repair ID", async () => {
    picked = [photo(), photo()];
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
    const action = vi.fn(async (_previous, _formData: FormData) => ({ success: true as const }));
    render(<TicketPhotoUpload ticketId="repair-1" onUploadPhoto={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Photos" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const formData = action.mock.calls[0][1];
    expect(formData.get("ticketId")).toBe("repair-1");
    const photos = formData.getAll("photos") as File[];
    expect(photos).toHaveLength(2);
    expect(photos.every((item) => item.type === "image/jpeg" && item.name.endsWith(".jpg"))).toBe(true);
    expect(photos.every((item) => item.size <= 921_600)).toBe(true);
    expect(photos.reduce((sum, item) => sum + item.size, 0)).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
  });

  it("accepts a 15 MB pick and sends a small JPEG", async () => {
    picked = [new File([new Uint8Array(15 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" })];
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 8000, height: 6000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
    const action = vi.fn(async (_previous, _data: FormData) => ({ success: true as const }));
    render(<TicketPhotoUpload ticketId="repair-1" onUploadPhoto={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Photos" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect((action.mock.calls[0][1].get("photos") as File).size).toBeLessThanOrEqual(921_600);
  });

  it("passes a server redirect to the redirect boundary", async () => {
    redirectCaught = null;
    picked = [photo()];
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
    render(<RedirectBoundary><TicketPhotoUpload ticketId="repair-1"
      onUploadPhoto={vi.fn(async () => redirect("/x"))} /></RedirectBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Photos" }));
    await screen.findByText("Redirect reached boundary");
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByText("We could not send that. Please try again.")).not.toBeInTheDocument();
  });

  it("keeps picked files when one photo cannot shrink", async () => {
    picked = [photo()];
    vi.spyOn(imageCodec, "decode").mockRejectedValue(new Error("decode"));
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob());
    const action = vi.fn(async () => { throw new Error("413"); });
    render(<TicketPhotoUpload ticketId="repair-1" onUploadPhoto={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Photos" }));
    await screen.findByText("This photo is too big. Try a different photo.");
    expect(action).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByText("1 picked")).toBeInTheDocument();
  });

  it("shows a thrown action error without clearing selected photos", async () => {
    picked = [photo()];
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
    const action = vi.fn(async () => { throw new Error("413"); });
    render(<TicketPhotoUpload ticketId="repair-1" onUploadPhoto={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Photos" }));
    await screen.findByText("We could not send that. Please try again.");
    expect(screen.getByText("1 picked")).toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("checks the existing count before compressing", async () => {
    picked = [photo(), photo()];
    const action = vi.fn(async () => ({ success: true as const }));
    render(<TicketPhotoUpload ticketId="repair-1" existingPhotos={existing as never} onUploadPhoto={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload Photos" }));
    expect(screen.getByText("You can attach up to 5 photos per ticket.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
