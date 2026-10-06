import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnifiedPropertyWizard } from "@/components/dashboard/unified-property-wizard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

async function reachSuccess(bankConnected: boolean) {
  const action = vi.fn(async () => ({ success: true as const, propertyId: "home-1" }));
  render(<UnifiedPropertyWizard open bankConnected={bankConnected} bankSetupHref="/connect/onboard"
    onOpenChange={vi.fn()} onCreatePropertyWithSetup={action} />);
  expect(screen.getByPlaceholderText("Maple House")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("123 Main St")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Property name"), { target: { value: "Maple House" } });
  fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "123 Main St" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Denver" } });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "CO" } });
  fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "80202" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Monthly rent"), { target: { value: "1000" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Create Everything" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
}

describe("UnifiedPropertyWizard", () => {
  it("shows bank setup after creating a home without a connected bank", async () => {
    await reachSuccess(false);
    expect(await screen.findByText("Your home is added. Connect your bank so tenants can pay you."))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect your bank" }))
      .toHaveAttribute("href", "/connect/onboard");
  });

  it("shows rent readiness only when the bank is connected", async () => {
    await reachSuccess(true);
    expect(await screen.findByText("Your home is ready. Tenants can pay rent here."))
      .toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect your bank" })).not.toBeInTheDocument();
  });
});
