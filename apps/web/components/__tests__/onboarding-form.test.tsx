import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: () => [null, vi.fn()]
}));
const action = vi.fn(async () => ({ success: true as const }));
describe("OnboardingForm names", () => {
  it("leaves a name derived from the email empty", () => {
    render(<OnboardingForm email="richard.ace.smith+walkowner@example.com"
      fullName="richard.ace.smith+walkowner" role="owner" onCompleteOnboarding={action} />);
    expect(screen.getByLabelText("First Name")).toHaveValue("");
    expect(screen.getByLabelText("Last Name")).toHaveValue("");
  });
  it("prefills a real first and last name", () => {
    render(<OnboardingForm email="ana@example.com" fullName="Ana Ruiz" role="owner"
      onCompleteOnboarding={action} />);
    expect(screen.getByLabelText("First Name")).toHaveValue("Ana");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Ruiz");
  });
});
