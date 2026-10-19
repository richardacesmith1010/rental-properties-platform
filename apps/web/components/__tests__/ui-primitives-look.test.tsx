import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

describe("UI primitives look", () => {
  it("uses action tokens for the default button", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("bg-[var(--action)]", "text-[var(--action-contrast)]");
    expect(button).not.toHaveClass("bg-[var(--accent)]", "text-white");
  });

  it("uses an ink border for the outline button", () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("border-[var(--ink)]");
  });

  it("keeps scale motion out of every button variant", () => {
    for (const variant of ["default", "gradient", "outline", "ghost", "link", "destructive", "success"] as const) {
      expect(buttonVariants({ variant })).not.toContain("active:scale");
    }
  });

  it("renders badges as square uppercase tags", () => {
    render(<Badge>Late</Badge>);
    const badge = screen.getByText("Late");
    expect(badge).toHaveClass("uppercase", "rounded-[2px]");
    expect(badge).not.toHaveClass("rounded-full");
  });

  it("keeps card rounding mapped through the 2xl token", () => {
    render(<Card data-testid="card" />);
    expect(screen.getByTestId("card")).toHaveClass("rounded-2xl");
  });
});
