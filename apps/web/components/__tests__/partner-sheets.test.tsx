import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartnerPaymentSheet } from "@/components/home-money/partner-payment-sheet";
import { ManagePartnersSheet } from "@/components/home-money/manage-partners-sheet";
import type { Partner } from "@/lib/partners";
const active: Partner = { id: "a", accountId: "llc", displayName: "Alice", active: true, profileId: null };
const inactive: Partner = { id: "b", accountId: "llc", displayName: "Yani", active: false, profileId: null };
describe("partner sheets", () => {
  it("payment sheet excludes inactive partners and saves cents", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    render(<PartnerPaymentSheet accountId="llc" partners={[active, inactive]} onClose={vi.fn()} onSave={save} />);
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(screen.queryByText("Yani")).toBeNull();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12.34" } });
    fireEvent.click(screen.getByTitle("Save payment"));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({ accountId: "llc", fromPartnerId: "a",
      toPartnerId: null, amountCents: 1234 });
  });
  it("manage partners adds a named person", async () => {
    const add = vi.fn().mockResolvedValue({ ok: true, data: { id: "new" } });
    render(<ManagePartnersSheet accountId="llc" partners={[active]} onClose={vi.fn()}
      onAdd={add} onRename={vi.fn()} onDeactivate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Yani" } });
    fireEvent.click(screen.getByTitle("Add person"));
    await waitFor(() => expect(add).toHaveBeenCalledWith("llc", "Yani"));
  });
});
