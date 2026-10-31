import { readFileSync } from "node:fs";
import { legalDocumentText } from "@/lib/legal-text";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TermsPage from "../terms/page";
import PrivacyPage from "../privacy/page";

vi.mock("@/components/marketing/landing-shell", () => ({
  LandingShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);


const forbidden = ["March 4", "[", "DECISION", "billed"];

function expectSentence(sentence: string) {
  expect(screen.getByText((_, element) =>
    (element?.tagName === "P" || element?.tagName === "LI") &&
    (element.textContent?.includes(sentence) ?? false),
  )).toBeInTheDocument();
}

function expectHeaderAndCopy(headings: string[]) {
  expect(screen.getByText("Last updated: October 30, 2026")).toBeInTheDocument();
  expect(screen.getByText(/in effect now\. We will tell you before we change/)).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(headings);
  expect(document.body.textContent).not.toMatch(/lawyer/i);
  expect(document.body.textContent).not.toMatch(/early access version/i);
  for (const text of forbidden) expect(document.body.textContent).not.toContain(text);
}

describe("early-access legal pages", () => {
  it.each([["terms", TermsPage], ["privacy", PrivacyPage]] as const)("V4 %s rendered page text equals the archive", (name, Page) => {
    const { container } = render(<Page />);
    const section = container.querySelector("main section")!;
    expect(legalDocumentText(<div dangerouslySetInnerHTML={{ __html: section.parentElement!.outerHTML }} />))
      .toEqual(readFileSync(`legal-archive/${name}/2026-10-30.txt`, "utf8"));
    expect(container.textContent).not.toMatch(/lawyer/i); expect(container.textContent).not.toMatch(/early access version/i);
  });
  it("uses theme colors, never white", () => {
    for (const Page of [TermsPage, PrivacyPage]) {
      const { container, unmount } = render(<Page />);
      expect(container.querySelectorAll('[class*="white"]')).toHaveLength(0);
      expect(container.querySelector("h1")?.className).toContain("text-[var(--ink)]");
      const sectionClass = container.querySelector("main section")?.className ?? "";
      expect(sectionClass).toContain("text-[var(--muted)]");
      expect(sectionClass).not.toContain("text-[var(--faint)]");
      for (const heading of container.querySelectorAll("h2")) {
        expect(heading.className).toContain("text-[var(--ink)]");
      }
      unmount();
    }
  });

  it("renders the approved Terms date, banner, headings, and key sentences without old copy", () => {
    render(<TermsPage />);
    expectHeaderAndCopy([
      "Who we are",
      "What Domus does",
      "Your account",
      "Early access and price",
      "Payments",
      "Bank data",
      "AI helper",
      "Rules",
      "Ending your account",
      "No guarantees",
      "Changes",
    ]);
    expect(screen.getByText("These terms are in effect now. We will tell you before we change them.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("does not hold your money");
    expect(document.body.textContent).not.toContain("18 or older");
    expectSentence('Domus ("we") is run by Richard Smith, an individual.');
    expectSentence("We will tell you at least 30 days before we start charging.");
  });

  it("renders the approved Privacy date, banner, headings, and key sentences without old copy", () => {
    render(<PrivacyPage />);
    expectHeaderAndCopy([
      "What we collect",
      "How we use it",
      "Who sees it",
      "How long we keep it",
      "Your choices and rights",
      "Cookies",
      "Security",
      "Children",
      "Changes",
      "Contact",
    ]);
    expect(screen.getByText("This policy is in effect now. We will tell you before we change it.")).toBeInTheDocument();
    expectSentence("We answer within 30 days.");
    expectSentence("Financial records (rent, payments, expenses) are kept for 7 years after the tax year they belong to.");
    expectSentence("Owners: Settings → Account & Data → Delete my account.");
  });
});
