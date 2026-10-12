import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "../not-found";

describe("404", () => {
  it("uses ink for the heading and ground for the return link focus offset", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toHaveClass("text-[var(--ink)]");
    expect(screen.getByRole("heading", { name: "Page not found" })).not.toHaveClass("text-white");
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveClass("ring-offset-[var(--ground)]");
  });
});
