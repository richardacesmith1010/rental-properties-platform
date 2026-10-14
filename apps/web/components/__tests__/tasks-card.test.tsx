import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TasksCard } from "@/components/home-money/tasks-card";
import { NeedsYouList } from "@/components/dashboard/owner-home/needs-you-list";
import type { AccountTask } from "@/lib/account-tasks";

const task: AccountTask = { id: "t1", accountId: "a1", title: "Pay vendors", frequency: "monthly",
  nextDueOn: "2020-01-01", ownerPartnerId: null, ownerName: null, lastDoneOn: null, active: true };
const props = { accountId: "a1", partners: [], onAdd: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(),
  onDone: vi.fn().mockResolvedValue({ ok: true }), onCommon: vi.fn().mockResolvedValue({ ok: true }) };
describe("TasksCard", () => {
  it("shows the empty state and opens a task sheet", () => {
    render(<TasksCard {...props} tasks={[]} />);
    expect(screen.getByText("No shared tasks yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add common tasks" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
    expect(screen.getByLabelText("Next due")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("How often"), { target: { value: "as_needed" } });
    expect(screen.queryByLabelText("Next due")).not.toBeInTheDocument();
  });
  it("shows an overdue task and updates the row after Done", async () => {
    render(<TasksCard {...props} tasks={[task]} />);
    expect(screen.getByText("Overdue since Jan 1")).toHaveClass("text-[var(--warn)]");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByText(/^Done [A-Z][a-z]{2} \d+$/)).toBeInTheDocument());
  });
  it("opens the edit action in the options menu", () => {
    render(<TasksCard {...props} tasks={[task]} />);
    fireEvent.click(screen.getByRole("button", { name: "Options for Pay vendors" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit" })).toBeInTheDocument();
  });
});
it("shows Home tasks only when the count is positive", () => {
  const home = { summary: { lateCharges: [], openRepairCount: 0, newMessageCount: 0 },
    bankState: { status: "connected" as const, href: "/owner/bank" }, onOpenSection: vi.fn() };
  const { rerender } = render(<NeedsYouList {...home} myTasksDueCount={0} />);
  expect(screen.queryByText("2 tasks due")).not.toBeInTheDocument();
  rerender(<NeedsYouList {...home} myTasksDueCount={2} />);
  expect(screen.getByRole("link", { name: "2 tasks due" })).toHaveAttribute("href", "/owner/money");
});
