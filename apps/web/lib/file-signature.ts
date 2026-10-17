export type UploadPath = "maintenance" | "avatar" | "receipt" | "vault";
export type UploadType = { extension: string; contentType: string; category: "image" | "pdf" | "document" };

function has(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function sniffFileType(bytes: Uint8Array) {
  if (has(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (has(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (has(bytes, [0x52, 0x49, 0x46, 0x46]) && has(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  for (let offset = 0; offset < Math.min(1024, bytes.length - 4); offset += 1) {
    if (has(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], offset)) return "pdf";
  }
  if (has(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (has(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  return null;
}

// Weak check: no known binary signature and no NUL in 4 KB. Text files are stored, never parsed.
export function isPlainText(bytes: Uint8Array) {
  if (sniffFileType(bytes)) return false;
  return !bytes.slice(0, 4096).includes(0);
}

function containsAscii(bytes: Uint8Array, entry: string) {
  const needle = new TextEncoder().encode(entry);
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

export function resolveUploadType(path: UploadPath, bytes: Uint8Array, fileName: string): UploadType | null {
  const signature = sniffFileType(bytes);
  const images: Record<string, UploadType> = {
    jpeg: { extension: "jpg", contentType: "image/jpeg", category: "image" },
    png: { extension: "png", contentType: "image/png", category: "image" },
    webp: { extension: "webp", contentType: "image/webp", category: "image" }
  };
  if (signature && images[signature]) return images[signature];
  if (path === "maintenance" || path === "avatar") return null;
  if (signature === "pdf") return { extension: "pdf", contentType: "application/pdf", category: "pdf" };
  if (path === "receipt") return null;
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (signature === "zip" && containsAscii(bytes, "[Content_Types].xml")) {
    if (extension === "docx" && containsAscii(bytes, "word/document.xml")) {
      return { extension: "docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        category: "document" };
    }
    if (extension === "xlsx" && containsAscii(bytes, "xl/workbook.xml")) {
      return { extension: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        category: "document" };
    }
  }
  // OLE is a container signature, not proof of Word or Excel content.
  if (signature === "ole" && extension === "doc") {
    return { extension: "doc", contentType: "application/msword", category: "document" };
  }
  if (signature === "ole" && extension === "xls") {
    return { extension: "xls", contentType: "application/vnd.ms-excel", category: "document" };
  }
  if (isPlainText(bytes) && extension === "csv") {
    return { extension: "csv", contentType: "text/csv", category: "document" };
  }
  if (isPlainText(bytes) && extension === "txt") {
    return { extension: "txt", contentType: "text/plain", category: "document" };
  }
  return null;
}
