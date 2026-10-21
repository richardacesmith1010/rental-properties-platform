import Link from "next/link";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its child when used with asChild", () => {
    render(
      <Button asChild variant="outline">
        <Link href="/owner">Back to Dashboard</Link>
      </Button>
    );

    expect(
      screen.getByRole("link", { name: "Back to Dashboard" })
    ).toHaveAttribute("href", "/owner");
  });

  it("keeps disabled primary buttons readable without fading other variants", () => {
    render(<>
      <Button disabled>Create account</Button>
      <Button disabled variant="gradient">Continue</Button>
      <Button disabled variant="outline">Cancel</Button>
    </>);

    for (const name of ["Create account", "Continue"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button.className).toContain("disabled:bg-[var(--surface-3)]");
      expect(button.className).toContain("disabled:text-[var(--muted)]");
      expect(button.className).toContain("disabled:border-[var(--line)]");
      expect(button.className).not.toContain("disabled:opacity-50");
    }
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain("disabled:opacity-50");
  });
});
