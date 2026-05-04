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
});
