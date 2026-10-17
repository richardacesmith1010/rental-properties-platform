import { Component, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TicketForm } from "@/components/dashboard/ticket-form";
import { imageCodec, UPLOAD_BUDGET_BYTES } from "@/lib/image-compress";
import { PHOTO_UPLOAD_UNFINISHED_MESSAGE } from "@/lib/maintenance-photos";
import type { ActionState } from "@/app/actions";


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
  PhotoUpload: ({ onPhotosSelected }: { onPhotosSelected: (files: File[]) => void }) =>
    <button type="button" onClick={() => onPhotosSelected(selectedFiles)}>Pick photos</button>
}));
let selectedFiles: File[] = [];
const jpeg = () => new File([new Uint8Array(3_000_000)], "IMG_1.jpg", { type: "image/jpeg" });
const setup = async (action: (previous: ActionState, formData: FormData) => Promise<ActionState>,
  boundary = false) => {
  const form = <TicketForm units={[{ id: "unit-1", propertyName: "Home", unitNumber: "1" }]}
    viewerRole="tenant" onCreateTicket={action} />;
  render(boundary ? <RedirectBoundary>{form}</RedirectBoundary> : form);
  fireEvent.change(screen.getByLabelText("What needs repair?"), { target: { value: "The sink leaks." } });
  fireEvent.click(screen.getByRole("button", { name: "Pick photos" }));
  fireEvent.click(await screen.findByRole("button", { name: "Send to landlord" }));
};

const notice = "Once your landlord sets up your lease, you can report repairs. You can also send messages.";

describe("TicketForm tenant", () => {
  it("sends two compressed JPEGs within the shared budget", async () => {
    selectedFiles = [jpeg(), jpeg()];
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
    const action = vi.fn(async (_previous, _formData: FormData) => ({ success: true as const }));
    await setup(action);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0][1].getAll("photos") as File[];
    expect(sent).toHaveLength(2);
    expect(sent.every((photo) => photo.type === "image/jpeg" && photo.name.endsWith(".jpg"))).toBe(true);
    expect(sent.reduce((sum, photo) => sum + photo.size, 0)).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
    vi.restoreAllMocks();
  });

  it("shows a thrown action error and keeps the typed repair", async () => {
    selectedFiles = [];
    refresh.mockClear();
    await setup(vi.fn(async () => { throw new Error("413"); }));
    await screen.findByText("We could not send that. Please try again.");
    expect(screen.getByLabelText("What needs repair?")).toHaveValue("The sink leaks.");
    expect(await screen.findByRole("button", { name: "Send to landlord" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("passes a server redirect to the redirect boundary", async () => {
    redirectCaught = null;
    selectedFiles = [];
    await setup(vi.fn(async () => redirect("/x")), true);
    await screen.findByText("Redirect reached boundary");
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByText("We could not send that. Please try again.")).not.toBeInTheDocument();
  });

  it("keeps one photo when the browser cannot shrink it", async () => {
    selectedFiles = [jpeg()];
    refresh.mockClear();
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(null);
    const action = vi.fn(async () => ({ success: true as const }));
    await setup(action);
    await screen.findByText("This photo is too big. Try a different photo.");
    expect(action).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("accepts a 15 MB tenant photo and sends a small JPEG", async () => {
    selectedFiles = [new File([new Uint8Array(15 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" })];
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 8000, height: 6000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
    const action = vi.fn(async (_previous, _data: FormData) => ({ success: true as const }));
    await setup(action);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect((action.mock.calls[0][1].get("photos") as File).size).toBeLessThanOrEqual(921_600);
    vi.restoreAllMocks();
  });

  it("sends five JPEGs in one action within the shared budget", async () => {
    selectedFiles = Array.from({ length: 5 }, () => jpeg());
    vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
      source: {} as HTMLImageElement, release: vi.fn() });
    vi.spyOn(imageCodec, "encode").mockImplementation(async (_image, options) =>
      new Blob([new Uint8Array(options.quality === 0.8 ? 819_200 : 614_400)]));
    const action = vi.fn(async (_previous, _formData: FormData) => ({ success: true as const }));
    await setup(action);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0][1].getAll("photos") as File[];
    expect(sent).toHaveLength(5);
    expect(sent.reduce((sum, photo) => sum + photo.size, 0)).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
    vi.restoreAllMocks();
  });

  it("shows the lost-photo notice while preserving a plain success message", async () => {
    selectedFiles = [];
    await setup(vi.fn(async () => ({ success: true as const, message: PHOTO_UPLOAD_UNFINISHED_MESSAGE })));
    expect(await screen.findByText("Sent. Your photos did not go through. Add them to the repair again."))
      .toBeInTheDocument();
    expect(screen.queryByText("Sent. You'll see updates on Home.")).not.toBeInTheDocument();
  });

  it("shows the normal tenant success message", async () => {
    selectedFiles = [];
    await setup(vi.fn(async () => ({ success: true as const })));
    expect(await screen.findByText("Sent. You'll see updates on Home.")).toBeInTheDocument();
  });

  it("explains the missing lease and never sends a typed problem", () => {
    const onCreateTicket = vi.fn(async () => ({ success: true as const }));
    render(<TicketForm units={[]} viewerRole="tenant" hasActiveLease={false} onCreateTicket={onCreateTicket} />);
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.getByText("Tell us what's wrong. Your landlord will see it in Domus.")).toBeInTheDocument();
    expect(screen.getByText("Your landlord will see it in Domus.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What needs repair?"), { target: { value: "The sink is leaking." } });
    const send = screen.getByRole("button", { name: "Send to landlord" });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(onCreateTicket).not.toHaveBeenCalled();
  });
});
