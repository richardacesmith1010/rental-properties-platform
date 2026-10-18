import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { InviteManagerForm } from "@/components/dashboard/invitations/invite-manager-form";
import type { ActionState } from "@/app/actions";

const state = vi.hoisted(() => ({ current: null as ActionState }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: (action: (prev: ActionState, data: FormData) => Promise<ActionState>) => [
    state.current, (data: FormData) => action(null, data)
  ],
  useFormStatus: () => ({ pending: false })
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const homes = [
  { id: crypto.randomUUID(), name: "Maple Home" },
  { id: crypto.randomUUID(), name: "Oak Home" },
  { id: crypto.randomUUID(), name: "Client Home", ownerAccountIsClient: true },
  { id: crypto.randomUUID(), name: "Closed Home", active: false }
];
const action = vi.fn(async (_prev: ActionState, _formData: FormData) => ({
  success: true as const, message: "Invite complete."
}));

function advanceToReview() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText("manager@email.com"), { target: { value: "manager@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText("Manager full name"), { target: { value: "Alex" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => {
  state.current = null;
  action.mockClear();
  vi.mocked(toast.success).mockClear();
});

describe("manager invite form", () => {
  it("shows the Home, Email, Name and Send steps with a home checkbox", () => {
    render(<InviteManagerForm properties={homes} onInviteManager={action} />);
    expect(screen.getByText("Step 1: Pick homes.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "All my homes" })).toBeInTheDocument();
    for (const label of ["Home", "Email", "Name", "Send"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Maple Home" })).toBeInTheDocument();
  });

  it.each([
    "Invite sent to manager@example.com. They'll get an email from Domus.",
    "Added Alex to this home. They'll see it next time they sign in.",
    "Alex already has access to this home. No email was sent."
  ])("shows delivery message: %s", (message) => {
    state.current = { success: true, message };
    render(<InviteManagerForm properties={homes} onInviteManager={action} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(message).closest(".overflow-hidden")).toBeNull();
    expect(screen.queryByText("Skip for now")).not.toBeInTheDocument();
  });

  it("picks one home, lists it in review, and posts propertyIds", async () => {
    const { container } = render(<InviteManagerForm properties={homes} onInviteManager={action} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Maple Home" }));
    advanceToReview();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByText("Homes:").parentElement).toHaveTextContent("Homes: Maple Home");
    expect(container.querySelector<HTMLInputElement>('input[name="propertyIds"]')?.value)
      .toBe(JSON.stringify([homes[0].id]));
    expect(container.querySelector('input[name="propertyId"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send Manager Invite" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0][1].get("propertyIds")).toBe(JSON.stringify([homes[0].id]));
  });

  it("All my homes checks and clears every eligible home in list order", () => {
    const { container } = render(<InviteManagerForm properties={homes} onInviteManager={action} />);
    const all = screen.getByRole("checkbox", { name: "All my homes" });
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Maple Home" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Oak Home" })).toBeChecked();
    fireEvent.click(all);
    expect(all).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(all);
    advanceToReview();
    expect(screen.getByText("Homes:").parentElement).toHaveTextContent("Homes: Maple Home, Oak Home");
    expect(container.querySelector<HTMLInputElement>('input[name="propertyIds"]')?.value)
      .toBe(JSON.stringify([homes[0].id, homes[1].id]));
  });

  it("hides client and inactive homes, even when the account query is set", () => {
    window.history.replaceState({}, "", "?account=x");
    const { container } = render(<InviteManagerForm properties={homes} onInviteManager={action} />);
    expect(screen.queryByRole("checkbox", { name: "Client Home" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Closed Home" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "All my homes" }));
    advanceToReview();
    expect(container.querySelector('input[name="ownershipAccountId"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[name="propertyIds"]')?.value)
      .toBe(JSON.stringify([homes[0].id, homes[1].id]));
    window.history.replaceState({}, "", "/");
  });

  it("preselects one eligible home and drops picks that become ineligible", () => {
    const { rerender } = render(<InviteManagerForm properties={[homes[0], homes[2]]} onInviteManager={action} />);
    expect(screen.getByRole("checkbox", { name: "Maple Home" })).toBeChecked();
    rerender(<InviteManagerForm properties={[{ ...homes[0], active: false }, homes[1]]} onInviteManager={action} />);
    expect(screen.queryByRole("checkbox", { name: "Maple Home" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Oak Home" })).toBeChecked();
  });

  it("shows an empty state and disables Next when no homes are eligible", () => {
    render(<InviteManagerForm properties={[homes[2], homes[3]]} onInviteManager={action} />);
    expect(screen.getByText("No homes here can get a manager.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("keeps the draft on error, allows Send again, and resets on success", async () => {
    const send = vi.fn(async (_prev: ActionState, _data: FormData): Promise<ActionState> => (
      { success: true, message: "Invite complete." }
    ));
    send.mockResolvedValueOnce({ success: false, error: "Could not send invite. Try again." });
    const { rerender } = render(<InviteManagerForm properties={homes} onInviteManager={send} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Maple Home" }));
    advanceToReview();
    fireEvent.click(screen.getByRole("button", { name: "Send Manager Invite" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    state.current = { success: false, error: "Could not send invite. Try again." };
    rerender(<InviteManagerForm properties={homes} onInviteManager={send} />);
    expect(screen.getByText("Could not send invite. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Homes:").parentElement).toHaveTextContent("Homes: Maple Home");
    expect(screen.getByText("Email:").parentElement).toHaveTextContent("Email: manager@example.com");
    expect(screen.getByText("Name:").parentElement).toHaveTextContent("Name: Alex");
    expect(screen.getByRole("button", { name: "Send Manager Invite" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Send Manager Invite" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][1].get("propertyIds")).toBe(JSON.stringify([homes[0].id]));
    expect(send.mock.calls[1][1].get("email")).toBe("manager@example.com");
    expect(send.mock.calls[1][1].get("fullName")).toBe("Alex");
    state.current = { success: true, message: "Invite complete." };
    rerender(<InviteManagerForm properties={homes} onInviteManager={send} />);
    await waitFor(() => expect(screen.getByText("Step 1: Pick homes.")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Maple Home" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Oak Home" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "All my homes" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Maple Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByPlaceholderText("manager@email.com")).toHaveValue("");
    fireEvent.change(screen.getByPlaceholderText("manager@email.com"), { target: { value: "manager@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByPlaceholderText("Manager full name")).toHaveValue("");
    expect(toast.success).toHaveBeenCalledOnce();
  });
});
