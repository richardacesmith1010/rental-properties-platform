import { Component, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { imageCodec, PHOTO_MAX_BYTES } from "@/lib/image-compress";
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
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
const NativeFormData = FormData;
const png = () => new File([new Uint8Array(3_000_000)], "avatar.png", { type: "image/png" });
const jpeg = (size: number) => new File([new Uint8Array(size)], "avatar.jpg", { type: "image/jpeg" });
const mockCodec = () => {
  vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
    source: {} as HTMLImageElement, release: vi.fn() });
  const encode = vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
  return encode;
};

beforeEach(() => {
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form?: HTMLFormElement) {
      super(form);
      if (form) for (const input of form.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
        if (input.name && input.files?.[0]) this.set(input.name, input.files[0]);
      }
    }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const profile = (action: (previous: ActionState, data: FormData) => Promise<ActionState>) =>
  render(<ProfileSettings email="ana@example.test" fullName="Ana Ruiz" onUpdateProfile={action} />);
const onboarding = (action: (previous: ActionState, data: FormData) => Promise<ActionState>) =>
  render(<OnboardingForm email="ana@example.test" fullName="Ana Ruiz" role="tenant" onCompleteOnboarding={action} />);

describe("avatar upload budget", () => {
  it.each(["profile", "onboarding"])("compresses a %s avatar before its action", async (kind) => {
    const encode = mockCodec();
    const action = vi.fn(async (_previous, _data: FormData) => {
      return { success: false as const, error: "Try again." };
    });
    if (kind === "profile") profile(action); else onboarding(action);
    await userEvent.upload(document.querySelector('input[name="avatarFile"]')!, png());
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0][1].get("avatarFile") as File;
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
    expect(encode.mock.calls[0][1].width).toBe(512);
    expect(screen.getByText("JPG, PNG, or WebP.")).toBeInTheDocument();
  });

  it.each(["profile", "onboarding"])("keeps typed %s names and clears a failed preview", async (kind) => {
    mockCodec();
    const action = vi.fn(async () => { throw new Error("413"); });
    if (kind === "profile") profile(action); else onboarding(action);
    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Alicia" } });
    await userEvent.upload(document.querySelector('input[name="avatarFile"]')!, png());
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("We could not send that. Please choose the file again.");
    expect(screen.getByLabelText("First Name")).toHaveValue("Alicia");
    expect(screen.queryByRole("img", { name: kind === "profile" ? "Profile preview" : "Avatar preview" }))
      .not.toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
  });

  it.each(["profile", "onboarding"])("rethrows a %s redirect without clearing its preview", async (kind) => {
    redirectCaught = null;
    mockCodec();
    const action = vi.fn(async () => redirect("/x"));
    const form = kind === "profile"
      ? <ProfileSettings email="ana@example.test" fullName="Ana Ruiz" onUpdateProfile={action} />
      : <OnboardingForm email="ana@example.test" fullName="Ana Ruiz" role="tenant"
          onCompleteOnboarding={action} />;
    render(<RedirectBoundary>{form}</RedirectBoundary>);
    await userEvent.upload(document.querySelector('input[name="avatarFile"]')!, png());
    expect(screen.getByRole("img", { name: kind === "profile" ? "Profile preview" : "Avatar preview" }))
      .toBeInTheDocument();
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Redirect reached boundary");
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByText("We could not send that. Please choose the file again.")).not.toBeInTheDocument();
  });

  it.each(["profile", "onboarding"])("passes an empty %s file field unchanged", async (kind) => {
    const action = vi.fn(async (_previous, _data: FormData) =>
      ({ success: false as const, error: "Try again." }));
    if (kind === "profile") profile(action); else onboarding(action);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect((action.mock.calls[0][1].get("avatarFile") as File).size).toBe(0);
  });

  it("accepts a 6 MB onboarding pick and rejects a 16 MB pick", async () => {
    onboarding(vi.fn(async () => ({ success: true as const })));
    const input = document.querySelector('input[name="avatarFile"]') as HTMLInputElement;
    await userEvent.upload(input, jpeg(6 * 1024 * 1024));
    expect(screen.queryByText("Image must be under 15 MB.")).not.toBeInTheDocument();
    await userEvent.upload(input, jpeg(16 * 1024 * 1024));
    expect(screen.getByText("Image must be under 15 MB.")).toBeInTheDocument();
  });
});
