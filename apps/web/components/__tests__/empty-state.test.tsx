import { forwardRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LucideProps } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

const CustomIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => (
  <svg ref={ref} data-testid="custom-icon" {...props} />
));
CustomIcon.displayName = "CustomIcon";

describe("EmptyState", () => {
  it("renders a neutral icon by default", () => {
    const { container } = render(<EmptyState message="Nothing here yet." />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders a custom icon when one is provided", () => {
    render(<EmptyState icon={CustomIcon} message="Custom icon state." />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("shows the title and message when provided", () => {
    render(<EmptyState title="No records" message="Nothing here yet." />);
    expect(screen.getByText("No records")).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("falls back to description when message is not provided", () => {
    render(<EmptyState description="Description only." />);
    expect(screen.getByText("Description only.")).toBeInTheDocument();
  });

  it("renders a working action button when both callback props are provided", () => {
    const onAction = vi.fn();
    render(<EmptyState message="Nothing here yet." actionLabel="Take action" onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Take action" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("does not render an action button when onAction is missing", () => {
    render(<EmptyState message="Nothing here yet." actionLabel="Take action" />);
    expect(screen.queryByRole("button", { name: "Take action" })).not.toBeInTheDocument();
  });
});
