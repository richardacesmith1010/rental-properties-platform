import { describe, expect, it } from "vitest";
import { buildBrandedEmailShell } from "@/lib/email/shell";

describe("email shell look", () => {
  it("uses graphite actions and keeps preheader and preferences", () => {
    const html = buildBrandedEmailShell({
      titleHtml: "Welcome", bodyHtml: "Your home is ready.", ctaText: "Open Domus",
      ctaUrl: "https://domusbase.com", preheaderText: "Preview text",
      footerPreferencesUrl: "https://domusbase.com/settings"
    });
    for (const token of ['bgcolor="#0B0C0E"', "#F3F4F6", "Georgia", "#2442B8", "Preview text",
      "Manage notification preferences"]) expect(html).toContain(token);
    for (const old of ["#1D4ED8", "#FBFBF9", "border-radius:999px"]) expect(html).not.toContain(old);
  });
});
