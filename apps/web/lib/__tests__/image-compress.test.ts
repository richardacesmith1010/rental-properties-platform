import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_STEPS, FileTooLargeError, PHOTO_MAX_BYTES, PHOTO_STEPS, PhotoTooLargeError,
  UPLOAD_BUDGET_BYTES, compressImage, imageCodec, preparePhotos, prepareUploadFile, uploadErrorCopy
} from "@/lib/image-compress";

const file = (size: number, name = "IMG_1.HEIC", type = "image/heic") =>
  new File([new Uint8Array(size)], name, { type });

function codec(width = 4000, height = 3000, sizes = [800_000]) {
  const release = vi.fn();
  vi.spyOn(imageCodec, "decode").mockResolvedValue({ width, height, source: {} as HTMLImageElement, release });
  const encode = vi.spyOn(imageCodec, "encode")
    .mockImplementation(async () => new Blob([new Uint8Array(sizes[Math.min(encode.mock.calls.length - 1, sizes.length - 1)])]));
  return { encode, release };
}

afterEach(() => vi.restoreAllMocks());

describe("browser image budget", () => {
  it("scales a large HEIC to a JPEG and never upscales a small photo", async () => {
    const first = codec();
    const output = await compressImage(file(3_000_000), { targetBytes: PHOTO_MAX_BYTES, steps: PHOTO_STEPS });
    expect(first.encode.mock.calls[0][1]).toEqual({ width: 2048, height: 1536, quality: 0.8 });
    expect(output.name).toBe("IMG_1.jpg");
    expect(output.type).toBe("image/jpeg");
    expect(first.release).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
    const second = codec(800, 600);
    await compressImage(file(3_000_000), { targetBytes: PHOTO_MAX_BYTES, steps: PHOTO_STEPS });
    expect(second.encode.mock.calls[0][1]).toEqual({ width: 800, height: 600, quality: 0.8 });
  });

  it("tries all three steps and fails after the last oversized result", async () => {
    const { encode, release } = codec(4000, 3000, [2_000_000, 1_000_000, 800_000]);
    await compressImage(file(3_000_000), { targetBytes: PHOTO_MAX_BYTES, steps: PHOTO_STEPS });
    expect(encode.mock.calls.map((call) => call[1])).toEqual([
      { width: 2048, height: 1536, quality: 0.8 },
      { width: 1600, height: 1200, quality: 0.7 },
      { width: 1280, height: 960, quality: 0.6 }
    ]);
    expect(release).toHaveBeenCalledOnce();
    encode.mockClear();
    encode.mockResolvedValue(new Blob([new Uint8Array(2_000_000)]));
    await expect(compressImage(file(3_000_000), { targetBytes: PHOTO_MAX_BYTES, steps: PHOTO_STEPS }))
      .rejects.toBeInstanceOf(PhotoTooLargeError);
    expect(encode).toHaveBeenCalledTimes(3);
  });

  it("falls back on decode and encode failures but releases decoded pixels", async () => {
    vi.spyOn(imageCodec, "decode").mockRejectedValue(new Error("decode"));
    const small = file(100);
    expect(await compressImage(small, { targetBytes: 100, steps: PHOTO_STEPS })).toBe(small);
    await expect(compressImage(file(3_000_000), { targetBytes: 100, steps: PHOTO_STEPS }))
      .rejects.toBeInstanceOf(PhotoTooLargeError);
    vi.restoreAllMocks();
    const { release } = codec();
    vi.spyOn(imageCodec, "encode").mockResolvedValue(null);
    expect(await compressImage(small, { targetBytes: 100, steps: PHOTO_STEPS })).toBe(small);
    await expect(compressImage(file(3_000_000), { targetBytes: 100, steps: PHOTO_STEPS }))
      .rejects.toBeInstanceOf(PhotoTooLargeError);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("shares 3.5 MB among five photos and caps a single photo at 900 KB", async () => {
    const { encode } = codec();
    encode.mockImplementation(async (_decoded, options) =>
      new Blob([new Uint8Array(options.quality === 0.8 ? 819_200 : 614_400)]));
    const results = await preparePhotos(Array.from({ length: 5 }, () => file(3_000_000)));
    expect(results).toHaveLength(5);
    expect(results.every((photo) => photo.type === "image/jpeg" && photo.size <= PHOTO_MAX_BYTES)).toBe(true);
    expect(results.reduce((sum, photo) => sum + photo.size, 0)).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
    expect(encode.mock.calls.length).toBeGreaterThan(5);
    encode.mockClear();
    expect((await preparePhotos([file(3_000_000)]))[0].size).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  it("uses the second step above 900 KB and accepts exactly 900 KB", async () => {
    const { encode } = codec(4000, 3000, [PHOTO_MAX_BYTES + 1, PHOTO_MAX_BYTES]);
    const [prepared] = await preparePhotos([file(3_000_000)]);
    expect(prepared.size).toBe(PHOTO_MAX_BYTES);
    expect(encode.mock.calls.map((call) => call[1].quality)).toEqual([0.8, 0.7]);
    encode.mockClear();
    encode.mockResolvedValue(new Blob([new Uint8Array(PHOTO_MAX_BYTES)]));
    await preparePhotos([file(3_000_000)]);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("falls back when the decoded image has no intrinsic size", async () => {
    const { encode, release } = codec(0, 0);
    const small = file(100);
    expect(await compressImage(small, { targetBytes: 100, steps: PHOTO_STEPS })).toBe(small);
    await expect(compressImage(file(3_000_000), { targetBytes: 100, steps: PHOTO_STEPS }))
      .rejects.toBeInstanceOf(PhotoTooLargeError);
    expect(encode).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("keeps a small PDF, rejects a large one, and caps avatars at 512 pixels", async () => {
    const small = file(1_000_000, "lease.pdf", "application/pdf");
    expect(await prepareUploadFile(small, "document")).toBe(small);
    await expect(prepareUploadFile(file(UPLOAD_BUDGET_BYTES + 1, "lease.pdf", "application/pdf"), "receipt"))
      .rejects.toBeInstanceOf(FileTooLargeError);
    const { encode } = codec();
    await prepareUploadFile(file(3_000_000), "avatar");
    expect(encode.mock.calls[0][1].width).toBe(512);
    expect(AVATAR_STEPS[0].quality).toBe(0.85);
  });

  it("compresses JPEG bytes with an empty client MIME", async () => {
    const input = new File([new Uint8Array([0xff, 0xd8, 0xff, 0])], "photo.jpg", { type: "" });
    vi.spyOn(input, "slice").mockReturnValue({
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer
    } as Blob);
    const { encode } = codec();
    const prepared = await prepareUploadFile(input, "receipt");
    expect(encode).toHaveBeenCalled();
    expect(prepared.type).toBe("image/jpeg");
  });

  it("maps every failure to the required plain message", () => {
    expect(uploadErrorCopy(new PhotoTooLargeError())).toBe("This photo is too big. Try a different photo.");
    expect(uploadErrorCopy(new PhotoTooLargeError(), { photoCount: 2 }))
      .toBe("These photos are too big. Try fewer photos.");
    expect(uploadErrorCopy(new FileTooLargeError())).toBe("This file is too big. Use a file under 3.5 MB.");
    expect(uploadErrorCopy(new Error("413"), { formFile: true }))
      .toBe("We could not send that. Please choose the file again.");
    expect(uploadErrorCopy(new Error("413"))).toBe("We could not send that. Please try again.");
  });

  it("fills white before drawing, releases canvas pixels, and revokes the input URL", async () => {
    const events: string[] = [];
    const canvas = document.createElement("canvas");
    const context = { fillStyle: "", fillRect: () => events.push("fill"), drawImage: () => events.push("draw") };
    vi.spyOn(canvas, "getContext").mockReturnValue(context as never);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => { callback(new Blob(["jpeg"])); });
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    const decoded = { width: 20, height: 10, source: {} as HTMLImageElement, release: vi.fn() };
    expect(await imageCodec.encode(decoded, { width: 20, height: 10, quality: 0.8 })).toBeInstanceOf(Blob);
    expect(context.fillStyle).toBe("#ffffff");
    expect(events).toEqual(["fill", "draw"]);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    vi.restoreAllMocks();
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    expect(await imageCodec.encode(decoded, { width: 20, height: 10, quality: 0.8 })).toBeNull();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    vi.restoreAllMocks();
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const image = { src: "", naturalWidth: 20, naturalHeight: 10, decode: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal("Image", class { constructor() { return image; } });
    const opened = await imageCodec.decode(file(10));
    opened.release();
    expect(image.src).toBe("");
    expect(revoke).toHaveBeenCalledWith("blob:test");
    vi.unstubAllGlobals();
  });
});
