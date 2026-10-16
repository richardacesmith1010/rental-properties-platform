import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { TicketStatusControl } from "@/components/dashboard/ticket-status-control";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: () => [{ success: true }, vi.fn()],
  useFormStatus: () => ({ pending: false })
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("repair status confirmation", () => {
  it("shows a lasting repair-updated toast after saving", () => {
    render(<TicketStatusControl ticketId="repair-1" currentStatus="open"
      onUpdateStatus={async () => ({ success: true })} />);
    expect(toast.success).toHaveBeenCalledWith("Repair updated.");
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });
});
