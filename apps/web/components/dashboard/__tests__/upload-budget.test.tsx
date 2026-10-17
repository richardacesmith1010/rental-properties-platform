import { Component, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseForm } from "@/components/dashboard/expenses/expense-form";
import { ExpenseList } from "@/components/dashboard/expenses/expense-list";
import { SignerFlow } from "@/components/dashboard/documents/signer-flow";
import { imageCodec, PHOTO_MAX_BYTES } from "@/lib/image-compress";
import type { ExpenseDashboardData } from "@/lib/expenses";


let redirectCaught: Error | null = null;
class RedirectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { redirectCaught = error; }
  render() { return this.state.failed ? <div>Redirect reached boundary</div> : this.props.children; }
}

const propertyId = "550e8400-e29b-41d4-a716-446655440001";
const expenseId = "550e8400-e29b-41d4-a716-446655440002";
const data: ExpenseDashboardData = {
  enabled: true, warning: null, properties: [{ id: propertyId, name: "Home" }],
  expenses: [{ id: expenseId, propertyId, propertyName: "Home", category: "repair", description: null,
    amountCents: 1000, expenseDate: "2026-10-16", recurring: false, recurringFrequency: null, vendorId: null,
    vendorName: null, receiptFileId: null, createdAt: "2026-10-16" }],
  pnlByProperty: [], monthlyByProperty: {}, categoryByProperty: {}
};
const photo = () => new File([new Uint8Array(3_000_000)], "receipt.png", { type: "image/png" });
const pdf = () => new File([new Uint8Array(4_000_000)], "bill.pdf", { type: "application/pdf" });
const mockCodec = () => {
  vi.spyOn(imageCodec, "decode").mockResolvedValue({ width: 4000, height: 3000,
    source: {} as HTMLImageElement, release: vi.fn() });
  vi.spyOn(imageCodec, "encode").mockResolvedValue(new Blob([new Uint8Array(800_000)]));
};
const NativeFormData = FormData;
beforeEach(() => {
  // jsdom serializes picked file inputs as empty Files in this React form-action environment.
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form?: HTMLFormElement) {
      super(form);
      if (form) for (const input of form.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
        if (input.name && input.files?.[0]) this.set(input.name, input.files[0]);
      }
    }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function reachExpenseForm() {
  const next = screen.getByRole("button", { name: "Next" });
  fireEvent.click(next);
  fireEvent.click(next);
  fireEvent.change(screen.getByPlaceholderText("Amount (USD)"), { target: { value: "10" } });
  fireEvent.click(next);
  fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-10-16" } });
  for (let index = 0; index < 5; index += 1) fireEvent.click(next);
  return document.querySelector('input[name="receiptFile"]') as HTMLInputElement;
}

function reachSigner() {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: propertyId } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "lease_agreement" } });
  for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  return document.querySelector('input[name="file"]') as HTMLInputElement;
}

