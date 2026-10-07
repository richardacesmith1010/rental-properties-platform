import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("lists the four canonical public URLs without the duplicate marketing route", () => {
    expect(sitemap().map(({ url }) => url)).toEqual([
      "https://domusbase.com",
      "https://domusbase.com/login",
      "https://domusbase.com/terms",
      "https://domusbase.com/privacy",
    ]);
  });
});
