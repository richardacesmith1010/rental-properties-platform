import { describe, expect, it } from "vitest";
import { isPlainText, resolveUploadType, sniffFileType, type UploadPath } from "@/lib/file-signature";

const encoder = new TextEncoder();
const bytes = (numbers: number[], suffix = "") => new Uint8Array([...numbers, ...encoder.encode(suffix)]);
const jpeg = bytes([0xff, 0xd8, 0xff]);
const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = encoder.encode("RIFF0000WEBP");
const pdf = encoder.encode("0123456789%PDF-");
const zip = bytes([0x50, 0x4b, 0x03, 0x04]);
const word = bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml word/document.xml");
const excel = bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml xl/workbook.xml");
const ole = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const text = encoder.encode("a,b\n1,2");
const allPaths: UploadPath[] = ["maintenance", "avatar", "receipt", "vault"];

describe("file signatures", () => {
  it.each([
    [jpeg, "jpeg"], [png, "png"], [webp, "webp"], [pdf, "pdf"], [zip, "zip"], [ole, "ole"]
  ])("detects each supported binary signature", (input, expected) => {
    expect(sniffFileType(input as Uint8Array)).toBe(expected);
  });

  it.each([
    [jpeg, "a.pdf", "jpg", "image/jpeg", "image", allPaths],
    [png, "a.jpg", "png", "image/png", "image", allPaths],
    [webp, "a.jpg", "webp", "image/webp", "image", allPaths],
    [pdf, "a.jpg", "pdf", "application/pdf", "pdf", ["receipt", "vault"]],
    [word, "Lease.DOCX", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "document", ["vault"]],
    [excel, "a.xlsx", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "document", ["vault"]],
    [ole, "a.doc", "doc", "application/msword", "document", ["vault"]],
    [ole, "a.xls", "xls", "application/vnd.ms-excel", "document", ["vault"]],
    [text, "a.csv", "csv", "text/csv", "document", ["vault"]],
    [text, "a.txt", "txt", "text/plain", "document", ["vault"]]
  ])("resolves %s on exactly its allowed paths", (input, name, extension, contentType, category, allowed) => {
    for (const path of allPaths) {
      const result = resolveUploadType(path, input as Uint8Array, name as string);
      if ((allowed as string[]).includes(path)) {
        expect(result).toEqual({ extension, contentType, category });
      } else {
        expect(result).toBeNull();
      }
    }
  });

  it("rejects mismatched and unknown containers", () => {
    for (const path of allPaths) expect(resolveUploadType(path, encoder.encode("<html>"), "x.jpg")).toBeNull();
    expect(resolveUploadType("receipt", zip, "lease.pdf")).toBeNull();
    expect(resolveUploadType("vault", ole, "a.docx")).toBeNull();
    expect(resolveUploadType("vault", zip, "evil.docx")).toBeNull();
    expect(resolveUploadType("vault", bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml"),
      "partial.docx")).toBeNull();
    expect(resolveUploadType("vault", word, "lease.xlsx")).toBeNull();
    expect(resolveUploadType("vault", bytes([65, 0, 66]), "notes.txt")).toBeNull();
    expect(isPlainText(text)).toBe(true);
  });
});