describe("form upload budgets", () => {
  it("compresses an expense receipt before the create action", async () => {
    mockCodec();
    const action = vi.fn(async (_previous, _formData: FormData) => ({ success: true as const, expenseId }));
    render(<ExpenseForm data={data} vendors={[]} propertyFiles={[]} onCreateExpense={action} />);
    await userEvent.upload(reachExpenseForm(), photo());
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const receipt = action.mock.calls[0][1].get("receiptFile") as File;
    expect(receipt.type).toBe("image/jpeg");
    expect(receipt.name).toMatch(/\.jpg$/);
    expect(receipt.size).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  it("rejects a large expense PDF and keeps the typed amount", async () => {
    const action = vi.fn(async () => ({ success: true as const }));
    render(<ExpenseForm data={data} vendors={[]} propertyFiles={[]} onCreateExpense={action} />);
    const receiptInput = reachExpenseForm();
    await userEvent.upload(receiptInput, pdf());
    expect(receiptInput.files?.[0]?.size).toBe(4_000_000);
    expect(((new FormData(document.querySelector("form")!)).get("receiptFile") as File).size).toBe(4_000_000);
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("This file is too big. Use a file under 3.5 MB.");
    expect(action).not.toHaveBeenCalled();
    expect(document.querySelector('input[name="amountDollars"]')).toHaveValue("10");
  });

  it("shows an expense action failure and keeps the typed amount", async () => {
    mockCodec();
    const action = vi.fn(async () => { throw new Error("413"); });
    render(<ExpenseForm data={data} vendors={[]} propertyFiles={[]} onCreateExpense={action} />);
    await userEvent.upload(reachExpenseForm(), photo());
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("We could not send that. Please choose the file again.");
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Save Expense" })).toBeInTheDocument();
    expect(document.querySelector('input[name="amountDollars"]')).toHaveValue("10");
  });

  it("rethrows an expense create redirect", async () => {
    redirectCaught = null;
    mockCodec();
    render(<RedirectBoundary><ExpenseForm data={data} vendors={[]} propertyFiles={[]}
      onCreateExpense={vi.fn(async () => redirect("/x"))} /></RedirectBoundary>);
    await userEvent.upload(reachExpenseForm(), photo());
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByText("Redirect reached boundary");
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByText("We could not send that. Please choose the file again.")).not.toBeInTheDocument();
  });

  it("rethrows an expense update redirect", async () => {
    redirectCaught = null;
    render(<RedirectBoundary><ExpenseList data={data} vendors={[]} propertyFiles={[]}
      onUpdateExpense={vi.fn(async () => redirect("/x"))}
      onDeleteExpense={vi.fn(async () => ({ success: true as const }))} /></RedirectBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.submit(document.querySelector('input[name="amountDollars"]')!.closest("form")!);
    await screen.findByText("Redirect reached boundary");
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByText("We could not send that. Please try again.")).not.toBeInTheDocument();
  });

  it("keeps edited expense fields after a thrown action", async () => {
    const action = vi.fn(async () => { throw new Error("413"); });
    render(<ExpenseList data={data} vendors={[]} propertyFiles={[]} onUpdateExpense={action}
      onDeleteExpense={vi.fn(async () => ({ success: true as const }))} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    const amount = document.querySelector('input[name="amountDollars"]') as HTMLInputElement;
    const description = document.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
    fireEvent.change(amount, { target: { value: "25" } });
    fireEvent.change(description, { target: { value: "New roof" } });
    fireEvent.submit(amount.closest("form")!);
    await screen.findByText("We could not send that. Please try again.");
    expect(amount).toHaveValue(25);
    expect(description).toHaveValue("New roof");
  });

  it("keeps unchanged expense payload fields and refuses a large PDF", async () => {
    const action = vi.fn(async (_previous, _formData: FormData) =>
      ({ success: false as const, error: "Try again." }));
    render(<ExpenseList data={data} vendors={[]} propertyFiles={[]} onUpdateExpense={action}
      onDeleteExpense={vi.fn(async () => ({ success: true as const }))} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    const input = document.querySelector('input[name="receiptFile"]') as HTMLInputElement;
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const unchanged = action.mock.calls[0][1];
    expect([...unchanged.keys()].sort()).toEqual([
      "amountDollars", "category", "description", "expenseDate", "expenseId", "receiptFile", "receiptFileId",
      "recurringFrequency", "vendorId"
    ]);
    expect(unchanged.get("category")).toBe("repair");
    expect(unchanged.get("amountDollars")).toBe("10");
    expect(unchanged.get("description")).toBe("");
    expect(unchanged.get("expenseId")).toBe(expenseId);
    expect(unchanged.get("expenseDate")).toBe("2026-10-16");
    expect(unchanged.get("recurringFrequency")).toBe("");
    expect(unchanged.get("vendorId")).toBe("");
    expect(unchanged.get("receiptFileId")).toBe("");
    expect((unchanged.get("receiptFile") as File).size).toBe(0);
    expect(unchanged.has("recurring")).toBe(false);
    await userEvent.upload(input, pdf());
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("This file is too big. Use a file under 3.5 MB.");
    expect(action).toHaveBeenCalledOnce();
  });

  it("checks vault documents and compresses vault images", async () => {
    mockCodec();
    const action = vi.fn(async (_previous, _formData: FormData) =>
      ({ success: false as const, error: "Try again." }));
    render(<SignerFlow properties={[{ id: propertyId, name: "Home" }]} onUploadPropertyFile={action}
      onCancel={() => {}} />);
    const input = reachSigner();
    await userEvent.upload(input, new File([new Uint8Array(4_000_000)], "a.docx"));
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("This file is too big. Use a file under 3.5 MB.");
    expect(action).not.toHaveBeenCalled();
    await userEvent.upload(input, photo());
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0][1].get("file") as File;
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  it("rethrows a vault redirect", async () => {
    redirectCaught = null;
    mockCodec();
    render(<RedirectBoundary><SignerFlow properties={[{ id: propertyId, name: "Home" }]}
      onUploadPropertyFile={vi.fn(async () => redirect("/x"))} onCancel={() => {}} /></RedirectBoundary>);
    const input = reachSigner();
    await userEvent.upload(input, photo());
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Redirect reached boundary");
    expect((redirectCaught as Error & { digest?: string } | null)?.digest).toMatch(/^NEXT_REDIRECT/);
    expect(screen.queryByText("We could not send that. Please choose the file again.")).not.toBeInTheDocument();
  });

  it("shows a vault action failure and keeps hidden property fields", async () => {
    mockCodec();
    const action = vi.fn(async () => { throw new Error("413"); });
    render(<SignerFlow properties={[{ id: propertyId, name: "Home" }]} onUploadPropertyFile={action}
      onCancel={() => {}} />);
    const input = reachSigner();
    await userEvent.upload(input, photo());
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("We could not send that. Please choose the file again.");
    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelector('input[name="propertyId"]')).toHaveValue(propertyId);
    expect(document.querySelector('input[name="category"]')).toHaveValue("lease_agreement");
  });
});
