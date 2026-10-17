import { Component, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDataSettings } from "@/components/settings/account-data-settings";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";
import { SettingsLayout } from "@/components/settings/settings-layout";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/account-deletion-request", () => ({ requestAccountDeletion: action }));

let redirectCaught: Error | null = null;
class RedirectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { redirectCaught = error; }
  render() { return this.state.failed ? <div>Redirect reached boundary</div> : this.props.children; }
}

beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue({ success: false, error: "We could not send your request. Please try again." });
  redirectCaught = null;
});

function confirm(value = "DELETE") {
  fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value } });
}

describe("DeleteAccountSection", () => {
  it("shows the exact copy, labeled input and iPhone typing attributes", () => {
    render(<DeleteAccountSection />);
    expect(screen.getByRole("heading", { name: "Delete my account", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("We will delete your account within 30 days.")).toBeInTheDocument();
    expect(screen.getByText("We may keep rent and payment records, without your name.")).toBeInTheDocument();
    const input = screen.getByLabelText("Type DELETE to confirm");
    expect(input).toHaveAttribute("autocapitalize", "characters");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(document.querySelector('label[for="delete-account-confirmation"]')).not.toHaveClass("uppercase");
  });

  it.each(["", "delete", "Delete", " DELETE", "DELETE "])("disables submission for %j", (value) => {
    render(<DeleteAccountSection />);
    confirm(value);
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  });

  it("submits exact confirmation once and displays the returned failure", async () => {
    render(<DeleteAccountSection />);
    confirm();
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][1] as FormData;
    expect(data.get("confirmation")).toBe("DELETE");
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not send your request. Please try again.");
  });

  it("shows Sending… and disables the button while pending", async () => {
    let finish!: (value: { success: false; error: string }) => void;
    action.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<DeleteAccountSection />);
    confirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled());
    finish({ success: false, error: "We could not send your request. Please try again." });
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not send your request. Please try again.");
  });

  it("rethrows a real Next redirect through the error boundary", async () => {
    action.mockImplementation(async () => redirect("/login?deleted=requested"));
    render(<RedirectBoundary><DeleteAccountSection /></RedirectBoundary>);
    confirm();
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await screen.findByText("Redirect reached boundary");
    expect(action.mock.calls).toHaveLength(1);
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("We could not send your request. Please try again.")).not.toBeInTheDocument();
  });

  it("puts the section before all six owner wipe cards", () => {
    const wipe = vi.fn(async () => ({ success: false as const, error: "Try again." }));
    render(<SettingsLayout role="owner" sections={{
      account: { title: "Account & Data", content: <AccountDataSettings onDeleteAllProperties={wipe}
        onDeleteAllTenants={wipe} onDeleteAllManagers={wipe} onDeleteAllLeases={wipe}
        onDeleteAllFinancialData={wipe} onFullAccountWipe={wipe} /> }
    }} />);
    fireEvent.click(screen.getAllByTitle("Open Account & Data settings.")[0]);
    const titles = ["Delete my account", "Delete All Properties", "Remove All Tenants",
      "Remove All Property Managers", "Delete All Leases", "Delete All Financial Data", "Full Account Wipe"];
    const headings = titles.map((title) => screen.getByRole("heading", { name: title }));
    expect(headings.every((heading, index) => index === 0 ||
      Boolean(headings[index - 1].compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  });
});
