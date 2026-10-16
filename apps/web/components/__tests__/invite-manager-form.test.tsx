import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteManagerForm } from "@/components/dashboard/invitations/invite-manager-form";

const state = vi.hoisted(() => ({ current: null as null | { success: true; message: string } }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: () => [state.current, vi.fn()],
  useFormStatus: () => ({ pending: false })
}));

beforeEach(() => { state.current = null; });
describe("manager invite form", () => {
  it("names the home select and shows the plain-language steps", () => {
    render(<InviteManagerForm properties={[]} onInviteManager={async () => null} />);
    expect(screen.getByRole("combobox", { name: /home/i })).toBeInTheDocument();
    for (const label of ["Home", "Email", "Name", "Send"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each([
    "Invite sent to manager@example.com. They'll get an email from Domus.",
    "Added Alex to this home. They'll see it next time they sign in.",
    "Alex already has access to this home. No email was sent."
  ])("shows delivery message: %s", (message) => {
    state.current = { success: true, message };
    render(<InviteManagerForm properties={[]} onInviteManager={async () => null} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(message).closest(".overflow-hidden")).toBeNull();
    expect(screen.queryByText(["Skip", "for now"].join(" "))).not.toBeInTheDocument();
  });

  it("hides Next on the final invite step", () => {
    render(<InviteManagerForm properties={[{ id: "home-1", name: "Home" }]}
      onInviteManager={async () => null} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Home" }), { target: { value: "home-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("manager@email.com"), { target: { value: "m@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("Manager full name"), { target: { value: "Manager" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});
