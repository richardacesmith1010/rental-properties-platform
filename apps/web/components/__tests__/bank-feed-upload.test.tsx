import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadCard } from "@/components/bank-feed/upload-card";

describe("bank account picker", () => {
  it("treats Add an account as a choice, never an account id", () => {
    const onSelected = vi.fn();
    render(<UploadCard accounts={[{ id: "account-a", nickname: "Checking", institution: "other" }]}
      ownerAccountId="owner" onCreate={vi.fn()} onImport={vi.fn()} onSelected={onSelected} />);
    fireEvent.change(screen.getByTitle("Pick the account for this file."), { target: { value: "add" } });
    expect(onSelected).toHaveBeenCalledWith(null);
  });
});
