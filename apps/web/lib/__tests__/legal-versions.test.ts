import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TermsDocument } from "@/components/legal/terms-document";
import { PrivacyDocument } from "@/components/legal/privacy-document";
import { legalDocumentText } from "@/lib/legal-text";
import { formatLegalDate, LEGAL_DOCUMENTS } from "@/lib/legal-versions";

describe("frozen legal versions", () => {
  it("V1 registry and archives are complete and SHA-256 matches UTF-8 bytes", () => {
    expect(formatLegalDate("2026-10-30")).toEqual("October 30, 2026");
    for (const name of ["terms", "privacy"] as const) {
      const document = LEGAL_DOCUMENTS[name];
      expect(document.current).toEqual("2026-10-30");
      expect(readdirSync(`legal-archive/${name}`).sort()).toEqual(Object.keys(document.versions).map((v) => `${v}.txt`).sort());
      for (const [version, hash] of Object.entries(document.versions)) {
        expect(createHash("sha256").update(readFileSync(`legal-archive/${name}/${version}.txt`)).digest("hex")).toEqual(hash);
      }
    }
  });
  it.each([["terms", TermsDocument], ["privacy", PrivacyDocument]] as const)("V2-V3 %s text and hrefs match the archive", (name, C) => {
    const element = createElement(C);
    const text = readFileSync(`legal-archive/${name}/${LEGAL_DOCUMENTS[name].current}.txt`, "utf8");
    expect(legalDocumentText(element), "Legal text changed: publish a new version").toEqual(text);
    expect(text).not.toMatch(/lawyer/i); expect(text).not.toMatch(/early access version/i);
    const markup = renderToStaticMarkup(element);
    for (const match of markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)) {
      expect(text).toContain(`<${match[1]}>`);
    }
    if (name === "terms") expect(text).toContain("support@domusbase.com");
  });
  it("V2 preserves rendered link targets before stripping tags, decodes text and formats lists", () => {
    const element = createElement("div", {}, createElement("h1", {}, "Title"),
      createElement("p", {}, createElement("a", { href: "/a?q=1&b=2" }, "A & B")),
      createElement("ul", {}, createElement("li", {}, " Item   one ")));
    expect(legalDocumentText(element)).toEqual("Title\nA & B </a?q=1&amp;b=2>\n- Item one\n");
  });
});
