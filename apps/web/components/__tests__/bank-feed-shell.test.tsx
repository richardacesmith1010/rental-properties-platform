import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BankFeedShell } from "@/components/bank-feed/page-shell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/bank-feed/upload-card", () => ({
  UploadCard: ({ onImport, onSelected }: {
    onImport: (id: string, rows: unknown[]) => Promise<void>;
    onSelected: (account: { id: string; nickname: string; institution: string }) => void;
  }) => <div>
    <button onClick={() => void onImport("account-a", [{ postedOn: "2026-10-01", amountCents: 100,
      direction: "out", description: "Bill" }])}>Import A</button>
    <button onClick={() => void onImport("account-a", [{ postedOn: "2026-10-02", amountCents: 200,
      direction: "out", description: "Second bill" }])}>Import again</button>
    <button onClick={() => onSelected({ id: "account-b", nickname: "Savings", institution: "other" })}>Pick B</button>
  </div>
}));
vi.mock("@/components/bank-feed/review-card", () => ({
  ReviewCard: ({ item, row, onAnswer, onUndo }: { item: unknown; row: { description: string };
    onAnswer: (item: unknown, decision: "yes",
    always: boolean) => Promise<{ bankTransactionId?: string }>; onUndo: (id: string) => Promise<unknown> }) => {
    const [id, setId] = useState("");
    const [changing, setChanging] = useState(false);
    return <div><p>{row.description}</p><button onClick={() => void onAnswer(item, "yes", false).then((result) =>
      setId(result.bankTransactionId || ""))}>Answer item</button>
      {changing ? <label>Type<select aria-label="Type"><option>Bill</option></select></label>
        : <button onClick={() => setChanging(true)}>Change</button>}
      {id ? <button onClick={() => void onUndo(id)}>Undo item</button> : null}</div>;
  }
}));
vi.mock("@/components/bank-feed/recent-list", () => ({ RecentList: ({ items }: {
  items: Array<{ description: string }> }) => <div>{items.map((item) => <span key={item.description}>{item.description}</span>)}</div> }));
vi.mock("@/components/bank-feed/missed-list", () => ({ MissedList: () => null }));

describe("bank account selection", () => {
  it("closes Change when a second import replaces a row at the same index", async () => {
    const importBankRows = vi.fn()
      .mockResolvedValueOnce({ success: true, results: [{ i: 0, status: "ask", token: "file-a" }] })
      .mockResolvedValueOnce({ success: true, results: [{ i: 0, status: "ask", token: "file-b" }] });
    const actions = { createBankAccount: vi.fn(), importBankRows, answerBankItem: vi.fn(),
      undoBankItem: vi.fn(), deleteBankAccount: vi.fn() };
    render(<BankFeedShell ownerAccountId="owner" accounts={[]} bankAccounts={[
      { id: "account-a", nickname: "Checking", institution: "other" }
    ]} properties={[]} charges={[]} recent={[]} actions={actions} />);

    fireEvent.click(screen.getByText("Import A"));
    await waitFor(() => expect(screen.getByText("Change")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Change"));
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Import again"));
    await waitFor(() => expect(screen.getByText("Second bill")).toBeInTheDocument());
    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
  });
  it("answers with the imported account after the picker changes", async () => {
    const answerBankItem = vi.fn(async () => ({ success: true }));
    const actions = { createBankAccount: vi.fn(), importBankRows: vi.fn(async () => ({ success: true,
      results: [{ i: 0, status: "ask" as const, token: "signed-token" }] })), answerBankItem,
    undoBankItem: vi.fn(), deleteBankAccount: vi.fn() };
    render(<BankFeedShell ownerAccountId="owner" accounts={[]} bankAccounts={[
      { id: "account-a", nickname: "Checking", institution: "other" },
      { id: "account-b", nickname: "Savings", institution: "other" }
    ]} properties={[]} charges={[]} recent={[]} actions={actions} />);
    fireEvent.click(screen.getByText("Import A"));
    await waitFor(() => expect(screen.getByText("Answer item")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pick B"));
    fireEvent.click(screen.getByText("Answer item"));
    await waitFor(() => expect(answerBankItem).toHaveBeenCalledWith(expect.objectContaining({
      bankAccountId: "account-a", token: "signed-token" })));
  });

  it("names the selected account before removing it", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deleteBankAccount = vi.fn(async () => ({ success: true }));
    const actions = { createBankAccount: vi.fn(), importBankRows: vi.fn(), answerBankItem: vi.fn(),
      undoBankItem: vi.fn(), deleteBankAccount };
    render(<BankFeedShell ownerAccountId="owner" accounts={[]} bankAccounts={[
      { id: "account-a", nickname: "Checking", institution: "other" },
      { id: "account-b", nickname: "Savings", institution: "other" }
    ]} properties={[]} charges={[]} recent={[]} actions={actions} />);
    fireEvent.click(screen.getByText("Pick B"));
    fireEvent.click(screen.getByTitle("Remove saved bank activity."));
    fireEvent.click(screen.getByRole("button", { name: "Remove Savings" }));
    await waitFor(() => expect(deleteBankAccount).toHaveBeenCalledWith({ bankAccountId: "account-b" }));
    expect(confirm).toHaveBeenCalledWith("Remove Savings? Filed rent and bills stay.");
    confirm.mockRestore();
  });
  it("updates recent items immediately after answer and undo", async () => {
    const actions = { createBankAccount: vi.fn(), importBankRows: vi.fn(async () => ({ success: true,
      results: [{ i: 0, status: "ask" as const, token: "signed-token" }] })),
    answerBankItem: vi.fn(async () => ({ success: true, bankTransactionId: "filed",
      recentItem: { id: "filed", postedOn: "2026-10-01", description: "New bill", propertyName: "Home",
        amountCents: 100, direction: "out" as const, kind: "expense" as const } })),
    undoBankItem: vi.fn(async () => ({ success: true })), deleteBankAccount: vi.fn() };
    render(<BankFeedShell ownerAccountId="owner" accounts={[]} bankAccounts={[
      { id: "account-a", nickname: "Checking", institution: "other" }
    ]} properties={[]} charges={[]} recent={[]} actions={actions} />);
    fireEvent.click(screen.getByText("Import A"));
    await waitFor(() => expect(screen.getByText("Answer item")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Answer item"));
    await waitFor(() => expect(screen.getByText("New bill")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Undo item"));
    await waitFor(() => expect(screen.queryByText("New bill")).not.toBeInTheDocument());
  });
});
