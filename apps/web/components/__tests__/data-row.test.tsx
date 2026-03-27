import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataRow } from "@/components/shared/data-row";

describe("DataRow", () => {
  it("renders label and value content", () => {
    const { getByText } = render(
      <DataRow>
        <span>Label</span>
        <span>Value</span>
      </DataRow>
    );

    expect(getByText("Label")).toBeInTheDocument();
    expect(getByText("Value")).toBeInTheDocument();
  });

  it("applies the default row layout classes", () => {
    const { container } = render(
      <DataRow>
        <span>Only child</span>
      </DataRow>
    );

    expect(container.firstChild).toHaveClass(
      "flex",
      "flex-col",
      "items-stretch",
      "sm:flex-row",
      "sm:items-center",
      "sm:justify-between"
    );
  });

  it("handles empty value content", () => {
    const { container } = render(
      <DataRow>
        <span>Label</span>
        <span />
      </DataRow>
    );

    expect(container.textContent).toContain("Label");
  });

  it("removes the bottom border when last is true", () => {
    const { container } = render(
      <DataRow last>
        <span>Last row</span>
      </DataRow>
    );

    expect(container.firstChild).not.toHaveClass("border-b");
  });
});
