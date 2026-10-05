import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewCard } from "@/components/bank-feed/review-card";

const row = { postedOn: "2026-10-01", amountCents: 103944, direction: "out" as const,
  description: "Transfer To Mortgage" };
const properties = [{ id: "home", name: "1st Home" }];
const actions = { onAnswer: vi.fn(async () => ({ success: true, bankTransactionId: "item", createdRecord: true })),
  onUndo: vi.fn(async () => ({ success: true })) };

describe("bank review card", () => {
  it("shows the suggestion and a checked rule box for a specific payee", () => {
    render(<ReviewCard item={{ i: 0, token: "token", ruleable: true,
      suggestion: { text: "Mortgage", kind: "expense", propertyId: "home", category: "mortgage", label: "Mortgage" } }}
      row={row} properties={properties} charges={[]} {...actions} />);
    expect(screen.getByText("Looks like: Mortgage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not rental" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, that's right" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Always do this for this payee" })).toBeChecked();
  });

  it("requires a home when the bill has no property", () => {
    render(<ReviewCard item={{ i: 0, token: "token", ruleable: false,
      suggestion: { text: "Mortgage", kind: "expense", propertyId: null, category: "mortgage", label: "Mortgage" } }}
      row={row} properties={properties} charges={[]} {...actions} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, that's right" })).toBeDisabled();
    fireEvent.change(screen.getByTitle("Pick a home."), { target: { value: "home" } });
    expect(screen.getByRole("button", { name: "Yes, that's right" })).toBeEnabled();
  });

  it("collapses after filing and offers undo", async () => {
    actions.onAnswer.mockClear();
    render(<ReviewCard item={{ i: 0, token: "token", ruleable: true,
      suggestion: { text: "Mortgage", kind: "expense", propertyId: "home", category: "mortgage", label: "Mortgage" } }}
      row={row} properties={properties} charges={[]} {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's right" }));
    await waitFor(() => expect(screen.getByText(/Filed:/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("excludes waived rent from the rent due list", () => {
    render(<ReviewCard item={{ i: 0, token: "token" }} row={{ ...row, direction: "in", amountCents: 235000 }}
      properties={properties} charges={[{ id: "waived", propertyId: "home", dueDate: "2026-10-01",
        amountCents: 235000, status: "waived" }]} {...actions} />);
    fireEvent.change(screen.getByTitle("Pick a home."), { target: { value: "home" } });
    expect(screen.queryByRole("option", { name: /Oct.*2350/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, that's right" })).toBeDisabled();
  });
  it("shows the home in a bill suggestion", () => {
    render(<ReviewCard item={{ i: 0, token: "token", suggestion: { text: "Mortgage · 1st Home",
      kind: "expense", propertyId: "home", category: "mortgage", label: "Mortgage" } }}
      row={row} properties={properties} charges={[]} {...actions} />);
    expect(screen.getByText("Looks like: Mortgage · 1st Home")).toBeInTheDocument();
  });
  it("offers undo for an already recorded rent and a transfer", async () => {
    const onAnswer = vi.fn(async () => ({ success: true, bankTransactionId: "item", createdRecord: false,
      alreadyRecorded: true }));
    const rent = render(<ReviewCard item={{ i: 0, token: "token" }}
      row={{ ...row, direction: "in" }} properties={properties} charges={[{ id: "charge", propertyId: "home",
        dueDate: row.postedOn, amountCents: row.amountCents, status: "paid" }]}
      onAnswer={onAnswer} onUndo={actions.onUndo} />);
    fireEvent.change(screen.getByTitle("Pick a home."), { target: { value: "home" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's right" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument());
    rent.unmount();
    render(<ReviewCard item={{ i: 0, token: "token" }} row={row} properties={properties} charges={[]}
      onAnswer={onAnswer} onUndo={actions.onUndo} />);
    fireEvent.change(screen.getByTitle("Pick a type."), { target: { value: "transfer" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's right" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument());
  });
});
