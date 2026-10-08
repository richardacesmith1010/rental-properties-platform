import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientsSection } from "@/components/dashboard/clients/clients-section";
import { PropertyForm } from "@/components/dashboard/forms/property-form";
import { WhoseHomeStep } from "@/components/dashboard/clients/whose-home-step";
import { UnifiedPropertyWizard } from "@/components/dashboard/unified-property-wizard";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const client = { id: "client-1", name: "Taylor Homes", accountType: "llc" as const,
  contactEmail: null, homeCount: 1, summary: "1 rent overdue" };

describe("manager clients", () => {
  it("renders client rows and rent summaries", () => {
    render(<ClientsSection clients={[client]} onCreateClientAccount={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Clients" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Taylor Homes/ })).toHaveAttribute("href", "/manager/clients/client-1");
    expect(screen.getByText("1 rent overdue")).toHaveClass("text-[var(--warn)]");
  });
  it("adds the first client and shows the success toast", async () => {
    const action = vi.fn(async () => ({ success: true as const, accountId: "client-2", message: "Client added." }));
    render(<ClientsSection clients={[]} onCreateClientAccount={action} />);
    expect(screen.getByText("Add your first client")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add client" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Add client" }));
    fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Morgan" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add client" }).at(-1)!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect((action.mock.calls[0] as unknown[])[1]).toBeInstanceOf(FormData);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Client added."));
    expect(screen.getByRole("link", { name: /Morgan/ })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("does not refresh after an add error", async () => {
    refresh.mockClear();
    const action = vi.fn(async () => ({ success: false as const, error: "Try again." }));
    render(<ClientsSection clients={[]} onCreateClientAccount={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Add client" }));
    fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Morgan" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add client" }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again."));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("opens a new client sheet from the picker", () => {
    render(<WhoseHomeStep clients={[]} selectedId="" onSelect={vi.fn()} onCreateClientAccount={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "New client" }));
    expect(screen.getByLabelText("Client name")).toBeInTheDocument();
  });
  it("posts the picked client from the manager property form", async () => {
    const action = vi.fn(async () => ({ success: true as const, propertyId: "home-1" }));
    render(<PropertyForm ownershipAccounts={[]} managerClients={[client]} onCreateClientAccount={vi.fn()}
      onCreateProperty={action} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Taylor Homes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("Example: Elm Street House"), { target: { value: "Maple House" } });
    for (let step = 0; step < 5; step++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Property" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const form = (action.mock.calls[0] as unknown[])[1] as FormData;
    expect(form.get("ownerAccountId")).toBe("client-1");
  });
  it("posts the selected account through the manager wizard", async () => {
    const action = vi.fn(async () => ({ success: true as const, propertyId: "home-1" }));
    render(<UnifiedPropertyWizard open managerClients={[client]} onCreateClientAccount={vi.fn()}
      onCreatePropertyWithSetup={action} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Taylor Homes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
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
    const form = (action.mock.calls[0] as unknown[])[1] as FormData;
    expect(form.get("accountId")).toBe("client-1");
  });
  it("requires a client in the manager wizard", () => {
    render(<UnifiedPropertyWizard open managerClients={[client]} onCreateClientAccount={vi.fn()}
      onCreatePropertyWithSetup={vi.fn()} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Add a home" })).toBeInTheDocument();
    expect(screen.getByText("Nothing is saved until you finish.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Whose home is this?" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Taylor Homes/ }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Property name")).toBeInTheDocument();
    expect(screen.queryByText("This setup flow is unavailable right now.")).not.toBeInTheDocument();
  });
});
