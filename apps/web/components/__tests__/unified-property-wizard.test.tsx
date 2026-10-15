import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnifiedPropertyWizard } from "@/components/dashboard/unified-property-wizard";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

async function reachSuccess(bankConnected: boolean, returnToClientHref?: string,
  tenant?: { outside?: boolean; dueDay?: string }) {
  const action = vi.fn(async () => ({ success: true as const, propertyId: "home-1" }));
  render(<UnifiedPropertyWizard open bankConnected={bankConnected} bankSetupHref="/connect/onboard"
    onOpenChange={vi.fn()} onCreatePropertyWithSetup={action} returnToClientHref={returnToClientHref} />);
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
  if (tenant) {
    fireEvent.click(screen.getByRole("button", { name: "Yes, I have a tenant" }));
    fireEvent.change(screen.getByLabelText("Tenant email"), { target: { value: "alias@example.com" } });
    fireEvent.change(screen.getByLabelText("Lease start date"), { target: { value: "2026-10-31" } });
    expect(screen.getByLabelText("Rent due day")).toHaveValue(28);
    fireEvent.change(screen.getByLabelText("Lease end date"), { target: { value: "2027-10-31" } });
    if (tenant.dueDay) fireEvent.change(screen.getByLabelText("Rent due day"),
      { target: { value: tenant.dueDay } });
    if (tenant.outside) fireEvent.click(screen.getByRole("checkbox", { name: /Tenant pays outside Domus/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Enter the tenant's first and last name.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tenant first name"), { target: { value: "Maya" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Enter the tenant's first and last name.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tenant last name"), { target: { value: "Lopez" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  if (tenant) {
    expect(screen.getByText("Maya Lopez")).toBeInTheDocument();
    expect(screen.getByText(/Due on day/)).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button", { name: "Create Everything" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  return action;
}

describe("UnifiedPropertyWizard", () => {
  it("shows bank setup after creating a home without a connected bank", async () => {
    await reachSuccess(false);
    expect(await screen.findByText("Add a tenant when you are ready."))
      .toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect your bank" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to Home" })).toBeInTheDocument();
  });

  it("shows rent readiness only when the bank is connected", async () => {
    await reachSuccess(true);
    expect(await screen.findByText("Add a tenant when you are ready."))
      .toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect your bank" })).not.toBeInTheDocument();
  });

  it("sends tenant names, due day, and outside setting and shows the invite", async () => {
    const action = await reachSuccess(false, undefined, { outside: true, dueDay: "3" });
    const payload = JSON.parse(((action.mock.calls as unknown as [null, FormData][])[0][1]).get("payload") as string);
    expect(payload.lease).toMatchObject({ tenantFirstName: "Maya", tenantLastName: "Lopez",
      dueDayOfMonth: 3, collectsOutsideDomus: true });
    expect(screen.getByText("We emailed Maya an invite.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect your bank" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Your home is added.")).toHaveLength(1);
  });

  it("offers bank setup for an invited tenant who pays online", async () => {
    await reachSuccess(false, undefined, { dueDay: "3" });
    expect(screen.getByText("Connect your bank so tenants can pay online.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect your bank" })).toHaveAttribute("href", "/connect/onboard");
  });

  it("hides bank setup for an invited tenant when the bank is connected", async () => {
    await reachSuccess(true, undefined, { dueDay: "3" });
    expect(screen.getByText("We emailed Maya an invite.")).toBeInTheDocument();
    expect(screen.queryByText("Connect your bank so tenants can pay online.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect your bank" })).not.toBeInTheDocument();
  });

  it("returns to the client after setup when requested", async () => {
    await reachSuccess(true, "/manager/clients/client-1");
    const button = await screen.findByRole("button", { name: "Back to client" });
    fireEvent.click(button);
    expect(router.push).toHaveBeenCalledWith("/manager/clients/client-1");
    expect(screen.queryByRole("button", { name: "Go to Home" })).not.toBeInTheDocument();
  });
});
