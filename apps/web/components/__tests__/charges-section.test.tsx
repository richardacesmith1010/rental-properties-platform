import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChargesSection } from "@/components/dashboard/charges-section";

describe("ChargesSection", () => {
  it("shows the generate charges link when href is provided", () => {
    render(
      <ChargesSection
        charges={[]}
        onPayCharge={async () => {}}
        onGenerateChargesHref="/owner/generate"
      />
    );

    const generateLink = screen.getByRole("link", {
      name: "Generate This Month Charges"
    });

    expect(generateLink).toBeInTheDocument();
    expect(generateLink).toHaveAttribute("href", "/owner/generate");
  });

  it("does not show the generate link when href is omitted", () => {
    render(<ChargesSection charges={[]} onPayCharge={async () => {}} />);

    expect(
      screen.queryByRole("link", { name: "Generate This Month Charges" })
    ).not.toBeInTheDocument();
  });
});
