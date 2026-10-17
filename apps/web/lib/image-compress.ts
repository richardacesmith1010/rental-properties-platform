export const UPLOAD_BUDGET_BYTES = 3.5 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 900 * 1024;
export const PHOTO_STEPS = [
  { maxEdge: 2048, quality: 0.8 },
  { maxEdge: 1600, quality: 0.7 },
  { maxEdge: 1280, quality: 0.6 }
];
export const AVATAR_STEPS = [{ maxEdge: 512, quality: 0.85 }];

export class PhotoTooLargeError extends Error {}
export class FileTooLargeError extends Error {}

type DecodedImage = { width: number; height: number; source: HTMLImageElement; release: () => void };
type EncodeOptions = { width: number; height: number; quality: number };
type Step = { maxEdge: number; quality: number };

export const imageCodec = {
  async decode(file: File): Promise<DecodedImage> {
    const url = URL.createObjectURL(file);
    let image: HTMLImageElement | null = new Image();
    try {
      image.src = url;
      await image.decode();
      const source = image;
      return {
        width: source.naturalWidth,
        height: source.naturalHeight,
        source,
        release() {
          source.src = "";
          image = null;
          URL.revokeObjectURL(url);
        }
      };
    } catch (error) {
      image.src = "";
      image = null;
      URL.revokeObjectURL(url);
      throw error;
    }
  },
  async encode(decoded: DecodedImage, options: EncodeOptions): Promise<Blob | null> {
    const canvas = document.createElement("canvas");
    canvas.width = options.width;
    canvas.height = options.height;
    try {
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, options.width, options.height);
      context.drawImage(decoded.source, 0, 0, options.width, options.height);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", options.quality));
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};

export async function compressImage(file: File, options: { targetBytes: number; steps: Step[] }): Promise<File> {
  let decoded: DecodedImage | undefined;
  try {
    decoded = await imageCodec.decode(file);
    for (const step of options.steps) {
      const edge = Math.max(decoded.width, decoded.height);
      if (edge === 0) return fallback(file, options.targetBytes);
      const scale = Math.min(1, step.maxEdge / edge);
      const blob = await imageCodec.encode(decoded, {
        width: Math.max(1, Math.round(decoded.width * scale)),
        height: Math.max(1, Math.round(decoded.height * scale)),
        quality: step.quality
      });
      if (!blob) return fallback(file, options.targetBytes);
      if (blob.size <= options.targetBytes) {
        const base = file.name.replace(/\.[^.]*$/, "") || "photo";
        return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      }
    }
  } catch {
    return fallback(file, options.targetBytes);
  } finally {
    decoded?.release();
  }
  throw new PhotoTooLargeError();
}

function fallback(file: File, targetBytes: number) {
  if (file.size <= targetBytes) return file;
  throw new PhotoTooLargeError();
}

export async function preparePhotos(files: File[]): Promise<File[]> {
  const chosen: File[] = [];
  let bytes = 0;
  for (let index = 0; index < files.length; index += 1) {
    const targetBytes = Math.min(PHOTO_MAX_BYTES, Math.floor((UPLOAD_BUDGET_BYTES - bytes) / (files.length - index)));
    const photo = await compressImage(files[index], { targetBytes, steps: PHOTO_STEPS });
    chosen.push(photo);
    bytes += photo.size;
  }
  return chosen;
}

async function hasJpegSignature(file: File) {
  if (file.type) return false;
  const bytes = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function prepareUploadFile(file: File, kind: "receipt" | "document" | "avatar"): Promise<File> {
  if (kind === "avatar") return compressImage(file, { targetBytes: PHOTO_MAX_BYTES, steps: AVATAR_STEPS });
  if (file.type.startsWith("image/") || await hasJpegSignature(file)) {
    return compressImage(file, { targetBytes: PHOTO_MAX_BYTES, steps: PHOTO_STEPS });
  }
  if (file.size > UPLOAD_BUDGET_BYTES) throw new FileTooLargeError();
  return file;
}

export const PHOTO_TOO_LARGE_COPY = "This photo is too big. Try a different photo.";
export const PHOTOS_TOO_LARGE_COPY = "These photos are too big. Try fewer photos.";
export const FILE_TOO_LARGE_COPY = "This file is too big. Use a file under 3.5 MB.";
export const FORM_UPLOAD_ERROR_COPY = "We could not send that. Please choose the file again.";
export const UPLOAD_ERROR_COPY = "We could not send that. Please try again.";

export function uploadErrorCopy(error: unknown, options: { photoCount?: number; formFile?: boolean } = {}) {
  if (error instanceof PhotoTooLargeError) {
    return options.photoCount && options.photoCount >= 2 ? PHOTOS_TOO_LARGE_COPY : PHOTO_TOO_LARGE_COPY;
  }
  if (error instanceof FileTooLargeError) return FILE_TOO_LARGE_COPY;
  return options.formFile ? FORM_UPLOAD_ERROR_COPY : UPLOAD_ERROR_COPY;
}
