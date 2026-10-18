import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TermsPage from "../terms/page";
import PrivacyPage from "../privacy/page";

vi.mock("@/components/marketing/landing-shell", () => ({
  LandingShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

const banner = "Early access version. A lawyer is reviewing these terms. We will tell you before a final version takes effect.";
const forbidden = ["March 4", "[", "LAWYER", "DECISION", "billed"];

function expectSentence(sentence: string) {
  expect(screen.getByText((_, element) =>
    (element?.tagName === "P" || element?.tagName === "LI") &&
    (element.textContent?.includes(sentence) ?? false),
  )).toBeInTheDocument();
}

function expectHeaderAndCopy(headings: string[]) {
  expect(screen.getByText("Last updated: October 18, 2026")).toBeInTheDocument();
  expect(screen.getByText(banner)).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(headings);
  for (const text of forbidden) expect(document.body.textContent).not.toContain(text);
}

describe("early-access legal pages", () => {
  it("uses theme colors, never white", () => {
    for (const Page of [TermsPage, PrivacyPage]) {
      const { container, unmount } = render(<Page />);
      expect(container.querySelectorAll('[class*="white"]')).toHaveLength(0);
      expect(container.querySelector("h1")?.className).toContain("text-[var(--ink)]");
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
    expectSentence("We answer within 30 days.");
    expectSentence("Financial records (rent, payments, expenses) are kept for 7 years after the tax year they belong to.");
    expectSentence("Owners: Settings → Account & Data → Delete my account.");
  });
});
