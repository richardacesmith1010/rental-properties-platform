import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountDataSettings } from "@/components/settings/account-data-settings";

const wipe = vi.fn(async () => ({ success: false as const, error: "Try again." }));

function renderSettings(sharedAccountNames?: string[]) {
  return render(<AccountDataSettings
    sharedAccountNames={sharedAccountNames}
    onDeleteAllProperties={wipe}
    onDeleteAllTenants={wipe}
    onDeleteAllManagers={wipe}
    onDeleteAllLeases={wipe}
    onDeleteAllFinancialData={wipe}
    onFullAccountWipe={wipe}
  />);
}

describe("AccountDataSettings shared account note", () => {
  it("N1 shows exact copy and sorted names before the first delete card", () => {
    renderSettings(["Smith Family LLC", "Aspen LLC"]);
    const note = screen.getByRole("note");
    const lines = within(note).getAllByText(/.+/).map((line) => line.textContent);
    expect(lines).toEqual([
      "Some homes are shared with other owners.",
      "These buttons won't delete them. A full wipe only removes you.",
      "Shared: Aspen LLC, Smith Family LLC"
    ]);
    expect(within(note).getByText(lines[0] as string)).toHaveClass("font-bold");
    const accountDeletion = screen.getByRole("heading", { name: "Delete my account" });
    const firstCard = screen.getByRole("heading", { name: "Delete All Properties" });
    expect(note.compareDocumentPosition(accountDeletion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([[], undefined])("N2 hides the note when names are %j", (names) => {
    renderSettings(names);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/shared/i)).not.toBeInTheDocument();
  });

  it("N3 keeps all six delete card headings and button labels", () => {
    renderSettings(["Aspen LLC"]);
    const headings = ["Delete All Properties", "Remove All Tenants", "Remove All Property Managers",
      "Delete All Leases", "Delete All Financial Data", "Full Account Wipe"];
    const buttons = ["Delete Properties", "Remove Tenants", "Remove Managers", "Delete Leases",
      "Delete Financial Data", "Wipe Account"];
    for (const heading of headings) expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    for (const button of buttons) expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  });
});
