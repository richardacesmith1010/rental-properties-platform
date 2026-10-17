import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeOnboarding, updateProfile } from "@/app/actions/profile";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rate: vi.fn(), upload: vi.fn(),
  update: vi.fn(), redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));

const userId = "550e8400-e29b-41d4-a716-446655440001";
const input = (bytes: Uint8Array | string, type: string) => {
  const data = new FormData();
  data.set("firstName", "Ana");
  data.set("lastName", "Ruiz");
  data.set("avatarFile", new File([bytes], "photo.png", { type }));
  return data;
};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0]);

describe("profile avatar byte checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId }, role: "tenant" });
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    mocks.admin.mockReturnValue({
      storage: { from: () => ({ upload: mocks.upload,
        getPublicUrl: () => ({ data: { publicUrl: "https://example.test/avatar" } }) }) },
      from: () => ({ update: mocks.update })
    });
  });

  it("stores PNG bytes as PNG with the correct body MIME and profile path", async () => {
    expect(await updateProfile(null, input(png, "image/png"))).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[0][0]).toBe(`${userId}/avatar.png`);
    expect(mocks.upload.mock.calls[0][1].type).toBe("image/png");
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({ upsert: true, contentType: "image/png" });
    expect(mocks.update.mock.calls[0][0]).toEqual({ avatar_url: `profile-avatars/${userId}/avatar.png` });
  });

  it("stores JPEG bytes as JPG", async () => {
    expect(await updateProfile(null, input(jpeg, "image/png"))).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[0][0]).toBe(`${userId}/avatar.jpg`);
    expect(mocks.upload.mock.calls[0][1].type).toBe("image/jpeg");
  });

  it("rejects HTML without storage or profile writes", async () => {
    expect(await updateProfile(null, input("<html>", "image/png"))).toMatchObject({ success: false,
      error: "Profile photo must be a JPG, PNG, or WebP image." });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("stores an onboarding JPEG and redirects after saving", async () => {
    await completeOnboarding(null, input(jpeg, "image/jpeg"));
    expect(mocks.upload.mock.calls[0][0]).toBe(`${userId}/avatar.jpg`);
    expect(mocks.upload.mock.calls[0][1].type).toBe("image/jpeg");
    expect(mocks.redirect).toHaveBeenCalled();
  });
});
