import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubmitButton } from "@/components/shared/submit-button";

const useFormStatusMock = vi.fn(() => ({ pending: false, data: null, method: "post", action: null }));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: () => useFormStatusMock()
  };
});

describe("SubmitButton", () => {
  it("renders the button label", () => {
    render(<SubmitButton>Save Changes</SubmitButton>);

    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("shows the loading spinner when pending", () => {
    useFormStatusMock.mockReturnValueOnce({ pending: true, data: null, method: "post", action: null });
    const { container } = render(<SubmitButton>Save Changes</SubmitButton>);

    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("disables the button when pending", () => {
    useFormStatusMock.mockReturnValueOnce({ pending: true, data: null, method: "post", action: null });
    render(<SubmitButton>Save Changes</SubmitButton>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("accepts a custom className", () => {
    render(<SubmitButton className="custom-submit-class">Save Changes</SubmitButton>);

    expect(screen.getByRole("button")).toHaveClass("custom-submit-class");
  });
});
