import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { OwnerAddMenu } from "../owner-add-menu";
import { InvitationsSection } from "../invitations-section";
import type { ActionState } from "@/app/actions";
import type { InvitationListItem } from "@/lib/invitations";

type RowAction = (prev: ActionState, data: FormData) => Promise<ActionState>;
const captured = vi.hoisted(() => ({ actions: [] as RowAction[], states: new Map<RowAction, ActionState>() }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: (action: RowAction) => {
    captured.actions.push(action);
    return [captured.states.get(action) ?? null, (data: FormData) => action(null, data)];
  },
  useFormStatus: () => ({ pending: false })
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const homes = [
  { id: crypto.randomUUID(), name: "Maple Home" },
  { id: crypto.randomUUID(), name: "Oak Home" },
  { id: crypto.randomUUID(), name: "Client Home", ownerAccountIsClient: true },
  { id: crypto.randomUUID(), name: "Closed Home", active: false }
];
const invite = vi.fn(async (): Promise<ActionState> => null);
const row: InvitationListItem = {
  id: crypto.randomUUID(), email: "manager@example.com", fullName: "Alex", role: "manager",
  propertyId: homes[0].id, propertyName: homes[0].name, ownershipAccountName: null,
  status: "pending", createdAt: new Date().toISOString(), acceptedAt: null
};

function section(invitations: InvitationListItem[], resend: RowAction = invite, revoke: RowAction = invite) {
  return <InvitationsSection ownershipAccounts={[]} properties={homes} invitations={invitations}
    onInviteTenant={invite} onInviteManager={invite} onResendInvite={resend} onRevokeInvite={revoke} />;
}

function rowActions() {
  return captured.actions.slice(-2);
}

beforeEach(() => {
  captured.actions.length = 0;
  captured.states.clear();
  vi.clearAllMocks();
});

describe("manager invite entry points", () => {
  it("filters manager homes in the owner Add menu", () => {
    render(<OwnerAddMenu role="owner" onAddHome={vi.fn()} onAddTenant={vi.fn()}
      onInviteManager={invite} properties={homes} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a manager" }));
    expect(screen.getByRole("checkbox", { name: "All my homes" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Maple Home" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Oak Home" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Client Home" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Closed Home" })).toBeNull();
  });

  it("filters manager homes in Invitations, while tenant keeps every home", () => {
    render(section([]));
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));
    const tenantSelect = screen.getByRole("combobox");
    for (const home of homes) expect(tenantSelect).toHaveTextContent(home.name);
    fireEvent.click(screen.getByRole("button", { name: "Manager Invite" }));
    expect(screen.getByRole("checkbox", { name: "Maple Home" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Oak Home" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Client Home" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Closed Home" })).toBeNull();
  });

  it("shows pending actions, hides accepted actions, and calls expired rows Revoked", () => {
    const { rerender } = render(section([row]));
    for (const label of ["Resend", "Copy link", "Revoke"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    rerender(section([{ ...row, status: "accepted" }]));
    for (const label of ["Resend", "Copy link", "Revoke"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    rerender(section([{ ...row, status: "expired" }]));
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.queryByText("Expired")).toBeNull();
    rerender(section([{ ...row, role: "tenant", status: "expired" }]));
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });

  it.each([
    "Invitation revoked.",
    "Invitation revoked. Another invite still gives them this home.",
    "Invitation revoked. They still manage this home."
  ])("toasts the exact revoke message: %s", async (message) => {
    const revoke = vi.fn(async (): Promise<ActionState> => ({ success: true, message }));
    render(section([row], invite, revoke));
    const [, revokeAction] = rowActions();
    await act(async () => { await revokeAction(null, new FormData()); });
    expect(revoke).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(message);
    expect(screen.queryByText(message)).toBeNull();
  });

  it("submits Revoke through the form action and toasts its success", async () => {
    const revoke = vi.fn(async (_prev: ActionState, _data: FormData): Promise<ActionState> => (
      { success: true, message: "Invitation revoked." }
    ));
    render(section([row], invite, revoke));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await act(async () => { await Promise.resolve(); });
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke.mock.calls[0][1].get("invitationId")).toBe(row.id);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Invitation revoked.");
  });

  it("toasts a Resend error when a rerender makes the row accepted", async () => {
    const error = "They already signed in. No email was sent.";
    const resend = vi.fn(async (): Promise<ActionState> => ({ success: false, error }));
    const { rerender } = render(section([row], resend));
    const [resendAction] = rowActions();
    await act(async () => { await resendAction(null, new FormData()); });
    captured.states.set(resendAction, { success: false, error });
    rerender(section([row], resend));
    expect(screen.queryByText(error)).toBeNull();
    rerender(section([{ ...row, status: "accepted" }], resend));
    expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(error);
    expect(screen.queryByText(error)).toBeNull();
  });

  it("toasts a Revoke error when a rerender makes the row accepted", async () => {
    const error = "They already signed in. This invite can't be revoked.";
    const revoke = vi.fn(async (): Promise<ActionState> => ({ success: false, error }));
    const { rerender } = render(section([row], invite, revoke));
    const [, revokeAction] = rowActions();
    await act(async () => { await revokeAction(null, new FormData()); });
    captured.states.set(revokeAction, { success: false, error });
    rerender(section([row], invite, revoke));
    expect(screen.queryByText(error)).toBeNull();
    rerender(section([{ ...row, status: "accepted" }], invite, revoke));
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(error);
    expect(screen.queryByText(error)).toBeNull();
  });

  it("toasts a tenant Revoke failure", async () => {
    const error = "Could not revoke invitation. Try again.";
    const revoke = vi.fn(async (): Promise<ActionState> => ({ success: false, error }));
    render(section([{ ...row, role: "tenant" }], invite, revoke));
    const [, revokeAction] = rowActions();
    await act(async () => { await revokeAction(null, new FormData()); });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(error);
    expect(screen.queryByText(error)).toBeNull();
  });

  it("toasts each submit once and does not toast on a rerender with an error state", async () => {
    const error = "They already signed in. No email was sent.";
    const resend = vi.fn(async (): Promise<ActionState> => ({ success: false, error }));
    const { rerender } = render(section([row], resend));
    const [resendAction] = rowActions();
    captured.states.set(resendAction, { success: false, error });
    rerender(section([row], resend));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    rerender(section([row], resend));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => {
      await resendAction(null, new FormData());
      await resendAction(null, new FormData());
    });
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenNthCalledWith(1, error);
    expect(toast.error).toHaveBeenNthCalledWith(2, error);
    rerender(section([row], resend));
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
